<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 2);
require_once dirname(__DIR__, 2) . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$pdo    = db();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

$route = clean_str((string)($_GET['route'] ?? ''), 200);
if ($route === '' && !empty($_SERVER['PATH_INFO'])) {
    $route = trim((string)$_SERVER['PATH_INFO'], '/');
}
$route = trim($route, '/');

function api_json(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function api_body_json(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return $_POST ?: [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function api_auth_user(PDO $pdo): ?array
{
    $bearer = bearer_token_user($pdo);
    if ($bearer) {
        return $bearer;
    }
    return current_user();
}

function api_require_owner(PDO $pdo, bool $requireWrite = false): array
{
    $user = api_auth_user($pdo);
    if (!$user) {
        api_json(401, ['error' => 'Authentication required.']);
    }
    if ($user['role'] !== 'gym_owner') {
        api_json(403, ['error' => 'Gym Owner role required.']);
    }

    $stmt = $pdo->prepare(
        'SELECT g.id, g.name, g.status
         FROM gym_owners go
         INNER JOIN gyms g ON g.id = go.gym_id
         WHERE go.user_id = :uid
         ORDER BY go.is_primary DESC, g.id ASC'
    );
    $stmt->execute([':uid' => (int)$user['id']]);
    $ownedGyms = $stmt->fetchAll();
    if (empty($ownedGyms)) {
        api_json(403, ['error' => 'No gym workspace linked to this owner.']);
    }

    $preferred = (int)($user['token_gym_id'] ?? $_SESSION['active_gym_id'] ?? 0);
    $matched   = $ownedGyms[0];
    foreach ($ownedGyms as $og) {
        if ((int)$og['id'] === $preferred) {
            $matched = $og;
            break;
        }
    }

    $gymId = (int)$matched['id'];
    sync_expired_memberships($pdo, $gymId);
    $sub = get_gym_subscription_info($pdo, $gymId);
    if ($requireWrite && $sub && !$sub['can_write_operations']) {
        api_json(402, ['error' => $sub['restriction_reason'] ?? 'Subscription expired or suspended.']);
    }

    return ['user' => $user, 'gym_id' => $gymId, 'gym_name' => $matched['name'], 'subscription' => $sub];
}

// Mobile apps (owner + member): auth, owner/*, member/* routes on the live schema
require __DIR__ . '/mobile.php';

// ----------------------------------------------------------------------------
// 1. GET public/landing
// ----------------------------------------------------------------------------
if ($method === 'GET' && ($route === '' || $route === 'public/landing')) {
    $cfg   = get_platform_settings($pdo);
    $plans = $pdo->query('SELECT id, slug, plan_name, tagline, monthly_price, quarterly_price, yearly_price, trial_days, max_members, max_branches, discount_percent, enabled_features_json, description, is_featured FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();
    $faqs  = $pdo->query('SELECT id, question, answer FROM platform_faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')->fetchAll();
    api_json(200, ['platform' => $cfg, 'plans' => $plans, 'faqs' => $faqs]);
}

// ----------------------------------------------------------------------------
// 2. POST auth/login (issues Bearer API token for mobile/API clients)
// ----------------------------------------------------------------------------
if ($method === 'POST' && $route === 'auth/login') {
    $body     = api_body_json();
    $email    = strtolower(clean_str((string)($body['email'] ?? ''), 190));
    $password = (string)($body['password'] ?? '');

    if ($email === '' || $password === '') {
        api_json(400, ['error' => 'Email and password are required.']);
    }

    $stmt = $pdo->prepare('SELECT id, role, full_name, email, password_hash, is_active FROM users WHERE email = :em LIMIT 1');
    $stmt->execute([':em' => $email]);
    $user = $stmt->fetch();

    if (!$user || (int)$user['is_active'] !== 1 || !password_verify($password, (string)$user['password_hash'])) {
        api_json(401, ['error' => 'Invalid credentials.']);
    }

    $gymId = null;
    if ($user['role'] === 'gym_owner') {
        $gStmt = $pdo->prepare('SELECT gym_id FROM gym_owners WHERE user_id = :uid ORDER BY is_primary DESC, id ASC LIMIT 1');
        $gStmt->execute([':uid' => (int)$user['id']]);
        $gymId = (int)($gStmt->fetchColumn() ?: 0) ?: null;
    } elseif ($user['role'] === 'gym_member') {
        $mStmt = $pdo->prepare('SELECT gym_id FROM members WHERE user_id = :uid ORDER BY id ASC LIMIT 1');
        $mStmt->execute([':uid' => (int)$user['id']]);
        $gymId = (int)($mStmt->fetchColumn() ?: 0) ?: null;
    }

    $plainToken = 'hem_live_' . bin2hex(random_bytes(24));
    $tokenHash  = hash('sha256', $plainToken);
    $label      = clean_str((string)($body['device_label'] ?? 'API Client Token'), 120);

    $pdo->prepare('INSERT INTO api_tokens (user_id, gym_id, token_hash, label, expires_at) VALUES (:uid, :gid, :th, :lbl, DATE_ADD(NOW(), INTERVAL 90 DAY))')
        ->execute([':uid' => (int)$user['id'], ':gid' => $gymId, ':th' => $tokenHash, ':lbl' => $label]);

    log_audit_event($pdo, (string)$user['role'], (int)$user['id'], 'api.token_login', 'user', (string)$user['id'], $gymId);

    api_json(200, [
        'token' => $plainToken,
        'user'  => [
            'id'        => (int)$user['id'],
            'role'      => $user['role'],
            'full_name' => $user['full_name'],
            'email'     => $user['email'],
            'gym_id'    => $gymId,
        ],
    ]);
}

// ----------------------------------------------------------------------------
// 3. GET owner/dashboard (strict gym_id tenant isolation)
// ----------------------------------------------------------------------------
if ($method === 'GET' && $route === 'owner/dashboard') {
    $ctx   = api_require_owner($pdo, false);
    $gymId = (int)$ctx['gym_id'];

    $kpis = [];
    $s1 = $pdo->prepare('SELECT COUNT(*) FROM members WHERE gym_id = :g');
    $s1->execute([':g' => $gymId]);
    $kpis['total_members'] = (int)$s1->fetchColumn();

    $s2 = $pdo->prepare("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Active'");
    $s2->execute([':g' => $gymId]);
    $kpis['active_members'] = (int)$s2->fetchColumn();

    $s3 = $pdo->prepare("SELECT COUNT(*) FROM members WHERE gym_id = :g AND status = 'Expired'");
    $s3->execute([':g' => $gymId]);
    $kpis['expired_members'] = (int)$s3->fetchColumn();

    $s4 = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE gym_id = :g AND attendance_date = CURDATE()');
    $s4->execute([':g' => $gymId]);
    $kpis['today_attendance'] = (int)$s4->fetchColumn();

    $s5 = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE gym_id = :g AND payment_status IN ('Paid','Partial') AND DATE_FORMAT(payment_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')");
    $s5->execute([':g' => $gymId]);
    $kpis['monthly_revenue'] = (float)$s5->fetchColumn();

    api_json(200, [
        'gym_id'       => $gymId,
        'gym_name'     => $ctx['gym_name'],
        'subscription' => $ctx['subscription'],
        'kpis'         => $kpis,
    ]);
}

// ----------------------------------------------------------------------------
// 4. GET|POST owner/members
// ----------------------------------------------------------------------------
if ($route === 'owner/members' && $method === 'GET') {
    $ctx   = api_require_owner($pdo, false);
    $gymId = (int)$ctx['gym_id'];
    $stmt  = $pdo->prepare(
        'SELECT m.id, m.member_code, m.full_name, m.phone, m.email, m.status, m.membership_start_date, m.membership_expiry_date,
                mp.plan_name,
                (SELECT qc.credential_token FROM qr_credentials qc WHERE qc.gym_id = m.gym_id AND qc.member_id = m.id AND qc.status = \'Active\' LIMIT 1) AS active_qr_token
         FROM members m
         LEFT JOIN membership_plans mp ON mp.id = m.plan_id
         WHERE m.gym_id = :g
         ORDER BY m.id DESC
         LIMIT 200'
    );
    $stmt->execute([':g' => $gymId]);
    api_json(200, ['gym_id' => $gymId, 'members' => $stmt->fetchAll()]);
}

if ($route === 'owner/members' && $method === 'POST') {
    $ctx   = api_require_owner($pdo, true);
    $gymId = (int)$ctx['gym_id'];
    if (!$ctx['subscription']['can_add_more_members']) {
        api_json(402, ['error' => 'Member limit reached for your SaaS plan. Upgrade to add more members.']);
    }

    $body     = api_body_json();
    $fullName = clean_str((string)($body['full_name'] ?? ''), 150);
    $phone    = clean_str((string)($body['phone'] ?? ''), 30);
    $email    = clean_str((string)($body['email'] ?? ''), 190);
    $planId   = (int)($body['plan_id'] ?? 0);

    if ($fullName === '' || $phone === '') {
        api_json(422, ['error' => 'full_name and phone are required.']);
    }

    $plan = null;
    if ($planId > 0) {
        $pStmt = $pdo->prepare('SELECT * FROM membership_plans WHERE id = :id AND gym_id = :g LIMIT 1');
        $pStmt->execute([':id' => $planId, ':g' => $gymId]);
        $plan = $pStmt->fetch();
        if (!$plan) {
            api_json(422, ['error' => 'Selected membership plan does not belong to your gym.']);
        }
    }

    $code  = generate_member_code($pdo, $gymId);
    $today = date('Y-m-d');
    $exp   = $plan ? date('Y-m-d', strtotime('+' . (int)$plan['duration_days'] . ' days')) : null;

    $pdo->prepare(
        "INSERT INTO members (gym_id, member_code, full_name, phone, email, joining_date, plan_id, membership_start_date, membership_expiry_date, status)
         VALUES (:g, :mc, :fn, :ph, :em, :jd, :pid, :ms, :me, 'Active')"
    )->execute([
        ':g' => $gymId, ':mc' => $code, ':fn' => $fullName, ':ph' => $phone, ':em' => $email ?: null,
        ':jd' => $today, ':pid' => $plan ? (int)$plan['id'] : null, ':ms' => $plan ? $today : null, ':me' => $exp,
    ]);
    $memberId = (int)$pdo->lastInsertId();
    $qrToken  = issue_member_qr_credential($pdo, $gymId, $memberId, (int)$ctx['user']['id']);
    log_audit_event($pdo, 'gym_owner', (int)$ctx['user']['id'], 'api.create_member', 'member', (string)$memberId, $gymId);

    api_json(201, ['id' => $memberId, 'member_code' => $code, 'qr_token' => $qrToken]);
}

// ----------------------------------------------------------------------------
// 5. POST owner/attendance/qr-checkin (Tenant-isolated QR & Member ID Check-In)
// ----------------------------------------------------------------------------
if ($method === 'POST' && $route === 'owner/attendance/qr-checkin') {
    $ctx   = api_require_owner($pdo, true);
    $gymId = (int)$ctx['gym_id'];
    $body  = api_body_json();

    $qrToken    = clean_str((string)($body['credential_token'] ?? $body['qr_token'] ?? ''), 120);
    $memberCode = strtoupper(clean_str((string)($body['member_code'] ?? ''), 30));

    $member = null;
    $qrCredId = null;
    $methodUsed = 'QR';

    if ($qrToken !== '') {
        $qStmt = $pdo->prepare('SELECT * FROM qr_credentials WHERE credential_token = :tok LIMIT 1');
        $qStmt->execute([':tok' => $qrToken]);
        $cred = $qStmt->fetch();
        if (!$cred) {
            api_json(404, ['error' => 'Unrecognized QR credential token.']);
        }
        if ((int)$cred['gym_id'] !== $gymId) {
            api_json(403, ['error' => 'Cross-tenant QR token rejected. This pass belongs to another gym.']);
        }
        if ($cred['status'] !== 'Active') {
            api_json(403, ['error' => 'QR credential has been revoked. Issue a fresh pass for this member.']);
        }
        $qrCredId = (int)$cred['id'];

        $mStmt = $pdo->prepare('SELECT * FROM members WHERE id = :id AND gym_id = :g LIMIT 1');
        $mStmt->execute([':id' => (int)$cred['member_id'], ':g' => $gymId]);
        $member = $mStmt->fetch();
    } elseif ($memberCode !== '') {
        $methodUsed = 'ID_Scan';
        $mStmt = $pdo->prepare('SELECT * FROM members WHERE gym_id = :g AND member_code = :mc LIMIT 1');
        $mStmt->execute([':g' => $gymId, ':mc' => $memberCode]);
        $member = $mStmt->fetch();
    } else {
        api_json(400, ['error' => 'Provide credential_token or member_code.']);
    }

    if (!$member) {
        api_json(404, ['error' => 'Member not found in this gym workspace.']);
    }

    if ($member['status'] === 'Inactive') {
        api_json(403, ['error' => 'Member account is Inactive.']);
    }
    $today = date('Y-m-d');
    if ($member['status'] === 'Expired' || ($member['membership_expiry_date'] && $member['membership_expiry_date'] < $today)) {
        api_json(403, ['error' => 'Membership expired on ' . ($member['membership_expiry_date'] ?: 'N/A') . '. Renewal required.', 'member' => $member]);
    }

    $dupStmt = $pdo->prepare('SELECT id, check_in_time FROM attendance WHERE gym_id = :g AND member_id = :m AND attendance_date = :dt LIMIT 1');
    $dupStmt->execute([':g' => $gymId, ':m' => (int)$member['id'], ':dt' => $today]);
    if ($existing = $dupStmt->fetch()) {
        api_json(409, ['error' => 'Member already checked in today at ' . $existing['check_in_time'] . '.', 'member' => $member]);
    }

    $nowTime = date('H:i:s');
    $pdo->prepare(
        'INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, qr_credential_id, recorded_by)
         VALUES (:g, :m, :dt, :tm, :mth, :qrid, :rec)'
    )->execute([
        ':g' => $gymId, ':m' => (int)$member['id'], ':dt' => $today, ':tm' => $nowTime,
        ':mth' => $methodUsed, ':qrid' => $qrCredId, ':rec' => (int)$ctx['user']['id'],
    ]);

    api_json(201, [
        'ok'            => true,
        'gym_id'        => $gymId,
        'check_in_time' => $nowTime,
        'method'        => $methodUsed,
        'member'        => [
            'id'                     => (int)$member['id'],
            'member_code'            => $member['member_code'],
            'full_name'              => $member['full_name'],
            'photo_path'             => $member['photo_path'],
            'status'                 => $member['status'],
            'membership_expiry_date' => $member['membership_expiry_date'],
        ],
    ]);
}

// ----------------------------------------------------------------------------
// 6. POST webhooks/payment (HMAC-SHA256 verified per-gym webhook)
// ----------------------------------------------------------------------------
if ($method === 'POST' && $route === 'webhooks/payment') {
    $rawPayload = (string)file_get_contents('php://input');
    $body       = json_decode($rawPayload, true);
    if (!is_array($body)) {
        api_json(400, ['error' => 'Invalid JSON payload.']);
    }

    $orderRef  = clean_str((string)($body['order_ref'] ?? ''), 80);
    $eventId   = clean_str((string)($body['webhook_event_id'] ?? ''), 120);
    $signature = (string)($_SERVER['HTTP_X_HEMNITY_SIGNATURE'] ?? $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '');

    if ($orderRef === '' || $signature === '') {
        api_json(400, ['error' => 'order_ref and webhook signature header are required.']);
    }

    $oStmt = $pdo->prepare('SELECT * FROM payment_orders WHERE order_ref = :ref LIMIT 1');
    $oStmt->execute([':ref' => $orderRef]);
    $order = $oStmt->fetch();
    if (!$order) {
        api_json(404, ['error' => 'Payment order not found.']);
    }

    $gwStmt = $pdo->prepare('SELECT * FROM gym_payment_gateways WHERE gym_id = :g LIMIT 1');
    $gwStmt->execute([':g' => (int)$order['gym_id']]);
    $gw = $gwStmt->fetch();
    $secret = decrypt_secret($gw['webhook_secret_encrypted'] ?? '') ?: decrypt_secret($gw['secret_encrypted'] ?? '');

    if ($secret === '' || !verify_hmac_signature($rawPayload, $signature, $secret)) {
        api_json(401, ['error' => 'Webhook signature verification failed.']);
    }

    if ($order['status'] === 'Paid') {
        api_json(200, ['ok' => true, 'idempotent' => true, 'payment_id' => (int)$order['payment_id']]);
    }

    $pdo->beginTransaction();
    try {
        $receiptNo = generate_receipt_number($pdo, (int)$order['gym_id']);
        $pdo->prepare(
            "INSERT INTO payments (gym_id, receipt_number, member_id, plan_id, amount, plan_total_amount, balance_due, payment_date, payment_method, transaction_ref, payment_status, payment_source, gateway_order_id, notes)
             VALUES (:g, :rcp, :m, :p, :amt, :amt2, 0.00, CURDATE(), 'UPI', :ref, 'Paid', :src, :oid, 'Verified via webhook')"
        )->execute([
            ':g' => (int)$order['gym_id'], ':rcp' => $receiptNo, ':m' => (int)$order['member_id'],
            ':p' => $order['plan_id'], ':amt' => $order['amount'], ':amt2' => $order['amount'],
            ':ref' => $eventId ?: $orderRef, ':src' => $order['gateway_provider'], ':oid' => (int)$order['id'],
        ]);
        $paymentId = (int)$pdo->lastInsertId();

        $pdo->prepare("UPDATE payment_orders SET status = 'Paid', webhook_event_id = :ev, payment_id = :pid, verified_signature = :sig, raw_verified_at = NOW() WHERE id = :id")
            ->execute([':ev' => $eventId ?: null, ':pid' => $paymentId, ':sig' => $signature, ':id' => (int)$order['id']]);

        $pdo->commit();
        api_json(200, ['ok' => true, 'payment_id' => $paymentId, 'receipt_number' => $receiptNo]);
    } catch (Throwable $ex) {
        $pdo->rollBack();
        api_json(500, ['error' => 'Webhook processing error.']);
    }
}

// ----------------------------------------------------------------------------
// 7. GET docs/spec (Strictly Authenticated)
// ----------------------------------------------------------------------------
if ($method === 'GET' && $route === 'docs/spec') {
    $user = api_auth_user($pdo);
    if (!$user || !in_array($user['role'], ['gym_owner', 'super_admin'], true)) {
        api_json(401, ['error' => 'Protected API documentation requires Gym Owner or Super Admin authentication.']);
    }

    api_json(200, [
        'openapi'  => '3.0.3',
        'info'     => ['title' => 'Hemnity Gym Management Software REST API', 'version' => GYM_APP_VERSION],
        'security' => [['bearerAuth' => []]],
        'endpoints' => [
            ['method' => 'GET', 'path' => '/api/v1/public/landing', 'auth' => 'Public', 'summary' => 'Fetch DB-driven SaaS plans, FAQs, and CMS settings'],
            ['method' => 'POST', 'path' => '/api/v1/auth/login', 'auth' => 'Public', 'summary' => 'Exchange email + password for a revocable Bearer API token'],
            ['method' => 'GET', 'path' => '/api/v1/owner/dashboard', 'auth' => 'Gym Owner', 'summary' => 'Tenant-isolated KPIs & subscription status'],
            ['method' => 'GET|POST', 'path' => '/api/v1/owner/members', 'auth' => 'Gym Owner', 'summary' => 'List or register members with automatic QR credential issuance'],
            ['method' => 'POST', 'path' => '/api/v1/owner/attendance/qr-checkin', 'auth' => 'Gym Owner', 'summary' => 'Verify revocable QR credential token or Member ID within authorized gym_id'],
            ['method' => 'POST', 'path' => '/api/v1/webhooks/payment', 'auth' => 'HMAC-SHA256', 'summary' => 'Verify payment gateway webhook and record idempotent receipt'],
            ['method' => 'GET', 'path' => '/api/v1/docs/spec', 'auth' => 'Gym Owner / Super Admin', 'summary' => 'Authenticated OpenAPI JSON specification'],
        ],
    ]);
}

api_json(404, ['error' => 'API endpoint not found.', 'route' => $route]);
