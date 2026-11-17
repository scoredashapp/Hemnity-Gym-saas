<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);

$paymentId = (int)($_GET['id'] ?? 0);
if ($paymentId <= 0) {
    redirect('payments.php');
}

$stmt = $pdo->prepare(
    'SELECT py.*,
            m.member_code, m.full_name, m.phone, m.email, m.address AS member_address,
            m.membership_start_date, m.membership_expiry_date,
            p.plan_name, p.duration_days,
            u.full_name AS received_by_name
     FROM payments py
     INNER JOIN members m ON m.id = py.member_id
     LEFT JOIN membership_plans p ON p.id = py.plan_id
     LEFT JOIN users u ON u.id = py.received_by
     WHERE py.id = :id AND py.gym_id = :gid
     LIMIT 1'
);
$stmt->execute([':id' => $paymentId, ':gid' => $gymId]);
$receipt = $stmt->fetch();

if (!$receipt) {
    set_flash('danger', 'Payment receipt not found in your gym workspace.');
    redirect('payments.php');
}

$pageTitle   = 'Receipt ' . $receipt['receipt_number'];
$pageHeading = 'Payment Receipt';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4 no-print" style="max-width: 760px; margin: 0 auto;">
    <a href="payments.php" class="btn btn-light border btn-sm">&larr; Back to Payments</a>
    <div class="d-flex gap-2">
        <a href="member_view.php?id=<?= (int)$receipt['member_id'] ?>" class="btn btn-light border btn-sm">Member Profile</a>
        <button type="button" onclick="window.print()" class="btn btn-gym-primary btn-sm"><i class="bi bi-printer me-1"></i>Print / Save PDF</button>
    </div>
</div>

