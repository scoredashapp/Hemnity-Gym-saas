<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$pdo = db();
$platformCfg = get_platform_settings($pdo);

$superCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")->fetchColumn();
$ownerCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'gym_owner'")->fetchColumn();
$isLocked   = $superCount > 0 && $ownerCount > 0;

$errors    = [];
$completed = false;
$form      = ['super_name' => 'Hemnity Platform Admin', 'super_email' => '', 'owner_name' => '', 'owner_email' => '', 'gym_name' => 'Ironworks Fitness Club'];

if (!$isLocked && $_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $form['super_name']  = clean_str($_POST['super_name'] ?? '', 120);
    $form['super_email'] = strtolower(clean_str($_POST['super_email'] ?? '', 190));
    $superPass           = (string)($_POST['super_password'] ?? '');

    $form['owner_name']  = clean_str($_POST['owner_name'] ?? '', 120);
    $form['owner_email'] = strtolower(clean_str($_POST['owner_email'] ?? '', 190));
    $ownerPass           = (string)($_POST['owner_password'] ?? '');
    $form['gym_name']    = clean_str($_POST['gym_name'] ?? 'Ironworks Fitness Club', 150);

    if ($superCount === 0) {
        if ($form['super_name'] === '' || !filter_var($form['super_email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Valid Super Admin name and email are required.';
        }
        if (strlen($superPass) < 8 || !preg_match('/[A-Za-z]/', $superPass) || !preg_match('/\d/', $superPass)) {
            $errors[] = 'Super Admin password must be at least 8 characters with letters and numbers.';
        }
    }

    if ($ownerCount === 0) {
        if ($form['owner_name'] === '' || !filter_var($form['owner_email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Valid Primary Gym Owner name and email are required.';
        }
        if ($superCount === 0 && $form['super_email'] === $form['owner_email']) {
            $errors[] = 'Super Admin and Gym Owner must use distinct email addresses.';
        }
        if (strlen($ownerPass) < 8 || !preg_match('/[A-Za-z]/', $ownerPass) || !preg_match('/\d/', $ownerPass)) {
            $errors[] = 'Gym Owner password must be at least 8 characters with letters and numbers.';
        }
    }

    if (empty($errors)) {
        try {
            $pdo->beginTransaction();

            if ($superCount === 0) {
                $pdo->prepare("INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete) VALUES ('super_admin', :name, :email, :hash, 1, 1)")
                    ->execute([':name' => $form['super_name'], ':email' => $form['super_email'], ':hash' => password_hash($superPass, PASSWORD_DEFAULT)]);
            }

            if ($ownerCount === 0) {
                $hash = password_hash($ownerPass, PASSWORD_DEFAULT);
                $pdo->prepare("INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete) VALUES ('gym_owner', :name, :email, :hash, 1, 1)")
                    ->execute([':name' => $form['owner_name'], ':email' => $form['owner_email'], ':hash' => $hash]);
                $ownerId = (int)$pdo->lastInsertId();

                $pdo->prepare('UPDATE gyms SET name = :name, owner_user_id = :uid WHERE id = 1')
                    ->execute([':name' => $form['gym_name'] ?: 'Ironworks Fitness Club', ':uid' => $ownerId]);
                $pdo->prepare("INSERT IGNORE INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (1, :uid, 'Owner', 1)")
                    ->execute([':uid' => $ownerId]);
                $pdo->prepare('UPDATE gym_settings SET gym_name = :name WHERE gym_id = 1')
                    ->execute([':name' => $form['gym_name'] ?: 'Ironworks Fitness Club']);
            }

            $pdo->commit();
            $completed = true;
            $isLocked  = true;
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[Hemnity Setup Error] ' . $ex->getMessage());
            $errors[] = 'Unable to create initial accounts. Verify database_saas.sql was imported first.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Initial SaaS Setup — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card" style="max-width: 560px;">
        <div class="d-flex align-items-center gap-2 mb-3">
            <span class="gym-brand-mark">H</span>
            <span class="fw-bold fs-5 text-dark"><?= e($platformCfg['software_name'] ?? 'Hemnity Gym Management Software') ?></span>
        </div>

        <?php if ($completed): ?>
            <h1 class="h4 fw-bold mb-2">Platform Setup Complete</h1>
            <div class="alert alert-success small">Your Super Admin and Primary Gym Owner accounts have been securely initialized using <code>password_hash()</code>.</div>
            <div class="alert alert-warning small"><strong>Security Action:</strong> Immediately delete <code>setup_admin.php</code> from cPanel File Manager!</div>
            <div class="d-grid gap-2">
                <a href="login.php" class="btn btn-gym-primary">Sign In as Gym Owner</a>
                <a href="superadmin/login.php" class="btn btn-gym-dark">Open Super Admin Console</a>
            </div>
        <?php elseif ($isLocked): ?>
            <h1 class="h4 fw-bold mb-2">Initial Setup Locked</h1>
            <p class="text-muted small mb-3">Super Admin and Gym Owner accounts already exist. Please delete <code>setup_admin.php</code> from your server.</p>
            <a href="login.php" class="btn btn-gym-dark w-100">Go to Sign In</a>
        <?php else: ?>
            <h1 class="h4 fw-bold mb-1">First-Time SaaS Platform Setup</h1>
            <p class="text-muted small mb-4">Create your Hemnity Super Admin and primary Gym #1 Owner credentials. Delete this file immediately afterward.</p>

            <?php if (!empty($errors)): ?>
                <div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div>
            <?php endif; ?>

            <form method="post" action="setup_admin.php" novalidate>
                <?= csrf_field() ?>
                <?php if ($superCount === 0): ?>
                    <h2 class="h6 fw-bold mb-2">1. Hemnity Super Admin</h2>
                    <div class="row g-2 mb-3">
                        <div class="col-sm-6"><label class="form-label small fw-medium">Full Name</label><input type="text" class="form-control" name="super_name" value="<?= e($form['super_name']) ?>" required></div>
                        <div class="col-sm-6"><label class="form-label small fw-medium">Super Admin Email</label><input type="email" class="form-control" name="super_email" value="<?= e($form['super_email']) ?>" required></div>
                        <div class="col-12"><label class="form-label small fw-medium">Super Admin Password</label><input type="password" class="form-control" name="super_password" required minlength="8"></div>
                    </div>
                <?php endif; ?>

                <?php if ($ownerCount === 0): ?>
                    <h2 class="h6 fw-bold mb-2">2. Primary Gym #1 Owner</h2>
                    <div class="row g-2 mb-4">
                        <div class="col-12"><label class="form-label small fw-medium">Primary Gym Name</label><input type="text" class="form-control" name="gym_name" value="<?= e($form['gym_name']) ?>" required></div>
                        <div class="col-sm-6"><label class="form-label small fw-medium">Owner Full Name</label><input type="text" class="form-control" name="owner_name" value="<?= e($form['owner_name']) ?>" required></div>
                        <div class="col-sm-6"><label class="form-label small fw-medium">Owner Email</label><input type="email" class="form-control" name="owner_email" value="<?= e($form['owner_email']) ?>" required></div>
                        <div class="col-12"><label class="form-label small fw-medium">Owner Password</label><input type="password" class="form-control" name="owner_password" required minlength="8"></div>
                    </div>
                <?php endif; ?>

                <button type="submit" class="btn btn-gym-primary w-100 py-2">Initialize Platform Accounts</button>
            </form>
        <?php endif; ?>
    </div>
</div>
</body>
</html>
