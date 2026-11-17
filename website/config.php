<?php
declare(strict_types=1);

/**
 * Hemnity Gym Management Software — Multi-Tenant SaaS Configuration & Helpers
 * Parent Brand: Hemnity (https://gym.hemnity.in)
 * Compatible with PHP 8.1+ and MySQL 8.0+ / MariaDB 10.4+ on cPanel Shared Hosting
 */

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php') {
    http_response_code(403);
    exit('403 Forbidden: Direct access is not permitted.');
}

define('GYM_APP_INIT', true);
define('GYM_APP_VERSION', '2.0.0');

// Default timezone (adjust in cPanel or config.local.php as needed)
date_default_timezone_set(getenv('GYM_TIMEZONE') ?: 'Asia/Kolkata');

if (!defined('GYM_PATH_DEPTH')) {
    define('GYM_PATH_DEPTH', 0);
}

/**
 * Resolve relative prefix based on folder depth ('', '../', '../../') so all links
 * work inside domain root (public_html/) as well as any cPanel subfolder (public_html/gym/).
 */
function app_prefix(): string
{
    return str_repeat('../', max(0, (int)GYM_PATH_DEPTH));
}

function app_href(string $relative = ''): string
{
    return app_prefix() . ltrim($relative, '/');
}

// Harden PHP session cookies before starting session
if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((int)($_SERVER['SERVER_PORT'] ?? 80) === 443)
        || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');

    session_name('HEMNITY_GYM_SESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ============================================================================
// DATABASE & SECURITY CONFIGURATION (cPanel / phpMyAdmin)
// Put secrets in an untracked `config.local.php` file returning an array:
//   ['host' => 'localhost', 'dbname' => '...', 'username' => '...', 'password' => '...', 'encryption_key' => '...']
// ============================================================================
$dbConfig = [
    'host'           => getenv('GYM_DB_HOST') ?: 'localhost',
    'port'           => getenv('GYM_DB_PORT') ?: '3306',
    'dbname'         => getenv('GYM_DB_NAME') ?: 'hemnity_gym_saas',
    'username'       => getenv('GYM_DB_USER') ?: 'CHANGE_ME_DB_USER',
    'password'       => getenv('GYM_DB_PASS') !== false ? (string)getenv('GYM_DB_PASS') : '',
    'charset'        => 'utf8mb4',
    'encryption_key' => getenv('HEMNITY_ENC_KEY') ?: '',
    'base_url'       => getenv('HEMNITY_BASE_URL') ?: 'https://gym.hemnity.in',
];

$localConfigFile = __DIR__ . '/config.local.php';
if (is_file($localConfigFile) && is_readable($localConfigFile)) {
    $overrides = require $localConfigFile;
    if (is_array($overrides)) {
        $dbConfig = array_merge($dbConfig, $overrides);
    }
}

/**
 * Returns singleton PDO connection using native prepared statements.
 */
function db(): PDO
{
    static $pdo = null;
    global $dbConfig;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $dbConfig['host'],
        $dbConfig['port'],
        $dbConfig['dbname'],
        $dbConfig['charset']
    );

    try {
        $pdo = new PDO($dsn, (string)$dbConfig['username'], (string)$dbConfig['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $ex) {
        error_log('[Hemnity DB Connection Error] ' . $ex->getMessage());
        http_response_code(500);
        exit('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Database Configuration Required — Hemnity Gym</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8f9fb;color:#111827;margin:0;padding:48px 20px}.box{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px}h1{margin:0 0 12px;font-size:22px}p,li{line-height:1.6;color:#374151;font-size:15px}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px}</style></head><body><div class="box"><h1>Database Connection Not Configured</h1><p>Hemnity Gym Management Software could not connect to MySQL. Please verify your cPanel setup:</p><ol><li>Create your MySQL database &amp; user in <strong>cPanel &rarr; MySQL Databases</strong> with <strong>ALL PRIVILEGES</strong>.</li><li>Import <code>database_saas.sql</code> (fresh install) or <code>database_migration.sql</code> (upgrade) via <strong>phpMyAdmin</strong>.</li><li>Configure <code>$dbConfig</code> in <code>config.php</code> or <code>config.local.php</code>.</li></ol></div></body></html>');
    }

    hemnity_ensure_schema($pdo);
    return $pdo;
}

/**
 * Derive 32-byte encryption key from config.local.php / env or fallback secret.
 */
function hemnity_encryption_key(): string
{
    global $dbConfig;
    $raw = (string)($dbConfig['encryption_key'] ?? '');
    if ($raw === '') {
        $raw = 'hemnity-cpanel-key:' . __DIR__ . ':' . (string)($dbConfig['dbname'] ?? 'gym');
    }
    return hash('sha256', $raw, true);
}

/**
 * Encrypt sensitive secrets (payment gateway keys, SMTP password) using AES-256-GCM / CBC.
 */
function encrypt_secret(?string $plain): string
{
    $text = trim((string)($plain ?? ''));
    if ($text === '') {
        return '';
    }
    $key = hemnity_encryption_key();
    if (function_exists('openssl_encrypt')) {
        $cipher = in_array('aes-256-gcm', openssl_get_cipher_methods(), true) ? 'aes-256-gcm' : 'aes-256-cbc';
        if ($cipher === 'aes-256-gcm') {
            $iv = random_bytes(12);
            $tag = '';
            $enc = openssl_encrypt($text, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
            if ($enc !== false) {
                return 'v1:gcm:' . base64_encode($iv) . ':' . base64_encode($tag) . ':' . base64_encode($enc);
            }
        } else {
            $iv = random_bytes(16);
            $enc = openssl_encrypt($text, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
            if ($enc !== false) {
                $mac = hash_hmac('sha256', $iv . $enc, $key, true);
                return 'v1:cbc:' . base64_encode($iv) . ':' . base64_encode($mac) . ':' . base64_encode($enc);
            }
        }
    }
    return '';
}

function decrypt_secret(?string $stored): string
{
    $val = trim((string)($stored ?? ''));
    if ($val === '' || !function_exists('openssl_decrypt')) {
        return '';
    }
    $parts = explode(':', $val);
    if (count($parts) === 5 && $parts[0] === 'v1') {
        $key = hemnity_encryption_key();
        $iv  = base64_decode($parts[2], true);
        $tagOrMac = base64_decode($parts[3], true);
        $cipherText = base64_decode($parts[4], true);
        if ($iv === false || $tagOrMac === false || $cipherText === false) {
            return '';
        }
        if ($parts[1] === 'gcm') {
            $dec = openssl_decrypt($cipherText, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tagOrMac);
            return $dec === false ? '' : $dec;
        }
        if ($parts[1] === 'cbc') {
            $calcMac = hash_hmac('sha256', $iv . $cipherText, $key, true);
            if (!hash_equals($calcMac, $tagOrMac)) {
                return '';
            }
            $dec = openssl_decrypt($cipherText, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
            return $dec === false ? '' : $dec;
        }
    }
    return '';
}

function mask_secret(?string $stored): string
{
    $plain = decrypt_secret($stored);
    if ($plain === '') {
        return '';
    }
    $len = strlen($plain);
    if ($len <= 4) {
        return str_repeat('*', $len);
    }
    return str_repeat('*', max(4, $len - 4)) . substr($plain, -4);
}

function verify_hmac_signature(string $payload, string $signatureHex, string $secret): bool
{
    if ($signatureHex === '' || $secret === '') {
        return false;
    }
    $expected = hash_hmac('sha256', $payload, $secret);
    return hash_equals(strtolower($expected), strtolower(trim($signatureHex)));
}

/**
 * Escape string safely for HTML output to prevent XSS.
 */
function e(mixed $value): string
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function clean_str(?string $value, int $maxLength = 255, bool $allowNewlines = false): string
{
    $str = trim((string)($value ?? ''));
    if ($allowNewlines) {
        $str = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $str) ?? '';
    } else {
        $str = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $str) ?? '';
        $str = preg_replace('/\s+/u', ' ', $str) ?? '';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($str, 0, $maxLength, 'UTF-8');
    }
    return substr($str, 0, $maxLength);
}

function slugify_gym_name(string $name): string
{
    $slug = strtolower(trim($name));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? 'gym';
    $slug = trim($slug, '-');
    return $slug !== '' ? substr($slug, 0, 70) : 'gym-' . bin2hex(random_bytes(3));
}

function is_valid_date(?string $date): bool
{
    if ($date === null || $date === '') {
        return false;
    }
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $date);
    return $dt !== false && $dt->format('Y-m-d') === $date;
}

function normalize_time(?string $time): ?string
{
    if ($time === null || trim($time) === '') {
        return null;
    }
    $time = trim($time);
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $time, $m)) {
        return sprintf('%s:%s:%s', $m[1], $m[2], $m[3] ?? '00');
    }
    return null;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function verify_csrf(): void
{
    $submitted = (string)($_POST['csrf_token'] ?? '');
    $expected  = csrf_token();
    if ($submitted === '' || !hash_equals($expected, $submitted)) {
        http_response_code(419);
        set_flash('danger', 'Your form session expired or failed security verification. Please try again.');
        $referer = basename((string)($_SERVER['SCRIPT_NAME'] ?? 'index.php'));
        redirect($referer ?: 'index.php');
    }
}

function redirect(string $relativePath): never
{
    $clean = ltrim($relativePath, '/\\');
    if (preg_match('/^[a-zA-Z][a-zA-Z0-9+.-]*:/', $clean) || str_starts_with($clean, '//')) {
        $clean = app_href('index.php');
    }
    $clean = preg_replace('/\.php(?=($|[?#]))/', '', $clean) ?? $clean;
    if ($clean === 'index' || $clean === '') { $clean = './'; }
    header('Location: ' . $clean);
    exit;
}

function set_flash(string $type, string $message): void
{
    $_SESSION['flash_messages'][] = [
        'type'    => $type,
        'message' => $message,
    ];
}

function pull_flashes(): array
{
    $messages = $_SESSION['flash_messages'] ?? [];
    unset($_SESSION['flash_messages']);
    return is_array($messages) ? $messages : [];
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id']) || !is_int($_SESSION['user_id'])) {
        return null;
    }
    $stmt = db()->prepare(
        'SELECT id, role, full_name, email, phone, is_active, is_initial_setup_complete, last_login_at
         FROM users WHERE id = :id AND is_active = 1 LIMIT 1'
    );
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return $row;
}

