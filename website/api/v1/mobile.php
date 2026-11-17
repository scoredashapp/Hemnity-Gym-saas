<?php
declare(strict_types=1);

/**
 * Mobile app REST layer (Hemnity Gym Owner + Gym Member Android apps).
 * Included by api/v1/index.php before its legacy routes. Every handler exits via api_json().
 * Tenant isolation: gym_id is ALWAYS derived from the authenticated token, never from the body.
 */

if (!isset($pdo, $method, $route)) {
    http_response_code(403);
    exit;
}

// --------------------------------------------------------------------------- helpers
function mob_base_url(): string
{
    global $dbConfig;
    $b = rtrim((string)($dbConfig['base_url'] ?? ''), '/');
    if ($b === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
        $b = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
    return $b;
}

function mob_asset(?string $rel): ?string
{
    $rel = trim((string)$rel);
    return $rel === '' ? null : mob_base_url() . '/' . ltrim($rel, '/');
}

function mob_method_enum(?string $m): string
{
    return match (strtolower(trim((string)$m))) {
        'upi' => 'UPI', 'card' => 'Card', 'bank', 'bank transfer', 'bank_transfer', 'netbanking' => 'Bank Transfer',
        'cash', '' => 'Cash', default => 'Other',
    };
}

function mob_num(mixed $v): float
{
    return (float)preg_replace('/[^0-9.\-]/', '', (string)$v);
}

function mob_member_status(array $m): string
{
    $st = (string)($m['status'] ?? 'Active');
    if ($st === 'Active' && !empty($m['membership_expiry_date']) && $m['membership_expiry_date'] < date('Y-m-d')) {
        return 'Expired';
    }
    return $st;
}

function mob_pending(PDO $pdo, int $gymId, int $memberId): float
{
    $s = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END), 0) FROM payments WHERE gym_id = :g AND member_id = :m AND payment_status IN ('Pending','Partial') AND (payment_status = 'Pending' OR balance_due > 0)");
    $s->execute([':g' => $gymId, ':m' => $memberId]);
    return (float)$s->fetchColumn();
}

function mob_member_json(PDO $pdo, int $gymId, array $m, bool $withFees = true): array
{
    $qr = $pdo->prepare("SELECT credential_token FROM qr_credentials WHERE gym_id = :g AND member_id = :m AND status = 'Active' ORDER BY id DESC LIMIT 1");
    $qr->execute([':g' => $gymId, ':m' => (int)$m['id']]);
    $token = $qr->fetchColumn() ?: null;
    $st    = mob_member_status($m);
    $days  = !empty($m['membership_expiry_date']) ? (int)((strtotime((string)$m['membership_expiry_date']) - strtotime(date('Y-m-d'))) / 86400) : null;
    $out = [
        'id' => (int)$m['id'], 'member_code' => $m['member_code'], 'full_name' => $m['full_name'], 'name' => $m['full_name'],
        'phone' => $m['phone'], 'email' => $m['email'], 'photo_url' => mob_asset($m['photo_path'] ?? null),
        'plan_id' => $m['plan_id'] !== null ? (int)$m['plan_id'] : null, 'plan_name' => $m['plan_name'] ?? null,
        'status' => $st, 'membership_status' => $st, 'joining_date' => $m['joining_date'] ?? null,
        'start_date' => $m['membership_start_date'] ?? null, 'membership_start_date' => $m['membership_start_date'] ?? null,
        'expiry_date' => $m['membership_expiry_date'] ?? null, 'membership_expiry_date' => $m['membership_expiry_date'] ?? null,
        'days_remaining' => $days, 'qr_token' => $token, 'qr_credential' => $token,
        'qr_payload' => $token ? 'HEMNITY:QR:' . $gymId . ':' . $m['member_code'] . ':' . $token : null,
    ];
    if ($withFees) {
        $paid = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE gym_id = :g AND member_id = :m AND payment_status IN ('Paid','Partial')");
        $paid->execute([':g' => $gymId, ':m' => (int)$m['id']]);
        $last = $pdo->prepare('SELECT plan_total_amount, amount, balance_due, payment_status FROM payments WHERE gym_id = :g AND member_id = :m ORDER BY id DESC LIMIT 1');
        $last->execute([':g' => $gymId, ':m' => (int)$m['id']]);
        $lp = $last->fetch() ?: null;
        $pending = mob_pending($pdo, $gymId, (int)$m['id']);
        $out += [
            'pending_amount' => $pending, 'amount_paid' => (float)$paid->fetchColumn(),
            'assigned_fee' => $lp ? (float)$lp['plan_total_amount'] : (float)($m['plan_price'] ?? 0),
            'final_fee' => $lp ? (float)$lp['plan_total_amount'] : (float)($m['plan_price'] ?? 0),
            'plan_current_price' => isset($m['plan_price']) ? (float)$m['plan_price'] : null,
            'payment_status' => $lp ? $lp['payment_status'] : 'Unpaid', 'fee_source' => 'plan_default',
        ];
    }
    return $out;
}

function mob_member_select(): string
{
    return 'SELECT m.*, p.plan_name, p.price AS plan_price FROM members m LEFT JOIN membership_plans p ON p.id = m.plan_id';
}

function mob_find_member(PDO $pdo, int $gymId, string $idOrCode): ?array
{
    $s = $pdo->prepare(mob_member_select() . ' WHERE m.gym_id = :g AND (m.id = :id OR UPPER(m.member_code) = :code) LIMIT 1');
    $s->execute([':g' => $gymId, ':id' => ctype_digit($idOrCode) ? (int)$idOrCode : 0, ':code' => strtoupper($idOrCode)]);
    return $s->fetch() ?: null;
}

function mob_payment_json(array $p): array
{
    return [
        'id' => (int)$p['id'], 'receipt_number' => $p['receipt_number'], 'invoice_no' => $p['receipt_number'],
        'member_name' => $p['full_name'] ?? null, 'member_code' => $p['member_code'] ?? null, 'plan_name' => $p['plan_name'] ?? null,
        'amount' => (float)$p['amount'], 'balance_due' => (float)($p['balance_due'] ?? 0),
        'status' => $p['payment_status'], 'payment_status' => $p['payment_status'],
        'method' => $p['payment_method'], 'payment_method' => $p['payment_method'],
        'paid_at' => $p['payment_date'], 'payment_date' => $p['payment_date'], 'created_at' => $p['created_at'] ?? $p['payment_date'],
        'transaction_ref' => $p['transaction_ref'] ?? null,
    ];
}

function mob_issue_tokens(PDO $pdo, array $user, ?int $gymId, string $label): array
{
    $access  = 'hem_live_' . bin2hex(random_bytes(24));
    $refresh = 'hem_ref_' . bin2hex(random_bytes(24));
    $pdo->prepare('INSERT INTO api_tokens (user_id, gym_id, token_hash, refresh_hash, label, expires_at) VALUES (:u, :g, :t, :r, :l, DATE_ADD(NOW(), INTERVAL 90 DAY))')
        ->execute([':u' => (int)$user['id'], ':g' => $gymId, ':t' => hash('sha256', $access), ':r' => hash('sha256', $refresh), ':l' => mb_substr($label, 0, 120)]);
    return ['token' => $access, 'access_token' => $access, 'refresh_token' => $refresh, 'expires_in' => 90 * 86400];
}

function mob_user_json(PDO $pdo, array $user, ?int $gymId): array
{
    $j = [
        'id' => (int)$user['id'], 'role' => $user['role'], 'user_type' => $user['role'], 'full_name' => $user['full_name'], 'name' => $user['full_name'],
        'email' => $user['email'], 'phone' => $user['phone'] ?? null, 'gym_id' => $gymId, 'default_gym_id' => $gymId,
    ];
    if ($gymId) {
        $g = $pdo->prepare('SELECT name FROM gyms WHERE id = :g');
        $g->execute([':g' => $gymId]);
        $j['gym_name'] = $g->fetchColumn() ?: null;
    }
    if ($user['role'] === 'gym_member' && $gymId) {
        $m = $pdo->prepare('SELECT id, member_code, photo_path FROM members WHERE user_id = :u AND gym_id = :g LIMIT 1');
        $m->execute([':u' => (int)$user['id'], ':g' => $gymId]);
        if ($row = $m->fetch()) {
            $j['member_id'] = (int)$row['id'];
            $j['member_code'] = $row['member_code'];
            $j['photo_url'] = mob_asset($row['photo_path']);
        }
    }
    return $j;
}

function mob_default_gym(PDO $pdo, array $user): ?int
{
    if ($user['role'] === 'gym_owner') {
        $s = $pdo->prepare('SELECT gym_id FROM gym_owners WHERE user_id = :u ORDER BY is_primary DESC, id ASC LIMIT 1');
    } elseif ($user['role'] === 'gym_member') {
        $s = $pdo->prepare('SELECT gym_id FROM members WHERE user_id = :u ORDER BY id ASC LIMIT 1');
    } else {
        return null;
    }
    $s->execute([':u' => (int)$user['id']]);
    $g = (int)($s->fetchColumn() ?: 0);
    return $g ?: null;
}

