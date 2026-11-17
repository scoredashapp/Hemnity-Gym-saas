<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(true);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

$mStmt = $pdo->prepare('SELECT id, member_code, full_name, phone, plan_id, membership_expiry_date, status FROM members WHERE gym_id = :gid ORDER BY full_name ASC');
$mStmt->execute([':gid' => $gymId]);
$members = $mStmt->fetchAll();

$pStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE gym_id = :gid AND is_active = 1 ORDER BY duration_days ASC');
$pStmt->execute([':gid' => $gymId]);
$plans = $pStmt->fetchAll();

$preselectedMemberId = (int)($_GET['member_id'] ?? 0);
$defaultPlanId       = $plans[0]['id'] ?? '';
$defaultAmount       = $plans[0]['price'] ?? '';

if ($preselectedMemberId > 0) {
    foreach ($members as $m) {
        if ((int)$m['id'] === $preselectedMemberId && !empty($m['plan_id'])) {
            $defaultPlanId = (int)$m['plan_id'];
            foreach ($plans as $pl) {
                if ((int)$pl['id'] === $defaultPlanId) {
                    $defaultAmount = $pl['price'];
                    break;
                }
            }
            break;
        }
    }
}

$form = [
    'member_id'         => $preselectedMemberId > 0 ? (string)$preselectedMemberId : '',
    'plan_id'           => (string)$defaultPlanId,
    'amount'            => (string)$defaultAmount,
    'plan_total_amount' => (string)$defaultAmount,
    'payment_date'      => date('Y-m-d'),
    'payment_method'    => 'Cash',
    'transaction_ref'   => '',
    'payment_status'    => 'Paid',
    'extend_membership' => '0',
    'notes'             => '',
];
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $form['member_id']         = clean_str($_POST['member_id'] ?? '', 20);
    $form['plan_id']           = clean_str($_POST['plan_id'] ?? '', 20);
    $form['amount']            = clean_str($_POST['amount'] ?? '', 20);
    $form['plan_total_amount'] = clean_str($_POST['plan_total_amount'] ?? '', 20);
    $form['payment_date']      = clean_str($_POST['payment_date'] ?? '', 20);
    $form['payment_method']    = clean_str($_POST['payment_method'] ?? '', 30);
    $form['transaction_ref']   = clean_str($_POST['transaction_ref'] ?? '', 120);
    $form['payment_status']    = clean_str($_POST['payment_status'] ?? '', 20);
    $form['extend_membership'] = !empty($_POST['extend_membership']) ? '1' : '0';
    $form['notes']             = clean_str($_POST['notes'] ?? '', 500, true);

    $memberStmt = $pdo->prepare('SELECT * FROM members WHERE id = :id AND gym_id = :gid LIMIT 1');
    $memberStmt->execute([':id' => (int)$form['member_id'], ':gid' => $gymId]);
    $member = $memberStmt->fetch();
    if (!$member) {
        $errors[] = 'Please select a valid member from your gym.';
    }

    $selectedPlan = null;
    if ($form['plan_id'] !== '') {
        $plStmt = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :gid LIMIT 1');
        $plStmt->execute([':id' => (int)$form['plan_id'], ':gid' => $gymId]);
        $selectedPlan = $plStmt->fetch() ?: null;
        if (!$selectedPlan) {
            $errors[] = 'Selected membership plan is invalid.';
        }
    }

    if (!is_numeric($form['amount']) || (float)$form['amount'] <= 0) {
        $errors[] = 'Payment amount must be greater than zero.';
    }
    $planTotal = is_numeric($form['plan_total_amount']) ? max(0.0, (float)$form['plan_total_amount']) : (float)($selectedPlan['price'] ?? $form['amount']);
    if (!is_valid_date($form['payment_date'])) {
        $errors[] = 'Please enter a valid payment date.';
    }
    if (!in_array($form['payment_method'], ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'], true)) {
        $errors[] = 'Invalid payment method.';
    }
    if (!in_array($form['payment_status'], ['Paid', 'Partial', 'Pending'], true)) {
        $errors[] = 'Invalid payment status.';
    }

    if (empty($errors) && $member) {
        try {
            $pdo->beginTransaction();

            $paidAmount = round((float)$form['amount'], 2);
            $balanceDue = 0.0;
            if ($form['payment_status'] === 'Partial') {
                $balanceDue = max(0.0, round($planTotal - $paidAmount, 2));
            } elseif ($form['payment_status'] === 'Pending') {
                $balanceDue = $paidAmount;
            }

            $linkedMembershipId = null;
            if ($form['extend_membership'] === '1' && $selectedPlan) {
                $today = date('Y-m-d');
                $startBase = (!empty($member['membership_expiry_date']) && $member['membership_expiry_date'] >= $today)
                    ? (new DateTimeImmutable($member['membership_expiry_date']))->modify('+1 day')->format('Y-m-d')
                    : $today;
                $newExpiry = (new DateTimeImmutable($startBase))->modify('+' . (int)$selectedPlan['duration_days'] . ' days')->format('Y-m-d');

                $pdo->prepare("UPDATE memberships SET status = 'Superseded' WHERE member_id = :mid AND gym_id = :gid AND status = 'Active'")
                    ->execute([':mid' => (int)$member['id'], ':gid' => $gymId]);

                $pdo->prepare(
                    'INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot, start_date, expiry_date, action_type, status, notes, created_by)
                     VALUES (:gid, :mid, :pid, :pname, :pprice, :sdate, :edate, \'Renewal\', \'Active\', \'Renewed during payment entry.\', :admin_id)'
                )->execute([
                    ':gid' => $gymId, ':mid' => (int)$member['id'], ':pid' => (int)$selectedPlan['id'],
                    ':pname' => (string)$selectedPlan['plan_name'], ':pprice' => (string)$selectedPlan['price'],
                    ':sdate' => $startBase, ':edate' => $newExpiry, ':admin_id' => (int)$currentAdmin['id'],
                ]);
                $linkedMembershipId = (int)$pdo->lastInsertId();

                $pdo->prepare("UPDATE members SET plan_id = :pid, membership_start_date = :sdate, membership_expiry_date = :edate, status = 'Active' WHERE id = :mid AND gym_id = :gid")
                    ->execute([':pid' => (int)$selectedPlan['id'], ':sdate' => $startBase, ':edate' => $newExpiry, ':mid' => (int)$member['id'], ':gid' => $gymId]);
            } else {
                $latestStmt = $pdo->prepare('SELECT id FROM memberships WHERE member_id = :mid AND gym_id = :gid ORDER BY id DESC LIMIT 1');
                $latestStmt->execute([':mid' => (int)$member['id'], ':gid' => $gymId]);
                $latestId = $latestStmt->fetchColumn();
                if ($latestId) {
                    $linkedMembershipId = (int)$latestId;
                }
            }

            $receiptNo = generate_receipt_number($pdo, $gymId);

            $pdo->prepare(
                'INSERT INTO payments (
                    gym_id, receipt_number, member_id, membership_id, plan_id,
                    amount, plan_total_amount, balance_due, payment_date,
                    payment_method, transaction_ref, payment_status, payment_source, notes, received_by
                ) VALUES (
                    :gid, :rcp, :mid, :mhid, :pid,
                    :amt, :ptotal, :bdue, :pdate,
                    :pmethod, :tref, :pstatus, \'manual\', :notes, :admin_id
                )'
            )->execute([
                ':gid' => $gymId, ':rcp' => $receiptNo, ':mid' => (int)$member['id'], ':mhid' => $linkedMembershipId,
                ':pid' => $selectedPlan ? (int)$selectedPlan['id'] : null,
                ':amt' => number_format($paidAmount, 2, '.', ''), ':ptotal' => number_format($planTotal, 2, '.', ''), ':bdue' => number_format($balanceDue, 2, '.', ''),
                ':pdate' => $form['payment_date'], ':pmethod' => $form['payment_method'],
                ':tref' => $form['transaction_ref'] !== '' ? $form['transaction_ref'] : null,
                ':pstatus' => $form['payment_status'], ':notes' => $form['notes'] !== '' ? $form['notes'] : null, ':admin_id' => (int)$currentAdmin['id'],
            ]);

            $paymentId = (int)$pdo->lastInsertId();
            $pdo->commit();
            set_flash('success', sprintf('Payment %s recorded.', $receiptNo));
            redirect('receipt.php?id=' . $paymentId);
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $errors[] = 'Could not save payment record.';
        }
    }
}