function is_admin_logged_in(): bool
{
    $u = current_user();
    return $u !== null && $u['role'] === 'gym_owner';
}

function is_super_admin_logged_in(): bool
{
    $u = current_user();
    return $u !== null && $u['role'] === 'super_admin';
}

function is_member_logged_in(): bool
{
    $u = current_user();
    return $u !== null && $u['role'] === 'gym_member';
}

/**
 * Evaluate subscription status & write quota/grace rules for a gym tenant.
 */
function get_gym_subscription_info(PDO $pdo, int $gymId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT sub.*, sp.slug AS plan_slug, sp.plan_name, sp.max_members, sp.max_branches, sp.enabled_features_json, g.status AS gym_status
         FROM gym_saas_subscriptions sub
         INNER JOIN saas_plans sp ON sp.id = sub.saas_plan_id
         INNER JOIN gyms g ON g.id = sub.gym_id
         WHERE sub.gym_id = :gid
         LIMIT 1'
    );
    $stmt->execute([':gid' => $gymId]);
    $sub = $stmt->fetch();
    if (!$sub) {
        return null;
    }

    $mStmt = $pdo->prepare('SELECT COUNT(*) FROM members WHERE gym_id = :gid');
    $mStmt->execute([':gid' => $gymId]);
    $currentMembers = (int)$mStmt->fetchColumn();

    $today = date('Y-m-d');
    $effectiveStatus = (string)$sub['status'];
    $canWrite = true;
    $reason = null;

    if ($sub['gym_status'] === 'Suspended' || $effectiveStatus === 'Suspended') {
        $effectiveStatus = 'Suspended';
        $canWrite = false;
        $reason = 'Workspace suspended by Hemnity Super Admin.';
    } elseif ($sub['current_period_end'] < $today) {
        $graceEnd = (new DateTimeImmutable($sub['current_period_end']))
            ->modify('+' . (int)$sub['grace_period_days'] . ' days')
            ->format('Y-m-d');
        if ($today <= $graceEnd) {
            $effectiveStatus = 'Grace';
            $reason = 'Subscription in grace period until ' . format_date($graceEnd) . '. Please renew soon.';
        } else {
            $effectiveStatus = 'Expired';
            $canWrite = false;
            $reason = 'SaaS subscription expired on ' . format_date($sub['current_period_end']) . '. Renew to resume adding/editing records.';
        }
    }

    $maxMembers = (int)$sub['max_members'];
    $sub['effective_status'] = $effectiveStatus;
    $sub['current_members'] = $currentMembers;
    $sub['can_write_operations'] = $canWrite;
    $sub['can_add_more_members'] = $canWrite && ($currentMembers < $maxMembers);
    $sub['restriction_reason'] = $reason;
    return $sub;
}

