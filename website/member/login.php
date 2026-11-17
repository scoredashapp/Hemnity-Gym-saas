<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 1);
require_once dirname(__DIR__) . '/config.php';

if (is_member_logged_in()) {
    redirect('index.php');
}

$pdo         = db();
$platformCfg = get_platform_settings($pdo);
$error       = '';
$email       = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $email    = strtolower(clean_str($_POST['email'] ?? '', 190));
    $password = (string)($_POST['password'] ?? '');

    $stmt = $pdo->prepare('SELECT id, role, full_name, email, password_hash, is_active FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if ($user && (int)$user['is_active'] === 1 && $user['role'] === 'gym_member' && password_verify($password, (string)$user['password_hash'])) {
        session_regenerate_id(true);
        $_SESSION['user_id']    = (int)$user['id'];
        $_SESSION['user_role']  = 'gym_member';
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int)$user['id']]);
        redirect('index.php');
    } else {
        $error = 'Invalid member credentials. Ask your gym desk to enable your Member Portal login.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Member Portal Login — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="../assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <span class="fw-bold"><span class="me-2"><?= brand_mark_html($platformCfg) ?></span>Member Portal</span>
            <a href="../index.php?landing=1" class="small text-muted text-decoration-none">&larr; Public Site</a>
        </div>
        <h1 class="h4 fw-bold mb-1">Member Sign In</h1>
        <p class="text-muted small mb-4">View your digital QR pass, attendance log, receipts, and online renewals.</p>
        <?php if ($error !== ''): ?><div class="alert alert-danger small"><?= e($error) ?></div><?php endif; ?>
        <form method="post" action="login.php">
            <?= csrf_field() ?>
            <div class="mb-3"><label class="form-label fw-medium">Email</label><input type="email" class="form-control" name="email" value="<?= e($email) ?>" required></div>
            <div class="mb-4"><label class="form-label fw-medium">Password</label><input type="password" class="form-control" name="password" required></div>
            <button type="submit" class="btn btn-gym-primary w-100 py-2">Open My Gym Pass</button>
        </form>
        <div class="mt-3 pt-3 border-top text-center small"><a href="../login.php" class="text-muted text-decoration-none">Are you a Gym Owner? Sign in here</a></div>
    </div>
</div>
</body>
</html>
