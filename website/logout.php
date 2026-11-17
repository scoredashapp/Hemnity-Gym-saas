<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool)$params['secure'],
            (bool)$params['httponly']
        );
    }
    session_destroy();

    session_start();
    set_flash('success', 'You have been signed out safely.');
    redirect('login.php');
}

if (!current_user()) {
    redirect('login.php');
}

$platformCfg = get_platform_settings(db());
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign Out — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card text-center">
        <h1 class="h5 fw-bold mb-2">Confirm Sign Out</h1>
        <p class="text-muted small mb-4">Are you sure you want to end your current session?</p>
        <form method="post" action="logout.php" class="d-grid gap-2">
            <?= csrf_field() ?>
            <button type="submit" class="btn btn-danger">Sign Out Now</button>
            <a href="index.php" class="btn btn-light border">Return to Workspace</a>
        </form>
    </div>
</div>
</body>
</html>