/**
 * Centralized Multi-Tenant Owner Authorization.
 * Never trusts client-submitted gym_id; derives gym_id strictly from gym_owners.
 */
function require_owner_tenant(bool $requireWriteAccess = false): array
{
    $user = current_user();
    if (!$user || $user['role'] !== 'gym_owner') {
        redirect(app_href('login.php'));
    }

    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT g.id, g.gym_code, g.slug, g.name, g.status
         FROM gym_owners go
         INNER JOIN gyms g ON g.id = go.gym_id
         WHERE go.user_id = :uid
         ORDER BY go.is_primary DESC, g.id ASC'
    );
    $stmt->execute([':uid' => (int)$user['id']]);
    $ownedGyms = $stmt->fetchAll();

    if (empty($ownedGyms)) {
        set_flash('danger', 'No gym workspace is linked to this owner account.');
        redirect(app_href('login.php'));
    }

    $activeGymId = (int)($_SESSION['active_gym_id'] ?? 0);
    $matched = $ownedGyms[0];
    foreach ($ownedGyms as $og) {
        if ((int)$og['id'] === $activeGymId) {
            $matched = $og;
            break;
        }
    }
    $_SESSION['active_gym_id'] = (int)$matched['id'];

    sync_expired_memberships($pdo, (int)$matched['id']);
    $sub = get_gym_subscription_info($pdo, (int)$matched['id']);
    if ($requireWriteAccess && $sub && !$sub['can_write_operations']) {
        set_flash('warning', (string)($sub['restriction_reason'] ?? 'Subscription expired. Renew to unlock edits.'));
        redirect(app_href('owner_subscription.php'));
    }

    $user['gym_id'] = (int)$matched['id'];
    $user['gym_name'] = (string)$matched['name'];
    $user['gym_code'] = (string)$matched['gym_code'];
    $user['gym_status'] = (string)$matched['status'];
    $user['subscription'] = $sub;
    return $user;
}

/**
 * Backward-compatible alias used across existing root modules.
 */
function require_admin(): array
{
    return require_owner_tenant(false);
}

function require_super_admin(): array
{
    $user = current_user();
    if (!$user || $user['role'] !== 'super_admin') {
        redirect(app_href('superadmin/login.php'));
    }
    return $user;
}

function require_member_user(): array
{
    $user = current_user();
    if (!$user || $user['role'] !== 'gym_member') {
        redirect(app_href('member/login.php'));
    }
    sync_expired_memberships(db());
    return $user;
}

