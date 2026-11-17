<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 1);
require_once dirname(__DIR__) . '/config.php';

$memberUser  = require_member_user();
$pdo         = db();
$platformCfg = get_platform_settings($pdo);

// Fetch all gym memberships linked strictly to this member user account
$mStmt = $pdo->prepare(
    'SELECT m.*, g.name AS gym_name, g.slug AS gym_slug, p.plan_name, p.price AS current_plan_price, p.duration_days
     FROM members m
     INNER JOIN gyms g ON g.id = m.gym_id
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.user_id = :uid
     ORDER BY m.id ASC'
);
$mStmt->execute([':uid' => (int)$memberUser['id']]);
$profiles = $mStmt->fetchAll();

if (empty($profiles)) {
    set_flash('warning', 'No gym membership profile is linked to this login yet.');
}

$requestedProfileId = (int)($_GET['member_id'] ?? $_SESSION['active_member_id'] ?? 0);
$activeProfile = $profiles[0] ?? null;
foreach ($profiles as $pr) {
    if ((int)$pr['id'] === $requestedProfileId) {
        $activeProfile = $pr;
        break;
    }
}
if ($activeProfile) {
    $_SESSION['active_member_id'] = (int)$activeProfile['id'];
}

$flashes = pull_flashes();

// Handle Member Online Renewal Order Creation / Test Webhook Verification
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $activeProfile) {
    verify_csrf();
    $action = clean_str($_POST['form_action'] ?? '', 30);
    $gymId  = (int)$activeProfile['gym_id'];

    if ($action === 'renew_online') {
        $planId = (int)($_POST['plan_id'] ?? 0);
        $pStmt  = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :pid AND gym_id = :gid AND is_active = 1 LIMIT 1');
        $pStmt->execute([':pid' => $planId, ':gid' => $gymId]);
        $plan = $pStmt->fetch();

        if ($plan) {
            $orderRef = 'ORD-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $gwStmt   = $pdo->prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = :gid LIMIT 1');
            $gwStmt->execute([':gid' => $gymId]);
            $gw = $gwStmt->fetch();
            $provider = $gw ? (string)$gw['provider'] : 'manual';

            $pdo->prepare("INSERT INTO payment_orders (order_ref, gym_id, member_id, plan_id, gateway_provider, amount, currency, status) VALUES (:ref, :gid, :mid, :pid, :prov, :amt, 'INR', 'Created')")
                ->execute([':ref' => $orderRef, ':gid' => $gymId, ':mid' => (int)$activeProfile['id'], ':pid' => $planId, ':prov' => $provider, ':amt' => (string)$plan['price']]);

            // If gym gateway is enabled in test mode, simulate HMAC-signed webhook verification
            if ($gw && !empty($gw['is_enabled']) && $gw['mode'] === 'test' && !empty($_POST['simulate_verified_webhook'])) {
                $whSecret = decrypt_secret($gw['webhook_secret_encrypted'] ?? '') ?: 'test-webhook-secret';
                $evtId    = 'EVT-' . strtoupper(bin2hex(random_bytes(4)));
                $payload  = json_encode(['order_ref' => $orderRef, 'event_id' => $evtId, 'amount' => (float)$plan['price']]);
                $sig      = hash_hmac('sha256', (string)$payload, $whSecret);

                if (verify_hmac_signature((string)$payload, $sig, $whSecret)) {
                    $today = date('Y-m-d');
                    $start = (!empty($activeProfile['membership_expiry_date']) && $activeProfile['membership_expiry_date'] >= $today)
                        ? (new DateTimeImmutable($activeProfile['membership_expiry_date']))->modify('+1 day')->format('Y-m-d')
                        : $today;
                    $expiry = (new DateTimeImmutable($start))->modify('+' . (int)$plan['duration_days'] . ' days')->format('Y-m-d');
                    $rcpNo  = generate_receipt_number($pdo, $gymId);

                    $pdo->beginTransaction();
                    $pdo->prepare("INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot, start_date, expiry_date, action_type, status, notes) VALUES (:gid, :mid, :pid, :pname, :pprice, :sdate, :edate, 'Renewal', 'Active', 'Online member portal renewal')")
                        ->execute([':gid' => $gymId, ':mid' => (int)$activeProfile['id'], ':pid' => $planId, ':pname' => $plan['plan_name'], ':pprice' => $plan['price'], ':sdate' => $start, ':edate' => $expiry]);
                    $mhId = (int)$pdo->lastInsertId();

                    $pdo->prepare("UPDATE members SET plan_id = :pid, membership_start_date = :sdate, membership_expiry_date = :edate, status = 'Active' WHERE id = :mid AND gym_id = :gid")
                        ->execute([':pid' => $planId, ':sdate' => $start, ':edate' => $expiry, ':mid' => (int)$activeProfile['id'], ':gid' => $gymId]);

                    $pdo->prepare("INSERT INTO payments (gym_id, receipt_number, member_id, membership_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, transaction_ref, payment_status, payment_source) VALUES (:gid, :rcp, :mid, :mhid, :pid, :amt, :amt, 0.00, :pdate, 'UPI', :tref, 'Paid', 'gateway')")
                        ->execute([':gid' => $gymId, ':rcp' => $rcpNo, ':mid' => (int)$activeProfile['id'], ':mhid' => $mhId, ':pid' => $planId, ':amt' => $plan['price'], ':pdate' => $today, ':tref' => $orderRef]);
                    $payId = (int)$pdo->lastInsertId();

                    $pdo->prepare("UPDATE payment_orders SET status = 'Paid', webhook_event_id = :ev, payment_id = :payid, verified_signature = :sig, raw_verified_at = NOW() WHERE order_ref = :ref")
                        ->execute([':ev' => $evtId, ':payid' => $payId, ':sig' => $sig, ':ref' => $orderRef]);
                    $pdo->commit();

                    set_flash('success', sprintf('Verified renewal completed! Receipt %s issued and membership extended to %s.', $rcpNo, format_date($expiry)));
                    redirect('index.php?member_id=' . (int)$activeProfile['id']);
                }
            }
            set_flash('info', sprintf('Order %s created (%s). Complete checkout with your gym gateway.', $orderRef, format_money($plan['price'])));
        }
        redirect('index.php?member_id=' . (int)$activeProfile['id']);
    }
}

