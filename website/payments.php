<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);

    $action    = clean_str($_POST['action'] ?? '', 30);
    $paymentId = (int)($_POST['payment_id'] ?? 0);

    if ($action === 'refund' && $paymentId > 0) {
        $pStmt = $pdo->prepare('SELECT id, receipt_number, amount, payment_status FROM payments WHERE id = :id AND gym_id = :gid LIMIT 1');
        $pStmt->execute([':id' => $paymentId, ':gid' => $gymId]);
        $target = $pStmt->fetch();

        if ($target && $target['payment_status'] !== 'Refunded') {
            $pdo->prepare("UPDATE payments SET payment_status = 'Refunded', refund_amount = amount, balance_due = 0.00 WHERE id = :id AND gym_id = :gid")
                ->execute([':id' => $paymentId, ':gid' => $gymId]);
            log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'payment.refunded', 'payment', (string)$paymentId, $gymId, ['receipt_number' => $target['receipt_number']]);
            set_flash('success', sprintf('Receipt %s marked as Refunded.', $target['receipt_number']));
        }
    }
    redirect('payments.php');
}

$search   = clean_str($_GET['q'] ?? '', 100);
$method   = clean_str($_GET['method'] ?? '', 30);
$status   = clean_str($_GET['status'] ?? '', 20);
$dateFrom = clean_str($_GET['from'] ?? '', 20);
$dateTo   = clean_str($_GET['to'] ?? '', 20);
$page     = max(1, (int)($_GET['page'] ?? 1));
$perPage  = 15;

$today      = date('Y-m-d');
$monthStart = date('Y-m-01');
$monthEnd   = date('Y-m-t');

$dailyStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE gym_id = :gid AND payment_status IN ('Paid', 'Partial') AND payment_date = :today");
$dailyStmt->execute([':gid' => $gymId, ':today' => $today]);
$dailyRevenue = (float)$dailyStmt->fetchColumn();

$monthStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE gym_id = :gid AND payment_status IN ('Paid', 'Partial') AND payment_date BETWEEN :ms AND :me");
$monthStmt->execute([':gid' => $gymId, ':ms' => $monthStart, ':me' => $monthEnd]);
$monthlyRevenue = (float)$monthStmt->fetchColumn();

$duesStmt = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END), 0) FROM payments WHERE gym_id = :gid AND payment_status IN ('Pending', 'Partial') AND (payment_status = 'Pending' OR balance_due > 0)");
$duesStmt->execute([':gid' => $gymId]);
$outstandingDues = (float)$duesStmt->fetchColumn();

$where  = ['py.gym_id = :gid'];
$params = [':gid' => $gymId];

if ($search !== '') {
    $where[]       = '(m.full_name LIKE :q1 OR m.member_code LIKE :q2 OR py.receipt_number LIKE :q3 OR py.transaction_ref LIKE :q4)';
    $like          = '%' . $search . '%';
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
}
if (in_array($method, ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'], true)) {
    $where[]           = 'py.payment_method = :method';
    $params[':method'] = $method;
}
if (in_array($status, ['Paid', 'Partial', 'Pending', 'Refunded'], true)) {
    $where[]           = 'py.payment_status = :status';
    $params[':status'] = $status;
}
if (is_valid_date($dateFrom)) {
    $where[]         = 'py.payment_date >= :from';
    $params[':from'] = $dateFrom;
}
if (is_valid_date($dateTo)) {
    $where[]       = 'py.payment_date <= :to';
    $params[':to'] = $dateTo;
}

$whereSql = 'WHERE ' . implode(' AND ', $where);

$countStmt = $pdo->prepare(
    "SELECT COUNT(*), COALESCE(SUM(CASE WHEN py.payment_status IN ('Paid','Partial') THEN py.amount ELSE 0 END), 0)
     FROM payments py INNER JOIN members m ON m.id = py.member_id {$whereSql}"
);
foreach ($params as $k => $v) {
    $countStmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
}
$countStmt->execute();
[$totalRows, $filteredTotal] = array_values($countStmt->fetch(PDO::FETCH_NUM) ?: [0, 0]);
$totalRows     = (int)$totalRows;
$filteredTotal = (float)$filteredTotal;
$totalPages    = max(1, (int)ceil($totalRows / $perPage));
if ($page > $totalPages) {
    $page = $totalPages;
}
$offset = ($page - 1) * $perPage;

$sql = "SELECT py.*, m.full_name, m.member_code, m.phone, p.plan_name
        FROM payments py
        INNER JOIN members m ON m.id = py.member_id
        LEFT JOIN membership_plans p ON p.id = py.plan_id
        {$whereSql}
        ORDER BY py.payment_date DESC, py.id DESC
        LIMIT :limit OFFSET :offset";

$stmt = $pdo->prepare($sql);
foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
}
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$payments = $stmt->fetchAll();

$pageTitle   = 'Payments';
$pageHeading = 'Payments & Receipts';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Payments &amp; Receipts</h1><p class="text-muted small mb-0">Tenant ledger, refunds, outstanding balances, and printable receipts.</p></div>
    <a href="payment_add.php" class="btn btn-gym-primary d-inline-flex align-items-center gap-2"><i class="bi bi-cash-stack"></i><span>Record Payment</span></a>