function sync_expired_memberships(PDO $pdo, ?int $gymId = null): void
{
    static $syncedKeys = [];
    $key = $gymId === null ? 'all' : (string)$gymId;
    if (isset($syncedKeys[$key])) {
        return;
    }
    $syncedKeys[$key] = true;

    $today = date('Y-m-d');
    if ($gymId !== null) {
        $pdo->prepare("UPDATE members SET status = 'Expired' WHERE gym_id = :gid AND status = 'Active' AND membership_expiry_date IS NOT NULL AND membership_expiry_date < :today")
            ->execute([':gid' => $gymId, ':today' => $today]);
        $pdo->prepare("UPDATE memberships SET status = 'Expired' WHERE gym_id = :gid AND status = 'Active' AND expiry_date < :today")
            ->execute([':gid' => $gymId, ':today' => $today]);
    } else {
        $pdo->prepare("UPDATE members SET status = 'Expired' WHERE status = 'Active' AND membership_expiry_date IS NOT NULL AND membership_expiry_date < :today")
            ->execute([':today' => $today]);
        $pdo->prepare("UPDATE memberships SET status = 'Expired' WHERE status = 'Active' AND expiry_date < :today")
            ->execute([':today' => $today]);
    }
}

function get_platform_settings(PDO $pdo): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }
    $row = $pdo->query('SELECT * FROM platform_settings WHERE id = 1 LIMIT 1')->fetch();
    $cached = $row ?: [
        'brand_name' => 'Hemnity',
        'software_name' => 'Hemnity Gym Management Software',
        'base_url' => 'https://gym.hemnity.in',
        'hero_badge' => 'Multi-Tenant SaaS Platform for Fitness Clubs',
        'hero_title' => 'Run every gym branch, QR check-in desk, and member billing portal from one platform.',
        'hero_subtitle' => 'Independent white-label operations, verifiable QR check-ins, and per-gym billing.',
        'hero_cta_primary' => 'Start Free Trial',
        'hero_cta_secondary' => 'Owner Login',
        'support_email' => 'support@hemnity.in',
        'support_phone' => '+91 80 4123 8900',
        'support_address' => 'Bengaluru, India',
        'maintenance_mode' => 0,
        'default_grace_period_days' => 7,
    ];
    return $cached;
}

function get_gym_settings(PDO $pdo, ?int $gymId = null): array
{
    static $cache = [];
    if ($gymId === null) {
        $gymId = (int)($_SESSION['active_gym_id'] ?? 1);
    }
    if (isset($cache[$gymId])) {
        return $cache[$gymId];
    }

    $stmt = $pdo->prepare('SELECT * FROM gym_settings WHERE gym_id = :gid LIMIT 1');
    $stmt->execute([':gid' => $gymId]);
    $row = $stmt->fetch();

    if (!$row) {
        $gStmt = $pdo->prepare('SELECT name FROM gyms WHERE id = :gid LIMIT 1');
        $gStmt->execute([':gid' => $gymId]);
        $gName = (string)($gStmt->fetchColumn() ?: 'Ironworks Fitness Club');

        $ins = $pdo->prepare(
            "INSERT IGNORE INTO gym_settings (gym_id, gym_name, currency_code, currency_symbol, receipt_footer)
             VALUES (:gid, :name, 'INR', '₹', 'Thank you for training with us.')"
        );
        $ins->execute([':gid' => $gymId, ':name' => $gName]);
        $stmt->execute([':gid' => $gymId]);
        $row = $stmt->fetch();
    }

    $cache[$gymId] = $row ?: [
        'gym_id' => $gymId,
        'gym_name' => 'Ironworks Fitness Club',
        'logo_path' => null,
        'address' => '',
        'contact_number' => '',
        'email' => '',
        'currency_code' => 'INR',
        'currency_symbol' => '₹',
        'receipt_footer' => 'Thank you for training with us.',
        'operating_hours' => '05:30 AM - 10:00 PM',
        'qr_attendance_enabled' => 1,
        'require_photo_verify' => 1,
        'id_card_accent_color' => '#ea580c',
        'id_card_show_expiry' => 1,
    ];

    return $cache[$gymId];
}

function format_money(float|string|int $amount, ?string $symbol = null): string
{
    if ($symbol === null) {
        $settings = get_gym_settings(db());
        $symbol = (string)($settings['currency_symbol'] ?? '₹');
    }
    return $symbol . number_format((float)$amount, 2, '.', ',');
}

function format_date(?string $date): string
{
    if (!$date || !is_valid_date($date)) {
        return '—';
    }
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $date);
    return $dt ? $dt->format('d M Y') : '—';
}

function days_until_expiry(?string $expiryDate): ?int
{
    if (!$expiryDate || !is_valid_date($expiryDate)) {
        return null;
    }
    $today  = new DateTimeImmutable(date('Y-m-d'));
    $target = new DateTimeImmutable($expiryDate);
    return (int)$today->diff($target)->format('%r%a');
}

function generate_member_code(PDO $pdo, int $gymId = 1): string
{
    $year   = date('Y');
    $prefix = 'GYM-' . $year . '-';

    $stmt = $pdo->prepare('SELECT member_code FROM members WHERE gym_id = :gid AND member_code LIKE :prefix ORDER BY id DESC LIMIT 1');
    $stmt->execute([':gid' => $gymId, ':prefix' => $prefix . '%']);
    $lastCode = $stmt->fetchColumn();

    $nextNum = 1;
    if (is_string($lastCode) && preg_match('/^GYM-\d{4}-(\d+)$/', $lastCode, $m)) {
        $nextNum = ((int)$m[1]) + 1;
    }

    $checkStmt = $pdo->prepare('SELECT 1 FROM members WHERE gym_id = :gid AND member_code = :code LIMIT 1');
    while (true) {
        $candidate = sprintf('%s%04d', $prefix, $nextNum);
        $checkStmt->execute([':gid' => $gymId, ':code' => $candidate]);
        if (!$checkStmt->fetchColumn()) {
            return $candidate;
        }
        $nextNum++;
    }
}

