<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (is_admin_logged_in()) {
    redirect('index.php');
}

$pdo         = db();
$platformCfg = get_platform_settings($pdo);
$userCount   = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role IN ('gym_owner', 'super_admin')")->fetchColumn();
$adminCount  = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();

$error = '';
$email = '';

$_SESSION['login_attempts'] = $_SESSION['login_attempts'] ?? [];
$_SESSION['login_attempts'] = array_values(array_filter(
    $_SESSION['login_attempts'],
    static fn(int $ts): bool => $ts > (time() - 900)
));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    if (count($_SESSION['login_attempts']) >= 8) {
        $error = 'Too many failed login attempts. Please wait 15 minutes before trying again.';
    } else {
        $email    = strtolower(clean_str($_POST['email'] ?? '', 190));
        $password = (string)($_POST['password'] ?? '');

        if ($email === '' || $password === '') {
            $error = 'Please enter both your email address and password.';
        } else {
            $stmt = $pdo->prepare('SELECT id, role, full_name, email, password_hash, is_active FROM users WHERE email = :email LIMIT 1');
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch();

            // Seamless upgrade compatibility: migrate legacy admins row if present
            if (!$user) {
                $aStmt = $pdo->prepare('SELECT id, full_name, email, password_hash FROM admins WHERE email = :email LIMIT 1');
                $aStmt->execute([':email' => $email]);
                $legacy = $aStmt->fetch();
                if ($legacy && password_verify($password, (string)$legacy['password_hash'])) {
                    $pdo->prepare("INSERT INTO users (role, full_name, email, password_hash, is_active, is_initial_setup_complete) VALUES ('gym_owner', :name, :email, :hash, 1, 1)")
                        ->execute([':name' => $legacy['full_name'], ':email' => $legacy['email'], ':hash' => $legacy['password_hash']]);
                    $newUid = (int)$pdo->lastInsertId();
                    $pdo->prepare("INSERT IGNORE INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (1, :uid, 'Owner', 1)")
                        ->execute([':uid' => $newUid]);
                    $stmt->execute([':email' => $email]);
                    $user = $stmt->fetch();
                }
            }

            if ($user && (int)$user['is_active'] === 1 && password_verify($password, (string)$user['password_hash'])) {
                if ($user['role'] !== 'gym_owner') {
                    $error = 'This login is for Gym Owners. Please use the Member Portal or Super Admin console.';
                } else {
                    session_regenerate_id(true);
                    $_SESSION['user_id']        = (int)$user['id'];
                    $_SESSION['user_role']      = 'gym_owner';
                    $_SESSION['login_attempts'] = [];
                    $_SESSION['csrf_token']     = bin2hex(random_bytes(32));

                    $gStmt = $pdo->prepare('SELECT gym_id FROM gym_owners WHERE user_id = :uid ORDER BY is_primary DESC, id ASC LIMIT 1');
                    $gStmt->execute([':uid' => (int)$user['id']]);
                    $_SESSION['active_gym_id'] = (int)($gStmt->fetchColumn() ?: 1);

                    $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int)$user['id']]);
                    log_audit_event($pdo, 'gym_owner', (int)$user['id'], 'owner.login', 'user', (string)$user['id'], $_SESSION['active_gym_id']);
                    redirect('index.php');
                }
            } else {
                $_SESSION['login_attempts'][] = time();
                $error = 'Invalid email address or password.';
            }
        }
    }
}

$flashes = pull_flashes();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Gym Owner Sign In — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card">
        <div class="d-flex align-items-center justify-content-between mb-4">
            <a href="index.php?landing=1" class="text-decoration-none d-flex align-items-center gap-2 text-dark">
                <?= brand_mark_html($platformCfg) ?>
                <span class="fw-bold fs-6"><?= e($platformCfg['brand_name'] ?? 'Hemnity') ?> Gym</span>
            </a>
            <a href="index.php?landing=1" class="small text-muted text-decoration-none">&larr; Public Site</a>
        </div>

        <h1 class="h4 fw-bold mb-1">Gym Owner Sign In</h1>
        <p class="text-muted small mb-4">Access your gym's isolated workspace, members, plans, and QR attendance.</p>

        <?php foreach ($flashes as $f): ?>
            <div class="alert alert-<?= e($f['type']) ?> small"><?= e($f['message']) ?></div>
        <?php endforeach; ?>
        <?php if ($error !== ''): ?>
            <div class="alert alert-danger small"><?= e($error) ?></div>
        <?php endif; ?>
        <?php if ($userCount === 0 && $adminCount === 0 && is_file(__DIR__ . '/setup_admin.php')): ?>
            <div class="alert alert-info small">
                <strong>First-Time Installation:</strong> <a href="setup_admin.php" class="fw-semibold">Run Initial Platform Setup</a> to create your Super Admin &amp; Gym Owner accounts.
            </div>
        <?php endif; ?>

        <form method="post" action="login.php" novalidate>
            <?= csrf_field() ?>
            <div class="mb-3">
                <label for="email" class="form-label fw-medium">Email Address</label>
                <input type="email" class="form-control" id="email" name="email" value="<?= e($email) ?>" required autofocus autocomplete="email">
            </div>
            <div class="mb-4">
                <label for="password" class="form-label fw-medium">Password</label>
                <input type="password" class="form-control" id="password" name="password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-gym-primary w-100 py-2">Sign In to Workspace</button>
        </form>

        <div class="mt-4 pt-3 border-top d-flex flex-wrap justify-content-between gap-2 small">
            <a href="owner_register.php" class="text-decoration-none fw-medium" style="color: var(--gym-orange);">Register a New Gym</a>
            <a href="member/login.php" class="text-decoration-none text-muted">Member Portal</a>
        </div>
    </div>
</div>
</body>
</html>
