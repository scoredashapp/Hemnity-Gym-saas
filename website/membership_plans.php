<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);

    $action = clean_str($_POST['action'] ?? '', 30);
    $planId = (int)($_POST['plan_id'] ?? 0);

    if ($planId > 0 && in_array($action, ['deactivate', 'activate'], true)) {
        $newState = ($action === 'activate') ? 1 : 0;
        $pdo->prepare('UPDATE membership_plans SET is_active = :state WHERE id = :id AND gym_id = :gid')
            ->execute([':state' => $newState, ':id' => $planId, ':gid' => $gymId]);
        set_flash('success', $newState === 1 ? 'Membership plan activated.' : 'Membership plan deactivated.');
    }
    redirect('membership_plans.php');
}

$plansStmt = $pdo->prepare(
    "SELECT p.*,
            COUNT(CASE WHEN m.status = 'Active' THEN 1 END) AS active_member_count
     FROM membership_plans p
     LEFT JOIN members m ON m.plan_id = p.id AND m.gym_id = p.gym_id
     WHERE p.gym_id = :gid
     GROUP BY p.id
     ORDER BY p.is_active DESC, p.duration_days ASC, p.id ASC"
);
$plansStmt->execute([':gid' => $gymId]);
$plans = $plansStmt->fetchAll();

$recentHistStmt = $pdo->prepare(
    'SELECT mh.*, m.full_name, m.member_code
     FROM memberships mh
     INNER JOIN members m ON m.id = mh.member_id
     WHERE mh.gym_id = :gid
     ORDER BY mh.id DESC
     LIMIT 12'
);
$recentHistStmt->execute([':gid' => $gymId]);
$recentHistory = $recentHistStmt->fetchAll();

$pageTitle   = 'Membership Plans';
$pageHeading = 'Membership Plans';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Membership Plans</h1><p class="text-muted small mb-0">Plans scoped exclusively to <?= e($currentAdmin['gym_name']) ?>.</p></div>
    <a href="plan_add.php" class="btn btn-gym-primary d-inline-flex align-items-center gap-2"><i class="bi bi-plus-lg"></i><span>Add Plan</span></a>
</div>

<div class="gym-card mb-4">
    <div class="table-responsive">
        <table class="table gym-table">
            <thead><tr><th>Plan Name</th><th>Duration</th><th class="text-end">Price</th><th>Description</th><th class="text-end">Active Members</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
            <tbody>
                <?php if (empty($plans)): ?>
                    <tr><td colspan="7" class="text-center py-5 text-muted">No membership plans found.</td></tr>
                <?php else: foreach ($plans as $plan): ?>
                    <tr>
                        <td class="fw-semibold"><?= e($plan['plan_name']) ?></td>
                        <td class="font-mono small"><?= (int)$plan['duration_days'] ?> days</td>
                        <td class="text-end font-mono fw-semibold"><?= e(format_money($plan['price'])) ?></td>
                        <td class="small text-muted"><?= e($plan['description'] ?: '—') ?></td>
                        <td class="text-end font-mono"><?= (int)$plan['active_member_count'] ?></td>
                        <td><?= (int)$plan['is_active'] === 1 ? '<span class="status-text-active">Active</span>' : '<span class="status-text-inactive">Deactivated</span>' ?></td>
                        <td class="text-end text-nowrap">
                            <a href="plan_edit.php?id=<?= (int)$plan['id'] ?>" class="btn btn-sm btn-light border">Edit</a>
                            <form method="post" action="membership_plans.php" class="d-inline m-0">
                                <?= csrf_field() ?><input type="hidden" name="action" value="<?= (int)$plan['is_active'] === 1 ? 'deactivate' : 'activate' ?>"><input type="hidden" name="plan_id" value="<?= (int)$plan['id'] ?>">
                                <button type="submit" class="btn btn-sm <?= (int)$plan['is_active'] === 1 ? 'btn-outline-secondary' : 'btn-outline-success' ?>"><?= (int)$plan['is_active'] === 1 ? 'Deactivate' : 'Activate' ?></button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
</div>

<div class="gym-card">
    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Recent Plan Assignments, Renewals &amp; Extensions</h2></div>
    <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Member</th><th>Plan</th><th>Action</th><th>Start</th><th>Expiry</th><th class="text-end">Fee</th></tr></thead><tbody>
        <?php if (empty($recentHistory)): ?><tr><td colspan="6" class="text-center py-4 text-muted">No assignments yet.</td></tr>
        <?php else: foreach ($recentHistory as $mh): ?>
            <tr><td><a href="member_view.php?id=<?= (int)$mh['member_id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($mh['full_name']) ?></a></td><td><?= e($mh['plan_name_snapshot']) ?></td><td><?= e($mh['action_type']) ?></td><td class="font-mono small"><?= e(format_date($mh['start_date'])) ?></td><td class="font-mono small"><?= e(format_date($mh['expiry_date'])) ?></td><td class="text-end font-mono"><?= e(format_money($mh['plan_price_snapshot'])) ?></td></tr>
        <?php endforeach; endif; ?>
    </tbody></table></div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