$pageTitle   = 'Record Payment';
$pageHeading = 'Record Payment';
require __DIR__ . '/includes/header.php';
?>
<div class="row justify-content-center"><div class="col-lg-8"><div class="gym-card">
    <div class="gym-card-header"><h1 class="h6 fw-bold mb-0">Record Member Payment</h1><a href="payments.php" class="btn btn-sm btn-light border">Back to Payments</a></div>
    <div class="gym-card-body">
        <?php if (!empty($errors)): ?><div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
        <form method="post" action="payment_add.php">
            <?= csrf_field() ?>
            <div class="row g-3">
                <div class="col-md-6"><label class="form-label fw-medium">Member *</label><select class="form-select" name="member_id" required><option value="">-- Select Member --</option><?php foreach ($members as $m): ?><option value="<?= (int)$m['id'] ?>" <?= (string)$form['member_id'] === (string)$m['id'] ? 'selected' : '' ?>><?= e($m['full_name']) ?> (<?= e($m['member_code']) ?>)</option><?php endforeach; ?></select></div>
                <div class="col-md-6"><label class="form-label fw-medium">Membership Plan</label><select class="form-select" name="plan_id" data-plan-selector><option value="">-- Custom Fee --</option><?php foreach ($plans as $pl): ?><option value="<?= (int)$pl['id'] ?>" data-duration="<?= (int)$pl['duration_days'] ?>" data-price="<?= e($pl['price']) ?>" <?= (string)$form['plan_id'] === (string)$pl['id'] ? 'selected' : '' ?>><?= e($pl['plan_name']) ?> — <?= e(format_money($pl['price'])) ?></option><?php endforeach; ?></select></div>
                <div class="col-md-4"><label class="form-label fw-medium">Amount Collected *</label><input type="number" step="0.01" min="0.01" class="form-control font-mono" name="amount" value="<?= e($form['amount']) ?>" data-plan-amount required></div>
                <div class="col-md-4"><label class="form-label fw-medium">Total Plan Fee</label><input type="number" step="0.01" min="0" class="form-control font-mono" name="plan_total_amount" value="<?= e($form['plan_total_amount']) ?>" data-plan-total></div>
                <div class="col-md-4"><label class="form-label fw-medium">Payment Date *</label><input type="date" class="form-control font-mono" name="payment_date" value="<?= e($form['payment_date']) ?>" required></div>
                <div class="col-md-4"><label class="form-label fw-medium">Method *</label><select class="form-select" name="payment_method"><?php foreach (['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'] as $pm): ?><option value="<?= e($pm) ?>" <?= $form['payment_method'] === $pm ? 'selected' : '' ?>><?= e($pm) ?></option><?php endforeach; ?></select></div>
                <div class="col-md-4"><label class="form-label fw-medium">Reference ID</label><input type="text" class="form-control font-mono" name="transaction_ref" value="<?= e($form['transaction_ref']) ?>"></div>
                <div class="col-md-4"><label class="form-label fw-medium">Status *</label><select class="form-select" name="payment_status"><option value="Paid" <?= $form['payment_status'] === 'Paid' ? 'selected' : '' ?>>Paid</option><option value="Partial" <?= $form['payment_status'] === 'Partial' ? 'selected' : '' ?>>Partial</option><option value="Pending" <?= $form['payment_status'] === 'Pending' ? 'selected' : '' ?>>Pending</option></select></div>
                <div class="col-12"><div class="form-check p-3 bg-light border rounded"><input class="form-check-input ms-0 me-2" type="checkbox" id="extend_membership" name="extend_membership" value="1" <?= $form['extend_membership'] === '1' ? 'checked' : '' ?>><label class="form-check-label fw-medium" for="extend_membership">Also renew / extend active membership by selected plan duration</label></div></div>
                <div class="col-12"><label class="form-label fw-medium">Remarks</label><textarea class="form-control" name="notes" rows="2"><?= e($form['notes']) ?></textarea></div>
            </div>
            <div class="d-flex justify-content-end gap-2 mt-4"><a href="payments.php" class="btn btn-light border">Cancel</a><button type="submit" class="btn btn-gym-primary">Save Payment &amp; Generate Receipt</button></div>
        </form>
    </div>
</div></div></div>
<?php require __DIR__ . '/includes/footer.php'; ?>
