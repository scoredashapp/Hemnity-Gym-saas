<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $formAction = clean_str($_POST['form_action'] ?? '', 30);

    if ($formAction === 'switch_plan') {
        $planId = (int)($_POST['saas_plan_id'] ?? 0);
        $cycle  = in_array($_POST['billing_cycle'] ?? '', ['monthly', 'quarterly', 'yearly'], true) ? (string)$_POST['billing_cycle'] : 'monthly';
        $pStmt  = $pdo->prepare('SELECT * FROM saas_plans WHERE id = :id AND is_active = 1 LIMIT 1');
        $pStmt->execute([':id' => $planId]);
        $plan   = $pStmt->fetch();

        if ($plan) {
            $days   = $cycle === 'yearly' ? 365 : ($cycle === 'quarterly' ? 90 : 30);
            $amount = $cycle === 'yearly' ? (float)$plan['yearly_price'] : ($cycle === 'quarterly' ? (float)$plan['quarterly_price'] : (float)$plan['monthly_price']);
            $today  = date('Y-m-d');
            $end    = (new DateTimeImmutable($today))->modify('+' . $days . ' days')->format('Y-m-d');

            $pdo->prepare("UPDATE gym_saas_subscriptions SET saas_plan_id = :pid, billing_cycle = :cycle, status = 'Active', current_period_start = :start, current_period_end = :end WHERE gym_id = :gid")
                ->execute([':pid' => $planId, ':cycle' => $cycle, ':start' => $today, ':end' => $end, ':gid' => $gymId]);
            $pdo->prepare("UPDATE gyms SET status = 'Active' WHERE id = :gid")->execute([':gid' => $gymId]);

            $invNo = 'HEM-INV-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
            $pdo->prepare("INSERT INTO saas_subscription_payments (invoice_number, gym_id, saas_plan_id, billing_cycle, amount, currency, payment_method, status, paid_at) VALUES (:inv, :gid, :pid, :cycle, :amt, 'INR', 'Online', 'Paid', NOW())")
                ->execute([':inv' => $invNo, ':gid' => $gymId, ':pid' => $planId, ':cycle' => $cycle, ':amt' => number_format($amount, 2, '.', '')]);

            log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'subscription.upgraded', 'gym', (string)$gymId, $gymId, ['plan' => $plan['slug'], 'cycle' => $cycle]);
            set_flash('success', sprintf('Switched to %s (%s). Invoice %s recorded.', $plan['plan_name'], $cycle, $invNo));
        }
        redirect('owner_subscription.php');
    } elseif ($formAction === 'support_ticket') {
        $subject = clean_str($_POST['subject'] ?? '', 200);
        $message = clean_str($_POST['message'] ?? '', 1200, true);
        if ($subject !== '' && $message !== '') {
            $pdo->prepare("INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status) VALUES (:gid, :uid, :name, :email, :subj, :msg, 'Open')")
                ->execute([':gid' => $gymId, ':uid' => (int)$currentAdmin['id'], ':name' => $currentAdmin['full_name'], ':email' => $currentAdmin['email'], ':subj' => $subject, ':msg' => $message]);
            set_flash('success', 'Support ticket submitted to the Hemnity platform team.');
        }
        redirect('owner_subscription.php');
    }
}

$sub       = get_gym_subscription_info($pdo, $gymId);
$saasPlans = $pdo->query('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC')->fetchAll();

$invStmt = $pdo->prepare('SELECT sp.*, pl.plan_name FROM saas_subscription_payments sp LEFT JOIN saas_plans pl ON pl.id = sp.saas_plan_id WHERE sp.gym_id = :gid ORDER BY sp.id DESC LIMIT 20');
$invStmt->execute([':gid' => $gymId]);
$invoices = $invStmt->fetchAll();

$tStmt = $pdo->prepare('SELECT * FROM support_tickets WHERE gym_id = :gid ORDER BY id DESC LIMIT 10');
$tStmt->execute([':gid' => $gymId]);
$tickets = $tStmt->fetchAll();