</div>

<div class="row g-3 mb-4">
    <div class="col-sm-6 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Today's Collections</div><div class="gym-stat-value"><?= e(format_money($dailyRevenue)) ?></div></div></div>
    <div class="col-sm-6 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">This Month</div><div class="gym-stat-value"><?= e(format_money($monthlyRevenue)) ?></div></div></div>
    <div class="col-sm-6 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Filtered Collected Total</div><div class="gym-stat-value"><?= e(format_money($filteredTotal)) ?></div></div></div>
    <div class="col-sm-6 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Outstanding Dues</div><div class="gym-stat-value <?= $outstandingDues > 0 ? 'text-danger' : '' ?>"><?= e(format_money($outstandingDues)) ?></div></div></div>
</div>

<div class="gym-card mb-4"><div class="gym-card-body py-3">
    <form method="get" action="payments.php" class="row g-2 align-items-end">
        <div class="col-md-3"><label class="form-label small text-muted mb-1">Member / Receipt / Ref</label><input type="text" class="form-control" name="q" value="<?= e($search) ?>" placeholder="Name, RCP-..."></div>
        <div class="col-sm-6 col-md-2"><label class="form-label small text-muted mb-1">Method</label><select class="form-select" name="method"><option value="">All Methods</option><?php foreach (['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'] as $mOpt): ?><option value="<?= e($mOpt) ?>" <?= $method === $mOpt ? 'selected' : '' ?>><?= e($mOpt) ?></option><?php endforeach; ?></select></div>
        <div class="col-sm-6 col-md-2"><label class="form-label small text-muted mb-1">Status</label><select class="form-select" name="status"><option value="">All Statuses</option><?php foreach (['Paid', 'Partial', 'Pending', 'Refunded'] as $sOpt): ?><option value="<?= e($sOpt) ?>" <?= $status === $sOpt ? 'selected' : '' ?>><?= e($sOpt) ?></option><?php endforeach; ?></select></div>
        <div class="col-sm-6 col-md-2"><label class="form-label small text-muted mb-1">From</label><input type="date" class="form-control font-mono" name="from" value="<?= e($dateFrom) ?>"></div>
        <div class="col-sm-6 col-md-2"><label class="form-label small text-muted mb-1">To</label><input type="date" class="form-control font-mono" name="to" value="<?= e($dateTo) ?>"></div>
        <div class="col-md-1 d-grid"><button type="submit" class="btn btn-gym-dark">Filter</button></div>
    </form>
</div></div>

<div class="gym-card">
    <div class="table-responsive">
        <table class="table gym-table">
            <thead><tr><th>Receipt #</th><th>Date</th><th>Member</th><th>Plan</th><th>Method</th><th class="text-end">Amount</th><th class="text-end">Balance</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
            <tbody>
                <?php if (empty($payments)): ?>
                    <tr><td colspan="9" class="text-center py-5 text-muted">No payment records found.</td></tr>
                <?php else: foreach ($payments as $py): ?>
                    <tr>
                        <td class="font-mono small fw-semibold"><a href="receipt.php?id=<?= (int)$py['id'] ?>" class="text-dark text-decoration-none"><?= e($py['receipt_number']) ?></a></td>
                        <td class="font-mono small"><?= e(format_date($py['payment_date'])) ?></td>
                        <td><a href="member_view.php?id=<?= (int)$py['member_id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($py['full_name']) ?></a><div class="small text-muted font-mono"><?= e($py['member_code']) ?></div></td>
                        <td><?= e($py['plan_name'] ?? '—') ?></td>
                        <td><div><?= e($py['payment_method']) ?></div><?php if (!empty($py['transaction_ref'])): ?><div class="small text-muted font-mono"><?= e($py['transaction_ref']) ?></div><?php endif; ?></td>
                        <td class="text-end font-mono fw-semibold"><?= e(format_money($py['amount'])) ?></td>
                        <td class="text-end font-mono <?= (float)$py['balance_due'] > 0 ? 'text-danger fw-semibold' : 'text-muted' ?>"><?= e(format_money($py['balance_due'])) ?></td>
                        <td>
                            <?php if ($py['payment_status'] === 'Paid'): ?><span class="status-text-active">Paid</span>
                            <?php elseif ($py['payment_status'] === 'Partial'): ?><span class="status-text-expiring">Partial</span>
                            <?php elseif ($py['payment_status'] === 'Refunded'): ?><span class="status-text-inactive">Refunded</span>
                            <?php else: ?><span class="status-text-expired">Pending</span><?php endif; ?>
                        </td>
                        <td class="text-end text-nowrap">
                            <a href="receipt.php?id=<?= (int)$py['id'] ?>" class="btn btn-sm btn-light border"><i class="bi bi-printer me-1"></i>Receipt</a>
                            <?php if ($py['payment_status'] !== 'Refunded'): ?>
                                <form method="post" action="payments.php" class="d-inline m-0" data-confirm="Mark receipt <?= e($py['receipt_number']) ?> as Refunded?">
                                    <?= csrf_field() ?><input type="hidden" name="action" value="refund"><input type="hidden" name="payment_id" value="<?= (int)$py['id'] ?>">
                                    <button type="submit" class="btn btn-sm btn-outline-danger">Refund</button>
                                </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
