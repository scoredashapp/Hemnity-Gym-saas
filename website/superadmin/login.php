<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 1);
require_once dirname(__DIR__) . '/config.php';

if (is_super_admin_logged_in()) {
    redirect('index.php');
}

$pdo         = db();
$platformCfg = get_platform_settings($pdo);
$superCount  = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")->fetchColumn();

$error = '';
$email = '';

$_SESSION['sa_login_attempts'] = $_SESSION['sa_login_attempts'] ?? [];
$_SESSION['sa_login_attempts'] = array_values(array_filter(
    $_SESSION['sa_login_attempts'],
    static fn(int $ts): bool => $ts > (time() - 900)
));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    if (count($_SESSION['sa_login_attempts']) >= 8) {
        $error = 'Too many failed login attempts. Please wait 15 minutes before trying again.';
    } else {
        $email    = strtolower(clean_str($_POST['email'] ?? '', 190));
        $password = (string)($_POST['password'] ?? '');

        if ($email === '' || $password === '') {
            $error = 'Please enter both your administrator email and password.';
        } else {
            $stmt = $pdo->prepare('SELECT id, role, full_name, email, password_hash, is_active FROM users WHERE email = :email LIMIT 1');
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch();

            if ($user && (int)$user['is_active'] === 1 && password_verify($password, (string)$user['password_hash'])) {
                if ($user['role'] !== 'super_admin') {
                    $error = 'Access denied. This console is strictly for Hemnity Super Administrators.';
                } else {
                    session_regenerate_id(true);
                    $_SESSION['user_id']           = (int)$user['id'];
                    $_SESSION['user_role']         = 'super_admin';
                    $_SESSION['sa_login_attempts'] = [];
                    $_SESSION['csrf_token']        = bin2hex(random_bytes(32));

                    $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int)$user['id']]);
                    log_audit_event($pdo, 'super_admin', (int)$user['id'], 'superadmin.login', 'user', (string)$user['id'], null);
                    redirect('index.php');
                }
            } else {
                $_SESSION['sa_login_attempts'][] = time();
                $error = 'Invalid Super Admin credentials.';
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
    <title>Hemnity Super Admin Sign In — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="../assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card">
        <div class="d-flex align-items-center justify-content-between mb-4">
            <a href="../index.php?landing=1" class="text-decoration-none d-flex align-items-center gap-2 text-dark">
                <?= brand_mark_html($platformCfg) ?>
                <span class="fw-bold fs-6"><?= e($platformCfg['brand_name'] ?? 'Hemnity') ?> Console</span>
            </a>
            <span class="badge bg-dark">Super Admin</span>
        </div>

        <h1 class="h4 fw-bold mb-1">Platform Super Admin</h1>
        <p class="text-muted small mb-4">Manage registered gym tenants, SaaS pricing plans, landing CMS, and audit logs.</p>

        <?php foreach ($flashes as $f): ?>
            <div class="alert alert-<?= e($f['type']) ?> small"><?= e($f['message']) ?></div>
        <?php endforeach; ?>
        <?php if ($error !== ''): ?>
            <div class="alert alert-danger small"><?= e($error) ?></div>
        <?php endif; ?>
        <?php if ($superCount === 0 && is_file(dirname(__DIR__) . '/setup_admin.php')): ?>
            <div class="alert alert-info small">
                No Super Admin account found yet. <a href="../setup_admin.php" class="fw-semibold">Run Initial Platform Setup</a> first.
            </div>
        <?php endif; ?>

        <form method="post" action="login.php" novalidate>
            <?= csrf_field() ?>
            <div class="mb-3">
                <label for="email" class="form-label fw-medium">Super Admin Email</label>
                <input type="email" class="form-control" id="email" name="email" value="<?= e($email) ?>" required autofocus autocomplete="email">
            </div>
            <div class="mb-4">
                <label for="password" class="form-label fw-medium">Password</label>
                <input type="password" class="form-control" id="password" name="password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-dark w-100 py-2 fw-semibold">Sign In to Platform Console</button>
        </form>

        <div class="mt-4 pt-3 border-top d-flex flex-wrap justify-content-between gap-2 small">
            <a href="../login.php" class="text-decoration-none text-muted">Gym Owner Login</a>
            <a href="../member/login.php" class="text-decoration-none text-muted">Member Portal</a>
            <a href="../index.php?landing=1" class="text-decoration-none text-muted">Public Landing</a>
        </div>
    </div>
</div>
</body>
</html>
