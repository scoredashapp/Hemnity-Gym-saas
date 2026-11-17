<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);

    $action   = clean_str($_POST['action'] ?? '', 30);
    $memberId = (int)($_POST['member_id'] ?? 0);

    if ($memberId > 0) {
        $stmt = $pdo->prepare('SELECT id, full_name, member_code, membership_expiry_date FROM members WHERE id = :id AND gym_id = :gid LIMIT 1');
        $stmt->execute([':id' => $memberId, ':gid' => $gymId]);
        $target = $stmt->fetch();

        if ($target) {
            if ($action === 'deactivate') {
                $pdo->prepare("UPDATE members SET status = 'Inactive' WHERE id = :id AND gym_id = :gid")
                    ->execute([':id' => $memberId, ':gid' => $gymId]);
                set_flash('success', sprintf('Member %s (%s) deactivated.', $target['full_name'], $target['member_code']));
            } elseif ($action === 'reactivate') {
                $today     = date('Y-m-d');
                $newStatus = (!empty($target['membership_expiry_date']) && $target['membership_expiry_date'] < $today) ? 'Expired' : 'Active';
                $pdo->prepare('UPDATE members SET status = :status WHERE id = :id AND gym_id = :gid')
                    ->execute([':status' => $newStatus, ':id' => $memberId, ':gid' => $gymId]);
                set_flash('success', sprintf('Member %s reactivated (%s).', $target['full_name'], $newStatus));
            } elseif ($action === 'delete') {
                $payCountStmt = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE member_id = :id AND gym_id = :gid');
                $payCountStmt->execute([':id' => $memberId, ':gid' => $gymId]);
                $payCount = (int)$payCountStmt->fetchColumn();

                if ($payCount > 0) {
                    set_flash('warning', sprintf('Cannot delete %s because %d payment record(s) exist. Deactivate instead.', $target['full_name'], $payCount));
                } else {
                    try {
                        $pdo->beginTransaction();
                        $pdo->prepare('DELETE FROM memberships WHERE member_id = :id AND gym_id = :gid')->execute([':id' => $memberId, ':gid' => $gymId]);
                        $pdo->prepare('DELETE FROM members WHERE id = :id AND gym_id = :gid')->execute([':id' => $memberId, ':gid' => $gymId]);
                        $pdo->commit();
                        set_flash('success', sprintf('Member %s (%s) permanently deleted.', $target['full_name'], $target['member_code']));
                    } catch (Throwable $ex) {
                        if ($pdo->inTransaction()) {
                            $pdo->rollBack();
                        }
                        set_flash('danger', 'Unable to delete member due to linked records.');
                    }
                }
            }
        }
    }
    redirect('members.php');
}

$search  = clean_str($_GET['q'] ?? '', 100);
$status  = clean_str($_GET['status'] ?? '', 20);
$sort    = clean_str($_GET['sort'] ?? 'newest', 20);
$page    = max(1, (int)($_GET['page'] ?? 1));
$perPage = 15;

$today       = date('Y-m-d');
$inSevenDays = (new DateTimeImmutable($today))->modify('+7 days')->format('Y-m-d');

$where  = ['m.gym_id = :gid'];
$params = [':gid' => $gymId];

if ($search !== '') {
    $where[]       = '(m.full_name LIKE :q1 OR m.phone LIKE :q2 OR m.member_code LIKE :q3)';
    $like          = '%' . $search . '%';
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
}

if (in_array($status, ['Active', 'Expired', 'Inactive'], true)) {
    $where[]           = 'm.status = :status';
    $params[':status'] = $status;
} elseif ($status === 'ExpiringSoon') {
    $where[]             = "m.status = 'Active' AND m.membership_expiry_date BETWEEN :today AND :in_seven";
    $params[':today']    = $today;
    $params[':in_seven'] = $inSevenDays;
}

$whereSql = 'WHERE ' . implode(' AND ', $where);
$orderMap = [
    'newest'      => 'm.id DESC',
    'name_asc'    => 'm.full_name ASC',
    'expiry_asc'  => 'ISNULL(m.membership_expiry_date) ASC, m.membership_expiry_date ASC',
    'expiry_desc' => 'm.membership_expiry_date DESC',
];
$orderBy = $orderMap[$sort] ?? $orderMap['newest'];

$countStmt = $pdo->prepare("SELECT COUNT(*) FROM members m {$whereSql}");
foreach ($params as $k => $v) {
    $countStmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
}
$countStmt->execute();
$totalRows  = (int)$countStmt->fetchColumn();
$totalPages = max(1, (int)ceil($totalRows / $perPage));
if ($page > $totalPages) {
    $page = $totalPages;
}
$offset = ($page - 1) * $perPage;