<style>
    .rc, .rc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .rc { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.10); border: 1px solid #e5e7eb; }
    .rc-head { background: linear-gradient(120deg, #0b0b12 0%, #1f2937 55%, <?= e($gymSettings['id_card_accent_color'] ?? '#ea580c') ?> 150%); color: #fff; padding: 26px 30px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; align-items: center; }
    .rc-head img.logo { width: 58px; height: 58px; object-fit: cover; border-radius: 12px; background: #fff; }
    .rc-title { text-align: right; }
    .rc-title .lbl { letter-spacing: .18em; font-size: 11px; opacity: .85; font-weight: 700; }
    .rc-title .no { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 800; }
    .rc-band { background: #fff7ed; border-bottom: 3px solid <?= e($gymSettings['id_card_accent_color'] ?? '#ea580c') ?>; padding: 10px 30px; display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 13px; color: #7c2d12; }
    .rc-body { padding: 26px 30px; }
    .rc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid <?= e($gymSettings['id_card_accent_color'] ?? '#ea580c') ?>; border-radius: 10px; padding: 14px 16px; height: 100%; }
    .rc table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    .rc th { background: #0b0b12; color: #fff; padding: 10px 12px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; text-align: left; }
    .rc th:last-child, .rc td:last-child { text-align: right; }
    .rc td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .rc tfoot td { border: 0; }
    .rc .total-row td { background: #ecfdf5; color: #065f46; font-weight: 800; font-size: 17px; border-top: 2px solid #10b981; }
    .rc .due-row td { background: #fef2f2; color: #b91c1c; font-weight: 700; }
    .rc .chip { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .05em; }
    .rc .chip.Paid { background: #22c55e; color: #052e16; } .rc .chip.Partial { background: #f59e0b; color: #451a03; } .rc .chip.Pending { background: #fb923c; color: #431407; } .rc .chip.Refunded, .rc .chip.Failed { background: #ef4444; color: #fff; }
    .rc-foot { background: linear-gradient(90deg, #0b0b12, <?= e($gymSettings['id_card_accent_color'] ?? '#ea580c') ?>); color: #fff; text-align: center; padding: 14px; font-size: 13px; }
    @media print { @page { size: A4; margin: 10mm; } .rc { box-shadow: none; border: 1px solid #d1d5db; max-width: 100%; } }
</style>
<div class="rc">
    <div class="rc-head">
        <div class="d-flex align-items-center gap-3">
            <?php if (!empty($gymSettings['logo_path']) && is_file(__DIR__ . '/' . $gymSettings['logo_path'])): ?>
                <img class="logo" src="<?= e($gymSettings['logo_path']) ?>" alt="<?= e($gymSettings['gym_name']) ?>">
            <?php else: ?>
                <span class="gym-brand-mark" style="width: 52px; height: 52px; font-size: 1.4rem;"><?= e(strtoupper(substr((string)$gymSettings['gym_name'], 0, 1))) ?></span>
            <?php endif; ?>
            <div>
                <div style="font-size:21px;font-weight:800;line-height:1.1"><?= e($gymSettings['gym_name']) ?></div>
                <?php if (!empty($gymSettings['address'])): ?><div style="font-size:12px;opacity:.85"><?= e($gymSettings['address']) ?></div><?php endif; ?>
                <div style="font-size:12px;opacity:.85"><?= e($gymSettings['contact_number'] ?? '') ?> <?= !empty($gymSettings['email']) ? '· ' . e($gymSettings['email']) : '' ?></div>
            </div>
        </div>
        <div class="rc-title"><div class="lbl">PAYMENT RECEIPT</div><div class="no"><?= e($receipt['receipt_number']) ?></div></div>
    </div>
    <div class="rc-band"><span>Date: <strong><?= e(format_date($receipt['payment_date'])) ?></strong></span><span>Method: <strong><?= e($receipt['payment_method']) ?></strong><?= !empty($receipt['transaction_ref']) ? ' · Ref: <strong>' . e($receipt['transaction_ref']) . '</strong>' : '' ?></span><span><span class="chip <?= e($receipt['payment_status']) ?>"><?= e($receipt['payment_status']) ?></span></span></div>
    <div class="rc-body">
        <div class="row g-3">
            <div class="col-sm-6"><div class="rc-box"><div class="small text-muted mb-1">BILLED TO</div><div class="fw-bold fs-6"><?= e($receipt['full_name']) ?></div><div class="small font-mono text-muted">Member ID: <?= e($receipt['member_code']) ?></div><div class="small font-mono text-muted">Phone: <?= e($receipt['phone']) ?></div></div></div>
            <div class="col-sm-6"><div class="rc-box"><div class="small text-muted mb-1">MEMBERSHIP</div><div class="fw-bold"><?= e($receipt['plan_name'] ?? 'Gym Membership') ?></div><div class="small font-mono text-muted"><?= e(format_date($receipt['membership_start_date'])) ?> &ndash; <?= e(format_date($receipt['membership_expiry_date'])) ?></div><?php if (!empty($receipt['received_by_name'])): ?><div class="small text-muted">Received by: <?= e($receipt['received_by_name']) ?></div><?php endif; ?></div></div>
        </div>
        <table>
            <thead><tr><th>Description</th><th>Validity Period</th><th>Amount</th></tr></thead>
            <tbody><tr>
                <td><div class="fw-semibold"><?= e($receipt['plan_name'] ? $receipt['plan_name'] . ' Membership' : 'Gym Membership Fee') ?></div><?php if (!empty($receipt['notes'])): ?><div class="small text-muted"><?= e($receipt['notes']) ?></div><?php endif; ?></td>
                <td class="font-mono small" style="text-align:left"><?= e(format_date($receipt['membership_start_date'])) ?> &ndash; <?= e(format_date($receipt['membership_expiry_date'])) ?></td>
                <td class="font-mono fw-semibold"><?= e(format_money($receipt['amount'])) ?></td>
            </tr></tbody>
            <tfoot>
                <tr class="total-row"><td colspan="2" style="text-align:right">Amount Paid</td><td class="font-mono"><?= e(format_money($receipt['amount'])) ?></td></tr>
                <?php if ((float)$receipt['balance_due'] > 0): ?><tr class="due-row"><td colspan="2" style="text-align:right">Balance Due</td><td class="font-mono"><?= e(format_money($receipt['balance_due'])) ?></td></tr><?php endif; ?>
            </tfoot>
        </table>
    </div>
    <div class="rc-foot"><?= e($gymSettings['receipt_footer']) ?></div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
