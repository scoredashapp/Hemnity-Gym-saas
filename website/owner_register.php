<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$pdo         = db();
$platformCfg = get_platform_settings($pdo);
$saasPlans   = $pdo->query('SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();

$selectedSlug = clean_str($_GET['plan'] ?? '', 60);
$defaultPlanId = $saasPlans[0]['id'] ?? 1;
foreach ($saasPlans as $sp) {
    if ($sp['slug'] === $selectedSlug || !empty($sp['is_featured'])) {
        $defaultPlanId = (int)$sp['id'];
        if ($sp['slug'] === $selectedSlug) break;
    }
}

$form = [
    'gym_name'      => '',
    'city'          => '',
    'phone'         => '',
    'owner_name'    => '',
    'email'         => '',
    'saas_plan_id'  => (string)$defaultPlanId,
    'billing_cycle' => 'monthly',
];
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $form['gym_name']      = clean_str($_POST['gym_name'] ?? '', 150);
    $form['city']          = clean_str($_POST['city'] ?? '', 100);
    $form['phone']         = clean_str($_POST['phone'] ?? '', 40);
    $form['owner_name']    = clean_str($_POST['owner_name'] ?? '', 120);
    $form['email']         = strtolower(clean_str($_POST['email'] ?? '', 190));
    $form['saas_plan_id']  = clean_str($_POST['saas_plan_id'] ?? '', 20);
    $form['billing_cycle'] = in_array($_POST['billing_cycle'] ?? '', ['monthly', 'quarterly', 'yearly'], true) ? (string)$_POST['billing_cycle'] : 'monthly';
    $password              = (string)($_POST['password'] ?? '');

    if (strlen($form['gym_name']) < 2) $errors[] = 'Gym name must be at least 2 characters.';
    if (strlen($form['owner_name']) < 2) $errors[] = 'Owner full name is required.';
    if (!filter_var($form['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Valid email address is required.';
    if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        $errors[] = 'Password must be at least 8 characters with letters and numbers.';
    }

    $pStmt = $pdo->prepare('SELECT * FROM saas_plans WHERE id = :id AND is_active = 1 LIMIT 1');
    $pStmt->execute([':id' => (int)$form['saas_plan_id']]);
    $chosenPlan = $pStmt->fetch();
    if (!$chosenPlan) $errors[] = 'Selected SaaS plan is unavailable.';

    $dupEmail = $pdo->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
    $dupEmail->execute([':email' => $form['email']]);
    if ($dupEmail->fetchColumn()) $errors[] = 'An account with this email already exists.';

    if (empty($errors) && $chosenPlan) {
        try {
            $pdo->beginTransaction();

            $pdo->prepare("INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete) VALUES ('gym_owner', :name, :email, :phone, :hash, 1, 1)")
                ->execute([':name' => $form['owner_name'], ':email' => $form['email'], ':phone' => $form['phone'] ?: null, ':hash' => password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int)$pdo->lastInsertId();

            $slug = slugify_gym_name($form['gym_name']) . '-' . substr(bin2hex(random_bytes(3)), 0, 4);
            $gymCode = 'HEM-GYM-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
            $trialDays = max(0, (int)$chosenPlan['trial_days']);
            $today     = date('Y-m-d');
            $trialEnd  = (new DateTimeImmutable($today))->modify('+' . ($trialDays ?: 14) . ' days')->format('Y-m-d');

            $pdo->prepare("INSERT INTO gyms (gym_code, slug, name, owner_user_id, email, phone, city, status) VALUES (:code, :slug, :name, :uid, :email, :phone, :city, 'Trial')")
                ->execute([':code' => $gymCode, ':slug' => $slug, ':name' => $form['gym_name'], ':uid' => $userId, ':email' => $form['email'], ':phone' => $form['phone'] ?: null, ':city' => $form['city'] ?: null]);
            $gymId = (int)$pdo->lastInsertId();

            $pdo->prepare("INSERT INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (:gid, :uid, 'Owner', 1)")
                ->execute([':gid' => $gymId, ':uid' => $userId]);

            $pdo->prepare("INSERT INTO gym_settings (gym_id, gym_name, contact_number, email, currency_code, currency_symbol, receipt_footer) VALUES (:gid, :name, :phone, :email, 'INR', '₹', :footer)")
                ->execute([':gid' => $gymId, ':name' => $form['gym_name'], ':phone' => $form['phone'] ?: null, ':email' => $form['email'], ':footer' => 'Thank you for training with ' . $form['gym_name'] . '.']);

            $insPlan = $pdo->prepare('INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active) VALUES (:gid, :pname, :days, :price, :desc, 1)');
            $insPlan->execute([':gid' => $gymId, ':pname' => 'Monthly', ':days' => 30, ':price' => 1000.00, ':desc' => '30-day full gym access']);
            $insPlan->execute([':gid' => $gymId, ':pname' => 'Quarterly', ':days' => 90, ':price' => 2700.00, ':desc' => '90-day strength & cardio access']);

            $pdo->prepare("INSERT INTO gym_saas_subscriptions (gym_id, saas_plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, grace_period_days) VALUES (:gid, :spid, :cycle, 'Trial', :tend, :pstart, :pend, :grace)")
                ->execute([':gid' => $gymId, ':spid' => (int)$chosenPlan['id'], ':cycle' => $form['billing_cycle'], ':tend' => $trialEnd, ':pstart' => $today, ':pend' => $trialEnd, ':grace' => (int)($platformCfg['default_grace_period_days'] ?? 7)]);

            $pdo->commit();

            session_regenerate_id(true);
            $_SESSION['user_id']       = $userId;
            $_SESSION['user_role']     = 'gym_owner';
            $_SESSION['active_gym_id'] = $gymId;
            $_SESSION['csrf_token']    = bin2hex(random_bytes(32));

            log_audit_event($pdo, 'gym_owner', $userId, 'gym.registered', 'gym', (string)$gymId, $gymId, ['plan' => $chosenPlan['slug']]);
            set_flash('success', sprintf('Welcome to Hemnity! Your workspace "%s" is ready with a %d-day free trial.', $form['gym_name'], $trialDays ?: 14));
            redirect('index.php');
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[Hemnity Register Error] ' . $ex->getMessage());
            $errors[] = 'Could not register gym workspace. Please try again.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Register Your Gym — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<div class="gym-auth-page">
    <div class="gym-auth-card" style="max-width: 580px;">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <a href="index.php?landing=1" class="text-decoration-none d-flex align-items-center gap-2 text-dark">
                <?= brand_mark_html($platformCfg) ?>
                <span class="fw-bold"><?= e($platformCfg['brand_name'] ?? 'Hemnity') ?> Gym SaaS</span>
            </a>
            <a href="login.php" class="small text-muted text-decoration-none">Already registered? Sign In</a>
        </div>
        <h1 class="h4 fw-bold mb-1">Create Your Gym Workspace</h1>
        <p class="text-muted small mb-4">Launch an isolated multi-tenant gym portal with QR attendance, ID cards, and online billing.</p>

        <?php if (!empty($errors)): ?><div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div><?php endif; ?>

        <form method="post" action="owner_register.php">
            <?= csrf_field() ?>
            <div class="row g-3">
                <div class="col-md-7"><label class="form-label small fw-medium">Gym / Club Name *</label><input type="text" class="form-control" name="gym_name" value="<?= e($form['gym_name']) ?>" required></div>
                <div class="col-md-5"><label class="form-label small fw-medium">City</label><input type="text" class="form-control" name="city" value="<?= e($form['city']) ?>"></div>
                <div class="col-md-6"><label class="form-label small fw-medium">Owner Full Name *</label><input type="text" class="form-control" name="owner_name" value="<?= e($form['owner_name']) ?>" required></div>
                <div class="col-md-6"><label class="form-label small fw-medium">Phone</label><input type="tel" class="form-control font-mono" name="phone" value="<?= e($form['phone']) ?>"></div>
                <div class="col-md-6"><label class="form-label small fw-medium">Owner Email *</label><input type="email" class="form-control" name="email" value="<?= e($form['email']) ?>" required></div>
                <div class="col-md-6"><label class="form-label small fw-medium">Password *</label><input type="password" class="form-control" name="password" required minlength="8"></div>
                <div class="col-md-7"><label class="form-label small fw-medium">SaaS Plan *</label><select class="form-select" name="saas_plan_id"><?php foreach ($saasPlans as $sp): ?><option value="<?= (int)$sp['id'] ?>" <?= (string)$form['saas_plan_id'] === (string)$sp['id'] ? 'selected' : '' ?>><?= e($sp['plan_name']) ?> — ₹<?= number_format((float)$sp['monthly_price'], 0) ?>/mo (<?= (int)$sp['max_members'] ?> members)</option><?php endforeach; ?></select></div>
                <div class="col-md-5"><label class="form-label small fw-medium">Billing Cycle</label><select class="form-select" name="billing_cycle"><option value="monthly" <?= $form['billing_cycle'] === 'monthly' ? 'selected' : '' ?>>Monthly</option><option value="quarterly" <?= $form['billing_cycle'] === 'quarterly' ? 'selected' : '' ?>>Quarterly</option><option value="yearly" <?= $form['billing_cycle'] === 'yearly' ? 'selected' : '' ?>>Yearly</option></select></div>
            </div>
            <button type="submit" class="btn btn-gym-primary w-100 py-2 mt-4">Create Gym Workspace</button>
        </form>
    </div>
</div>
</body>
</html>
