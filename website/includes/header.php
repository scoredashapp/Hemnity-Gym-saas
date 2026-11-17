<?php
declare(strict_types=1);

if (!defined('GYM_APP_INIT')) {
    http_response_code(403);
    exit('403 Forbidden');
}

$pdo          = db();
$platformCfg  = get_platform_settings($pdo);
$activeGymId  = (int)($currentAdmin['gym_id'] ?? $_SESSION['active_gym_id'] ?? 1);
$gymSettings  = get_gym_settings($pdo, $activeGymId);
$pageTitle    = isset($pageTitle) ? (string)$pageTitle . ' — ' . ($gymSettings['gym_name'] ?? 'Hemnity Gym') : ($gymSettings['gym_name'] ?? 'Hemnity Gym') . ' Workspace';
$flashes      = pull_flashes();
$subInfo      = $currentAdmin['subscription'] ?? get_gym_subscription_info($pdo, $activeGymId);
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0c0e12">
    <title><?= e($pageTitle) ?></title>
    <link rel="manifest" href="<?= e(app_href('manifest.webmanifest')) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="<?= e(app_href('assets/css/style.css')) ?>" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-shell">
    <?php require __DIR__ . '/sidebar.php'; ?>

    <div class="gym-main-wrap">
        <header class="gym-topbar no-print">
            <div class="d-flex align-items-center gap-3">
                <button type="button" class="btn btn-sm btn-outline-secondary d-lg-none" id="sidebarToggleBtn" aria-label="Toggle navigation menu">
                    <i class="bi bi-list fs-5"></i>
                </button>
                <nav aria-label="Breadcrumb" class="gym-breadcrumb">
                    <span class="text-muted"><?= e($gymSettings['gym_name']) ?></span>
                    <span class="mx-2 text-muted" aria-hidden="true">/</span>
                    <span class="fw-semibold text-dark"><?= e($pageHeading ?? 'Dashboard') ?></span>
                </nav>
            </div>

            <div class="d-flex align-items-center gap-2">
                <?php if ($ownerApp = app_download_info($platformCfg, 'owner')): ?><a href="<?= e($ownerApp['url']) ?>" class="btn btn-sm btn-success d-none d-md-inline-flex align-items-center gap-1"><i class="bi bi-android2"></i><span>Get Android App</span></a><?php endif; ?>
                <button type="button" class="btn btn-sm btn-light border d-none" id="pwaInstallBtn">
                    <i class="bi bi-download me-1"></i>Install App
                </button>
                <a href="<?= e(app_href('member_add.php')) ?>" class="btn btn-sm btn-gym-primary d-none d-sm-inline-flex align-items-center gap-1">
                    <i class="bi bi-person-plus"></i>
                    <span>Add Member</span>
                </a>
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-person-circle text-secondary"></i>
                        <span class="d-none d-md-inline"><?= e($currentAdmin['full_name'] ?? 'Owner') ?></span>
                        <i class="bi bi-chevron-down small text-muted"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border">
                        <li class="px-3 py-2 border-bottom small">
                            <div class="fw-semibold text-dark"><?= e($currentAdmin['full_name'] ?? 'Gym Owner') ?></div>
                            <div class="text-muted text-truncate" style="max-width: 200px;"><?= e($currentAdmin['email'] ?? '') ?></div>
                        </li>
                        <?php if (!empty($ownerApp)): ?><li><a class="dropdown-item py-2 fw-semibold text-success" href="<?= e($ownerApp['url']) ?>"><i class="bi bi-android2 me-2"></i>Download Android App</a></li><?php endif; ?>
                        <li><a class="dropdown-item py-2" href="<?= e(app_href('owner_subscription.php')) ?>"><i class="bi bi-award me-2"></i>SaaS Subscription</a></li>
                        <li><a class="dropdown-item py-2" href="<?= e(app_href('settings.php')) ?>"><i class="bi bi-gear me-2"></i>Gym Settings</a></li>
                        <li><a class="dropdown-item py-2" href="<?= e(app_href('change_password.php')) ?>"><i class="bi bi-key me-2"></i>Change Password</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <form action="<?= e(app_href('logout.php')) ?>" method="post" class="m-0">
                                <?= csrf_field() ?>
                                <button type="submit" class="dropdown-item py-2 text-danger">
                                    <i class="bi bi-box-arrow-right me-2"></i>Sign Out
                                </button>
                            </form>
                        </li>
                    </ul>
                </div>
            </div>
        </header>

        <main class="gym-content">
            <?php if ($subInfo && in_array($subInfo['effective_status'] ?? '', ['Trial', 'Grace', 'Expired', 'Suspended'], true)): ?>
                <div class="alert alert-<?= in_array($subInfo['effective_status'], ['Expired', 'Suspended'], true) ? 'danger' : 'warning' ?> d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4 no-print">
                    <div class="small">
                        <strong><?= e($subInfo['plan_name'] ?? 'SaaS') ?> (<?= e($subInfo['effective_status']) ?>):</strong>
                        <?= e($subInfo['restriction_reason'] ?: ('Active through ' . format_date($subInfo['current_period_end'] ?? null))) ?>
                        <span class="ms-2 font-mono">Members: <?= (int)($subInfo['current_members'] ?? 0) ?>/<?= (int)($subInfo['max_members'] ?? 0) ?></span>
                    </div>
                    <a href="<?= e(app_href('owner_subscription.php')) ?>" class="btn btn-sm btn-dark">Manage Plan</a>
                </div>
            <?php endif; ?>

            <?php if (is_file(dirname(__DIR__) . '/setup_admin.php') && empty($_SESSION['hide_setup_notice'])): ?>
                <div class="alert alert-warning d-flex align-items-center justify-content-between gap-3 mb-4 no-print" role="alert">
                    <div class="small">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>
                        <strong>Security Notice:</strong> Delete <code>setup_admin.php</code> from cPanel File Manager once initial installation is complete.
                    </div>
                </div>
            <?php endif; ?>

            <?php foreach ($flashes as $flash): ?>
                <div class="alert alert-<?= e($flash['type']) ?> alert-dismissible fade show mb-4 no-print" role="alert">
                    <?= e($flash['message']) ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            <?php endforeach; ?>
