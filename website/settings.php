<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$settings     = get_gym_settings($pdo, $gymId);

$gwStmt = $pdo->prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = :gid LIMIT 1');
$gwStmt->execute([':gid' => $gymId]);
$gateway = $gwStmt->fetch() ?: ['provider' => 'manual', 'merchant_key_id' => '', 'secret_encrypted' => '', 'webhook_secret_encrypted' => '', 'mode' => 'test', 'is_enabled' => 0, 'auto_activate_membership' => 1];

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);
    $section = clean_str($_POST['section'] ?? 'gym', 30);

    if ($section === 'gym') {
        $gymName        = clean_str($_POST['gym_name'] ?? '', 150);
        $contactNumber  = clean_str($_POST['contact_number'] ?? '', 40);
        $email          = clean_str($_POST['email'] ?? '', 190);
        $currencyCode   = strtoupper(clean_str($_POST['currency_code'] ?? 'INR', 10));
        $currencySym    = clean_str($_POST['currency_symbol'] ?? '₹', 10);
        $address        = clean_str($_POST['address'] ?? '', 500, true);
        $receiptFooter  = clean_str($_POST['receipt_footer'] ?? '', 500, true);
        $operatingHours = clean_str($_POST['operating_hours'] ?? '05:30 AM - 10:00 PM', 120);
        $qrEnabled      = isset($_POST['qr_attendance_enabled']) ? 1 : 0;
        $photoVerify    = isset($_POST['require_photo_verify']) ? 1 : 0;
        $accentColor    = clean_str($_POST['id_card_accent_color'] ?? '#ea580c', 20);

        if ($gymName === '') $errors[] = 'Gym name is required.';
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Please enter a valid gym email.';

        $logoPath = $settings['logo_path'];
        if (!empty($_POST['remove_logo'])) $logoPath = null;
        if (!empty($_FILES['logo']) && ($_FILES['logo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $up = handle_image_upload($_FILES['logo'], 'logos');
            if (!$up['ok']) $errors[] = (string)$up['error']; else $logoPath = $up['path'];
        }

        if (empty($errors)) {
            $pdo->prepare(
                'UPDATE gym_settings SET gym_name = :name, logo_path = :logo, address = :addr, contact_number = :phone,
                 email = :email, currency_code = :ccode, currency_symbol = :csym, receipt_footer = :footer,
                 operating_hours = :hours, qr_attendance_enabled = :qr, require_photo_verify = :pv, id_card_accent_color = :accent
                 WHERE gym_id = :gid'
            )->execute([
                ':name' => $gymName, ':logo' => $logoPath, ':addr' => $address ?: null, ':phone' => $contactNumber ?: null,
                ':email' => $email ?: null, ':ccode' => $currencyCode, ':csym' => $currencySym, ':footer' => $receiptFooter,
                ':hours' => $operatingHours, ':qr' => $qrEnabled, ':pv' => $photoVerify, ':accent' => $accentColor, ':gid' => $gymId,
            ]);
            $pdo->prepare('UPDATE gyms SET name = :name, logo_path = :logo, operating_hours = :hours WHERE id = :gid')
                ->execute([':name' => $gymName, ':logo' => $logoPath, ':hours' => $operatingHours, ':gid' => $gymId]);
            set_flash('success', 'Gym branding, QR check-in, and ID card settings updated.');
            redirect('settings.php');
        }
    } elseif ($section === 'gateway') {
        $provider = clean_str($_POST['provider'] ?? 'manual', 20);
        if (!in_array($provider, ['manual', 'razorpay', 'cashfree', 'stripe'], true)) $provider = 'manual';
        $keyId   = clean_str($_POST['merchant_key_id'] ?? '', 190);
        $mode    = clean_str($_POST['mode'] ?? 'test', 10) === 'live' ? 'live' : 'test';
        $enabled = isset($_POST['is_enabled']) ? 1 : 0;
        $autoAct = isset($_POST['auto_activate_membership']) ? 1 : 0;
        $plainSecret  = trim((string)($_POST['api_secret'] ?? ''));
        $plainWebhook = trim((string)($_POST['webhook_secret'] ?? ''));

        $encSecret  = $plainSecret !== '' ? encrypt_secret($plainSecret) : (string)($gateway['secret_encrypted'] ?? '');
        $encWebhook = $plainWebhook !== '' ? encrypt_secret($plainWebhook) : (string)($gateway['webhook_secret_encrypted'] ?? '');

        $pdo->prepare(
            'INSERT INTO gym_payment_gateways (gym_id, provider, merchant_key_id, secret_encrypted, webhook_secret_encrypted, mode, is_enabled, auto_activate_membership)
             VALUES (:gid, :prov, :kid, :sec, :wh, :mode, :en, :auto)
             ON DUPLICATE KEY UPDATE provider=VALUES(provider), merchant_key_id=VALUES(merchant_key_id), secret_encrypted=VALUES(secret_encrypted), webhook_secret_encrypted=VALUES(webhook_secret_encrypted), mode=VALUES(mode), is_enabled=VALUES(is_enabled), auto_activate_membership=VALUES(auto_activate_membership)'
        )->execute([':gid' => $gymId, ':prov' => $provider, ':kid' => $keyId, ':sec' => $encSecret, ':wh' => $encWebhook, ':mode' => $mode, ':en' => $enabled, ':auto' => $autoAct]);

        log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'gateway.updated', 'gym', (string)$gymId, $gymId, ['provider' => $provider, 'mode' => $mode]);
        set_flash('success', 'Payment gateway configuration saved with AES-256 encryption.');
        redirect('settings.php');
    } elseif ($section === 'profile') {
        $ownerName  = clean_str($_POST['admin_full_name'] ?? '', 120);
        $ownerEmail = strtolower(clean_str($_POST['admin_email'] ?? '', 190));

        if ($ownerName === '' || !filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Valid owner name and email are required.';
        } else {
            $dup = $pdo->prepare('SELECT 1 FROM users WHERE email = :email AND id != :id LIMIT 1');
            $dup->execute([':email' => $ownerEmail, ':id' => (int)$currentAdmin['id']]);
            if ($dup->fetchColumn()) $errors[] = 'Another account already uses that email.';
        }

        if (empty($errors)) {
            $pdo->prepare('UPDATE users SET full_name = :name, email = :email WHERE id = :id')
                ->execute([':name' => $ownerName, ':email' => $ownerEmail, ':id' => (int)$currentAdmin['id']]);
            set_flash('success', 'Owner profile updated.');
            redirect('settings.php');
        }
    }
}

