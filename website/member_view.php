<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);

$memberId = (int)($_GET['id'] ?? $_POST['member_id'] ?? 0);
if ($memberId <= 0) {
    redirect('members.php');
}

$mCheckStmt = $pdo->prepare(
    'SELECT m.*, p.plan_name, p.price AS current_plan_price, p.duration_days
     FROM members m
     LEFT JOIN membership_plans p ON p.id = m.plan_id AND p.gym_id = m.gym_id
     WHERE m.id = :id AND m.gym_id = :gid
     LIMIT 1'
);
$mCheckStmt->execute([':id' => $memberId, ':gid' => $gymId]);
$member = $mCheckStmt->fetch();

if (!$member) {
    set_flash('danger', 'Member profile not found in your gym workspace.');
    redirect('members.php');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);
    $postAction = clean_str($_POST['form_action'] ?? '', 40);

    if ($postAction === 'renew_or_extend') {
        $planId     = (int)($_POST['plan_id'] ?? 0);
        $actionType = clean_str($_POST['action_type'] ?? 'Renewal', 30);
        $startDate  = clean_str($_POST['start_date'] ?? '', 20);
        $expiryDate = clean_str($_POST['expiry_date'] ?? '', 20);
        $notes      = clean_str($_POST['notes'] ?? '', 500);

        if (!in_array($actionType, ['Renewal', 'Extension', 'Plan Change'], true)) {
            $actionType = 'Renewal';
        }

        $planStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE id = :id AND gym_id = :gid LIMIT 1');
        $planStmt->execute([':id' => $planId, ':gid' => $gymId]);
        $plan = $planStmt->fetch();

        if (!$plan) {
            set_flash('danger', 'Please select a valid membership plan.');
        } elseif (!is_valid_date($startDate) || !is_valid_date($expiryDate) || $expiryDate < $startDate) {
            set_flash('danger', 'Please provide valid start and expiry dates.');
        } else {
            try {
                $pdo->beginTransaction();
                $pdo->prepare("UPDATE memberships SET status = 'Superseded' WHERE member_id = :mid AND gym_id = :gid AND status = 'Active'")
                    ->execute([':mid' => $memberId, ':gid' => $gymId]);

                $today     = date('Y-m-d');
                $newStatus = ($expiryDate < $today) ? 'Expired' : 'Active';

                $pdo->prepare(
                    'INSERT INTO memberships (
                        gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
                        start_date, expiry_date, action_type, status, notes, created_by
                    ) VALUES (
                        :gid, :mid, :pid, :pname, :pprice,
                        :sdate, :edate, :atype, :status, :notes, :admin_id
                    )'
                )->execute([
                    ':gid'      => $gymId,
                    ':mid'      => $memberId,
                    ':pid'      => (int)$plan['id'],
                    ':pname'    => (string)$plan['plan_name'],
                    ':pprice'   => (string)$plan['price'],
                    ':sdate'    => $startDate,
                    ':edate'    => $expiryDate,
                    ':atype'    => $actionType,
                    ':status'   => $newStatus,
                    ':notes'    => $notes !== '' ? $notes : null,
                    ':admin_id' => (int)$currentAdmin['id'],
                ]);

                $pdo->prepare(
                    'UPDATE members SET plan_id = :pid, membership_start_date = :sdate, membership_expiry_date = :edate, status = :status
                     WHERE id = :mid AND gym_id = :gid'
                )->execute([':pid' => (int)$plan['id'], ':sdate' => $startDate, ':edate' => $expiryDate, ':status' => $newStatus, ':mid' => $memberId, ':gid' => $gymId]);

                $pdo->commit();
                set_flash('success', sprintf('%s applied through %s.', $actionType, format_date($expiryDate)));
            } catch (Throwable $ex) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                set_flash('danger', 'Unable to update membership.');
            }
        }
        redirect('member_view.php?id=' . $memberId);
    } elseif ($postAction === 'portal_credentials') {
        $portalEmail = strtolower(clean_str($_POST['portal_email'] ?? '', 190));
        $portalPass  = (string)($_POST['portal_password'] ?? '');

        if (!filter_var($portalEmail, FILTER_VALIDATE_EMAIL)) {
            set_flash('danger', 'Please provide a valid email address for the Member Portal login.');
        } elseif (strlen($portalPass) < 8 || !preg_match('/[A-Za-z]/', $portalPass) || !preg_match('/\d/', $portalPass)) {
            set_flash('danger', 'Member Portal password must be at least 8 characters with letters and numbers.');
        } else {
            $uStmt = $pdo->prepare('SELECT id, role FROM users WHERE email = :email LIMIT 1');
            $uStmt->execute([':email' => $portalEmail]);
            $existingUser = $uStmt->fetch();

            if ($existingUser && $existingUser['role'] !== 'gym_member') {
                set_flash('danger', 'That email already belongs to a non-member account.');
            } else {
                $hash = password_hash($portalPass, PASSWORD_DEFAULT);
                if ($existingUser) {
                    $uid = (int)$existingUser['id'];
                    $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')->execute([':hash' => $hash, ':id' => $uid]);
                } else {
                    $pdo->prepare("INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete) VALUES ('gym_member', :name, :email, :phone, :hash, 1, 1)")
                        ->execute([':name' => $member['full_name'], ':email' => $portalEmail, ':phone' => $member['phone'], ':hash' => $hash]);
                    $uid = (int)$pdo->lastInsertId();
                }
                $pdo->prepare('UPDATE members SET user_id = :uid, email = COALESCE(email, :email) WHERE id = :mid AND gym_id = :gid')
                    ->execute([':uid' => $uid, ':email' => $portalEmail, ':mid' => $memberId, ':gid' => $gymId]);
                set_flash('success', 'Member Portal login enabled/reset for ' . $portalEmail . '.');
            }
        }
        redirect('member_view.php?id=' . $memberId);
    }
}

$activePlansStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE gym_id = :gid AND is_active = 1 ORDER BY duration_days ASC');
$activePlansStmt->execute([':gid' => $gymId]);
$activePlans = $activePlansStmt->fetchAll();

$histStmt = $pdo->prepare(
    'SELECT mh.*, u.full_name AS admin_name
     FROM memberships mh
     LEFT JOIN users u ON u.id = mh.created_by
     WHERE mh.member_id = :mid AND mh.gym_id = :gid
     ORDER BY mh.id DESC'
);
$histStmt->execute([':mid' => $memberId, ':gid' => $gymId]);
$membershipHistory = $histStmt->fetchAll();

$payStmt = $pdo->prepare(
    'SELECT py.*, mp.plan_name
     FROM payments py
     LEFT JOIN membership_plans mp ON mp.id = py.plan_id
     WHERE py.member_id = :mid AND py.gym_id = :gid
     ORDER BY py.payment_date DESC, py.id DESC'
);
$payStmt->execute([':mid' => $memberId, ':gid' => $gymId]);
$payments = $payStmt->fetchAll();

$totalPaid  = 0.0;
$balanceDue = 0.0;
foreach ($payments as $py) {
    if (in_array($py['payment_status'], ['Paid', 'Partial'], true)) {
        $totalPaid += (float)$py['amount'];
    }
    if ($py['payment_status'] === 'Pending') {
        $balanceDue += (float)$py['amount'];
    } elseif ($py['payment_status'] === 'Partial') {
        $balanceDue += (float)$py['balance_due'];
    }
}

$attCountStmt = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE member_id = :mid AND gym_id = :gid');
$attCountStmt->execute([':mid' => $memberId, ':gid' => $gymId]);
$totalAttendance = (int)$attCountStmt->fetchColumn();

$attStmt = $pdo->prepare('SELECT * FROM attendance WHERE member_id = :mid AND gym_id = :gid ORDER BY attendance_date DESC, check_in_time DESC LIMIT 20');
$attStmt->execute([':mid' => $memberId, ':gid' => $gymId]);
$attendanceRows = $attStmt->fetchAll();

$qrStmt = $pdo->prepare("SELECT credential_token FROM qr_credentials WHERE member_id = :mid AND gym_id = :gid AND status = 'Active' ORDER BY id DESC LIMIT 1");
$qrStmt->execute([':mid' => $memberId, ':gid' => $gymId]);
$qrToken = $qrStmt->fetchColumn();
if (!$qrToken) {
    $qrToken = issue_member_qr_credential($pdo, $gymId, $memberId, (int)$currentAdmin['id']);
}

$daysLeft   = days_until_expiry($member['membership_expiry_date']);
$isExpired  = ($member['status'] === 'Expired') || ($daysLeft !== null && $daysLeft < 0);
$isExpiring = ($member['status'] === 'Active' && $daysLeft !== null && $daysLeft >= 0 && $daysLeft <= 7);
$waUrl      = whatsapp_reminder_url((string)$member['phone'], (string)$member['full_name'], (string)$gymSettings['gym_name'], $member['membership_expiry_date'], $isExpired);

$today            = date('Y-m-d');
$defaultStartDate = (!empty($member['membership_expiry_date']) && $member['membership_expiry_date'] >= $today)
    ? (new DateTimeImmutable($member['membership_expiry_date']))->modify('+1 day')->format('Y-m-d')
    : $today;
$defaultPlanRow   = $activePlans[0] ?? null;
foreach ($activePlans as $ap) {
    if ((int)$ap['id'] === (int)($member['plan_id'] ?? 0)) {
        $defaultPlanRow = $ap;
        break;
    }
}
$defaultExpiryDate = $defaultPlanRow
    ? (new DateTimeImmutable($defaultStartDate))->modify('+' . (int)$defaultPlanRow['duration_days'] . ' days')->format('Y-m-d')
    : $defaultStartDate;