$sql = "SELECT m.*, p.plan_name
        FROM members m
        LEFT JOIN membership_plans p ON p.id = m.plan_id AND p.gym_id = m.gym_id
        {$whereSql}
        ORDER BY {$orderBy}
        LIMIT :limit OFFSET :offset";

$stmt = $pdo->prepare($sql);
foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
}
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$members = $stmt->fetchAll();

$pageTitle   = 'Members';
$pageHeading = 'Members';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
        <h1 class="h4 fw-bold mb-1">Member Directory</h1>
        <p class="text-muted small mb-0">Tenant roster for <?= e($gymSettings['gym_name']) ?> (<?= $totalRows ?> total).</p>
    </div>
    <div class="d-flex gap-2">
        <a href="id_cards.php" class="btn btn-light border d-inline-flex align-items-center gap-2"><i class="bi bi-person-badge"></i><span>ID Cards &amp; QR</span></a>
        <a href="member_add.php" class="btn btn-gym-primary d-inline-flex align-items-center gap-2"><i class="bi bi-person-plus"></i><span>Add New Member</span></a>
    </div>
</div>

<div class="gym-card mb-4">
    <div class="gym-card-body py-3">
        <form method="get" action="members.php" class="row g-2 align-items-end">
            <div class="col-md-5"><label for="q" class="form-label small text-muted mb-1">Search Name, Phone, or Member ID</label><input type="text" class="form-control" id="q" name="q" value="<?= e($search) ?>" placeholder="e.g. GYM-2026-0001, 9876543210..."></div>
            <div class="col-sm-6 col-md-3">
                <label for="status" class="form-label small text-muted mb-1">Membership Status</label>
                <select class="form-select" id="status" name="status">
                    <option value="">All Statuses</option>
                    <option value="Active" <?= $status === 'Active' ? 'selected' : '' ?>>Active</option>
                    <option value="ExpiringSoon" <?= $status === 'ExpiringSoon' ? 'selected' : '' ?>>Expiring in 7 Days</option>
                    <option value="Expired" <?= $status === 'Expired' ? 'selected' : '' ?>>Expired</option>
                    <option value="Inactive" <?= $status === 'Inactive' ? 'selected' : '' ?>>Inactive</option>
                </select>
            </div>
            <div class="col-sm-6 col-md-2">
                <label for="sort" class="form-label small text-muted mb-1">Sort By</label>
                <select class="form-select" id="sort" name="sort">
                    <option value="newest" <?= $sort === 'newest' ? 'selected' : '' ?>>Newest First</option>
                    <option value="name_asc" <?= $sort === 'name_asc' ? 'selected' : '' ?>>Name (A–Z)</option>
                    <option value="expiry_asc" <?= $sort === 'expiry_asc' ? 'selected' : '' ?>>Expiry (Soonest)</option>
                    <option value="expiry_desc" <?= $sort === 'expiry_desc' ? 'selected' : '' ?>>Expiry (Latest)</option>
                </select>
            </div>
            <div class="col-md-2 d-flex gap-2">
                <button type="submit" class="btn btn-gym-dark flex-fill">Apply</button>
                <?php if ($search !== '' || $status !== '' || $sort !== 'newest'): ?><a href="members.php" class="btn btn-light border">Reset</a><?php endif; ?>
            </div>
        </form>
    </div>
</div>