$pageTitle   = 'Settings';
$pageHeading = 'Settings';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Gym Workspace &amp; Gateway Settings</h1><p class="text-muted small mb-0">Tenant configuration, QR rules, and AES-256 encrypted payment keys.</p></div>
    <a href="change_password.php" class="btn btn-light border"><i class="bi bi-key me-1"></i>Change Password</a>
</div>

<?php if (!empty($errors)): ?><div class="alert alert-danger small"><ul class="mb-0 ps-3"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div><?php endif; ?>

<div class="row g-4">
    <div class="col-lg-7">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Gym Branding, QR &amp; ID Card Settings</h2></div>
            <div class="gym-card-body">
                <form method="post" action="settings.php" enctype="multipart/form-data">
                    <?= csrf_field() ?><input type="hidden" name="section" value="gym">
                    <div class="row g-3">
                        <div class="col-md-7"><label class="form-label fw-medium">Gym Name *</label><input type="text" class="form-control" name="gym_name" value="<?= e($settings['gym_name']) ?>" required></div>
                        <div class="col-md-3"><label class="form-label fw-medium">Currency</label><input type="text" class="form-control font-mono" name="currency_code" value="<?= e($settings['currency_code']) ?>" required></div>
                        <div class="col-md-2"><label class="form-label fw-medium">Symbol</label><input type="text" class="form-control font-mono" name="currency_symbol" value="<?= e($settings['currency_symbol']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Contact Number</label><input type="text" class="form-control font-mono" name="contact_number" value="<?= e($settings['contact_number'] ?? '') ?>"></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Gym Email</label><input type="email" class="form-control" name="email" value="<?= e($settings['email'] ?? '') ?>"></div>
                        <div class="col-md-8"><label class="form-label fw-medium">Operating Hours</label><input type="text" class="form-control" name="operating_hours" value="<?= e($settings['operating_hours'] ?? '05:30 AM - 10:00 PM') ?>"></div>
                        <div class="col-md-4"><label class="form-label fw-medium">ID Card Accent</label><input type="color" class="form-control form-control-color w-100" name="id_card_accent_color" value="<?= e($settings['id_card_accent_color'] ?? '#ea580c') ?>"></div>
                        <div class="col-12"><label class="form-label fw-medium">Gym Logo</label><input type="file" class="form-control" name="logo" accept=".jpg,.jpeg,.png,.webp"><?php if (!empty($settings['logo_path'])): ?><div class="form-check mt-1"><input class="form-check-input" type="checkbox" id="remove_logo" name="remove_logo" value="1"><label class="form-check-label small" for="remove_logo">Remove current logo</label></div><?php endif; ?></div>
                        <div class="col-12"><label class="form-label fw-medium">Address</label><textarea class="form-control" name="address" rows="2"><?= e($settings['address'] ?? '') ?></textarea></div>
                        <div class="col-12"><label class="form-label fw-medium">Receipt Footer</label><textarea class="form-control" name="receipt_footer" rows="2"><?= e($settings['receipt_footer'] ?? '') ?></textarea></div>
                        <div class="col-md-6"><div class="form-check"><input class="form-check-input" type="checkbox" id="qr_enabled" name="qr_attendance_enabled" value="1" <?= !empty($settings['qr_attendance_enabled']) ? 'checked' : '' ?>><label class="form-check-label small" for="qr_enabled">Enable QR Check-In</label></div></div>
                        <div class="col-md-6"><div class="form-check"><input class="form-check-input" type="checkbox" id="photo_verify" name="require_photo_verify" value="1" <?= !empty($settings['require_photo_verify']) ? 'checked' : '' ?>><label class="form-check-label small" for="photo_verify">Show Member Photo on Scan</label></div></div>
                    </div>
                    <div class="mt-4 d-flex justify-content-end"><button type="submit" class="btn btn-gym-primary">Save Gym Settings</button></div>
                </form>
            </div>
        </div>
    </div>

    <div class="col-lg-5">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Per-Gym Payment Gateway (AES-256)</h2></div>
            <div class="gym-card-body">
                <form method="post" action="settings.php">
                    <?= csrf_field() ?><input type="hidden" name="section" value="gateway">
                    <div class="row g-2 mb-2">
                        <div class="col-7"><label class="form-label small fw-medium">Provider</label><select class="form-select form-select-sm" name="provider"><?php foreach (['manual', 'razorpay', 'cashfree', 'stripe'] as $prov): ?><option value="<?= e($prov) ?>" <?= $gateway['provider'] === $prov ? 'selected' : '' ?>><?= e(ucfirst($prov)) ?></option><?php endforeach; ?></select></div>
                        <div class="col-5"><label class="form-label small fw-medium">Mode</label><select class="form-select form-select-sm" name="mode"><option value="test" <?= $gateway['mode'] === 'test' ? 'selected' : '' ?>>Test</option><option value="live" <?= $gateway['mode'] === 'live' ? 'selected' : '' ?>>Live</option></select></div>
                    </div>
                    <div class="mb-2"><label class="form-label small fw-medium">Key ID / App ID</label><input type="text" class="form-control form-control-sm font-mono" name="merchant_key_id" value="<?= e($gateway['merchant_key_id'] ?? '') ?>"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">API Secret <?= !empty($gateway['secret_encrypted']) ? '(' . e(mask_secret($gateway['secret_encrypted'])) . ')' : '' ?></label><input type="password" class="form-control form-control-sm font-mono" name="api_secret" placeholder="Leave blank to keep stored secret"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Webhook Secret <?= !empty($gateway['webhook_secret_encrypted']) ? '(' . e(mask_secret($gateway['webhook_secret_encrypted'])) . ')' : '' ?></label><input type="password" class="form-control form-control-sm font-mono" name="webhook_secret" placeholder="Leave blank to keep stored secret"></div>
                    <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="gw_en" name="is_enabled" value="1" <?= !empty($gateway['is_enabled']) ? 'checked' : '' ?>><label class="form-check-label small" for="gw_en">Enable Online Member Checkout</label></div>
                    <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="gw_auto" name="auto_activate_membership" value="1" <?= !empty($gateway['auto_activate_membership']) ? 'checked' : '' ?>><label class="form-check-label small" for="gw_auto">Auto-extend membership on HMAC webhook</label></div>
                    <button type="submit" class="btn btn-gym-dark btn-sm w-100">Save Gateway Keys</button>
                </form>
            </div>
        </div>

        <div class="gym-card">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Owner Profile</h2></div>
            <div class="gym-card-body">
                <form method="post" action="settings.php">
                    <?= csrf_field() ?><input type="hidden" name="section" value="profile">
                    <div class="mb-2"><label class="form-label small fw-medium">Full Name *</label><input type="text" class="form-control form-control-sm" name="admin_full_name" value="<?= e($currentAdmin['full_name']) ?>" required></div>
                    <div class="mb-3"><label class="form-label small fw-medium">Login Email *</label><input type="email" class="form-control form-control-sm" name="admin_email" value="<?= e($currentAdmin['email']) ?>" required></div>
                    <button type="submit" class="btn btn-outline-dark btn-sm w-100">Update Profile</button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
