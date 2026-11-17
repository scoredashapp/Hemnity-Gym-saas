<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);

$tab         = clean_str($_GET['tab'] ?? 'summary', 30);
$granularity = clean_str($_GET['granularity'] ?? 'monthly', 20);
$defaultFrom = (new DateTimeImmutable('first day of this month'))->modify('-2 months')->format('Y-m-d');
$defaultTo   = date('Y-m-d');
$dateFrom    = is_valid_date($_GET['from'] ?? '') ? (string)$_GET['from'] : $defaultFrom;
$dateTo      = is_valid_date($_GET['to'] ?? '') ? (string)$_GET['to'] : $defaultTo;

if (!in_array($tab, ['summary', 'registrations', 'revenue', 'payments', 'attendance', 'renewals', 'dues'], true)) $tab = 'summary';
if (!in_array($granularity, ['daily', 'monthly', 'yearly'], true)) $granularity = 'monthly';

$headers = [];
$rows    = [];

if ($tab === 'summary') {
    $headers = ['Status / Metric', 'Member Count', 'Share (%)'];
    $cStmt   = $pdo->prepare('SELECT COUNT(*) FROM members WHERE gym_id = :gid');
    $cStmt->execute([':gid' => $gymId]);
    $rawTot = (int)$cStmt->fetchColumn();
    $tot    = max(1, $rawTot);

    $bStmt = $pdo->prepare("SELECT status, COUNT(*) AS cnt FROM members WHERE gym_id = :gid GROUP BY status ORDER BY FIELD(status, 'Active', 'Expired', 'Inactive')");
    $bStmt->execute([':gid' => $gymId]);
    $rows[] = ['Total Registered Members', (string)$rawTot, '100.0%'];
    foreach ($bStmt->fetchAll() as $b) {
        $rows[] = [$b['status'] . ' Memberships', (string)$b['cnt'], round(((int)$b['cnt'] / $tot) * 100, 1) . '%'];
    }
} elseif ($tab === 'registrations') {
    $headers = ['Member ID', 'Full Name', 'Phone', 'Plan', 'Joining Date', 'Expiry Date', 'Status'];
    $stmt = $pdo->prepare(
        'SELECT m.member_code, m.full_name, m.phone, COALESCE(p.plan_name, "Unassigned"), m.joining_date, COALESCE(m.membership_expiry_date, "—"), m.status
         FROM members m LEFT JOIN membership_plans p ON p.id = m.plan_id
         WHERE m.gym_id = :gid AND m.joining_date BETWEEN :from AND :to ORDER BY m.joining_date DESC'
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    $rows = $stmt->fetchAll(PDO::FETCH_NUM);
} elseif ($tab === 'revenue') {
    $fmt = match ($granularity) { 'daily' => '%Y-%m-%d', 'yearly' => '%Y', default => '%Y-%m' };
    $headers = [ucfirst($granularity) . ' Period', 'Transactions', 'Collected (' . ($gymSettings['currency_code'] ?? 'INR') . ')'];
    $stmt = $pdo->prepare(
        "SELECT DATE_FORMAT(payment_date, '{$fmt}') AS period_label, COUNT(*) AS tx_count, COALESCE(SUM(amount), 0) AS total_collected
         FROM payments WHERE gym_id = :gid AND payment_status IN ('Paid', 'Partial') AND payment_date BETWEEN :from AND :to
         GROUP BY period_label ORDER BY period_label DESC"
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    foreach ($stmt->fetchAll() as $r) {
        $rows[] = [$r['period_label'], (string)$r['tx_count'], number_format((float)$r['total_collected'], 2, '.', '')];
    }
} elseif ($tab === 'payments') {
    $headers = ['Receipt #', 'Payment Date', 'Member ID', 'Member Name', 'Plan', 'Method', 'Reference', 'Status', 'Amount', 'Balance Due'];
    $stmt = $pdo->prepare(
        'SELECT py.receipt_number, py.payment_date, m.member_code, m.full_name, COALESCE(p.plan_name, "—"), py.payment_method, COALESCE(py.transaction_ref, "—"), py.payment_status, py.amount, py.balance_due
         FROM payments py INNER JOIN members m ON m.id = py.member_id LEFT JOIN membership_plans p ON p.id = py.plan_id
         WHERE py.gym_id = :gid AND py.payment_date BETWEEN :from AND :to ORDER BY py.payment_date DESC'
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    $rows = $stmt->fetchAll(PDO::FETCH_NUM);
} elseif ($tab === 'attendance') {
    $headers = ['Date', 'Check-In Time', 'Method', 'Member ID', 'Member Name', 'Phone', 'Remarks'];
    $stmt = $pdo->prepare(
        'SELECT a.attendance_date, a.check_in_time, a.check_in_method, m.member_code, m.full_name, m.phone, COALESCE(a.remarks, "—")
         FROM attendance a INNER JOIN members m ON m.id = a.member_id
         WHERE a.gym_id = :gid AND a.attendance_date BETWEEN :from AND :to ORDER BY a.attendance_date DESC, a.check_in_time DESC'
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    $rows = $stmt->fetchAll(PDO::FETCH_NUM);
} elseif ($tab === 'renewals') {
    $headers = ['Recorded Date', 'Member ID', 'Member Name', 'Plan', 'Action Type', 'Start Date', 'Expiry Date', 'Plan Price'];
    $stmt = $pdo->prepare(
        "SELECT DATE(mh.created_at), m.member_code, m.full_name, mh.plan_name_snapshot, mh.action_type, mh.start_date, mh.expiry_date, mh.plan_price_snapshot
         FROM memberships mh INNER JOIN members m ON m.id = mh.member_id
         WHERE mh.gym_id = :gid AND mh.action_type IN ('Renewal', 'Extension', 'Plan Change') AND DATE(mh.created_at) BETWEEN :from AND :to ORDER BY mh.id DESC"
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    $rows = $stmt->fetchAll(PDO::FETCH_NUM);
} elseif ($tab === 'dues') {
    $headers = ['Receipt #', 'Payment Date', 'Member ID', 'Member Name', 'Phone', 'Status', 'Paid So Far', 'Outstanding Due'];
    $stmt = $pdo->prepare(
        "SELECT py.receipt_number, py.payment_date, m.member_code, m.full_name, m.phone, py.payment_status,
                CASE WHEN py.payment_status = 'Pending' THEN 0.00 ELSE py.amount END,
                CASE WHEN py.payment_status = 'Pending' THEN py.amount ELSE py.balance_due END
         FROM payments py INNER JOIN members m ON m.id = py.member_id
         WHERE py.gym_id = :gid AND py.payment_status IN ('Pending', 'Partial') AND (py.payment_status = 'Pending' OR py.balance_due > 0) AND py.payment_date BETWEEN :from AND :to"
    );
    $stmt->execute([':gid' => $gymId, ':from' => $dateFrom, ':to' => $dateTo]);
    $rows = $stmt->fetchAll(PDO::FETCH_NUM);
}

if (($_GET['export'] ?? '') === 'csv') {
    $filename = sprintf('hemnity_gym%d_%s_%s_to_%s.csv', $gymId, $tab, $dateFrom, $dateTo);
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $out = fopen('php://output', 'wb');
    if ($out !== false) {
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $headers);
        foreach ($rows as $row) {
            fputcsv($out, array_map(static function ($cell): string {
                $v = (string)$cell;
                return ($v !== '' && in_array($v[0], ['=', '+', '-', '@'], true) && !is_numeric($v)) ? "'" . $v : $v;
            }, $row));
        }
        fclose($out);
    }
    exit;
}

$tabLabels = ['summary' => 'Active vs Expired', 'registrations' => 'New Registrations', 'revenue' => 'Revenue Breakdown', 'payments' => 'Payment History', 'attendance' => 'Attendance History', 'renewals' => 'Renewals & Extensions', 'dues' => 'Outstanding Dues'];
$exportQuery = http_build_query(['tab' => $tab, 'granularity' => $granularity, 'from' => $dateFrom, 'to' => $dateTo, 'export' => 'csv']);

$pageTitle   = 'Reports';
$pageHeading = 'Reports & CSV Exports';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Analytics &amp; Tenant Reports</h1><p class="text-muted small mb-0">Scoped to <?= e($gymSettings['gym_name']) ?>.</p></div>
    <a href="reports.php?<?= e($exportQuery) ?>" class="btn btn-gym-primary"><i class="bi bi-download me-1"></i>Export CSV</a>
</div>

<div class="d-flex flex-wrap gap-2 mb-4">
    <?php foreach ($tabLabels as $tKey => $tLabel): ?>
        <a href="reports.php?<?= e(http_build_query(['tab' => $tKey, 'from' => $dateFrom, 'to' => $dateTo, 'granularity' => $granularity])) ?>" class="btn btn-sm <?= $tab === $tKey ? 'btn-gym-dark' : 'btn-light border' ?>"><?= e($tLabel) ?></a>
    <?php endforeach; ?>
</div>

<?php if ($tab !== 'summary'): ?>
    <div class="gym-card mb-4"><div class="gym-card-body py-3">
        <form method="get" action="reports.php" class="row g-2 align-items-end">
            <input type="hidden" name="tab" value="<?= e($tab) ?>">
            <div class="col-sm-4 col-md-3"><label class="form-label small text-muted mb-1">From</label><input type="date" class="form-control font-mono" name="from" value="<?= e($dateFrom) ?>"></div>
            <div class="col-sm-4 col-md-3"><label class="form-label small text-muted mb-1">To</label><input type="date" class="form-control font-mono" name="to" value="<?= e($dateTo) ?>"></div>
            <?php if ($tab === 'revenue'): ?><div class="col-sm-4 col-md-3"><label class="form-label small text-muted mb-1">Grouping</label><select class="form-select" name="granularity"><option value="daily" <?= $granularity === 'daily' ? 'selected' : '' ?>>Daily</option><option value="monthly" <?= $granularity === 'monthly' ? 'selected' : '' ?>>Monthly</option><option value="yearly" <?= $granularity === 'yearly' ? 'selected' : '' ?>>Yearly</option></select></div><?php endif; ?>
            <div class="col-sm-4 col-md-2"><button type="submit" class="btn btn-gym-dark w-100">Run</button></div>
        </form>
    </div></div>
<?php endif; ?>

<div class="gym-card">
    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0"><?= e($tabLabels[$tab]) ?></h2><span class="small text-muted font-mono"><?= count($rows) ?> row(s)</span></div>
    <div class="table-responsive"><table class="table gym-table">
        <thead><tr><?php foreach ($headers as $h): ?><th><?= e($h) ?></th><?php endforeach; ?></tr></thead>
        <tbody>
            <?php if (empty($rows)): ?><tr><td colspan="<?= count($headers) ?>" class="text-center py-5 text-muted">No records found.</td></tr>
            <?php else: foreach ($rows as $row): ?><tr><?php foreach ($row as $cell): ?><td class="<?= is_numeric($cell) ? 'font-mono' : '' ?>"><?= e($cell) ?></td><?php endforeach; ?></tr><?php endforeach; endif; ?>
        </tbody>
    </table></div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