<div class="gym-card">
    <div class="table-responsive">
        <table class="table gym-table">
            <thead><tr><th>Member</th><th>Phone / Email</th><th>Plan</th><th>Expiry Date</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
            <tbody>
                <?php if (empty($members)): ?>
                    <tr><td colspan="6" class="text-center py-5 text-muted">No members match your filters.</td></tr>
                <?php else: ?>
                    <?php foreach ($members as $m): ?>
                        <?php
                        $daysLeft   = days_until_expiry($m['membership_expiry_date']);
                        $isExpired  = ($m['status'] === 'Expired') || ($m['status'] === 'Active' && $daysLeft !== null && $daysLeft < 0);
                        $isExpiring = ($m['status'] === 'Active' && $daysLeft !== null && $daysLeft >= 0 && $daysLeft <= 7);
                        $rowClass   = ($m['status'] !== 'Inactive') ? ($isExpired ? 'gym-row-expired' : ($isExpiring ? 'gym-row-expiring' : '')) : '';
                        $initials   = strtoupper(substr(trim((string)$m['full_name']), 0, 1) ?: 'M');
                        $waUrl      = ($isExpired || $isExpiring) ? whatsapp_reminder_url((string)$m['phone'], (string)$m['full_name'], (string)$gymSettings['gym_name'], $m['membership_expiry_date'], $isExpired) : null;
                        ?>
                        <tr class="<?= $rowClass ?>">
                            <td>
                                <div class="d-flex align-items-center gap-3">
                                    <?php if (!empty($m['photo_path']) && is_file(__DIR__ . '/' . $m['photo_path'])): ?>
                                        <img src="<?= e($m['photo_path']) ?>" alt="<?= e($m['full_name']) ?>" class="gym-avatar">
                                    <?php else: ?>
                                        <span class="gym-avatar"><?= e($initials) ?></span>
                                    <?php endif; ?>
                                    <div>
                                        <a href="member_view.php?id=<?= (int)$m['id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($m['full_name']) ?></a>
                                        <div class="small text-muted font-mono"><?= e($m['member_code']) ?></div>
                                    </div>
                                </div>
                            </td>
                            <td><div class="font-mono small"><?= e($m['phone']) ?></div><?php if (!empty($m['email'])): ?><div class="small text-muted"><?= e($m['email']) ?></div><?php endif; ?></td>
                            <td><?= e($m['plan_name'] ?? 'Unassigned') ?></td>
                            <td class="font-mono small"><?= e(format_date($m['membership_expiry_date'])) ?></td>
                            <td>
                                <?php if ($m['status'] === 'Inactive'): ?><span class="status-text-inactive">Inactive</span>
                                <?php elseif ($isExpired): ?><span class="status-text-expired">Expired</span>
                                <?php elseif ($isExpiring): ?><span class="status-text-expiring">Expiring Soon</span>
                                <?php else: ?><span class="status-text-active">Active</span><?php endif; ?>
                            </td>
                            <td class="text-end text-nowrap">
                                <div class="d-inline-flex align-items-center gap-1">
                                    <?php if ($waUrl): ?><a href="<?= e($waUrl) ?>" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success"><i class="bi bi-whatsapp"></i></a><?php endif; ?>
                                    <a href="member_view.php?id=<?= (int)$m['id'] ?>" class="btn btn-sm btn-light border">View</a>
                                    <a href="member_edit.php?id=<?= (int)$m['id'] ?>" class="btn btn-sm btn-light border">Edit</a>
                                    <?php if ($m['status'] !== 'Inactive'): ?>
                                        <form method="post" action="members.php" class="d-inline m-0" data-confirm="Deactivate <?= e($m['full_name']) ?>?">
                                            <?= csrf_field() ?><input type="hidden" name="action" value="deactivate"><input type="hidden" name="member_id" value="<?= (int)$m['id'] ?>">
                                            <button type="submit" class="btn btn-sm btn-outline-secondary">Deactivate</button>
                                        </form>
                                    <?php else: ?>
                                        <form method="post" action="members.php" class="d-inline m-0">
                                            <?= csrf_field() ?><input type="hidden" name="action" value="reactivate"><input type="hidden" name="member_id" value="<?= (int)$m['id'] ?>">
                                            <button type="submit" class="btn btn-sm btn-outline-success">Activate</button>
                                        </form>
                                        <form method="post" action="members.php" class="d-inline m-0" data-confirm="Permanently delete <?= e($m['full_name']) ?>?">
                                            <?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="member_id" value="<?= (int)$m['id'] ?>">
                                            <button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                                        </form>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php if ($totalPages > 1): ?>
        <div class="p-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div class="small text-muted">Page <strong class="font-mono"><?= $page ?></strong> of <strong class="font-mono"><?= $totalPages ?></strong></div>
            <nav><ul class="pagination pagination-sm mb-0">
                <?php $baseQuery = ['q' => $search, 'status' => $status, 'sort' => $sort]; ?>
                <li class="page-item <?= $page <= 1 ? 'disabled' : '' ?>"><a class="page-link" href="members.php?<?= e(http_build_query(array_merge($baseQuery, ['page' => $page - 1]))) ?>">Previous</a></li>
                <li class="page-item <?= $page >= $totalPages ? 'disabled' : '' ?>"><a class="page-link" href="members.php?<?= e(http_build_query(array_merge($baseQuery, ['page' => $page + 1]))) ?>">Next</a></li>
            </ul></nav>
        </div>
    <?php endif; ?>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
