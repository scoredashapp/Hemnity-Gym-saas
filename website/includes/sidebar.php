<?php
declare(strict_types=1);

if (!defined('GYM_APP_INIT')) {
    http_response_code(403);
    exit('403 Forbidden');
}

$currentScript = basename((string)($_SERVER['SCRIPT_NAME'] ?? 'index.php'));
$currentDir    = basename(dirname((string)($_SERVER['SCRIPT_NAME'] ?? 'index.php')));

$navItems = [
    ['label' => 'Dashboard', 'href' => app_href('index.php'), 'icon' => 'bi-grid-1x2', 'matches' => ['index.php']],
    ['label' => 'Members', 'href' => app_href('members.php'), 'icon' => 'bi-people', 'matches' => ['members.php', 'member_add.php', 'member_edit.php', 'member_view.php']],
    ['label' => 'Membership Plans', 'href' => app_href('membership_plans.php'), 'icon' => 'bi-card-checklist', 'matches' => ['membership_plans.php', 'plan_add.php', 'plan_edit.php']],
    ['label' => 'Payments', 'href' => app_href('payments.php'), 'icon' => 'bi-credit-card-2-front', 'matches' => ['payments.php', 'payment_add.php', 'receipt.php']],
    ['label' => 'QR Attendance', 'href' => app_href('attendance.php'), 'icon' => 'bi-qr-code-scan', 'matches' => ['attendance.php']],
    ['label' => 'ID Cards & Passes', 'href' => app_href('id_cards.php'), 'icon' => 'bi-person-badge', 'matches' => ['id_cards.php']],
    ['label' => 'WhatsApp Automation', 'href' => app_href('whatsapp.php'), 'icon' => 'bi-whatsapp', 'matches' => ['whatsapp.php']],
    ['label' => 'Reports', 'href' => app_href('reports.php'), 'icon' => 'bi-bar-chart-line', 'matches' => ['reports.php']],
    ['label' => 'SaaS Subscription', 'href' => app_href('owner_subscription.php'), 'icon' => 'bi-award', 'matches' => ['owner_subscription.php']],
    ['label' => 'Settings', 'href' => app_href('settings.php'), 'icon' => 'bi-sliders', 'matches' => ['settings.php', 'change_password.php']],
    ['label' => 'REST API Docs', 'href' => app_href('api/docs/index.php'), 'icon' => 'bi-code-slash', 'matches' => ['docs_index']],
];
?>
<div class="gym-sidebar-backdrop no-print" id="sidebarBackdrop"></div>
<aside class="gym-sidebar no-print" id="gymSidebar" aria-label="Primary Sidebar Navigation">
    <div class="gym-sidebar-brand">
        <a href="<?= e(app_href('index.php')) ?>" class="text-decoration-none d-flex align-items-center gap-2 text-white">
            <?php if (!empty($gymSettings['logo_path']) && is_file(dirname(__DIR__) . '/' . $gymSettings['logo_path'])): ?>
                <img src="<?= e(app_href($gymSettings['logo_path'])) ?>" alt="<?= e($gymSettings['gym_name']) ?> Logo" class="gym-brand-logo">
            <?php else: ?>
                <span class="gym-brand-mark" aria-hidden="true">H</span>
            <?php endif; ?>
            <div class="min-w-0">
                <div class="gym-brand-text text-truncate" style="max-width: 160px;"><?= e($gymSettings['gym_name']) ?></div>
                <div class="text-secondary" style="font-size: 11px;">Powered by <?= e($platformCfg['brand_name'] ?? 'Hemnity') ?></div>
            </div>
        </a>
        <button type="button" class="btn btn-sm text-secondary d-lg-none" id="sidebarCloseBtn" aria-label="Close navigation menu">
            <i class="bi bi-x-lg"></i>
        </button>
    </div>

    <nav class="gym-sidebar-nav">
        <ul class="list-unstyled m-0 p-0">
            <?php foreach ($navItems as $item): ?>
                <?php
                $isActive = ($item['label'] === 'REST API Docs')
                    ? ($currentDir === 'docs')
                    : ($currentDir !== 'docs' && in_array($currentScript, $item['matches'], true));
                ?>
                <li>
                    <a href="<?= e($item['href']) ?>" class="gym-nav-link <?= $isActive ? 'active' : '' ?>" <?= $isActive ? 'aria-current="page"' : '' ?>>
                        <i class="bi <?= e($item['icon']) ?>"></i>
                        <span><?= e($item['label']) ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
        <div class="mt-3 pt-3 border-top border-secondary border-opacity-25">
            <a href="<?= e(app_href('index.php?landing=1')) ?>" class="gym-nav-link">
                <i class="bi bi-globe2"></i>
                <span>Public SaaS Site</span>
            </a>
        </div>
    </nav>

    <div class="gym-sidebar-footer">
        <div class="small text-secondary mb-2 text-truncate">
            Signed in as <strong class="text-light"><?= e($currentAdmin['full_name'] ?? 'Owner') ?></strong>
        </div>
        <form action="<?= e(app_href('logout.php')) ?>" method="post" class="m-0">
            <?= csrf_field() ?>
            <button type="submit" class="btn btn-sm btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2">
                <i class="bi bi-box-arrow-right"></i>
                <span>Sign Out</span>
            </button>
        </form>
    </div>
</aside>