$qrToken = '';
$attRows = [];
$payRows = [];
$gymPlans = [];
$gymSettings = [];

if ($activeProfile) {
    $gid = (int)$activeProfile['gym_id'];
    $mid = (int)$activeProfile['id'];
    $gymSettings = get_gym_settings($pdo, $gid);

    $qStmt = $pdo->prepare("SELECT credential_token FROM qr_credentials WHERE member_id = :mid AND gym_id = :gid AND status = 'Active' ORDER BY id DESC LIMIT 1");
    $qStmt->execute([':mid' => $mid, ':gid' => $gid]);
    $qrToken = (string)($qStmt->fetchColumn() ?: '');
    if ($qrToken === '') {
        $qrToken = issue_member_qr_credential($pdo, $gid, $mid, null);
    }

    $aStmt = $pdo->prepare('SELECT * FROM attendance WHERE member_id = :mid AND gym_id = :gid ORDER BY attendance_date DESC LIMIT 20');
    $aStmt->execute([':mid' => $mid, ':gid' => $gid]);
    $attRows = $aStmt->fetchAll();

    $pStmt = $pdo->prepare('SELECT py.*, mp.plan_name FROM payments py LEFT JOIN membership_plans mp ON mp.id = py.plan_id WHERE py.member_id = :mid AND py.gym_id = :gid ORDER BY py.payment_date DESC LIMIT 20');
    $pStmt->execute([':mid' => $mid, ':gid' => $gid]);
    $payRows = $pStmt->fetchAll();

    $plStmt = $pdo->prepare('SELECT * FROM membership_plans WHERE gym_id = :gid AND is_active = 1 ORDER BY duration_days ASC');
    $plStmt->execute([':gid' => $gid]);
    $gymPlans = $plStmt->fetchAll();
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Member Portal — <?= e($platformCfg['brand_name'] ?? 'Hemnity') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="../assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<header class="bg-dark text-white py-3 px-4 border-bottom border-secondary">
    <div class="container d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div class="d-flex align-items-center gap-2">
            <span class="gym-brand-mark">H</span>
            <strong><?= e($activeProfile['gym_name'] ?? 'Member Portal') ?></strong>
        </div>
        <div class="d-flex align-items-center gap-2">
            <?php if (count($profiles) > 1): ?>
                <form method="get" action="index.php" class="m-0">
                    <select name="member_id" class="form-select form-select-sm bg-dark text-white border-secondary" onchange="this.form.submit()">
                        <?php foreach ($profiles as $pr): ?>
                            <option value="<?= (int)$pr['id'] ?>" <?= (int)$pr['id'] === (int)$activeProfile['id'] ? 'selected' : '' ?>><?= e($pr['gym_name']) ?> (<?= e($pr['member_code']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </form>
            <?php endif; ?>
            <form method="post" action="../logout.php" class="m-0"><?= csrf_field() ?><button type="submit" class="btn btn-sm btn-outline-light">Sign Out</button></form>
        </div>
    </div>
</header>

<div class="container py-4">
    <?php foreach ($flashes as $f): ?><div class="alert alert-<?= e($f['type']) ?> small"><?= e($f['message']) ?></div><?php endforeach; ?>

    <?php if ($activeProfile): ?>
        <div class="row g-4">
            <div class="col-lg-4">
                <div class="gym-card mb-4 text-center p-4">
                    <div class="small text-muted text-uppercase fw-semibold mb-1">Digital QR Check-In Pass</div>
                    <h1 class="h5 fw-bold mb-1"><?= e($activeProfile['full_name']) ?></h1>
                    <div class="font-mono small text-muted mb-3"><?= e($activeProfile['member_code']) ?> &middot; <?= e($activeProfile['status']) ?></div>
                    <div class="d-inline-block p-2 border rounded bg-white mb-2" data-qr-value="<?= e('HEMNITY:QR:' . $activeProfile['gym_id'] . ':' . $activeProfile['member_code'] . ':' . $qrToken) ?>" data-qr-size="160"></div>
                    <div class="small font-mono text-muted text-truncate"><?= e($qrToken) ?></div>
                    <div class="mt-3 pt-3 border-top small text-start">
                        <div>Plan: <strong><?= e($activeProfile['plan_name'] ?? 'Unassigned') ?></strong></div>
                        <div>Expires: <strong class="font-mono"><?= e(format_date($activeProfile['membership_expiry_date'])) ?></strong></div>
                    </div>
                </div>

                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Renew Membership Online</h2>
                    <form method="post" action="index.php?member_id=<?= (int)$activeProfile['id'] ?>">
                        <?= csrf_field() ?><input type="hidden" name="form_action" value="renew_online">
                        <div class="mb-3"><label class="form-label small fw-medium">Choose Plan</label><select name="plan_id" class="form-select form-select-sm"><?php foreach ($gymPlans as $pl): ?><option value="<?= (int)$pl['id'] ?>"><?= e($pl['plan_name']) ?> — <?= e(format_money($pl['price'], $gymSettings['currency_symbol'] ?? '₹')) ?></option><?php endforeach; ?></select></div>
                        <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="sim_wh" name="simulate_verified_webhook" value="1" checked><label class="form-check-label small" for="sim_wh">Verify HMAC Webhook (Test Mode)</label></div>
                        <button type="submit" class="btn btn-gym-primary btn-sm w-100">Proceed to Renewal</button>
                    </form>
                </div>
            </div>

            <div class="col-lg-8">
                <div class="gym-card mb-4">
                    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Attendance History</h2></div>
                    <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Date</th><th>Check-In</th><th>Method</th><th>Remarks</th></tr></thead><tbody>
                        <?php if (empty($attRows)): ?><tr><td colspan="4" class="text-center py-4 text-muted">No attendance records yet.</td></tr>
                        <?php else: foreach ($attRows as $a): ?>
                            <tr><td class="font-mono small"><?= e(format_date($a['attendance_date'])) ?></td><td class="font-mono small"><?= e(substr((string)$a['check_in_time'], 0, 5)) ?></td><td><?= e($a['check_in_method'] ?? 'Manual') ?></td><td class="small text-muted"><?= e($a['remarks'] ?? '—') ?></td></tr>
                        <?php endforeach; endif; ?>
                    </tbody></table></div>
                </div>

                <div class="gym-card">
                    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Payment Receipts</h2></div>
                    <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Receipt #</th><th>Date</th><th>Plan</th><th>Method</th><th class="text-end">Amount</th><th>Status</th></tr></thead><tbody>
                        <?php if (empty($payRows)): ?><tr><td colspan="6" class="text-center py-4 text-muted">No receipts yet.</td></tr>
                        <?php else: foreach ($payRows as $py): ?>
                            <tr><td class="font-mono small fw-semibold"><?= e($py['receipt_number']) ?></td><td class="font-mono small"><?= e(format_date($py['payment_date'])) ?></td><td><?= e($py['plan_name'] ?? '—') ?></td><td><?= e($py['payment_method']) ?></td><td class="text-end font-mono"><?= e(format_money($py['amount'], $gymSettings['currency_symbol'] ?? '₹')) ?></td><td><?= e($py['payment_status']) ?></td></tr>
                        <?php endforeach; endif; ?>
                    </tbody></table></div>
                </div>
            </div>
        </div>
    <?php endif; ?>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<script src="../assets/js/app.js"></script>
</body>
</html>