function generate_receipt_number(PDO $pdo, int $gymId = 1): string
{
    $datePart = date('Ymd');
    $checkStmt = $pdo->prepare('SELECT 1 FROM payments WHERE gym_id = :gid AND receipt_number = :rcp LIMIT 1');

    for ($attempt = 0; $attempt < 50; $attempt++) {
        $rand = strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
        $candidate = sprintf('RCP-%s-%s', $datePart, $rand);
        $checkStmt->execute([':gid' => $gymId, ':rcp' => $candidate]);
        if (!$checkStmt->fetchColumn()) {
            return $candidate;
        }
    }

    return 'RCP-' . $datePart . '-' . strtoupper(bin2hex(random_bytes(4)));
}

function generate_qr_token(): string
{
    return 'HQR-' . strtoupper(bin2hex(random_bytes(16)));
}

function issue_member_qr_credential(PDO $pdo, int $gymId, int $memberId, ?int $issuedBy = null): string
{
    $pdo->prepare("UPDATE qr_credentials SET status = 'Revoked', revoked_at = NOW(), revoke_reason = 'Reissued new QR pass' WHERE gym_id = :gid AND member_id = :mid AND status = 'Active'")
        ->execute([':gid' => $gymId, ':mid' => $memberId]);

    $token = generate_qr_token();
    $pdo->prepare('INSERT INTO qr_credentials (gym_id, member_id, credential_token, status, issued_by) VALUES (:gid, :mid, :tok, \'Active\', :iby)')
        ->execute([':gid' => $gymId, ':mid' => $memberId, ':tok' => $token, ':iby' => $issuedBy]);
    return $token;
}

function log_audit_event(PDO $pdo, string $actorRole, ?int $actorUserId, string $action, string $targetType, ?string $targetId = null, ?int $gymId = null, ?array $details = null): void
{
    try {
        $ip = clean_str((string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'), 64);
        $stmt = $pdo->prepare(
            'INSERT INTO audit_logs (actor_user_id, actor_role, gym_id, action, target_type, target_id, details_json, ip_address)
             VALUES (:uid, :role, :gid, :act, :ttype, :tid, :details, :ip)'
        );
        $stmt->execute([
            ':uid'     => $actorUserId,
            ':role'    => $actorRole,
            ':gid'     => $gymId,
            ':act'     => $action,
            ':ttype'   => $targetType,
            ':tid'     => $targetId,
            ':details' => $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
            ':ip'      => $ip,
        ]);
    } catch (Throwable $ex) {
        error_log('[Hemnity Audit Error] ' . $ex->getMessage());
    }
}

function whatsapp_reminder_url(string $phone, string $memberName, string $gymName, ?string $expiryDate, bool $isExpired): ?string
{
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if ($digits === '') {
        return null;
    }
    if (strlen($digits) === 10) {
        $digits = '91' . $digits;
    } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
        $digits = '91' . substr($digits, 1);
    }

    $formattedDate = format_date($expiryDate);
    if ($isExpired) {
        $message = sprintf(
            'Hello %s, this is a friendly reminder from %s. Your gym membership expired on %s. Please renew via your Member Portal or visit the front desk!',
            $memberName,
            $gymName,
            $formattedDate
        );
    } else {
        $message = sprintf(
            'Hello %s, greetings from %s! Your gym membership expires on %s. Renew smoothly from your Member Portal or at the front desk.',
            $memberName,
            $gymName,
            $formattedDate
        );
    }

    return 'https://wa.me/' . $digits . '?text=' . rawurlencode($message);
}

function handle_image_upload(array $file, string $subDir, int $maxBytes = 2097152): array
{
    $errorCode = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($errorCode === UPLOAD_ERR_NO_FILE) {
        return ['ok' => true, 'path' => null];
    }
    if ($errorCode !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'Image upload failed (error code ' . $errorCode . '). Please choose a file under 2 MB.'];
    }

    $tmpName = (string)($file['tmp_name'] ?? '');
    $size    = (int)($file['size'] ?? 0);
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        return ['ok' => false, 'error' => 'Invalid uploaded image file.'];
    }
    if ($size <= 0 || $size > $maxBytes) {
        return ['ok' => false, 'error' => 'Image file must be smaller than 2 MB.'];
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = (string)$finfo->file($tmpName);
    $allowedMimes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($allowedMimes[$mime])) {
        return ['ok' => false, 'error' => 'Only JPG, PNG, and WEBP images are permitted.'];
    }

    $imgInfo = @getimagesize($tmpName);
    if ($imgInfo === false || $imgInfo[0] < 10 || $imgInfo[1] < 10) {
        return ['ok' => false, 'error' => 'Uploaded file is not a valid image.'];
    }

    $cleanSubDir = trim($subDir, '/\\');
    $targetDir   = __DIR__ . '/uploads/' . $cleanSubDir;
    if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
        return ['ok' => false, 'error' => 'Server could not create upload directory.'];
    }

    $filename     = bin2hex(random_bytes(12)) . '.' . $allowedMimes[$mime];
    $destination  = $targetDir . '/' . $filename;
    $relativePath = 'uploads/' . $cleanSubDir . '/' . $filename;

    if (!move_uploaded_file($tmpName, $destination)) {
        return ['ok' => false, 'error' => 'Could not save uploaded image. Check /uploads permissions.'];
    }

    @chmod($destination, 0644);
    return ['ok' => true, 'path' => $relativePath];
}