$pageTitle   = 'SaaS Subscription';
$pageHeading = 'SaaS Subscription & Support';
require __DIR__ . '/includes/header.php';
?>
<div class="row g-4 mb-4">
    <div class="col-lg-5">
        <div class="gym-card h-100">
            <div class="gym-card-header"><h1 class="h6 fw-bold mb-0">Current Hemnity SaaS Plan</h1></div>
            <div class="gym-card-body">
                <?php if ($sub): ?>
                    <div class="h4 fw-bold mb-1"><?= e($sub['plan_name']) ?> <span class="fs-6 text-muted font-mono">(<?= e($sub['effective_status']) ?>)</span></div>
                    <div class="small text-muted mb-3">Cycle: <strong><?= e(ucfirst($sub['billing_cycle'])) ?></strong> &middot; Valid until <span class="font-mono"><?= e(format_date($sub['current_period_end'])) ?></span></div>
                    <div class="mb-2 small">Member Quota: <strong class="font-mono"><?= (int)$sub['current_members'] ?> / <?= (int)$sub['max_members'] ?></strong></div>
                    <div class="progress mb-3" style="height: 8px;"><div class="progress-bar bg-warning" style="width: <?= min(100, (int)round(($sub['current_members'] / max(1, (int)$sub['max_members'])) * 100)) ?>%"></div></div>
                <?php endif; ?>

                <form method="post" action="owner_subscription.php" class="border-top pt-3 mt-3">
                    <?= csrf_field() ?><input type="hidden" name="form_action" value="switch_plan">
                    <div class="mb-2"><label class="form-label small fw-medium">Change / Renew Plan</label><select class="form-select form-select-sm" name="saas_plan_id"><?php foreach ($saasPlans as $sp): ?><option value="<?= (int)$sp['id'] ?>" <?= $sub && (int)$sub['saas_plan_id'] === (int)$sp['id'] ? 'selected' : '' ?>><?= e($sp['plan_name']) ?> (₹<?= number_format((float)$sp['monthly_price'], 0) ?>/mo)</option><?php endforeach; ?></select></div>
                    <div class="mb-3"><label class="form-label small fw-medium">Billing Cycle</label><select class="form-select form-select-sm" name="billing_cycle"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div>
                    <button type="submit" class="btn btn-gym-primary btn-sm w-100">Activate / Renew Subscription</button>
                </form>
            </div>
        </div>
    </div>

    <div class="col-lg-7">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Platform Invoices</h2></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Invoice #</th><th>Plan</th><th>Cycle</th><th class="text-end">Amount</th><th>Status</th></tr></thead><tbody>
                <?php if (empty($invoices)): ?><tr><td colspan="5" class="text-center py-4 text-muted">No SaaS invoices recorded yet.</td></tr>
                <?php else: foreach ($invoices as $inv): ?>
                    <tr><td class="font-mono small fw-semibold"><?= e($inv['invoice_number']) ?></td><td><?= e($inv['plan_name'] ?? 'SaaS') ?></td><td><?= e(ucfirst($inv['billing_cycle'])) ?></td><td class="text-end font-mono">₹<?= number_format((float)$inv['amount'], 2) ?></td><td><?= e($inv['status']) ?></td></tr>
                <?php endforeach; endif; ?>
            </tbody></table></div>
        </div>

        <div class="gym-card">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Contact Hemnity Support</h2></div>
            <div class="gym-card-body">
                <form method="post" action="owner_subscription.php" class="mb-3">
                    <?= csrf_field() ?><input type="hidden" name="form_action" value="support_ticket">
                    <div class="mb-2"><input type="text" class="form-control form-control-sm" name="subject" placeholder="Ticket subject..." required></div>
                    <div class="mb-2"><textarea class="form-control form-control-sm" name="message" rows="2" placeholder="Describe your request..." required></textarea></div>
                    <button type="submit" class="btn btn-gym-dark btn-sm">Submit Support Ticket</button>
                </form>
                <?php foreach ($tickets as $t): ?>
                    <div class="border rounded p-2 mb-2 small">
                        <div class="d-flex justify-content-between"><strong><?= e($t['subject']) ?></strong><span class="font-mono"><?= e($t['status']) ?></span></div>
                        <div class="text-muted"><?= e($t['message']) ?></div>
                        <?php if (!empty($t['admin_reply'])): ?><div class="mt-1 text-success">Reply: <?= e($t['admin_reply']) ?></div><?php endif; ?>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
