<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(true);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

$planId = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
if ($planId <= 0) {
    redirect('membership_plans.php');
}

$stmt = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :gid LIMIT 1');
$stmt->execute([':id' => $planId, ':gid' => $gymId]);
$plan = $stmt->fetch();

if (!$plan) {
    set_flash('danger', 'Membership plan not found.');
    redirect('membership_plans.php');
}

$form = ['plan_name' => (string)$plan['plan_name'], 'duration_days' => (string)$plan['duration_days'], 'price' => (string)$plan['price'], 'description' => (string)($plan['description'] ?? ''), 'is_active' => (string)$plan['is_active']];
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $form['plan_name']     = clean_str($_POST['plan_name'] ?? '', 100);
    $form['duration_days'] = clean_str($_POST['duration_days'] ?? '', 10);
    $form['price']         = clean_str($_POST['price'] ?? '', 20);
    $form['description']   = clean_str($_POST['description'] ?? '', 500, true);
    $form['is_active']     = isset($_POST['is_active']) ? '1' : '0';

    if ($form['plan_name'] === '') $errors[] = 'Plan name is required.';
    $days = filter_var($form['duration_days'], FILTER_VALIDATE_INT);
    if ($days === false || $days < 1 || $days > 3650) $errors[] = 'Duration must be between 1 and 3,650 days.';
    if (!is_numeric($form['price']) || (float)$form['price'] < 0) $errors[] = 'Price must be valid.';

    if (empty($errors)) {
        $pdo->prepare('UPDATE membership_plans SET plan_name = :name, duration_days = :days, price = :price, description = :desc, is_active = :active WHERE id = :id AND gym_id = :gid')
            ->execute([':name' => $form['plan_name'], ':days' => (int)$days, ':price' => number_format((float)$form['price'], 2, '.', ''), ':desc' => $form['description'] ?: null, ':active' => (int)$form['is_active'], ':id' => $planId, ':gid' => $gymId]);
        set_flash('success', 'Membership plan updated.');
        redirect('membership_plans.php');
    }
}

$pageTitle   = 'Edit Plan';
$pageHeading = 'Edit Membership Plan';
require __DIR__ . '/includes/header.php';
?>
<div class="row justify-content-center"><div class="col-lg-6"><div class="gym-card">
    <div class="gym-card-header"><h1 class="h6 fw-bold mb-0">Edit Plan — <?= e($plan['plan_name']) ?></h1><a href="membership_plans.php" class="btn btn-sm btn-light border">Back to Plans</a></div>
    <div class="gym-card-body">
        <?php if (!empty($errors)): ?><div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div><?php endif; ?>
        <form method="post" action="plan_edit.php?id=<?= (int)$planId ?>">
            <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int)$planId ?>">
            <div class="mb-3"><label class="form-label fw-medium">Plan Name *</label><input type="text" class="form-control" name="plan_name" value="<?= e($form['plan_name']) ?>" required></div>
            <div class="row g-3 mb-3">
                <div class="col-sm-6"><label class="form-label fw-medium">Duration (Days) *</label><input type="number" class="form-control font-mono" name="duration_days" value="<?= e($form['duration_days']) ?>" min="1" max="3650" required></div>
                <div class="col-sm-6"><label class="form-label fw-medium">Price *</label><input type="number" step="0.01" min="0" class="form-control font-mono" name="price" value="<?= e($form['price']) ?>" required></div>
            </div>
            <div class="mb-3"><label class="form-label fw-medium">Description</label><textarea class="form-control" name="description" rows="3"><?= e($form['description']) ?></textarea></div>
            <div class="form-check mb-4"><input class="form-check-input" type="checkbox" id="is_active" name="is_active" value="1" <?= $form['is_active'] === '1' ? 'checked' : '' ?>><label class="form-check-label" for="is_active">Active</label></div>
            <div class="d-flex justify-content-end gap-2"><a href="membership_plans.php" class="btn btn-light border">Cancel</a><button type="submit" class="btn btn-gym-primary">Save Changes</button></div>
        </form>
    </div>
</div></div></div>
<?php require __DIR__ . '/includes/footer.php'; ?>