$pageTitle   = $member['full_name'];
$pageHeading = 'Member Profile';
require __DIR__ . '/includes/header.php';
?>
<div class="gym-card mb-4 <?= $isExpired && $member['status'] !== 'Inactive' ? 'gym-row-expired' : ($isExpiring ? 'gym-row-expiring' : '') ?>">
    <div class="gym-card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div class="d-flex align-items-center gap-3">
                <?php if (!empty($member['photo_path']) && is_file(__DIR__ . '/' . $member['photo_path'])): ?>
                    <img src="<?= e($member['photo_path']) ?>" alt="<?= e($member['full_name']) ?>" class="gym-avatar gym-avatar-lg">
                <?php else: ?>
                    <span class="gym-avatar gym-avatar-lg"><?= e(strtoupper(substr($member['full_name'], 0, 1) ?: 'M')) ?></span>
                <?php endif; ?>
                <div>
                    <h1 class="h4 fw-bold mb-1"><?= e($member['full_name']) ?></h1>
                    <div class="d-flex flex-wrap align-items-center gap-2 small text-muted">
                        <span class="font-mono fw-semibold text-dark"><?= e($member['member_code']) ?></span>
                        <span>&middot;</span>
                        <span class="font-mono"><?= e($member['phone']) ?></span>
                        <span>&middot;</span>
                        <span>Joined <?= e(format_date($member['joining_date'])) ?></span>
                    </div>
                </div>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <?php if ($waUrl): ?><a href="<?= e($waUrl) ?>" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm"><i class="bi bi-whatsapp me-1"></i>Remind</a><?php endif; ?>
                <a href="id_cards.php?member_id=<?= (int)$member['id'] ?>" class="btn btn-light border btn-sm"><i class="bi bi-qr-code me-1"></i>ID Card / QR</a>
                <a href="payment_add.php?member_id=<?= (int)$member['id'] ?>" class="btn btn-gym-primary btn-sm">Record Payment</a>
                <a href="attendance.php?member_id=<?= (int)$member['id'] ?>" class="btn btn-gym-dark btn-sm">Check In</a>
                <a href="member_edit.php?id=<?= (int)$member['id'] ?>" class="btn btn-light border btn-sm">Edit</a>
            </div>
        </div>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-4">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">QR Check-In Pass</h2><a href="id_cards.php?member_id=<?= (int)$member['id'] ?>" class="small text-decoration-none">Print Card</a></div>
            <div class="gym-card-body text-center">
                <div class="d-inline-block p-2 border rounded bg-white mb-2" data-qr-value="<?= e('HEMNITY:QR:' . $gymId . ':' . $member['member_code'] . ':' . $qrToken) ?>" data-qr-size="132"></div>
                <div class="small font-mono text-muted text-truncate"><?= e($qrToken) ?></div>
            </div>
        </div>

        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Member Portal Login</h2></div>
            <div class="gym-card-body">
                <form method="post" action="member_view.php?id=<?= (int)$member['id'] ?>">
                    <?= csrf_field() ?>
                    <input type="hidden" name="form_action" value="portal_credentials">
                    <input type="hidden" name="member_id" value="<?= (int)$member['id'] ?>">
                    <div class="mb-2"><label class="form-label small fw-medium">Portal Email</label><input type="email" class="form-control form-control-sm" name="portal_email" value="<?= e($member['email'] ?? '') ?>" required></div>
                    <div class="mb-3"><label class="form-label small fw-medium">Set / Reset Password</label><input type="password" class="form-control form-control-sm" name="portal_password" required minlength="8" placeholder="Min 8 chars + number"></div>
                    <button type="submit" class="btn btn-sm btn-gym-dark w-100"><?= !empty($member['user_id']) ? 'Reset Portal Password' : 'Enable Member Portal Login' ?></button>
                </form>
            </div>
        </div>

        <div class="gym-card" id="renew">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Renew or Extend Membership</h2></div>
            <div class="gym-card-body">
                <form method="post" action="member_view.php?id=<?= (int)$member['id'] ?>">
                    <?= csrf_field() ?>
                    <input type="hidden" name="form_action" value="renew_or_extend">
                    <input type="hidden" name="member_id" value="<?= (int)$member['id'] ?>">
                    <div class="mb-2"><label class="form-label small fw-medium">Action Type</label><select class="form-select form-select-sm" name="action_type"><option value="Renewal">Renew Membership</option><option value="Extension">Extend Expiry Date</option><option value="Plan Change">Switch Plan</option></select></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Plan</label><select class="form-select form-select-sm" name="plan_id" data-plan-selector required><?php foreach ($activePlans as $ap): ?><option value="<?= (int)$ap['id'] ?>" data-duration="<?= (int)$ap['duration_days'] ?>" data-price="<?= e($ap['price']) ?>" <?= $defaultPlanRow && (int)$defaultPlanRow['id'] === (int)$ap['id'] ? 'selected' : '' ?>><?= e($ap['plan_name']) ?> — <?= e(format_money($ap['price'])) ?></option><?php endforeach; ?></select></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Start Date</label><input type="date" class="form-control form-control-sm font-mono" name="start_date" value="<?= e($defaultStartDate) ?>" data-start-date required></div>
                    <div class="mb-2"><label class="form-label small fw-medium">New Expiry Date</label><input type="date" class="form-control form-control-sm font-mono" name="expiry_date" value="<?= e($defaultExpiryDate) ?>" data-expiry-date required></div>
                    <div class="mb-3"><label class="form-label small fw-medium">Notes</label><input type="text" class="form-control form-control-sm" name="notes"></div>
                    <button type="submit" class="btn btn-sm btn-gym-primary w-100 py-2">Apply Membership Update</button>
                </form>
            </div>
        </div>
    </div>

    <div class="col-lg-8">
        <div class="row g-3 mb-4">
            <div class="col-sm-4"><div class="gym-stat-card"><div class="gym-stat-label">Total Paid</div><div class="gym-stat-value fs-4"><?= e(format_money($totalPaid)) ?></div></div></div>
            <div class="col-sm-4"><div class="gym-stat-card"><div class="gym-stat-label">Outstanding Balance</div><div class="gym-stat-value fs-4 <?= $balanceDue > 0 ? 'text-danger' : '' ?>"><?= e(format_money($balanceDue)) ?></div></div></div>
            <div class="col-sm-4"><div class="gym-stat-card"><div class="gym-stat-label">Total Check-Ins</div><div class="gym-stat-value fs-4"><?= $totalAttendance ?></div></div></div>
        </div>

        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Payment History</h2><a href="payment_add.php?member_id=<?= (int)$member['id'] ?>" class="btn btn-sm btn-gym-primary">Record Payment</a></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="text-end">Paid</th><th>Status</th><th class="text-end">Receipt</th></tr></thead><tbody>
                <?php if (empty($payments)): ?><tr><td colspan="6" class="text-center py-4 text-muted">No payments yet.</td></tr>
                <?php else: foreach ($payments as $py): ?>
                    <tr><td class="font-mono small fw-semibold"><?= e($py['receipt_number']) ?></td><td class="font-mono small"><?= e(format_date($py['payment_date'])) ?></td><td><?= e($py['payment_method']) ?></td><td class="text-end font-mono"><?= e(format_money($py['amount'])) ?></td><td><?= e($py['payment_status']) ?></td><td class="text-end"><a href="receipt.php?id=<?= (int)$py['id'] ?>" class="btn btn-sm btn-light border">Print</a></td></tr>
                <?php endforeach; endif; ?>
            </tbody></table></div>
        </div>

        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Membership History</h2></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Plan</th><th>Type</th><th>Start</th><th>Expiry</th><th class="text-end">Fee</th><th>Status</th></tr></thead><tbody>
                <?php if (empty($membershipHistory)): ?><tr><td colspan="6" class="text-center py-4 text-muted">No history yet.</td></tr>
                <?php else: foreach ($membershipHistory as $mh): ?>
                    <tr><td class="fw-medium"><?= e($mh['plan_name_snapshot']) ?></td><td><?= e($mh['action_type']) ?></td><td class="font-mono small"><?= e(format_date($mh['start_date'])) ?></td><td class="font-mono small"><?= e(format_date($mh['expiry_date'])) ?></td><td class="text-end font-mono"><?= e(format_money($mh['plan_price_snapshot'])) ?></td><td><?= e($mh['status']) ?></td></tr>
                <?php endforeach; endif; ?>
            </tbody></table></div>
        </div>

        <div class="gym-card">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Recent Attendance</h2></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Date</th><th>Time</th><th>Method</th><th>Remarks</th></tr></thead><tbody>
                <?php if (empty($attendanceRows)): ?><tr><td colspan="4" class="text-center py-4 text-muted">No check-ins yet.</td></tr>
                <?php else: foreach ($attendanceRows as $att): ?>
                    <tr><td class="font-mono small"><?= e(format_date($att['attendance_date'])) ?></td><td class="font-mono small"><?= e(substr((string)$att['check_in_time'], 0, 5)) ?></td><td><?= e($att['check_in_method'] ?? 'Manual') ?></td><td class="small text-muted"><?= e($att['remarks'] ?? '—') ?></td></tr>
                <?php endforeach; endif; ?>
            </tbody></table></div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