function bearer_token_user(PDO $pdo): ?array
{
    $hdr = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!str_starts_with($hdr, 'Bearer ')) {
        return null;
    }
    $raw = trim(substr($hdr, 7));
    if ($raw === '') {
        return null;
    }
    $hash = hash('sha256', $raw);
    $stmt = $pdo->prepare(
        'SELECT t.id AS token_id, t.gym_id AS token_gym_id, u.id, u.role, u.full_name, u.email, u.phone, u.is_active
         FROM api_tokens t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = :th AND (t.expires_at IS NULL OR t.expires_at > NOW()) AND u.is_active = 1
         LIMIT 1'
    );
    $stmt->execute([':th' => $hash]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $pdo->prepare('UPDATE api_tokens SET last_used_at = NOW() WHERE id = :id')->execute([':id' => (int)$row['token_id']]);
    return $row;
}


// ============================================================================
// v2.1 ADDITIONS — Clean URLs, favicon/logo branding, idempotent schema upgrade
// ============================================================================

/**
 * Idempotently adds v2.1 columns/tables (branding + WhatsApp automation) so cPanel
 * users never need to run SQL by hand. A marker file prevents re-checking each request.
 */
function hemnity_ensure_schema(PDO $pdo): void
{
    $marker = __DIR__ . '/uploads/.schema_v21';
    if (is_file($marker)) {
        return;
    }
    try {
        $colExists = static function (string $table, string $col) use ($pdo): bool {
            $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c');
            $q->execute([':t' => $table, ':c' => $col]);
            return (int)$q->fetchColumn() > 0;
        };
        foreach (['site_logo_path', 'favicon_path'] as $col) {
            if (!$colExists('platform_settings', $col)) {
                $pdo->exec('ALTER TABLE platform_settings ADD COLUMN `' . $col . '` VARCHAR(255) NULL');
            }
        }
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `whatsapp_settings` (
                `gym_id` BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
                `api_url` VARCHAR(500) NOT NULL DEFAULT '',
                `api_key_enc` TEXT NULL,
                `request_style` VARCHAR(24) NOT NULL DEFAULT 'post_json',
                `key_param` VARCHAR(40) NOT NULL DEFAULT 'apikey',
                `phone_param` VARCHAR(40) NOT NULL DEFAULT 'phone',
                `message_param` VARCHAR(40) NOT NULL DEFAULT 'message',
                `country_code` VARCHAR(6) NOT NULL DEFAULT '91',
                `notify_days_before` VARCHAR(40) NOT NULL DEFAULT '3,1',
                `send_on_expiry` TINYINT(1) NOT NULL DEFAULT 1,
                `repeat_after_expiry_days` INT NOT NULL DEFAULT 7,
                `tpl_expiring` TEXT NULL,
                `tpl_expired` TEXT NULL,
                `last_run_at` DATETIME NULL,
                `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `whatsapp_logs` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                `gym_id` BIGINT UNSIGNED NOT NULL,
                `member_id` BIGINT UNSIGNED NULL,
                `kind` VARCHAR(20) NOT NULL,
                `phone` VARCHAR(30) NOT NULL,
                `message` TEXT NULL,
                `status` VARCHAR(12) NOT NULL,
                `http_code` INT NULL,
                `response` TEXT NULL,
                `log_date` DATE NOT NULL,
                `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                KEY `idx_wa_gym_date` (`gym_id`, `log_date`),
                KEY `idx_wa_member_kind` (`gym_id`, `member_id`, `kind`, `log_date`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `member_devices` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                `user_id` BIGINT UNSIGNED NOT NULL,
                `token` VARCHAR(255) NOT NULL,
                `platform` VARCHAR(20) NULL,
                `device_name` VARCHAR(80) NULL,
                `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_device_token` (`token`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        if (!$colExists('api_tokens', 'refresh_hash')) {
            $pdo->exec('ALTER TABLE api_tokens ADD COLUMN `refresh_hash` CHAR(64) NULL');
        }
        $dir = dirname($marker);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents($marker, date('c'));
    } catch (Throwable $ex) {
        error_log('[Hemnity schema upgrade] ' . $ex->getMessage());
    }
}

/** Branding helpers: uploaded super-admin logo / favicon with safe fallbacks. */
function platform_logo_url(array $cfg): ?string
{
    $p = (string)($cfg['site_logo_path'] ?? '');
    return ($p !== '' && is_file(__DIR__ . '/' . $p)) ? app_href($p) : null;
}

function brand_mark_html(array $cfg, string $extraClass = ''): string
{
    $logo = platform_logo_url($cfg);
    if ($logo !== null) {
        return '<img src="' . e($logo) . '" alt="' . e((string)($cfg['brand_name'] ?? 'Logo')) . '" class="gym-brand-logo ' . e($extraClass) . '" style="height:34px;width:auto;max-width:140px;object-fit:contain;border-radius:8px;">';
    }
    return '<span class="gym-brand-mark ' . e($extraClass) . '" aria-hidden="true">' . e(strtoupper(substr((string)($cfg['brand_name'] ?? 'H'), 0, 1))) . '</span>';
}

/**
 * Output filter: (1) strips ".php" from internal href/action URLs so visitors never see
 * file extensions, (2) injects the favicon link, (3) injects the password show/hide script.
 */
function hemnity_output_filter(string $html): string
{
    if ($html === '' || (stripos($html, '<html') === false && stripos($html, '<!doctype') === false)) {
        return $html;
    }
    foreach (headers_list() as $h) {
        if (stripos($h, 'content-type:') === 0 && stripos($h, 'text/html') === false) {
            return $html;
        }
    }
    $html = preg_replace_callback(
        '/\b(href|action)=(["\'])([^"\']*?)\2/i',
        static function (array $m): string {
            $url = $m[3];
            if (preg_match('#^(https?:)?//#i', $url) || preg_match('/^(mailto|tel|javascript|data):/i', $url)) {
                return $m[0];
            }
            $url = preg_replace('/\.php(?=($|[?#]))/', '', $url) ?? $url;
            // "index" and ".../index" collapse to their directory URL
            $url = preg_replace('#(^|/)index(?=($|[?\#]))#', '$1', $url) ?? $url;
            if ($url === '' || $url[0] === '?' || $url[0] === '#') { $url = './' . $url; }
            return $m[1] . '=' . $m[2] . $url . $m[2];
        },
        $html
    ) ?? $html;

    $prefix = app_prefix();
    $inject = '';
    if (stripos($html, 'rel="icon"') === false && stripos($html, "rel='icon'") === false) {
        $inject .= '<link rel="icon" href="' . $prefix . 'site_icon">'
                 . '<link rel="apple-touch-icon" href="' . $prefix . 'site_icon">';
    }
    if ($inject !== '' && stripos($html, '</head>') !== false) {
        $html = preg_replace('#</head>#i', $inject . '</head>', $html, 1) ?? $html;
    }
    if (stripos($html, 'type="password"') !== false && stripos($html, 'assets/js/ux.js') === false && stripos($html, '</body>') !== false) {
        $html = preg_replace('#</body>#i', '<script src="' . $prefix . 'assets/js/ux.js"></script></body>', $html, 1) ?? $html;
    }
    return $html;
}

if (PHP_SAPI !== 'cli' && empty($GLOBALS['HEMNITY_NO_FILTER'])) {
    ob_start('hemnity_output_filter');
}

// ============================================================================
// WhatsApp automation (generic HTTP gateway: GET URL template, POST form, POST JSON)
// ============================================================================

function whatsapp_normalize_phone(string $phone, string $cc = '91'): string
{
    $d = preg_replace('/\D+/', '', $phone) ?? '';
    if ($d === '') {
        return '';
    }
    if (strlen($d) === 11 && $d[0] === '0') {
        $d = substr($d, 1);
    }
    if (strlen($d) === 10) {
        $d = $cc . $d;
    }
    return $d;
}

function whatsapp_render_template(string $tpl, array $vars): string
{
    $repl = [];
    foreach ($vars as $k => $v) {
        $repl['{' . $k . '}'] = (string)$v;
    }
    return strtr($tpl, $repl);
}

function whatsapp_default_templates(): array
{
    return [
        'tpl_expiring' => "Hello {name}, greetings from {gym}! Your {plan} membership (ID {member_id}) expires on {expiry} ({days} day(s) left). Renew now to keep training without a break.",
        'tpl_expired'  => "Hello {name}, your membership at {gym} expired on {expiry}. Please renew at the front desk or from your Member Portal to continue.",
    ];
}

/** @return array{ok:bool,code:int,response:string} */
function whatsapp_send(array $cfg, string $phone, string $message): array
{
    $url   = trim((string)($cfg['api_url'] ?? ''));
    $key   = decrypt_secret((string)($cfg['api_key_enc'] ?? ''));
    $style = (string)($cfg['request_style'] ?? 'post_json');
    $to    = whatsapp_normalize_phone($phone, (string)($cfg['country_code'] ?? '91'));
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        return ['ok' => false, 'code' => 0, 'response' => 'API URL is missing or invalid (must start with http:// or https://).'];
    }
    if ($to === '') {
        return ['ok' => false, 'code' => 0, 'response' => 'Invalid phone number.'];
    }
    $kp = (string)($cfg['key_param'] ?: 'apikey');
    $pp = (string)($cfg['phone_param'] ?: 'phone');
    $mp = (string)($cfg['message_param'] ?: 'message');

    $headers = [];
    $method  = 'POST';
    $body    = null;
    if ($style === 'get_url') {
        $method = 'GET';
        $url = strtr($url, ['{phone}' => rawurlencode($to), '{message}' => rawurlencode($message), '{key}' => rawurlencode($key)]);
    } elseif ($style === 'post_form') {
        $body = http_build_query([$kp => $key, $pp => $to, $mp => $message]);
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    } elseif ($style === 'post_json_bearer') {
        $body = json_encode([$pp => $to, $mp => $message], JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'Authorization: Bearer ' . $key;
    } else {
        $body = json_encode([$kp => $key, $pp => $to, $mp => $message], JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_USERAGENT      => 'HemnityGym/2.1',
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);

    if ($resp === false) {
        return ['ok' => false, 'code' => 0, 'response' => 'Connection error: ' . $err];
    }
    $resp = (string)$resp;
    $ok = $code >= 200 && $code < 300;
    $j = json_decode($resp, true);
    if ($ok && is_array($j)) {
        if (($j['success'] ?? $j['ok'] ?? null) === false || in_array(strtolower((string)($j['status'] ?? '')), ['error', 'failed', 'fail', 'false'], true) || isset($j['error']) && $j['error']) {
            $ok = false;
        }
    }
    return ['ok' => $ok, 'code' => $code, 'response' => mb_substr($resp, 0, 1000)];
}

function whatsapp_get_settings(PDO $pdo, int $gymId): array
{
    $stmt = $pdo->prepare('SELECT * FROM whatsapp_settings WHERE gym_id = :g LIMIT 1');
    $stmt->execute([':g' => $gymId]);
    $row = $stmt->fetch();
    $defaults = whatsapp_default_templates();
    if (!$row) {
        return array_merge([
            'gym_id' => $gymId, 'is_enabled' => 0, 'api_url' => '', 'api_key_enc' => '', 'request_style' => 'post_json',
            'key_param' => 'apikey', 'phone_param' => 'phone', 'message_param' => 'message', 'country_code' => '91',
            'notify_days_before' => '3,1', 'send_on_expiry' => 1, 'repeat_after_expiry_days' => 7, 'last_run_at' => null,
        ], $defaults);
    }
    foreach ($defaults as $k => $v) {
        if (trim((string)($row[$k] ?? '')) === '') {
            $row[$k] = $v;
        }
    }
    return $row;
}

/**
 * Daily expiry-reminder runner. Safe to call repeatedly: one message per member/kind/day.
 * @return array{sent:int,failed:int,skipped:int,gyms:int}
 */
function whatsapp_run_daily(PDO $pdo, ?int $onlyGymId = null): array
{
    $out = ['sent' => 0, 'failed' => 0, 'skipped' => 0, 'gyms' => 0];
    $sql = 'SELECT * FROM whatsapp_settings WHERE is_enabled = 1' . ($onlyGymId ? ' AND gym_id = ' . (int)$onlyGymId : '');
    $today = new DateTimeImmutable('today');
    foreach ($pdo->query($sql)->fetchAll() as $cfg) {
        $gymId = (int)$cfg['gym_id'];
        $cfg = whatsapp_get_settings($pdo, $gymId);
        if (trim((string)$cfg['api_url']) === '') {
            continue;
        }
        $out['gyms']++;
        $gym = get_gym_settings($pdo, $gymId);
        $notify = array_values(array_filter(array_map('intval', preg_split('/[\s,]+/', (string)$cfg['notify_days_before']) ?: []), static fn($n) => $n > 0));
        $repeat = max(0, (int)$cfg['repeat_after_expiry_days']);

        $m = $pdo->prepare(
            "SELECT m.id, m.member_code, m.full_name, m.phone, m.membership_expiry_date, p.plan_name
             FROM members m LEFT JOIN membership_plans p ON p.id = m.plan_id
             WHERE m.gym_id = :g AND m.status != 'Inactive' AND m.phone <> '' AND m.membership_expiry_date IS NOT NULL"
        );
        $m->execute([':g' => $gymId]);
        $dup = $pdo->prepare("SELECT COUNT(*) FROM whatsapp_logs WHERE gym_id = :g AND member_id = :m AND kind = :k AND log_date = CURDATE() AND status = 'sent'");
        $log = $pdo->prepare('INSERT INTO whatsapp_logs (gym_id, member_id, kind, phone, message, status, http_code, response, log_date) VALUES (:g, :m, :k, :ph, :msg, :st, :hc, :rs, CURDATE())');

        foreach ($m->fetchAll() as $row) {
            $exp  = new DateTimeImmutable((string)$row['membership_expiry_date']);
            $days = (int)$today->diff($exp)->format('%r%a');
            $kind = null;
            if ($days > 0 && in_array($days, $notify, true)) {
                $kind = 'expiring';
            } elseif ($days === 0 && !empty($cfg['send_on_expiry'])) {
                $kind = 'expiring';
            } elseif ($days < 0 && -$days <= $repeat) {
                $kind = 'expired';
            }
            if ($kind === null) {
                $out['skipped']++;
                continue;
            }
            $dup->execute([':g' => $gymId, ':m' => (int)$row['id'], ':k' => $kind]);
            if ((int)$dup->fetchColumn() > 0) {
                $out['skipped']++;
                continue;
            }
            $msg = whatsapp_render_template((string)$cfg[$kind === 'expired' ? 'tpl_expired' : 'tpl_expiring'], [
                'name' => $row['full_name'], 'gym' => $gym['gym_name'] ?? '', 'plan' => $row['plan_name'] ?? 'Gym',
                'expiry' => format_date($row['membership_expiry_date']), 'days' => max(0, $days), 'member_id' => $row['member_code'],
                'days_ago' => abs(min(0, $days)),
            ]);
            $res = whatsapp_send($cfg, (string)$row['phone'], $msg);
            $log->execute([':g' => $gymId, ':m' => (int)$row['id'], ':k' => $kind, ':ph' => $row['phone'], ':msg' => $msg, ':st' => $res['ok'] ? 'sent' : 'failed', ':hc' => $res['code'], ':rs' => $res['response']]);
            $res['ok'] ? $out['sent']++ : $out['failed']++;
            usleep(400000);
        }
        $pdo->prepare('UPDATE whatsapp_settings SET last_run_at = NOW() WHERE gym_id = :g')->execute([':g' => $gymId]);
    }
    return $out;
}

function hemnity_cron_token(): string
{
    return substr(hash_hmac('sha256', 'whatsapp-cron', hemnity_encryption_key()), 0, 32);
}
