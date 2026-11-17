<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$pdo          = db();
$errors       = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $currentPassword = (string)($_POST['current_password'] ?? '');
    $newPassword     = (string)($_POST['new_password'] ?? '');
    $confirmPassword = (string)($_POST['confirm_password'] ?? '');

    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => (int)$currentAdmin['id']]);
    $storedHash = (string)$stmt->fetchColumn();

    if ($currentPassword === '' || !password_verify($currentPassword, $storedHash)) {
        $errors[] = 'Your current password is incorrect.';
    }
    if (strlen($newPassword) < 8 || !preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/\d/', $newPassword)) {
        $errors[] = 'New password must be at least 8 characters with letters and numbers.';
    }
    if (!hash_equals($newPassword, $confirmPassword)) {
        $errors[] = 'New password and confirmation do not match.';
    }
    if ($currentPassword !== '' && hash_equals($currentPassword, $newPassword)) {
        $errors[] = 'Please choose a new password different from your current password.';
    }

    if (empty($errors)) {
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')
            ->execute([':hash' => $newHash, ':id' => (int)$currentAdmin['id']]);
        log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'owner.password_changed', 'user', (string)$currentAdmin['id'], (int)$currentAdmin['gym_id']);
        session_regenerate_id(true);
        set_flash('success', 'Your account password has been updated.');
        redirect('change_password.php');
    }
}

$pageTitle   = 'Change Password';
$pageHeading = 'Change Password';
require __DIR__ . '/includes/header.php';
?>
<div class="row justify-content-center">
    <div class="col-lg-6">
        <div class="gym-card">
            <div class="gym-card-header">
                <h1 class="h6 fw-bold mb-0">Update Account Password</h1>
                <a href="settings.php" class="btn btn-sm btn-light border">Back to Settings</a>
            </div>
            <div class="gym-card-body">
                <?php if (!empty($errors)): ?>
                    <div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div>
                <?php endif; ?>
                <form method="post" action="change_password.php" novalidate>
                    <?= csrf_field() ?>
                    <div class="mb-3"><label for="current_password" class="form-label fw-medium">Current Password *</label><input type="password" class="form-control" id="current_password" name="current_password" required></div>
                    <div class="mb-3"><label for="new_password" class="form-label fw-medium">New Password *</label><input type="password" class="form-control" id="new_password" name="new_password" required minlength="8"></div>
                    <div class="mb-4"><label for="confirm_password" class="form-label fw-medium">Confirm New Password *</label><input type="password" class="form-control" id="confirm_password" name="confirm_password" required minlength="8"></div>
                    <div class="d-flex justify-content-end gap-2"><a href="settings.php" class="btn btn-light border">Cancel</a><button type="submit" class="btn btn-gym-primary">Update Password</button></div>
                </form>
            </div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
