<?php
declare(strict_types=1);

// Login-protected Android APK download (file or admin-configured link).
$GLOBALS['HEMNITY_NO_FILTER'] = true;
require_once __DIR__ . '/config.php';

$user = current_user();
if (!$user || !in_array($user['role'], ['gym_owner', 'gym_member', 'super_admin'], true)) {
    redirect('login.php');
}
$app = ($_GET['app'] ?? '') === 'member' ? 'member' : 'owner';
if ($user['role'] === 'gym_member' && $app !== 'member') { $app = 'member'; }
if ($user['role'] === 'gym_owner' && $app !== 'owner') { $app = 'owner'; }

$cfg  = get_platform_settings(db());
$info = app_download_info($cfg, $app);
if (!$info) {
    http_response_code(404);
    exit('The Android app is not available yet. Please contact your administrator.');
}
if (!empty($info['external'])) {
    header('Location: ' . $info['url']);
    exit;
}
$abs = __DIR__ . '/' . $cfg[$app . '_apk_path'];
while (ob_get_level() > 0) { ob_end_clean(); }
header('Content-Type: application/vnd.android.package-archive');
header('Content-Disposition: attachment; filename="Hemnity-Gym-' . ucfirst($app) . '.apk"');
header('Content-Length: ' . filesize($abs));
header('X-Content-Type-Options: nosniff');
readfile($abs);
