<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$pdo = db();
$platformCfg = get_platform_settings($pdo);
$showLanding = isset($_GET['landing']) && $_GET['landing'] === '1';
$sessionUser = current_user();

if (!$showLanding && $sessionUser) {
    if ($sessionUser['role'] === 'super_admin') {
        redirect('superadmin/index.php');
    } elseif ($sessionUser['role'] === 'gym_member') {
        redirect('member/index.php');
    }
}

// ============================================================================
// PUBLIC HEMNITY SAAS LANDING PAGE (for unauthenticated visitors or ?landing=1)
// ============================================================================
if ($showLanding || !$sessionUser || $sessionUser['role'] !== 'gym_owner') {
    $contactSuccess = '';
    $contactError   = '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form_action'] ?? '') === 'public_contact') {
        verify_csrf();
        $cName  = clean_str($_POST['name'] ?? '', 120);
        $cEmail = strtolower(clean_str($_POST['email'] ?? '', 190));
        $cGym   = clean_str($_POST['gym_name'] ?? '', 150);
        $cMsg   = clean_str($_POST['message'] ?? '', 1200, true);

        if ($cName === '' || !filter_var($cEmail, FILTER_VALIDATE_EMAIL) || $cMsg === '') {
            $contactError = 'Please enter your name, a valid email address, and your inquiry.';
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status)
                 VALUES (1, NULL, :name, :email, :subj, :msg, \'Open\')'
            );
            $stmt->execute([
                ':name'  => $cName,
                ':email' => $cEmail,
                ':subj'  => 'Landing Inquiry' . ($cGym !== '' ? ': ' . $cGym : ''),
                ':msg'   => $cMsg,
            ]);
            $contactSuccess = 'Thank you! Your inquiry has been logged for the Hemnity onboarding team.';
        }
    }

    $saasPlans = $pdo->query('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();
    $lpReviews  = $pdo->query('SELECT * FROM landing_reviews WHERE is_active = 1 ORDER BY sort_order ASC, id DESC LIMIT 12')->fetchAll();
    $lpPartners = $pdo->query('SELECT * FROM landing_partners WHERE is_active = 1 ORDER BY sort_order ASC, id DESC LIMIT 60')->fetchAll();
    $lpYtId     = youtube_video_id($platformCfg['youtube_url'] ?? null);
    $faqs      = $pdo->query('SELECT * FROM platform_faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();
    ?>
    <!doctype html>
    <html lang="en">
    <head>
        <script>(function(){try{var t=localStorage.getItem("hemnity_theme");if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-bs-theme",t);}catch(e){}})();</script>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title><?= e($platformCfg['seo_title'] ?? 'Hemnity Gym Management Software') ?></title>
        <meta name="description" content="<?= e($platformCfg['seo_description'] ?? '') ?>">
        <link rel="manifest" href="manifest.webmanifest">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
        <link href="assets/css/style.css" rel="stylesheet">
        <style>
            [data-bs-theme="dark"] { --gym-bg:#0b0d12; --gym-surface:#151922; --gym-border:#262c38; --gym-text:#e5e7eb; --gym-muted:#9ca3af; --gym-orange-soft:#2a1a10; }
            [data-bs-theme="dark"] body.gym-body { background-color:#0b0d12; color:#e5e7eb; }
            [data-bs-theme="dark"] .bg-white { background-color:#12151c !important; }
            [data-bs-theme="dark"] .navbar { background-color:#0f1218 !important; border-color:#262c38 !important; }
            [data-bs-theme="dark"] .navbar .nav-link, [data-bs-theme="dark"] .navbar-brand { color:#e5e7eb; }
            [data-bs-theme="dark"] .gym-card { background:#171b25; border-color:#262c38; color:#e5e7eb; }
            [data-bs-theme="dark"] .text-muted { color:#9ca3af !important; }
            [data-bs-theme="dark"] .border, [data-bs-theme="dark"] .border-bottom, [data-bs-theme="dark"] .border-top { border-color:#262c38 !important; }
            [data-bs-theme="dark"] .btn-gym-dark { background:#e5e7eb; color:#0b0d12; border-color:#e5e7eb; }
            [data-bs-theme="dark"] .bg-warning-subtle { background:#2b2410 !important; color:#fcd34d; }
            [data-bs-theme="dark"] .form-control { background:#0f1218; border-color:#2a3140; color:#e5e7eb; }
            .theme-toggle { border:1px solid var(--gym-border,#e5e7eb); background:transparent; color:inherit; border-radius:999px; width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; }
            .theme-toggle .moon { display:none; } [data-bs-theme="dark"] .theme-toggle .sun { display:none; } [data-bs-theme="dark"] .theme-toggle .moon { display:inline; }
        </style>
    </head>
    <body class="gym-body">
    <nav class="navbar navbar-expand-lg bg-white border-bottom sticky-top">
        <div class="container py-1">
            <a class="navbar-brand d-flex align-items-center gap-2 fw-bold" href="index.php?landing=1">
                <?= brand_mark_html($platformCfg) ?>
                <span><?= e($platformCfg['software_name'] ?? 'Hemnity Gym Management Software') ?></span>
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#landingNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="landingNav">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-3">
                    <li class="nav-item"><a class="nav-link" href="#features">Features</a></li>
                    <li class="nav-item"><a class="nav-link" href="#pricing">Pricing</a></li>
                    <li class="nav-item"><a class="nav-link" href="#faqs">FAQs</a></li>
                    <li class="nav-item"><a class="nav-link" href="#contact">Support</a></li>
                </ul>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <button type="button" class="theme-toggle" id="themeToggle" aria-label="Switch day / night mode" title="Day / Night"><i class="bi bi-sun-fill sun"></i><i class="bi bi-moon-stars-fill moon"></i></button>
                    <a href="owner_register.php" class="btn btn-sm btn-gym-primary">Start Free Trial</a>
                </div>
            </div>
        </div>
    </nav>

    <?php if (!empty($platformCfg['announcement_banner'])): ?>
        <div class="bg-warning-subtle border-bottom text-center py-2 px-3 small fw-medium">
            <?= e($platformCfg['announcement_banner']) ?>
        </div>
    <?php endif; ?>

    <section class="saas-hero py-5">
        <div class="container py-4">
            <div class="row align-items-center g-5">
                <div class="col-lg-8">
                    <div class="small text-uppercase fw-semibold mb-2" style="color: #fb923c; letter-spacing: 0.06em;">
                        <?= e($platformCfg['hero_badge'] ?? 'Multi-Tenant SaaS Platform for Fitness Clubs') ?>
                    </div>
                    <h1 class="display-5 fw-bold mb-3"><?= e($platformCfg['hero_title']) ?></h1>
                    <p class="lead text-secondary mb-4" style="color: #cbd5e1 !important;"><?= e($platformCfg['hero_subtitle']) ?></p>
                    <div class="d-flex flex-wrap gap-2">
                        <a href="owner_register.php" class="btn btn-gym-primary px-4 py-2"><?= e($platformCfg['hero_cta_primary'] ?? 'Start Free Trial') ?></a>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section id="features" class="py-5 bg-white border-bottom">
        <div class="container">
            <div class="mb-4">
                <h2 class="h3 fw-bold mb-1"><?= e($platformCfg['intro_title'] ?? 'Built for modern fitness clubs') ?></h2>
                <p class="text-muted mb-0"><?= e($platformCfg['intro_body'] ?? '') ?></p>
            </div>
            <div class="row g-4">
                <div class="col-md-4"><div class="gym-card p-4 h-100"><h3 class="h6 fw-bold">Strict Multi-Tenant Isolation</h3><p class="small text-muted mb-0">Every gym receives isolated plans, members, financial receipts, QR tokens, and payment gateway keys keyed by authorized gym_id.</p></div></div>
                <div class="col-md-4"><div class="gym-card p-4 h-100"><h3 class="h6 fw-bold">QR Attendance &amp; PVC ID Cards</h3><p class="small text-muted mb-0">Verify members visually at reception with photo check-in, print A4/CR80 ID cards, and revoke lost cards immediately.</p></div></div>
                <div class="col-md-4"><div class="gym-card p-4 h-100"><h3 class="h6 fw-bold">Member Portal &amp; Direct Renewals</h3><p class="small text-muted mb-0">Members view plans, monthly attendance calendars, digital QR passes, receipts, and renew online via verified webhooks.</p></div></div>
            </div>
        </div>
    </section>

    <?php if ($lpYtId): ?>
    <section id="video" class="py-5">
        <div class="container">
            <h2 class="h3 fw-bold text-center mb-4"><?= e($platformCfg['youtube_title'] ?: 'See it in action') ?></h2>
            <div class="mx-auto" style="max-width: 860px;">
                <div class="ratio ratio-16x9 rounded-4 overflow-hidden shadow">
                    <iframe src="https://www.youtube-nocookie.com/embed/<?= e($lpYtId) ?>?rel=0" title="<?= e($platformCfg['youtube_title'] ?: 'Product video') ?>" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                </div>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <?php if (!empty($lpPartners)): ?>
    <section id="partners" class="py-5 bg-white border-top border-bottom">
        <div class="container">
            <div class="text-center mb-4"><h2 class="h3 fw-bold mb-1">Trusted by Gyms We Work With</h2><p class="text-muted small mb-0">Fitness clubs already running on our platform.</p></div>
            <div class="row g-3 justify-content-center">
                <?php foreach ($lpPartners as $pt): ?>
                    <div class="col-6 col-md-4 col-lg-3">
                        <?php $tag = !empty($pt['website_url']) ? 'a' : 'div'; ?>
                        <<?= $tag ?> <?= $tag === 'a' ? 'href="' . e($pt['website_url']) . '" target="_blank" rel="noopener noreferrer nofollow"' : '' ?> class="gym-card p-3 h-100 d-flex flex-column align-items-center justify-content-center text-center text-decoration-none" style="color:inherit;min-height:130px">
                            <?php if (!empty($pt['logo_path']) && is_file(__DIR__ . '/' . $pt['logo_path'])): ?>
                                <img src="<?= e($pt['logo_path']) ?>" alt="<?= e($pt['name']) ?>" loading="lazy" style="max-width:120px;max-height:56px;object-fit:contain;margin-bottom:8px">
                            <?php else: ?>
                                <span class="gym-brand-mark mb-2"><?= e(strtoupper(mb_substr((string)$pt['name'], 0, 1))) ?></span>
                            <?php endif; ?>
                            <div class="fw-semibold small"><?= e($pt['name']) ?></div>
                            <?php if (!empty($pt['city'])): ?><div class="small text-muted"><?= e($pt['city']) ?></div><?php endif; ?>
                        </<?= $tag ?>>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <?php if (!empty($lpReviews)): ?>
    <section id="reviews" class="py-5">
        <div class="container">
            <div class="text-center mb-4"><h2 class="h3 fw-bold mb-1">What Our Customers Say</h2><p class="text-muted small mb-0">Real feedback from gym owners using Hemnity.</p></div>
            <div class="row g-4">
                <?php foreach ($lpReviews as $rv): ?>
                    <div class="col-md-6 col-lg-4">
                        <div class="gym-card p-4 h-100 d-flex flex-column">
                            <div class="mb-2" style="color:#f59e0b;letter-spacing:2px" aria-label="<?= (int)$rv['rating'] ?> out of 5 stars"><?= str_repeat('★', (int)$rv['rating']) . str_repeat('☆', 5 - (int)$rv['rating']) ?></div>
                            <p class="mb-3 flex-grow-1">&ldquo;<?= e($rv['review_text']) ?>&rdquo;</p>
                            <div class="d-flex align-items-center gap-2">
                                <?php if (!empty($rv['photo_path']) && is_file(__DIR__ . '/' . $rv['photo_path'])): ?>
                                    <img src="<?= e($rv['photo_path']) ?>" alt="" loading="lazy" style="width:44px;height:44px;border-radius:50%;object-fit:cover">
                                <?php else: ?><span class="gym-avatar"><?= e(strtoupper(mb_substr((string)$rv['customer_name'], 0, 1))) ?></span><?php endif; ?>
                                <div><div class="fw-semibold small"><?= e($rv['customer_name']) ?></div><?php if (!empty($rv['customer_role'])): ?><div class="small text-muted"><?= e($rv['customer_role']) ?></div><?php endif; ?></div>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <section id="pricing" class="py-5">
        <div class="container">
            <div class="text-center mb-4">
                <h2 class="h3 fw-bold mb-1">Database-Driven SaaS Pricing Plans</h2>
                <p class="text-muted small">Simple, transparent pricing for every gym size.</p>
            </div>
            <div class="row g-4">
                <?php foreach ($saasPlans as $sp): ?>
                    <?php $features = json_decode((string)$sp['enabled_features_json'], true) ?: []; ?>
                    <div class="col-md-4">
                        <div class="gym-card p-4 h-100 d-flex flex-column <?= !empty($sp['is_featured']) ? 'border-dark border-2' : '' ?>">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h3 class="h5 fw-bold mb-0"><?= e($sp['plan_name']) ?></h3>
                                <span class="small font-mono text-muted">Up to <?= (int)$sp['max_members'] ?> members</span>
                            </div>
                            <p class="small text-muted mb-3"><?= e($sp['tagline'] ?? $sp['description'] ?? '') ?></p>
                            <div class="h3 font-mono fw-bold mb-1">₹<?= number_format((float)$sp['monthly_price'], 0) ?><span class="fs-6 fw-normal text-muted">/mo</span></div>
                            <div class="small text-muted font-mono mb-3">Quarterly ₹<?= number_format((float)$sp['quarterly_price'], 0) ?> &middot; Yearly ₹<?= number_format((float)$sp['yearly_price'], 0) ?></div>
                            <ul class="list-unstyled small mb-4 flex-grow-1">
                                <li class="mb-1"><i class="bi bi-check2 text-success me-1"></i><?= (int)$sp['trial_days'] ?>-day free trial</li>
                                <li class="mb-1"><i class="bi bi-check2 text-success me-1"></i>Up to <?= (int)$sp['max_branches'] ?> branch(es)</li>
                                <?php foreach ($features as $feat): ?>
                                    <li class="mb-1"><i class="bi bi-check2 text-success me-1"></i><?= e(ucwords(str_replace('_', ' ', (string)$feat))) ?></li>
                                <?php endforeach; ?>
                            </ul>
                            <a href="owner_register.php?plan=<?= e($sp['slug']) ?>" class="btn <?= !empty($sp['is_featured']) ? 'btn-gym-primary' : 'btn-gym-dark' ?> w-100">
                                Choose <?= e($sp['plan_name']) ?>
                            </a>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <section id="faqs" class="py-5 bg-white border-top border-bottom">
        <div class="container">
            <h2 class="h4 fw-bold mb-4">Frequently Asked Questions</h2>
            <div class="row g-3">
                <?php foreach ($faqs as $faq): ?>
                    <div class="col-md-6">
                        <div class="gym-card p-3 h-100">
                            <div class="fw-semibold mb-1"><?= e($faq['question']) ?></div>
                            <div class="small text-muted"><?= e($faq['answer']) ?></div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <section id="contact" class="py-5">
        <div class="container">
            <div class="row g-4">
                <div class="col-lg-5">
                    <h2 class="h4 fw-bold mb-2">Contact Hemnity Support</h2>
                    <p class="small text-muted mb-3">Questions about onboarding, migrating from single-gym, or enterprise multi-branch pricing?</p>
                    <div class="small mb-1"><strong>Email:</strong> <?= e($platformCfg['support_email'] ?? 'support@hemnity.in') ?></div>
                    <div class="small mb-1"><strong>Phone:</strong> <span class="font-mono"><?= e($platformCfg['support_phone'] ?? '') ?></span></div>
                    <div class="small text-muted"><?= e($platformCfg['support_address'] ?? '') ?></div>
                </div>
                <div class="col-lg-7">
                    <div class="gym-card p-4">
                        <?php if ($contactSuccess !== ''): ?>
                            <div class="alert alert-success small"><?= e($contactSuccess) ?></div>
                        <?php elseif ($contactError !== ''): ?>
                            <div class="alert alert-danger small"><?= e($contactError) ?></div>
                        <?php endif; ?>
                        <form method="post" action="index.php?landing=1#contact">
                            <?= csrf_field() ?>
                            <input type="hidden" name="form_action" value="public_contact">
                            <div class="row g-3">
                                <div class="col-sm-6"><label class="form-label small fw-medium">Your Name</label><input type="text" name="name" class="form-control" required></div>
                                <div class="col-sm-6"><label class="form-label small fw-medium">Email</label><input type="email" name="email" class="form-control" required></div>
                                <div class="col-12"><label class="form-label small fw-medium">Gym / Club Name</label><input type="text" name="gym_name" class="form-control"></div>
                                <div class="col-12"><label class="form-label small fw-medium">Message</label><textarea name="message" class="form-control" rows="3" required></textarea></div>
                            </div>
                            <button type="submit" class="btn btn-gym-primary mt-3">Send Inquiry</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <footer class="bg-dark text-secondary py-4 small">
        <div class="container d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span>&copy; <?= date('Y') ?> <?= e($platformCfg['software_name'] ?? 'Hemnity Gym Management Software') ?></span>
            <span>Privacy: <?= e(substr((string)($platformCfg['legal_privacy_summary'] ?? ''), 0, 90)) ?>...</span>
        </div>
    </footer>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="assets/js/app.js"></script>
    <script>
    document.getElementById('themeToggle').addEventListener('click', function () {
        var el = document.documentElement, next = el.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
        el.setAttribute('data-bs-theme', next);
        try { localStorage.setItem('hemnity_theme', next); } catch (e) {}
    });
    </script>
    </body>
    </html>
    <?php
    exit;
}

// ============================================================================
// AUTHENTICATED GYM OWNER DASHBOARD (Tenant-Scoped by gym_id)
// ============================================================================
$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$gymSettings  = get_gym_settings($pdo, $gymId);

$today       = date('Y-m-d');
$inSevenDays = (new DateTimeImmutable($today))->modify('+7 days')->format('Y-m-d');
$monthStart  = date('Y-m-01');
$monthEnd    = date('Y-m-t');

// 1. Member KPI Counts (Scoped by gym_id)
$memberStatsStmt = $pdo->prepare(
    "SELECT
        COUNT(*) AS total_members,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_members,
        SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END) AS expired_members,
        SUM(CASE WHEN status = 'Active' AND membership_expiry_date BETWEEN :today AND :in_seven THEN 1 ELSE 0 END) AS expiring_soon
     FROM members
     WHERE gym_id = :gid"
);
$memberStatsStmt->execute([
    ':gid'      => $gymId,
    ':today'    => $today,
    ':in_seven' => $inSevenDays,
]);
$memberStats = $memberStatsStmt->fetch() ?: [];

// 2. Today's Attendance Count (Scoped by gym_id)
$attStmt = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE gym_id = :gid AND attendance_date = :today');
$attStmt->execute([':gid' => $gymId, ':today' => $today]);
$todayAttendance = (int)$attStmt->fetchColumn();

// 3. Monthly Revenue Collected & Pending Payments (Scoped by gym_id)
$revStmt = $pdo->prepare(
    "SELECT COALESCE(SUM(amount), 0)
     FROM payments
     WHERE gym_id = :gid
       AND payment_status IN ('Paid', 'Partial')
       AND payment_date BETWEEN :m_start AND :m_end"
);
$revStmt->execute([':gid' => $gymId, ':m_start' => $monthStart, ':m_end' => $monthEnd]);
$monthlyRevenue = (float)$revStmt->fetchColumn();

$pendingStmt = $pdo->prepare(
    "SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END), 0) AS pending_amount,
        COUNT(*) AS pending_count
     FROM payments
     WHERE gym_id = :gid
       AND payment_status IN ('Pending', 'Partial')
       AND (payment_status = 'Pending' OR balance_due > 0)"
);
$pendingStmt->execute([':gid' => $gymId]);
$pendingRow    = $pendingStmt->fetch() ?: ['pending_amount' => 0, 'pending_count' => 0];
$pendingAmount = (float)$pendingRow['pending_amount'];
$pendingCount  = (int)$pendingRow['pending_count'];

// 4. Last 6 Months Revenue Chart Data (Scoped by gym_id)
$sixMonthsAgo = (new DateTimeImmutable('first day of this month'))->modify('-5 months')->format('Y-m-01');
$chartStmt = $pdo->prepare(
    "SELECT DATE_FORMAT(payment_date, '%Y-%m') AS ym, COALESCE(SUM(amount), 0) AS total
     FROM payments
     WHERE gym_id = :gid
       AND payment_status IN ('Paid', 'Partial')
       AND payment_date >= :start_date
     GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
     ORDER BY ym ASC"
);
$chartStmt->execute([':gid' => $gymId, ':start_date' => $sixMonthsAgo]);
$rawChart = [];
foreach ($chartStmt->fetchAll() as $r) {
    $rawChart[(string)$r['ym']] = (float)$r['total'];
}

$monthlySeries = [];
for ($i = 5; $i >= 0; $i--) {
    $dt = (new DateTimeImmutable('first day of this month'))->modify("-{$i} months");
    $ym = $dt->format('Y-m');
    $monthlySeries[] = ['ym' => $ym, 'label' => $dt->format('M Y'), 'total' => $rawChart[$ym] ?? 0.0];
}

// 5. Membership Expiry Alerts (Scoped by gym_id)
$alertsStmt = $pdo->prepare(
    "SELECT m.id, m.member_code, m.full_name, m.phone, m.membership_expiry_date, m.status, p.plan_name
     FROM members m
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.gym_id = :gid
       AND m.status != 'Inactive'
       AND m.membership_expiry_date IS NOT NULL
       AND m.membership_expiry_date <= :in_seven
     ORDER BY m.membership_expiry_date ASC
     LIMIT 10"
);
$alertsStmt->execute([':gid' => $gymId, ':in_seven' => $inSevenDays]);
$expiryAlerts = $alertsStmt->fetchAll();

// 6. Recent Member Registrations (Scoped by gym_id)
$recentMembersStmt = $pdo->prepare(
    "SELECT m.id, m.member_code, m.full_name, m.phone, m.joining_date, m.status, m.membership_expiry_date, p.plan_name
     FROM members m
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE m.gym_id = :gid
     ORDER BY m.id DESC
     LIMIT 6"
);
$recentMembersStmt->execute([':gid' => $gymId]);
$recentMembers = $recentMembersStmt->fetchAll();

// 7. Recent Payments (Scoped by gym_id)
$recentPaymentsStmt = $pdo->prepare(
    "SELECT py.id, py.receipt_number, py.amount, py.payment_date, py.payment_method, py.payment_status,
            m.id AS member_id, m.full_name, m.member_code
     FROM payments py
     INNER JOIN members m ON m.id = py.member_id
     WHERE py.gym_id = :gid
     ORDER BY py.payment_date DESC, py.id DESC
     LIMIT 6"
);
$recentPaymentsStmt->execute([':gid' => $gymId]);
$recentPayments = $recentPaymentsStmt->fetchAll();

$pageTitle   = 'Dashboard';
$pageHeading = 'Dashboard';
require __DIR__ . '/includes/header.php';
?>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
        <h1 class="h4 fw-bold mb-1">Operations Overview</h1>
        <p class="text-muted small mb-0">Tenant workspace metrics for <?= e($gymSettings['gym_name']) ?> on <?= e(format_date($today)) ?>.</p>
    </div>
    <div class="d-flex flex-wrap gap-2">
        <a href="member_add.php" class="btn btn-gym-primary d-inline-flex align-items-center gap-2"><i class="bi bi-person-plus"></i><span>Add Member</span></a>
        <a href="payment_add.php" class="btn btn-gym-dark d-inline-flex align-items-center gap-2"><i class="bi bi-cash-stack"></i><span>Record Payment</span></a>
        <a href="attendance.php" class="btn btn-light border d-inline-flex align-items-center gap-2"><i class="bi bi-qr-code-scan"></i><span>QR Check-In</span></a>
        <a href="id_cards.php" class="btn btn-light border d-inline-flex align-items-center gap-2"><i class="bi bi-person-badge"></i><span>ID Cards</span></a>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-6 col-md-4 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Total Members</div><div class="gym-stat-value"><?= (int)($memberStats['total_members'] ?? 0) ?></div><div class="small text-muted mt-1"><a href="members.php" class="text-decoration-none text-muted">View directory &rarr;</a></div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Active Members</div><div class="gym-stat-value text-success"><?= (int)($memberStats['active_members'] ?? 0) ?></div><div class="small text-muted mt-1"><a href="members.php?status=Active" class="text-decoration-none text-muted">Active roster &rarr;</a></div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Expired Memberships</div><div class="gym-stat-value text-danger"><?= (int)($memberStats['expired_members'] ?? 0) ?></div><div class="small text-muted mt-1"><a href="members.php?status=Expired" class="text-decoration-none text-danger">Needs renewal &rarr;</a></div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="gym-stat-card"><div class="gym-stat-label">Expiring in Next 7 Days</div><div class="gym-stat-value" style="color: var(--gym-amber);"><?= (int)($memberStats['expiring_soon'] ?? 0) ?></div><div class="small text-muted mt-1"><a href="members.php?status=ExpiringSoon" class="text-decoration-none" style="color: var(--gym-amber);">Upcoming renewals &rarr;</a></div></div></div>
    <div class="col-6 col-md-4 col-xl-4"><div class="gym-stat-card"><div class="gym-stat-label">Today's Attendance</div><div class="gym-stat-value"><?= $todayAttendance ?></div><div class="small text-muted mt-1">Check-ins recorded on <?= e(format_date($today)) ?></div></div></div>
    <div class="col-6 col-md-4 col-xl-4"><div class="gym-stat-card"><div class="gym-stat-label">Collected This Month (<?= e(date('M Y')) ?>)</div><div class="gym-stat-value"><?= e(format_money($monthlyRevenue)) ?></div><div class="small text-muted mt-1"><a href="payments.php" class="text-decoration-none text-muted">Payment ledger &rarr;</a></div></div></div>
    <div class="col-12 col-md-4 col-xl-4"><div class="gym-stat-card"><div class="gym-stat-label">Pending Payments / Dues</div><div class="gym-stat-value <?= $pendingAmount > 0 ? 'text-danger' : '' ?>"><?= e(format_money($pendingAmount)) ?></div><div class="small text-muted mt-1"><?= $pendingCount ?> open balance record(s)</div></div></div>
</div>

<div class="row g-4 mb-4">
    <div class="col-lg-5">
        <div class="gym-card h-100">
            <div class="gym-card-header">
                <h2 class="h6 fw-bold mb-0">Monthly Revenue (6 Months)</h2>
                <a href="reports.php?tab=revenue" class="small text-decoration-none fw-medium" style="color: var(--gym-orange);">Full Report</a>
            </div>
            <div class="gym-card-body">
                <div id="monthlyRevenueChart" data-series="<?= e(json_encode($monthlySeries, JSON_THROW_ON_ERROR)) ?>" data-currency="<?= e($gymSettings['currency_symbol'] ?? '₹') ?>">
                    <div class="table-responsive"><table class="table table-sm gym-table"><thead><tr><th>Month</th><th class="text-end">Collected</th></tr></thead><tbody><?php foreach ($monthlySeries as $row): ?><tr><td><?= e($row['label']) ?></td><td class="text-end font-mono"><?= e(format_money($row['total'])) ?></td></tr><?php endforeach; ?></tbody></table></div>
                </div>
            </div>
        </div>
    </div>

    <div class="col-lg-7">
        <div class="gym-card h-100">
            <div class="gym-card-header">
                <h2 class="h6 fw-bold mb-0">Membership Expiry Alerts</h2>
                <a href="members.php?status=Expired" class="small text-decoration-none fw-medium" style="color: var(--gym-orange);">View All</a>
            </div>
            <div class="table-responsive">
                <table class="table gym-table">
                    <thead><tr><th>Member</th><th>Plan</th><th>Expiry Date</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
                    <tbody>
                        <?php if (empty($expiryAlerts)): ?>
                            <tr><td colspan="5" class="text-center py-4 text-muted">No expired memberships or renewals due within the next 7 days.</td></tr>
                        <?php else: ?>
                            <?php foreach ($expiryAlerts as $alert): ?>
                                <?php
                                $daysLeft  = days_until_expiry($alert['membership_expiry_date']);
                                $isExpired = ($alert['status'] === 'Expired') || ($daysLeft !== null && $daysLeft < 0);
                                $rowClass  = $isExpired ? 'gym-row-expired' : 'gym-row-expiring';
                                $waUrl     = whatsapp_reminder_url((string)$alert['phone'], (string)$alert['full_name'], (string)$gymSettings['gym_name'], $alert['membership_expiry_date'], $isExpired);
                                ?>
                                <tr class="<?= $rowClass ?>">
                                    <td><a href="member_view.php?id=<?= (int)$alert['id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($alert['full_name']) ?></a><div class="small text-muted font-mono"><?= e($alert['member_code']) ?> &middot; <?= e($alert['phone']) ?></div></td>
                                    <td><?= e($alert['plan_name'] ?? '—') ?></td>
                                    <td class="font-mono small"><?= e(format_date($alert['membership_expiry_date'])) ?></td>
                                    <td><?= $isExpired ? '<span class="status-text-expired">Expired</span>' : '<span class="status-text-expiring">' . (int)$daysLeft . 'd left</span>' ?></td>
                                    <td class="text-end text-nowrap">
                                        <?php if ($waUrl): ?><a href="<?= e($waUrl) ?>" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success"><i class="bi bi-whatsapp"></i> Remind</a><?php endif; ?>
                                        <a href="member_view.php?id=<?= (int)$alert['id'] ?>#renew" class="btn btn-sm btn-gym-primary">Renew</a>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<div class="row g-4">
    <div class="col-lg-6">
        <div class="gym-card h-100">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Recent Member Registrations</h2><a href="members.php" class="small text-decoration-none fw-medium" style="color: var(--gym-orange);">All Members</a></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Member</th><th>Plan</th><th>Joined</th><th>Status</th></tr></thead><tbody>
                <?php if (empty($recentMembers)): ?>
                    <tr><td colspan="4" class="text-center py-4 text-muted">No members registered yet.</td></tr>
                <?php else: ?>
                    <?php foreach ($recentMembers as $m): ?>
                        <tr>
                            <td><a href="member_view.php?id=<?= (int)$m['id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($m['full_name']) ?></a><div class="small text-muted font-mono"><?= e($m['member_code']) ?></div></td>
                            <td><?= e($m['plan_name'] ?? '—') ?></td>
                            <td class="font-mono small"><?= e(format_date($m['joining_date'])) ?></td>
                            <td><?= e($m['status']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody></table></div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="gym-card h-100">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Recent Payments</h2><a href="payments.php" class="small text-decoration-none fw-medium" style="color: var(--gym-orange);">All Payments</a></div>
            <div class="table-responsive"><table class="table gym-table"><thead><tr><th>Receipt</th><th>Member</th><th>Method</th><th class="text-end">Amount</th></tr></thead><tbody>
                <?php if (empty($recentPayments)): ?>
                    <tr><td colspan="4" class="text-center py-4 text-muted">No payments recorded yet.</td></tr>
                <?php else: ?>
                    <?php foreach ($recentPayments as $p): ?>
                        <tr>
                            <td class="font-mono small"><a href="receipt.php?id=<?= (int)$p['id'] ?>" class="text-decoration-none fw-semibold text-dark"><?= e($p['receipt_number']) ?></a><div class="text-muted"><?= e(format_date($p['payment_date'])) ?></div></td>
                            <td><a href="member_view.php?id=<?= (int)$p['member_id'] ?>" class="text-decoration-none text-dark"><?= e($p['full_name']) ?></a></td>
                            <td><?= e($p['payment_method']) ?></td>
                            <td class="text-end font-mono fw-semibold"><?= e(format_money($p['amount'])) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody></table></div>
        </div>
    </div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