/** Member context: all gyms this member user belongs to + the selected one. */
function mob_require_member(PDO $pdo): array
{
    $user = api_auth_user($pdo);
    if (!$user) {
        api_json(401, ['error' => 'Authentication required.']);
    }
    if ($user['role'] !== 'gym_member') {
        api_json(403, ['error' => 'This endpoint is for Gym Member accounts only.']);
    }
    $s = $pdo->prepare(
        'SELECT m.*, p.plan_name, p.price AS plan_price, p.duration_days, g.name AS gym_name, g.status AS gym_status,
                gs.logo_path AS gym_logo_path, COALESCE(gs.currency_symbol, \'₹\') AS currency_symbol
         FROM members m
         INNER JOIN gyms g ON g.id = m.gym_id
         LEFT JOIN gym_settings gs ON gs.gym_id = m.gym_id
         LEFT JOIN membership_plans p ON p.id = m.plan_id
         WHERE m.user_id = :u ORDER BY m.id ASC'
    );
    $s->execute([':u' => (int)$user['id']]);
    $rows = $s->fetchAll();
    if (!$rows) {
        api_json(403, ['error' => 'No gym membership is linked to this account.']);
    }
    $want = (int)($_GET['gym_id'] ?? 0) ?: (int)($user['token_gym_id'] ?? 0);
    $sel  = $rows[0];
    foreach ($rows as $r) {
        if ((int)$r['gym_id'] === $want) {
            $sel = $r;
            break;
        }
    }
    return ['user' => $user, 'rows' => $rows, 'm' => $sel, 'gym_id' => (int)$sel['gym_id']];
}

function mob_notifications_unread(PDO $pdo, int $userId, int $gymId): int
{
    $s = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE is_read = 0 AND (user_id = :u OR (user_id IS NULL AND gym_id = :g))');
    $s->execute([':u' => $userId, ':g' => $gymId]);
    return (int)$s->fetchColumn();
}

/** Minimal single-page PDF (Helvetica) so receipts download without extra libraries. */
function mob_simple_pdf(array $lines, string $title): string
{
    $esc = static fn(string $t): string => str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], preg_replace('/[^\x20-\x7E]/', '?', $t) ?? '');
    $content = "BT /F1 18 Tf 50 790 Td (" . $esc($title) . ") Tj ET\n";
    $y = 755;
    foreach ($lines as $ln) {
        $content .= "BT /F1 12 Tf 50 {$y} Td (" . $esc($ln) . ") Tj ET\n";
        $y -= 22;
    }
    $objs = [];
    $objs[] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objs[] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    $objs[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
    $objs[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objs[] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream";
    $pdf = "%PDF-1.4\n";
    $offs = [];
    foreach ($objs as $i => $o) {
        $offs[$i] = strlen($pdf);
        $pdf .= ($i + 1) . " 0 obj\n" . $o . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
    foreach ($offs as $o) {
        $pdf .= sprintf("%010d 00000 n \n", $o);
    }
    $pdf .= "trailer\n<< /Size " . (count($objs) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}

// --------------------------------------------------------------------------- AUTH
if ($method === 'POST' && $route === 'auth/login') {
    $body  = api_body_json();
    $ident = strtolower(clean_str((string)($body['identifier'] ?? $body['email'] ?? $body['phone'] ?? ''), 190));
    $pass  = (string)($body['password'] ?? '');
    if ($ident === '' || $pass === '') {
        api_json(400, ['error' => 'Email/phone and password are required.']);
    }
    // basic brute-force throttle per identifier + IP (5 failures / 10 min)
    $ipKey = hash('sha256', $ident . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
    $_SESSION['api_fail'][$ipKey] = array_values(array_filter($_SESSION['api_fail'][$ipKey] ?? [], static fn($t) => $t > time() - 600));
    if (count($_SESSION['api_fail'][$ipKey]) >= 8) {
        api_json(429, ['error' => 'Too many failed attempts. Please wait 10 minutes and try again.']);
    }

    $digits = preg_replace('/\D+/', '', $ident) ?? '';
    $stmt = $pdo->prepare('SELECT id, role, full_name, email, phone, password_hash, is_active FROM users WHERE LOWER(email) = :e OR (:d <> \'\' AND REPLACE(REPLACE(REPLACE(phone, \' \', \'\'), \'-\', \'\'), \'+\', \'\') LIKE :dl) LIMIT 1');
    $stmt->execute([':e' => $ident, ':d' => $digits, ':dl' => $digits === '' ? '' : '%' . substr($digits, -10)]);
    $user = $stmt->fetch();
    if (!$user || (int)$user['is_active'] !== 1 || !password_verify($pass, (string)$user['password_hash'])) {
        $_SESSION['api_fail'][$ipKey][] = time();
        api_json(401, ['error' => 'Invalid credentials.']);
    }
    if (!in_array($user['role'], ['gym_owner', 'gym_member', 'super_admin'], true)) {
        api_json(403, ['error' => 'Account role not permitted.']);
    }
    $gymId = mob_default_gym($pdo, $user);
    $tok   = mob_issue_tokens($pdo, $user, $gymId, (string)($body['device_name'] ?? $body['device_label'] ?? 'Mobile App'));
    $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([':id' => (int)$user['id']]);
    log_audit_event($pdo, (string)$user['role'], (int)$user['id'], 'api.token_login', 'user', (string)$user['id'], $gymId);
    $uj = mob_user_json($pdo, $user, $gymId);
    api_json(200, $tok + ['role' => $user['role'], 'user' => $uj, 'member' => $user['role'] === 'gym_member' ? $uj : null, 'gym' => ['id' => $gymId, 'name' => $uj['gym_name'] ?? null]]);
}

if ($method === 'GET' && $route === 'auth/me') {
    $user = api_auth_user($pdo);
    if (!$user) {
        api_json(401, ['error' => 'Authentication required.']);
    }
    $gymId = (int)($user['token_gym_id'] ?? 0) ?: mob_default_gym($pdo, $user);
    $uj = mob_user_json($pdo, $user, $gymId);
    $unread = $user['role'] === 'gym_member' && $gymId ? mob_notifications_unread($pdo, (int)$user['id'], $gymId) : 0;
    api_json(200, ['authenticated' => true, 'role' => $user['role'], 'user' => $uj, 'selected_gym_id' => $gymId, 'gym_id' => $gymId, 'gym_name' => $uj['gym_name'] ?? null, 'unread_notifications' => $unread]);
}

if ($method === 'POST' && $route === 'auth/refresh') {
    $body = api_body_json();
    $rt   = trim((string)($body['refresh_token'] ?? ''));
    if ($rt === '') {
        api_json(400, ['error' => 'refresh_token required.']);
    }
    $s = $pdo->prepare('SELECT t.id, t.gym_id, u.id AS uid, u.role, u.full_name, u.email, u.phone, u.is_active FROM api_tokens t INNER JOIN users u ON u.id = t.user_id WHERE t.refresh_hash = :h LIMIT 1');
    $s->execute([':h' => hash('sha256', $rt)]);
    $row = $s->fetch();
    if (!$row || (int)$row['is_active'] !== 1) {
        api_json(401, ['error' => 'Refresh token invalid or expired. Please sign in again.']);
    }
    $pdo->prepare('DELETE FROM api_tokens WHERE id = :id')->execute([':id' => (int)$row['id']]);
    $user = ['id' => $row['uid'], 'role' => $row['role'], 'full_name' => $row['full_name'], 'email' => $row['email'], 'phone' => $row['phone']];
    $gymId = $row['gym_id'] !== null ? (int)$row['gym_id'] : mob_default_gym($pdo, $user);
    $uj = mob_user_json($pdo, $user, $gymId);
    api_json(200, mob_issue_tokens($pdo, $user, $gymId, 'Mobile App (refreshed)') + ['role' => $row['role'], 'user' => $uj]);
}

if ($method === 'POST' && $route === 'auth/logout') {
    $hdr = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (str_starts_with($hdr, 'Bearer ')) {
        $pdo->prepare('DELETE FROM api_tokens WHERE token_hash = :h')->execute([':h' => hash('sha256', trim(substr($hdr, 7)))]);
    }
    api_json(200, ['message' => 'Signed out.', 'success' => true]);
}

if ($method === 'POST' && $route === 'auth/forgot-password') {
    $body = api_body_json();
    $ident = clean_str((string)($body['identifier'] ?? $body['email'] ?? ''), 190);
    if ($ident !== '') {
        $pdo->prepare("INSERT INTO support_tickets (gym_id, user_id, sender_name, sender_email, subject, message, status) VALUES (1, NULL, 'Mobile App User', :em, 'Password reset request (mobile app)', :msg, 'Open')")
            ->execute([':em' => filter_var($ident, FILTER_VALIDATE_EMAIL) ? $ident : 'noreply@invalid.local', ':msg' => 'Password reset requested for: ' . $ident]);
    }
    api_json(200, ['message' => 'If this account exists, the gym desk / support team has been notified and will help you reset your password.', 'success' => true]);
}

// --------------------------------------------------------------------------- OWNER
if (str_starts_with($route, 'owner/')) {
    $isWrite = $method !== 'GET';
    $ctx   = api_require_owner($pdo, $isWrite);
    $gymId = (int)$ctx['gym_id'];
    $uid   = (int)$ctx['user']['id'];
    $today = date('Y-m-d');
    $body  = $isWrite ? api_body_json() : [];
    $gs    = get_gym_settings($pdo, $gymId);

    // ---- dashboard
    if ($method === 'GET' && $route === 'owner/dashboard') {
        $one = static function (string $sql, array $p) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
        $in7 = date('Y-m-d', strtotime('+7 days'));
        $kpis = [
            'total_members'   => (int)$one('SELECT COUNT(*) FROM members WHERE gym_id = :g', [':g' => $gymId]),
            'active_members'  => (int)$one("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Active' AND (membership_expiry_date IS NULL OR membership_expiry_date >= CURDATE())", [':g' => $gymId]),
            'expired_members' => (int)$one("SELECT COUNT(*) FROM members WHERE gym_id = :g AND (status = 'Expired' OR (status = 'Active' AND membership_expiry_date < CURDATE()))", [':g' => $gymId]),
            'expiring_soon'   => (int)$one("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Active' AND membership_expiry_date BETWEEN CURDATE() AND :d", [':g' => $gymId, ':d' => $in7]),
            'today_attendance' => (int)$one('SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND attendance_date = CURDATE()', [':g' => $gymId]),
            'monthly_revenue' => (float)$one("SELECT COALESCE(SUM(amount),0) FROM payments WHERE gym_id = :g AND payment_status IN ('Paid','Partial') AND DATE_FORMAT(payment_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')", [':g' => $gymId]),
            'pending_fees'    => (float)$one("SELECT COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE balance_due END),0) FROM payments WHERE gym_id = :g AND payment_status IN ('Pending','Partial') AND (payment_status = 'Pending' OR balance_due > 0)", [':g' => $gymId]),
        ];
        $al = $pdo->prepare("SELECT id, member_code, full_name, phone, membership_expiry_date, status FROM members WHERE gym_id = :g AND status != 'Inactive' AND membership_expiry_date IS NOT NULL AND membership_expiry_date <= :d ORDER BY membership_expiry_date ASC LIMIT 15");
        $al->execute([':g' => $gymId, ':d' => $in7]);
        $alerts = array_map(static fn($r) => [
            'id' => (int)$r['id'], 'member_id' => (int)$r['id'], 'name' => $r['full_name'], 'full_name' => $r['full_name'], 'phone' => $r['phone'],
            'membership_expiry_date' => $r['membership_expiry_date'], 'expiry_date' => $r['membership_expiry_date'],
            'days_remaining' => (int)((strtotime((string)$r['membership_expiry_date']) - strtotime($today)) / 86400),
            'status' => $r['membership_expiry_date'] < date('Y-m-d') ? 'Expired' : 'Expiring Soon',
        ], $al->fetchAll());
        $rp = $pdo->prepare('SELECT py.*, m.full_name, m.member_code, p.plan_name FROM payments py INNER JOIN members m ON m.id = py.member_id LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE py.gym_id = :g ORDER BY py.payment_date DESC, py.id DESC LIMIT 8');
        $rp->execute([':g' => $gymId]);
        $sub = $ctx['subscription'] ?: [];
        if ($sub) {
            $sub['enabled_features'] = json_decode((string)($sub['enabled_features_json'] ?? '[]'), true) ?: [];
            unset($sub['enabled_features_json']);
        }
        $logo = mob_asset($gs['logo_path'] ?? null);
        api_json(200, [
            'gym' => ['id' => $gymId, 'name' => $ctx['gym_name'], 'logo_url' => $logo], 'gym_id' => $gymId, 'gym_name' => $ctx['gym_name'], 'gym_logo' => $logo,
            'kpis' => $kpis, 'subscription' => $sub, 'expiry_alerts' => $alerts, 'recent_payments' => array_map('mob_payment_json', $rp->fetchAll()),
        ]);
    }

    // ---- members list / create
    if ($route === 'owner/members' && $method === 'GET') {
        $q = clean_str((string)($_GET['search'] ?? ''), 100);
        $sql = mob_member_select() . ' WHERE m.gym_id = :g';
        $p = [':g' => $gymId];
        if ($q !== '') {
            $sql .= ' AND (m.full_name LIKE :q1 OR m.member_code LIKE :q2 OR m.phone LIKE :q3)';
            $p[':q1'] = $p[':q2'] = $p[':q3'] = '%' . $q . '%';
        }
        $s = $pdo->prepare($sql . ' ORDER BY m.id DESC LIMIT 500');
        $s->execute($p);
        api_json(200, ['gym_id' => $gymId, 'members' => array_map(static fn($m) => mob_member_json($pdo, $gymId, $m), $s->fetchAll())]);
    }

    if ($route === 'owner/members' && $method === 'POST') {
        if (empty($ctx['subscription']['can_add_more_members'])) {
            api_json(402, ['error' => 'Member limit reached for your SaaS plan. Upgrade to add more members.']);
        }
        $name  = clean_str((string)($body['full_name'] ?? $body['name'] ?? ''), 150);
        $phone = clean_str((string)($body['phone'] ?? ''), 30);
        $email = clean_str((string)($body['email'] ?? ''), 190);
        if ($name === '' || $phone === '') {
            api_json(422, ['error' => 'Full name and phone are required.']);
        }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            api_json(422, ['error' => 'Invalid email address.']);
        }
        $dup = $pdo->prepare('SELECT id FROM members WHERE gym_id = :g AND phone = :p AND full_name = :n AND created_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE) LIMIT 1');
        $dup->execute([':g' => $gymId, ':p' => $phone, ':n' => $name]);
        if ($dupId = $dup->fetchColumn()) {
            $m = mob_find_member($pdo, $gymId, (string)$dupId);
            api_json(200, ['message' => 'Member already created.', 'member' => mob_member_json($pdo, $gymId, $m)]);
        }
        $plan = null;
        $planId = (int)($body['plan_id'] ?? 0);
        if ($planId > 0) {
            $ps = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :g AND is_active = 1 LIMIT 1');
            $ps->execute([':id' => $planId, ':g' => $gymId]);
            $plan = $ps->fetch() ?: null;
            if (!$plan) {
                api_json(422, ['error' => 'Selected plan is not active or does not belong to your gym.']);
            }
        }
        $start  = is_valid_date((string)($body['start_date'] ?? '')) ? (string)$body['start_date'] : $today;
        $expiry = $plan ? (is_valid_date((string)($body['expiry_date'] ?? '')) ? (string)$body['expiry_date'] : date('Y-m-d', strtotime($start . ' +' . (int)$plan['duration_days'] . ' days'))) : null;
        $fee    = $plan ? max(0.0, isset($body['final_fee']) && $body['final_fee'] !== '' ? mob_num($body['final_fee']) : (float)$plan['price'] - mob_num($body['discount_amount'] ?? 0)) : 0.0;
        $paid   = min($fee, max(0.0, mob_num($body['amount_paid'] ?? 0)));
        $pdo->beginTransaction();
        try {
            $code = generate_member_code($pdo, $gymId);
            $status = ($expiry !== null && $expiry < $today) ? 'Expired' : 'Active';
            $pdo->prepare('INSERT INTO members (gym_id, member_code, full_name, phone, email, joining_date, plan_id, membership_start_date, membership_expiry_date, status) VALUES (:g, :c, :n, :p, :e, :j, :pid, :s, :x, :st)')
                ->execute([':g' => $gymId, ':c' => $code, ':n' => $name, ':p' => $phone, ':e' => $email ?: null, ':j' => $today, ':pid' => $plan ? (int)$plan['id'] : null, ':s' => $plan ? $start : null, ':x' => $expiry, ':st' => $status]);
            $memberId = (int)$pdo->lastInsertId();
            $mhId = null;
            if ($plan) {
                $pdo->prepare("INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot, start_date, expiry_date, action_type, status, notes, created_by) VALUES (:g, :m, :p, :pn, :pp, :s, :x, 'Initial', 'Active', 'Created from mobile app', :u)")
                    ->execute([':g' => $gymId, ':m' => $memberId, ':p' => (int)$plan['id'], ':pn' => $plan['plan_name'], ':pp' => $fee, ':s' => $start, ':x' => $expiry, ':u' => $uid]);
                $mhId = (int)$pdo->lastInsertId();
                if ($paid > 0 || $fee > 0) {
                    $pstat = $paid >= $fee ? 'Paid' : ($paid > 0 ? 'Partial' : 'Pending');
                    $pdo->prepare('INSERT INTO payments (gym_id, receipt_number, member_id, membership_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, payment_status, payment_source, notes, received_by) VALUES (:g, :r, :m, :mh, :p, :a, :t, :b, :d, :meth, :st, \'mobile_app\', :n, :u)')
                        ->execute([':g' => $gymId, ':r' => generate_receipt_number($pdo, $gymId), ':m' => $memberId, ':mh' => $mhId, ':p' => (int)$plan['id'], ':a' => $pstat === 'Pending' ? $fee : $paid, ':t' => $fee, ':b' => max(0, $fee - $paid), ':d' => $today, ':meth' => mob_method_enum($body['payment_method'] ?? ''), ':st' => $pstat, ':n' => clean_str((string)($body['adjustment_reason'] ?? ''), 400) ?: null, ':u' => $uid]);
                }
            }
            issue_member_qr_credential($pdo, $gymId, $memberId, $uid);
            $pdo->commit();
        } catch (Throwable $ex) {
            $pdo->rollBack();
            error_log('[mobile create member] ' . $ex->getMessage());
            api_json(500, ['error' => 'Could not create member. Please try again.']);
        }
        log_audit_event($pdo, 'gym_owner', $uid, 'api.create_member', 'member', (string)$memberId, $gymId);
        api_json(201, ['message' => 'Member created.', 'member' => mob_member_json($pdo, $gymId, mob_find_member($pdo, $gymId, (string)$memberId))]);
    }

    // ---- member by id actions
    if (preg_match('#^owner/members/(\d+)(?:/(status|renew|reissue-qr|payments|attendance))?$#', $route, $mm)) {
        $memberRow = mob_find_member($pdo, $gymId, (string)(int)$mm[1]);
        if (!$memberRow || (int)$memberRow['id'] !== (int)$mm[1]) {
            api_json(404, ['error' => 'Member not found in your gym.']);
        }
        $mid = (int)$memberRow['id'];
        $sub = $mm[2] ?? '';

        if ($sub === '' && $method === 'GET') {
            api_json(200, ['member' => mob_member_json($pdo, $gymId, $memberRow)]);
        }
        if ($sub === '' && $method === 'PUT') {
            $name = clean_str((string)($body['full_name'] ?? $body['name'] ?? $memberRow['full_name']), 150);
            $phone = clean_str((string)($body['phone'] ?? $memberRow['phone']), 30);
            $email = clean_str((string)($body['email'] ?? ''), 190);
            if ($name === '' || $phone === '') {
                api_json(422, ['error' => 'Name and phone are required.']);
            }
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                api_json(422, ['error' => 'Invalid email address.']);
            }
            $pdo->prepare('UPDATE members SET full_name = :n, phone = :p, email = :e WHERE id = :id AND gym_id = :g')->execute([':n' => $name, ':p' => $phone, ':e' => $email ?: null, ':id' => $mid, ':g' => $gymId]);
            api_json(200, ['message' => 'Member updated.', 'member' => mob_member_json($pdo, $gymId, mob_find_member($pdo, $gymId, (string)$mid))]);
        }
        if ($sub === 'status' && $method === 'POST') {
            $want = strtolower((string)($body['status'] ?? ''));
            if (in_array($want, ['active', 'resume', 'activate'], true)) {
                $new = ($memberRow['membership_expiry_date'] && $memberRow['membership_expiry_date'] < $today) ? 'Expired' : 'Active';
            } elseif (in_array($want, ['suspended', 'inactive', 'suspend', 'deactivate'], true)) {
                $new = 'Inactive';
            } else {
                api_json(422, ['error' => 'status must be active or suspended.']);
            }
            $pdo->prepare('UPDATE members SET status = :s WHERE id = :id AND gym_id = :g')->execute([':s' => $new, ':id' => $mid, ':g' => $gymId]);
            api_json(200, ['message' => 'Member status set to ' . $new . '.', 'status' => $new]);
        }
        if ($sub === 'reissue-qr' && $method === 'POST') {
            $t = issue_member_qr_credential($pdo, $gymId, $mid, $uid);
            log_audit_event($pdo, 'gym_owner', $uid, 'qr.reissued', 'member', (string)$mid, $gymId);
            api_json(200, ['message' => 'New QR pass issued. The old pass is revoked.', 'qr_token' => $t, 'qr_payload' => 'HEMNITY:QR:' . $gymId . ':' . $memberRow['member_code'] . ':' . $t]);
        }
        if ($sub === 'payments' && $method === 'GET') {
            $s = $pdo->prepare('SELECT py.*, m.full_name, m.member_code, p.plan_name FROM payments py INNER JOIN members m ON m.id = py.member_id LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE py.gym_id = :g AND py.member_id = :m ORDER BY py.payment_date DESC, py.id DESC LIMIT 100');
            $s->execute([':g' => $gymId, ':m' => $mid]);
            api_json(200, ['payments' => array_map('mob_payment_json', $s->fetchAll())]);
        }
        if ($sub === 'attendance' && $method === 'GET') {
            $s = $pdo->prepare('SELECT a.*, m.full_name, m.member_code FROM attendance a INNER JOIN members m ON m.id = a.member_id WHERE a.gym_id = :g AND a.member_id = :m ORDER BY a.attendance_date DESC, a.check_in_time DESC LIMIT 100');
            $s->execute([':g' => $gymId, ':m' => $mid]);
            api_json(200, ['records' => array_map(static fn($a) => [
                'id' => (int)$a['id'], 'member_name' => $a['full_name'], 'member_code' => $a['member_code'],
                'checked_in_at' => $a['attendance_date'] . ' ' . substr((string)$a['check_in_time'], 0, 5), 'method' => $a['check_in_method'], 'status' => 'Checked In',
            ], $s->fetchAll())]);
        }
        if ($sub === 'renew' && $method === 'POST') {
            $planId = (int)($body['plan_id'] ?? 0);
            $ps = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :g AND is_active = 1 LIMIT 1');
            $ps->execute([':id' => $planId, ':g' => $gymId]);
            $plan = $ps->fetch();
            if (!$plan) {
                api_json(422, ['error' => 'Choose an active plan from your gym.']);
            }
            $start  = is_valid_date((string)($body['start_date'] ?? '')) ? (string)$body['start_date'] : $today;
            $expiry = is_valid_date((string)($body['expiry_date'] ?? '')) ? (string)$body['expiry_date'] : date('Y-m-d', strtotime($start . ' +' . (int)$plan['duration_days'] . ' days'));
            if ($expiry < $start) {
                api_json(422, ['error' => 'Expiry date cannot be before the start date.']);
            }
            $fee  = isset($body['final_fee']) && $body['final_fee'] !== '' ? max(0.0, mob_num($body['final_fee'])) : max(0.0, (float)$plan['price'] - mob_num($body['discount_amount'] ?? 0));
            $paid = min($fee, max(0.0, mob_num($body['amount_paid'] ?? 0)));
            $action = ((int)$memberRow['plan_id'] === $planId) ? 'Renewal' : 'Plan Change';
            $pdo->beginTransaction();
            try {
                $pdo->prepare("UPDATE memberships SET status = 'Superseded' WHERE member_id = :m AND gym_id = :g AND status = 'Active'")->execute([':m' => $mid, ':g' => $gymId]);
                $pdo->prepare('INSERT INTO memberships (gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot, start_date, expiry_date, action_type, status, notes, created_by) VALUES (:g, :m, :p, :pn, :pp, :s, :x, :a, \'Active\', \'Assigned from mobile app\', :u)')
                    ->execute([':g' => $gymId, ':m' => $mid, ':p' => $planId, ':pn' => $plan['plan_name'], ':pp' => $fee, ':s' => $start, ':x' => $expiry, ':a' => $action, ':u' => $uid]);
                $mhId = (int)$pdo->lastInsertId();
                $pdo->prepare("UPDATE members SET plan_id = :p, membership_start_date = :s, membership_expiry_date = :x, status = :st WHERE id = :id AND gym_id = :g")
                    ->execute([':p' => $planId, ':s' => $start, ':x' => $expiry, ':st' => $expiry < $today ? 'Expired' : 'Active', ':id' => $mid, ':g' => $gymId]);
                if ($fee > 0 || $paid > 0) {
                    $pstat = $paid >= $fee ? 'Paid' : ($paid > 0 ? 'Partial' : 'Pending');
                    $pdo->prepare('INSERT INTO payments (gym_id, receipt_number, member_id, membership_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, payment_status, payment_source, notes, received_by) VALUES (:g, :r, :m, :mh, :p, :a, :t, :b, :d, :meth, :st, \'mobile_app\', :n, :u)')
                        ->execute([':g' => $gymId, ':r' => generate_receipt_number($pdo, $gymId), ':m' => $mid, ':mh' => $mhId, ':p' => $planId, ':a' => $pstat === 'Pending' ? $fee : $paid, ':t' => $fee, ':b' => max(0, $fee - $paid), ':d' => $today, ':meth' => mob_method_enum($body['payment_method'] ?? ''), ':st' => $pstat, ':n' => clean_str((string)($body['adjustment_reason'] ?? ''), 400) ?: null, ':u' => $uid]);
                }
                $pdo->commit();
            } catch (Throwable $ex) {
                $pdo->rollBack();
                error_log('[mobile renew] ' . $ex->getMessage());
                api_json(500, ['error' => 'Could not assign plan. Please try again.']);
            }
            api_json(200, ['message' => 'Membership plan assigned until ' . format_date($expiry) . '.', 'member' => mob_member_json($pdo, $gymId, mob_find_member($pdo, $gymId, (string)$mid))]);
        }
        api_json(405, ['error' => 'Method not allowed for this member endpoint.']);
    }

    // ---- attendance
    if ($route === 'owner/attendance' && $method === 'GET') {
        $d = is_valid_date((string)($_GET['date'] ?? '')) ? (string)$_GET['date'] : $today;
        $s = $pdo->prepare('SELECT a.*, m.full_name, m.member_code FROM attendance a INNER JOIN members m ON m.id = a.member_id WHERE a.gym_id = :g AND a.attendance_date = :d ORDER BY a.check_in_time DESC LIMIT 300');
        $s->execute([':g' => $gymId, ':d' => $d]);
        api_json(200, ['date' => $d, 'records' => array_map(static fn($a) => [
            'id' => (int)$a['id'], 'member_name' => $a['full_name'], 'member_code' => $a['member_code'],
            'checked_in_at' => substr((string)$a['check_in_time'], 0, 5), 'method' => $a['check_in_method'], 'status' => 'Checked In',
        ], $s->fetchAll())]);
    }

    if ($route === 'owner/attendance/qr-checkin' && $method === 'POST') {
        $raw = clean_str((string)($body['credential_token'] ?? $body['qr_token'] ?? ''), 200);
        $code = strtoupper(clean_str((string)($body['member_code'] ?? ''), 40));
        if (str_starts_with($raw, 'HEMNITY:QR:')) {
            $parts = explode(':', $raw);
            $raw = (string)end($parts);
        }
        $member = null; $qrId = null; $how = 'QR Scan';
        if ($raw !== '') {
            $q = $pdo->prepare('SELECT * FROM qr_credentials WHERE credential_token = :t LIMIT 1');
            $q->execute([':t' => $raw]);
            $cred = $q->fetch();
            if (!$cred) {
                api_json(404, ['error' => 'Invalid QR code — not recognised.']);
            }
            if ((int)$cred['gym_id'] !== $gymId) {
                api_json(403, ['error' => 'Invalid QR: this pass belongs to a different gym.']);
            }
            if ($cred['status'] !== 'Active') {
                api_json(403, ['error' => 'This QR pass was revoked. Issue a new pass for the member.']);
            }
            $qrId = (int)$cred['id'];
            $member = mob_find_member($pdo, $gymId, (string)(int)$cred['member_id']);
        } elseif ($code !== '') {
            $how = 'ID Scan';
            $member = mob_find_member($pdo, $gymId, $code);
        } else {
            api_json(400, ['error' => 'Provide credential_token or member_code.']);
        }
        if (!$member) {
            api_json(404, ['error' => 'Member not found in this gym.']);
        }
        $mj = mob_member_json($pdo, $gymId, $member, false);
        if ($member['status'] === 'Inactive') {
            api_json(403, ['error' => 'Member account is inactive / suspended.', 'data' => ['status' => 'expired', 'member' => $mj]]);
        }
        if (mob_member_status($member) === 'Expired') {
            api_json(403, ['error' => 'Membership expired on ' . format_date($member['membership_expiry_date']) . '. Renewal required.', 'data' => ['status' => 'expired', 'member' => $mj]]);
        }
        $dup = $pdo->prepare('SELECT check_in_time FROM attendance WHERE gym_id = :g AND member_id = :m AND attendance_date = :d LIMIT 1');
        $dup->execute([':g' => $gymId, ':m' => (int)$member['id'], ':d' => $today]);
        if ($t = $dup->fetchColumn()) {
            api_json(409, ['error' => 'Already checked in today at ' . substr((string)$t, 0, 5) . '.', 'data' => ['status' => 'duplicate', 'duplicate' => true, 'member' => $mj]]);
        }
        $now = date('H:i:s');
        $pdo->prepare('INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, qr_credential_id, remarks, recorded_by) VALUES (:g, :m, :d, :t, :meth, :q, :r, :u)')
            ->execute([':g' => $gymId, ':m' => (int)$member['id'], ':d' => $today, ':t' => $now, ':meth' => $how, ':q' => $qrId, ':r' => $how . ' via mobile app', ':u' => $uid]);
        api_json(201, ['success' => true, 'message' => 'Check-in recorded for ' . $member['full_name'] . '.', 'data' => ['status' => 'success', 'checked_in_at' => substr($now, 0, 5), 'member' => $mj, 'plan_name' => $member['plan_name']]]);
    }

    // ---- plans
    if ($route === 'owner/plans' && $method === 'GET') {
        $s = $pdo->prepare("SELECT p.*, (SELECT COUNT(*) FROM members m WHERE m.gym_id = p.gym_id AND m.plan_id = p.id AND m.status = 'Active') AS active_members FROM membership_plans p WHERE p.gym_id = :g ORDER BY p.is_active DESC, p.duration_days ASC, p.id ASC");
        $s->execute([':g' => $gymId]);
        api_json(200, ['plans' => array_map(static fn($p) => [
            'id' => (int)$p['id'], 'name' => $p['plan_name'], 'plan_name' => $p['plan_name'], 'price' => (float)$p['price'], 'duration_days' => (int)$p['duration_days'],
            'plan_type' => $p['duration_days'] >= 360 ? 'Yearly' : ($p['duration_days'] >= 85 ? 'Quarterly' : 'Monthly'), 'description' => $p['description'],
            'is_active' => (bool)$p['is_active'], 'active_members' => (int)$p['active_members'],
        ], $s->fetchAll())]);
    }
    if ($route === 'owner/plans' && $method === 'POST') {
        $name = clean_str((string)($body['plan_name'] ?? $body['name'] ?? ''), 100);
        $price = mob_num($body['price'] ?? 0);
        $days = (int)mob_num($body['duration_days'] ?? 0);
        if ($name === '' || $days < 1 || $price < 0) {
            api_json(422, ['error' => 'Plan name, a positive duration and a valid price are required.']);
        }
        $pdo->prepare('INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active) VALUES (:g, :n, :d, :p, :ds, 1)')
            ->execute([':g' => $gymId, ':n' => $name, ':d' => $days, ':p' => $price, ':ds' => clean_str((string)($body['description'] ?? ''), 500) ?: null]);
        api_json(201, ['message' => 'Plan created.', 'plan' => ['id' => (int)$pdo->lastInsertId(), 'name' => $name, 'plan_name' => $name, 'price' => $price, 'duration_days' => $days, 'is_active' => true]]);
    }
    if ($method === 'PUT' && preg_match('#^owner/plans/(\d+)$#', $route, $pm)) {
        $s = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :g LIMIT 1');
        $s->execute([':id' => (int)$pm[1], ':g' => $gymId]);
        $p = $s->fetch();
        if (!$p) {
            api_json(404, ['error' => 'Plan not found in your gym.']);
        }
        $name = isset($body['plan_name']) || isset($body['name']) ? clean_str((string)($body['plan_name'] ?? $body['name']), 100) : $p['plan_name'];
        $price = isset($body['price']) ? mob_num($body['price']) : (float)$p['price'];
        $days = isset($body['duration_days']) ? (int)mob_num($body['duration_days']) : (int)$p['duration_days'];
        $act = array_key_exists('is_active', $body) ? (filter_var($body['is_active'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0) : (int)$p['is_active'];
        $pdo->prepare('UPDATE membership_plans SET plan_name = :n, price = :pr, duration_days = :d, is_active = :a WHERE id = :id AND gym_id = :g')->execute([':n' => $name, ':pr' => $price, ':d' => max(1, $days), ':a' => $act, ':id' => (int)$pm[1], ':g' => $gymId]);
        api_json(200, ['message' => 'Plan updated.']);
    }

    // ---- payments
    if ($route === 'owner/payments' && $method === 'GET') {
        $where = 'py.gym_id = :g'; $p = [':g' => $gymId];
        $st = clean_str((string)($_GET['status'] ?? ''), 20);
        if (in_array(ucfirst(strtolower($st)), ['Paid', 'Partial', 'Pending', 'Refunded'], true)) { $where .= ' AND py.payment_status = :st'; $p[':st'] = ucfirst(strtolower($st)); }
        $q = clean_str((string)($_GET['search'] ?? ''), 80);
        if ($q !== '') { $where .= ' AND (m.full_name LIKE :q1 OR m.member_code LIKE :q2 OR py.receipt_number LIKE :q3)'; $p[':q1'] = $p[':q2'] = $p[':q3'] = '%' . $q . '%'; }
        $s = $pdo->prepare("SELECT py.*, m.full_name, m.member_code, p.plan_name FROM payments py INNER JOIN members m ON m.id = py.member_id LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE {$where} ORDER BY py.payment_date DESC, py.id DESC LIMIT 200");
        $s->execute($p);
        api_json(200, ['payments' => array_map('mob_payment_json', $s->fetchAll())]);
    }
    if ($route === 'owner/payments' && $method === 'POST') {
        $m = mob_find_member($pdo, $gymId, trim((string)($body['member_id'] ?? '')));
        $amt = mob_num($body['amount'] ?? 0);
        if (!$m) { api_json(404, ['error' => 'Member not found in your gym.']); }
        if ($amt <= 0) { api_json(422, ['error' => 'Enter a payment amount greater than zero.']); }
        $planId = (int)($body['plan_id'] ?? 0) ?: ($m['plan_id'] !== null ? (int)$m['plan_id'] : null);
        $rcp = generate_receipt_number($pdo, $gymId);
        $pdo->prepare("INSERT INTO payments (gym_id, receipt_number, member_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, payment_status, payment_source, notes, received_by) VALUES (:g, :r, :m, :p, :a, :a, 0, :d, :meth, 'Paid', 'mobile_app', :n, :u)")
            ->execute([':g' => $gymId, ':r' => $rcp, ':m' => (int)$m['id'], ':p' => $planId, ':a' => $amt, ':d' => $today, ':meth' => mob_method_enum($body['payment_method'] ?? ''), ':n' => clean_str((string)($body['notes'] ?? ''), 400) ?: null, ':u' => $uid]);
        $row = $pdo->prepare('SELECT py.*, m.full_name, m.member_code, p.plan_name FROM payments py INNER JOIN members m ON m.id = py.member_id LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE py.id = :id');
        $row->execute([':id' => (int)$pdo->lastInsertId()]);
        api_json(201, ['message' => 'Payment recorded.', 'payment' => mob_payment_json($row->fetch())]);
    }

    // ---- reports
    if ($route === 'owner/reports' && $method === 'GET') {
        $from = is_valid_date((string)($_GET['from'] ?? '')) ? (string)$_GET['from'] : date('Y-m-01');
        $to   = is_valid_date((string)($_GET['to'] ?? '')) ? (string)$_GET['to'] : date('Y-m-t');
        $one = static function (string $sql, array $p) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
        $series = $pdo->prepare("SELECT DATE_FORMAT(payment_date,'%b %Y') AS label, DATE_FORMAT(payment_date,'%Y-%m') AS ym, COALESCE(SUM(amount),0) AS value FROM payments WHERE gym_id = :g AND payment_status IN ('Paid','Partial') AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY ym, label ORDER BY ym ASC");
        $series->execute([':g' => $gymId]);
        api_json(200, [
            'period' => format_date($from) . ' – ' . format_date($to),
            'total_members' => (int)$one('SELECT COUNT(*) FROM members WHERE gym_id = :g', [':g' => $gymId]),
            'active_members' => (int)$one("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Active' AND (membership_expiry_date IS NULL OR membership_expiry_date >= CURDATE())", [':g' => $gymId]),
            'total_attendance' => (int)$one('SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND attendance_date BETWEEN :f AND :t', [':g' => $gymId, ':f' => $from, ':t' => $to]),
            'expiring_soon' => (int)$one("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Active' AND membership_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)", [':g' => $gymId]),
            'total_collected' => (float)$one("SELECT COALESCE(SUM(amount),0) FROM payments WHERE gym_id = :g AND payment_status IN ('Paid','Partial') AND payment_date BETWEEN :f AND :t", [':g' => $gymId, ':f' => $from, ':t' => $to]),
            'total_pending' => (float)$one("SELECT COALESCE(SUM(CASE WHEN payment_status='Pending' THEN amount ELSE balance_due END),0) FROM payments WHERE gym_id = :g AND payment_status IN ('Pending','Partial') AND (payment_status='Pending' OR balance_due > 0)", [':g' => $gymId]),
            'monthly_revenue' => array_map(static fn($r) => ['label' => $r['label'], 'value' => (float)$r['value']], $series->fetchAll()),
        ]);
    }

    // ---- settings / subscription / notifications
    if ($route === 'owner/settings' && $method === 'GET') {
        $gw = $pdo->prepare('SELECT provider, is_enabled FROM gym_payment_gateways WHERE gym_id = :g');
        $gw->execute([':g' => $gymId]);
        $g = $gw->fetch() ?: ['provider' => 'manual', 'is_enabled' => 0];
        $sub = $ctx['subscription'] ?: [];
        api_json(200, ['settings' => [
            'gym_name' => $gs['gym_name'], 'logo_url' => mob_asset($gs['logo_path'] ?? null), 'email' => $gs['email'] ?? $ctx['user']['email'], 'phone' => $gs['contact_number'] ?? '',
            'address' => $gs['address'] ?? '', 'operating_hours' => $gs['operating_hours'] ?? '', 'attendance_rule' => !empty($gs['qr_attendance_enabled']) ? 'QR check-in enabled' : 'Manual check-in',
            'subscription_plan' => $sub['plan_name'] ?? null, 'subscription_status' => $sub['effective_status'] ?? null,
            'gateway_configured' => (bool)$g['is_enabled'], 'gateway_provider' => $g['provider'],
        ]]);
    }
    if ($route === 'owner/settings' && $method === 'PUT') {
        $pdo->prepare('UPDATE gym_settings SET gym_name = :n, contact_number = :p, address = :a, operating_hours = :h WHERE gym_id = :g')->execute([
            ':n' => clean_str((string)($body['gym_name'] ?? $gs['gym_name']), 150) ?: $gs['gym_name'], ':p' => clean_str((string)($body['phone'] ?? $gs['contact_number'] ?? ''), 40),
            ':a' => clean_str((string)($body['address'] ?? $gs['address'] ?? ''), 500, true), ':h' => clean_str((string)($body['operating_hours'] ?? $gs['operating_hours'] ?? ''), 120), ':g' => $gymId]);
        api_json(200, ['message' => 'Settings saved.']);
    }
    if ($route === 'owner/subscription' && $method === 'GET') {
        $sub = $ctx['subscription'] ?: [];
        $end = $sub['current_period_end'] ?? null;
        api_json(200, ['subscription' => [
            'plan_name' => $sub['plan_name'] ?? null, 'status' => $sub['effective_status'] ?? null, 'renewal_date' => $end, 'current_period_end' => $end,
            'days_remaining' => $end ? (int)((strtotime((string)$end) - strtotime($today)) / 86400) : null,
            'max_members' => $sub['max_members'] ?? null, 'max_branches' => $sub['max_branches'] ?? null, 'current_members' => $sub['current_members'] ?? null,
            'features' => json_decode((string)($sub['enabled_features_json'] ?? '[]'), true) ?: [],
        ]]);
    }
    if ($route === 'owner/notifications' && $method === 'GET') {
        $items = [];
        $ex = $pdo->prepare("SELECT id, full_name, membership_expiry_date FROM members WHERE gym_id = :g AND status != 'Inactive' AND membership_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) ORDER BY membership_expiry_date ASC LIMIT 20");
        $ex->execute([':g' => $gymId]);
        foreach ($ex->fetchAll() as $r) {
            $items[] = ['id' => 'exp-' . $r['id'], 'title' => 'Membership expiring', 'message' => $r['full_name'] . ' expires on ' . format_date($r['membership_expiry_date']) . '.', 'category' => 'Membership', 'created_at' => $today, 'is_read' => false];
        }
        $pn = $pdo->prepare("SELECT py.id, py.amount, py.payment_status, m.full_name FROM payments py INNER JOIN members m ON m.id = py.member_id WHERE py.gym_id = :g AND py.payment_status IN ('Pending','Partial') ORDER BY py.id DESC LIMIT 10");
        $pn->execute([':g' => $gymId]);
        foreach ($pn->fetchAll() as $r) {
            $items[] = ['id' => 'pay-' . $r['id'], 'title' => 'Payment ' . strtolower((string)$r['payment_status']), 'message' => $r['full_name'] . ' has a pending fee balance.', 'category' => 'Payments', 'created_at' => $today, 'is_read' => false];
        }
        $sn = $pdo->prepare('SELECT id, title, body, created_at, is_read FROM notifications WHERE gym_id = :g AND (user_id IS NULL OR user_id = :u) ORDER BY id DESC LIMIT 20');
        $sn->execute([':g' => $gymId, ':u' => $uid]);
        foreach ($sn->fetchAll() as $r) {
            $items[] = ['id' => (string)$r['id'], 'title' => $r['title'], 'message' => $r['body'], 'category' => 'General', 'created_at' => $r['created_at'], 'is_read' => (bool)$r['is_read']];
        }
        api_json(200, ['notifications' => $items]);
    }

    api_json(404, ['error' => 'API endpoint not found.', 'route' => $route]);
}

// --------------------------------------------------------------------------- MEMBER
if (str_starts_with($route, 'member/')) {
    $mc    = mob_require_member($pdo);
    $uid   = (int)$mc['user']['id'];
    $gymId = $mc['gym_id'];
    $m     = $mc['m'];
    $mid   = (int)$m['id'];
    $today = date('Y-m-d');
    $cur   = (string)$m['currency_symbol'];
    $logo  = mob_asset($m['gym_logo_path'] ?? null);
    $status = mob_member_status($m);
    $days  = !empty($m['membership_expiry_date']) ? (int)((strtotime((string)$m['membership_expiry_date']) - strtotime($today)) / 86400) : null;
    $gwq = $pdo->prepare('SELECT provider, mode, is_enabled FROM gym_payment_gateways WHERE gym_id = :g');
    $gwq->execute([':g' => $gymId]);
    $gw = $gwq->fetch() ?: ['provider' => 'manual', 'mode' => 'test', 'is_enabled' => 0];
    $onlineOk = (bool)$gw['is_enabled'] && $gw['provider'] !== 'manual';

    if ($route === 'member/gyms' && $method === 'GET') {
        api_json(200, ['selected_gym_id' => (string)$gymId, 'gyms' => array_map(static fn($r) => [
            'gym_id' => (string)$r['gym_id'], 'gym_name' => $r['gym_name'], 'gym_logo_url' => mob_asset($r['gym_logo_path'] ?? null), 'membership_id' => (string)$r['id'],
            'member_code' => $r['member_code'], 'plan_name' => $r['plan_name'], 'status' => mob_member_status($r), 'expiry_date' => $r['membership_expiry_date'],
            'is_current' => (int)$r['gym_id'] === $gymId,
        ], $mc['rows'])]);
    }

    if ($route === 'member/dashboard' && $method === 'GET') {
        $tot = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND member_id = :m'); $tot->execute([':g' => $gymId, ':m' => $mid]);
        $mon = $pdo->prepare("SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND member_id = :m AND DATE_FORMAT(attendance_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')"); $mon->execute([':g' => $gymId, ':m' => $mid]);
        $td = $pdo->prepare('SELECT check_in_time FROM attendance WHERE gym_id = :g AND member_id = :m AND attendance_date = CURDATE() LIMIT 1'); $td->execute([':g' => $gymId, ':m' => $mid]);
        $tdt = $td->fetchColumn();
        api_json(200, [
            'member_name' => $m['full_name'], 'full_name' => $m['full_name'], 'member_photo_url' => mob_asset($m['photo_path']), 'photo_url' => mob_asset($m['photo_path']),
            'gym_id' => (string)$gymId, 'gym_name' => $m['gym_name'], 'gym_logo_url' => $logo, 'membership_id' => (string)$mid, 'member_code' => $m['member_code'],
            'plan_name' => $m['plan_name'], 'membership_status' => $status, 'status' => $status,
            'start_date' => $m['membership_start_date'], 'expiry_date' => $m['membership_expiry_date'], 'membership_expiry_date' => $m['membership_expiry_date'],
            'remaining_days' => $days !== null ? max(0, $days) : null, 'total_visits' => (int)$tot->fetchColumn(), 'month_attendance' => (int)$mon->fetchColumn(),
            'pending_fees' => mob_pending($pdo, $gymId, $mid), 'currency_symbol' => $cur, 'unread_notifications' => mob_notifications_unread($pdo, $uid, $gymId),
            'gyms_count' => count($mc['rows']), 'today_checked_in' => $tdt !== false, 'today_checkin_time' => $tdt !== false ? substr((string)$tdt, 0, 5) : null,
        ]);
    }

    if ($route === 'member/memberships' && $method === 'GET') {
        $h = $pdo->prepare('SELECT * FROM memberships WHERE gym_id = :g AND member_id = :m ORDER BY id DESC LIMIT 20');
        $h->execute([':g' => $gymId, ':m' => $mid]);
        $hist = array_map(static fn($r) => ['id' => (string)$r['id'], 'plan_name' => $r['plan_name_snapshot'], 'start_date' => $r['start_date'], 'expiry_date' => $r['expiry_date'], 'amount' => (float)$r['plan_price_snapshot'], 'payment_status' => $r['status'], 'renewed_at' => substr((string)$r['created_at'], 0, 10)], $h->fetchAll());
        $lp = $pdo->prepare('SELECT payment_status FROM payments WHERE gym_id = :g AND member_id = :m ORDER BY id DESC LIMIT 1'); $lp->execute([':g' => $gymId, ':m' => $mid]);
        $detail = [
            'gym_id' => (string)$gymId, 'gym_name' => $m['gym_name'], 'membership_id' => (string)$mid, 'member_code' => $m['member_code'], 'plan_name' => $m['plan_name'],
            'plan_duration' => $m['duration_days'] ? $m['duration_days'] . ' days' : null, 'duration_days' => $m['duration_days'] !== null ? (int)$m['duration_days'] : null,
            'start_date' => $m['membership_start_date'], 'expiry_date' => $m['membership_expiry_date'], 'remaining_days' => $days !== null ? max(0, $days) : null,
            'status' => $status, 'membership_fee' => $m['plan_price'] !== null ? (float)$m['plan_price'] : null, 'currency_symbol' => $cur,
            'payment_status' => $lp->fetchColumn() ?: null, 'renewal_supported' => $onlineOk && $m['plan_id'] !== null, 'online_payment_enabled' => $onlineOk, 'renewal_history' => $hist,
        ];
        api_json(200, ['current' => $detail, 'membership' => $detail, 'memberships' => [$detail]]);
    }

    if ($route === 'member/memberships/renew' && $method === 'POST') {
        $body = api_body_json();
        if (!$onlineOk || $m['plan_id'] === null) {
            api_json(409, ['message' => 'Online renewal is not enabled for this gym. Please renew at the front desk.', 'status' => 'unavailable']);
        }
        $ref = 'MOB-' . strtoupper(bin2hex(random_bytes(5)));
        $pdo->prepare("INSERT INTO payment_orders (order_ref, gym_id, member_id, plan_id, gateway_provider, amount, currency, status) VALUES (:r, :g, :m, :p, :pv, :a, 'INR', 'Created')")
            ->execute([':r' => $ref, ':g' => $gymId, ':m' => $mid, ':p' => (int)$m['plan_id'], ':pv' => $gw['provider'], ':a' => (float)$m['plan_price']]);
        api_json(200, ['message' => 'Order ' . $ref . ' created. Complete the payment in the secure member portal.', 'checkout_url' => mob_base_url() . '/member/', 'payment_id' => $ref, 'status' => 'pending']);
    }

    if ($route === 'member/attendance' && $method === 'GET') {
        $month = preg_match('/^\d{4}-\d{2}$/', (string)($_GET['month'] ?? '')) ? (string)$_GET['month'] : date('Y-m');
        $s = $pdo->prepare("SELECT attendance_date, check_in_time, check_out_time, check_in_method FROM attendance WHERE gym_id = :g AND member_id = :m AND DATE_FORMAT(attendance_date,'%Y-%m') = :mo ORDER BY attendance_date DESC");
        $s->execute([':g' => $gymId, ':m' => $mid, ':mo' => $month]);
        $rows = $s->fetchAll();
        $cal = array_map(static fn($r) => ['date' => $r['attendance_date'], 'status' => 'present', 'checkin_time' => substr((string)$r['check_in_time'], 0, 5), 'checkout_time' => $r['check_out_time'] ? substr((string)$r['check_out_time'], 0, 5) : null], $rows);
        $hist = array_map(static fn($r) => ['id' => $r['attendance_date'], 'date' => $r['attendance_date'], 'checkin_time' => substr((string)$r['check_in_time'], 0, 5), 'checkout_time' => $r['check_out_time'] ? substr((string)$r['check_out_time'], 0, 5) : null, 'method' => $r['check_in_method'], 'status' => 'present'], $rows);
        $tot = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND member_id = :m'); $tot->execute([':g' => $gymId, ':m' => $mid]);
        $dates = $pdo->prepare('SELECT DISTINCT attendance_date FROM attendance WHERE gym_id = :g AND member_id = :m AND attendance_date <= CURDATE() ORDER BY attendance_date DESC LIMIT 120');
        $dates->execute([':g' => $gymId, ':m' => $mid]);
        $streak = 0; $cursor = strtotime($today);
        foreach ($dates->fetchAll(PDO::FETCH_COLUMN) as $d) {
            $ts = strtotime((string)$d);
            if ($ts === $cursor || ($streak === 0 && $ts === $cursor - 86400)) { $streak++; $cursor = $ts - 86400; } else { break; }
        }
        $td = $pdo->prepare('SELECT check_in_time FROM attendance WHERE gym_id = :g AND member_id = :m AND attendance_date = CURDATE() LIMIT 1'); $td->execute([':g' => $gymId, ':m' => $mid]);
        $tdt = $td->fetchColumn();
        api_json(200, ['month' => $month, 'today_status' => $tdt !== false ? 'present' : 'not_checked_in', 'today_checkin_time' => $tdt !== false ? substr((string)$tdt, 0, 5) : null,
            'total_visits' => (int)$tot->fetchColumn(), 'month_visits' => count($rows), 'attendance_streak' => $streak, 'calendar_days' => $cal, 'holidays' => [], 'history' => $hist, 'records' => $hist]);
    }

    if ($route === 'member/id-card' && $method === 'GET') {
        $q = $pdo->prepare("SELECT credential_token FROM qr_credentials WHERE gym_id = :g AND member_id = :m AND status = 'Active' ORDER BY id DESC LIMIT 1");
        $q->execute([':g' => $gymId, ':m' => $mid]);
        $tok = $q->fetchColumn() ?: issue_member_qr_credential($pdo, $gymId, $mid, null);
        api_json(200, [
            'gym_id' => (string)$gymId, 'gym_name' => $m['gym_name'], 'gym_logo_url' => $logo, 'member_name' => $m['full_name'], 'full_name' => $m['full_name'],
            'member_photo_url' => mob_asset($m['photo_path']), 'membership_id' => (string)$mid, 'member_code' => $m['member_code'], 'plan_name' => $m['plan_name'],
            'expiry_date' => $m['membership_expiry_date'], 'status' => $status, 'qr_payload' => 'HEMNITY:QR:' . $gymId . ':' . $m['member_code'] . ':' . $tok, 'qr_token' => $tok,
            'download_permitted' => true,
        ]);
    }

    if ($route === 'member/payments' && $method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1)); $per = 20;
        $s = $pdo->prepare('SELECT py.*, p.plan_name FROM payments py LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE py.gym_id = :g AND py.member_id = :m ORDER BY py.payment_date DESC, py.id DESC LIMIT ' . ($per + 1) . ' OFFSET ' . (($page - 1) * $per));
        $s->execute([':g' => $gymId, ':m' => $mid]);
        $rows = $s->fetchAll();
        $more = count($rows) > $per; $rows = array_slice($rows, 0, $per);
        $paid = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE gym_id = :g AND member_id = :m AND payment_status IN ('Paid','Partial')"); $paid->execute([':g' => $gymId, ':m' => $mid]);
        $items = array_map(static fn($r) => [
            'id' => (string)$r['id'], 'payment_date' => $r['payment_date'], 'amount' => (float)$r['amount'], 'currency_symbol' => $cur, 'payment_method' => $r['payment_method'], 'method' => $r['payment_method'],
            'status' => $r['payment_status'], 'receipt_number' => $r['receipt_number'], 'plan_name' => $r['plan_name'], 'receipt_supported' => true,
            'receipt_pdf_url' => mob_base_url() . '/api/v1/member/payments/' . $r['id'] . '/receipt',
        ], $rows);
        api_json(200, ['total_paid' => (float)$paid->fetchColumn(), 'pending_fees' => mob_pending($pdo, $gymId, $mid), 'currency_symbol' => $cur, 'online_payment_enabled' => $onlineOk, 'gateway_name' => $onlineOk ? $gw['provider'] : null, 'payments' => $items, 'items' => $items, 'page' => $page, 'has_more' => $more]);
    }

    if ($route === 'member/payments/initiate' && $method === 'POST') {
        if (!$onlineOk) {
            api_json(409, ['message' => 'Online payment is not enabled for this gym. Please pay at the front desk.', 'status' => 'unavailable']);
        }
        api_json(200, ['message' => 'Open the secure member portal to complete payment.', 'checkout_url' => mob_base_url() . '/member/', 'status' => 'pending']);
    }

    if (preg_match('#^member/payments/(\d+)/(verify|receipt)$#', $route, $pm) && $method === 'GET') {
        $s = $pdo->prepare('SELECT py.*, p.plan_name FROM payments py LEFT JOIN membership_plans p ON p.id = py.plan_id WHERE py.id = :id AND py.gym_id = :g AND py.member_id = :m LIMIT 1');
        $s->execute([':id' => (int)$pm[1], ':g' => $gymId, ':m' => $mid]);
        $p = $s->fetch();
        if (!$p) {
            api_json(404, ['error' => 'Payment not found.']);
        }
        if ($pm[2] === 'verify') {
            $ok = in_array($p['payment_status'], ['Paid', 'Partial'], true);
            api_json(200, ['payment_id' => (string)$p['id'], 'status' => $p['payment_status'], 'verified' => $ok, 'message' => $ok ? 'Payment verified.' : 'Payment is ' . $p['payment_status'] . '.', 'receipt_number' => $p['receipt_number']]);
        }
        $pdf = mob_simple_pdf([
            'Gym: ' . $m['gym_name'], 'Receipt No: ' . $p['receipt_number'], 'Date: ' . $p['payment_date'], 'Member: ' . $m['full_name'] . ' (' . $m['member_code'] . ')',
            'Plan: ' . ($p['plan_name'] ?? 'Membership'), 'Method: ' . $p['payment_method'], 'Status: ' . $p['payment_status'],
            'Amount Paid: ' . preg_replace('/[^\x20-\x7E]/', 'Rs.', $cur) . ' ' . number_format((float)$p['amount'], 2), 'Balance Due: ' . number_format((float)$p['balance_due'], 2), '', 'Thank you for training with us.',
        ], 'PAYMENT RECEIPT');
        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="receipt-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string)$p['receipt_number']) . '.pdf"');
        header('Content-Length: ' . strlen($pdf));
        echo $pdf;
        exit;
    }

    if ($route === 'member/profile' && $method === 'GET') {
        $ec = (string)($m['emergency_contact'] ?? '');
        $parts = array_map('trim', explode('|', $ec));
        $ecObj = $ec === '' ? null : (count($parts) >= 2 ? ['name' => $parts[0], 'phone' => $parts[1], 'relation' => $parts[2] ?? null] : ['name' => $ec, 'phone' => null, 'relation' => null]);
        api_json(200, [
            'id' => (string)$mid, 'member_code' => $m['member_code'], 'full_name' => $m['full_name'], 'name' => $m['full_name'], 'phone' => $m['phone'], 'email' => $m['email'],
            'photo_url' => mob_asset($m['photo_path']), 'joining_date' => $m['joining_date'], 'membership_start_date' => $m['membership_start_date'], 'emergency_contact' => $ecObj,
            'emergency_contact_authorized' => true, 'editable_fields' => ['full_name', 'phone', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation'],
            'gyms_count' => count($mc['rows']), 'notification_preferences' => ['push_enabled' => true, 'membership_alerts' => true, 'payment_alerts' => true, 'gym_announcements' => true],
        ]);
    }
    if ($route === 'member/profile' && $method === 'PATCH') {
        $b = api_body_json();
        $name = array_key_exists('full_name', $b) ? clean_str((string)$b['full_name'], 150) : $m['full_name'];
        $phone = array_key_exists('phone', $b) ? clean_str((string)$b['phone'], 30) : $m['phone'];
        if ($name === '' || $phone === '') {
            api_json(422, ['error' => 'Name and phone cannot be empty.']);
        }
        $ec = (string)($m['emergency_contact'] ?? '');
        if (isset($b['emergency_contact_name']) || isset($b['emergency_contact_phone']) || isset($b['emergency_contact_relation'])) {
            $ec = implode(' | ', [clean_str((string)($b['emergency_contact_name'] ?? ''), 60), clean_str((string)($b['emergency_contact_phone'] ?? ''), 25), clean_str((string)($b['emergency_contact_relation'] ?? ''), 30)]);
        }
        $pdo->prepare('UPDATE members SET full_name = :n, phone = :p, emergency_contact = :e WHERE id = :id AND user_id = :u')->execute([':n' => $name, ':p' => $phone, ':e' => $ec ?: null, ':id' => $mid, ':u' => $uid]);
        $pdo->prepare('UPDATE users SET full_name = :n, phone = :p WHERE id = :u')->execute([':n' => $name, ':p' => $phone, ':u' => $uid]);
        $_GET['gym_id'] = (string)$gymId;
        api_json(200, ['message' => 'Profile updated.', 'id' => (string)$mid, 'full_name' => $name, 'phone' => $phone, 'member_code' => $m['member_code'], 'email' => $m['email']]);
    }
    if ($route === 'member/profile/change-password' && $method === 'POST') {
        $b = api_body_json();
        $cp = (string)($b['current_password'] ?? ''); $np = (string)($b['new_password'] ?? ''); $cf = (string)($b['confirm_password'] ?? '');
        $u = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id'); $u->execute([':id' => $uid]);
        if (!password_verify($cp, (string)$u->fetchColumn())) { api_json(422, ['error' => 'Current password is incorrect.']); }
        if (strlen($np) < 8) { api_json(422, ['error' => 'New password must be at least 8 characters.']); }
        if ($np !== $cf) { api_json(422, ['error' => 'New password and confirmation do not match.']); }
        $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id')->execute([':h' => password_hash($np, PASSWORD_DEFAULT), ':id' => $uid]);
        $keep = hash('sha256', trim(substr((string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''), 7)));
        $pdo->prepare('DELETE FROM api_tokens WHERE user_id = :u AND token_hash <> :k')->execute([':u' => $uid, ':k' => $keep]);
        api_json(200, ['message' => 'Password changed successfully.', 'success' => true]);
    }

    if ($route === 'member/notifications' && $method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1)); $per = 20;
        $s = $pdo->prepare('SELECT n.id, n.title, n.body, n.is_read, n.created_at, n.gym_id FROM notifications n WHERE (n.user_id = :u OR (n.user_id IS NULL AND n.gym_id = :g)) ORDER BY n.id DESC LIMIT ' . ($per + 1) . ' OFFSET ' . (($page - 1) * $per));
        $s->execute([':u' => $uid, ':g' => $gymId]);
        $rows = $s->fetchAll(); $more = count($rows) > $per; $rows = array_slice($rows, 0, $per);
        $items = array_map(static fn($r) => ['id' => (string)$r['id'], 'type' => 'general', 'title' => $r['title'], 'message' => $r['body'], 'body' => $r['body'], 'created_at' => $r['created_at'], 'is_read' => (bool)$r['is_read'], 'gym_id' => (string)$r['gym_id'], 'gym_name' => $m['gym_name']], $rows);
        api_json(200, ['notifications' => $items, 'items' => $items, 'unread_count' => mob_notifications_unread($pdo, $uid, $gymId), 'page' => $page, 'has_more' => $more]);
    }
    if ($route === 'member/notifications/read-all' && $method === 'POST') {
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = :u')->execute([':u' => $uid]);
        api_json(200, ['message' => 'All notifications marked as read.', 'success' => true]);
    }
    if (preg_match('#^member/notifications/(\d+)/read$#', $route, $nm) && $method === 'POST') {
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :u')->execute([':id' => (int)$nm[1], ':u' => $uid]);
        api_json(200, ['message' => 'Marked as read.', 'success' => true]);
    }
    if ($route === 'member/notifications/preferences' && in_array($method, ['PATCH', 'PUT', 'POST'], true)) {
        $b = api_body_json();
        api_json(200, ['push_enabled' => (bool)($b['push_enabled'] ?? true), 'membership_alerts' => (bool)($b['membership_alerts'] ?? true), 'payment_alerts' => (bool)($b['payment_alerts'] ?? true), 'gym_announcements' => (bool)($b['gym_announcements'] ?? true)]);
    }
    if ($route === 'member/devices/token' && $method === 'POST') {
        $b = api_body_json();
        $t = clean_str((string)($b['token'] ?? ''), 250);
        if ($t !== '') {
            $pdo->prepare('INSERT INTO member_devices (user_id, token, platform, device_name) VALUES (:u, :t, :p, :d) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), device_name = VALUES(device_name)')
                ->execute([':u' => $uid, ':t' => $t, ':p' => clean_str((string)($b['platform'] ?? 'android'), 20), ':d' => clean_str((string)($b['device_name'] ?? ''), 80)]);
        }
        api_json(200, ['message' => 'Device registered.', 'success' => true]);
    }
    if ($route === 'member/devices/token' && $method === 'DELETE') {
        $pdo->prepare('DELETE FROM member_devices WHERE user_id = :u AND token = :t')->execute([':u' => $uid, ':t' => clean_str((string)($_GET['token'] ?? ''), 250)]);
        api_json(200, ['message' => 'Device removed.', 'success' => true]);
    }

    api_json(404, ['error' => 'API endpoint not found.', 'route' => $route]);
}
