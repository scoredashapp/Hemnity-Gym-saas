<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 2);
require_once dirname(__DIR__, 2) . '/config.php';

$pdo  = db();
$user = bearer_token_user($pdo) ?: current_user();

if (!$user || !in_array($user['role'], ['gym_owner', 'super_admin'], true)) {
    if (($_GET['format'] ?? '') === 'json') {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Protected endpoint: sign in as Gym Owner or Super Admin to view API documentation.']);
        exit;
    }
    set_flash('warning', 'Sign in as a Gym Owner or Super Admin to access the protected REST API documentation.');
    redirect('../../login.php');
}

$activeGymId = null;
if ($user['role'] === 'gym_owner') {
    $gStmt = $pdo->prepare('SELECT gym_id FROM gym_owners WHERE user_id = :uid ORDER BY is_primary DESC, id ASC LIMIT 1');
    $gStmt->execute([':uid' => (int)$user['id']]);
    $activeGymId = (int)($gStmt->fetchColumn() ?: 0) ?: null;
}

$issuedPlainToken = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = clean_str($_POST['action'] ?? '', 40);

    if ($action === 'create_token') {
        $label      = clean_str($_POST['label'] ?? 'Integration Token', 120) ?: 'Integration Token';
        $plainToken = 'hem_live_' . bin2hex(random_bytes(24));
        $tokenHash  = hash('sha256', $plainToken);

        $pdo->prepare('INSERT INTO api_tokens (user_id, gym_id, token_hash, label, expires_at) VALUES (:uid, :gid, :th, :lbl, DATE_ADD(NOW(), INTERVAL 180 DAY))')
            ->execute([':uid' => (int)$user['id'], ':gid' => $activeGymId, ':th' => $tokenHash, ':lbl' => $label]);

        $issuedPlainToken = $plainToken;
        log_audit_event($pdo, (string)$user['role'], (int)$user['id'], 'api.create_token', 'api_token', $label, $activeGymId);
    }

    if ($action === 'revoke_token') {
        $tokenId = (int)($_POST['token_id'] ?? 0);
        if ($tokenId > 0) {
            $pdo->prepare('DELETE FROM api_tokens WHERE id = :id AND user_id = :uid')
                ->execute([':id' => $tokenId, ':uid' => (int)$user['id']]);
            set_flash('success', 'API token revoked.');
            redirect('index.php');
        }
    }
}

$tStmt = $pdo->prepare('SELECT id, label, last_used_at, expires_at, created_at FROM api_tokens WHERE user_id = :uid ORDER BY id DESC');
$tStmt->execute([':uid' => (int)$user['id']]);
$tokens = $tStmt->fetchAll();

$platformCfg = get_platform_settings($pdo);
$flashes     = pull_flashes();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Protected REST API Docs — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="../../assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<header class="bg-dark text-white py-3 px-4">
    <div class="container d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-2">
            <span class="gym-brand-mark">H</span>
            <div>
                <div class="fw-bold">Hemnity Developer API v1</div>
                <div class="small text-secondary">Authenticated session: <?= e($user['email']) ?> (<?= e($user['role']) ?>)</div>
            </div>
        </div>
        <div class="d-flex gap-2">
            <?php if ($user['role'] === 'super_admin'): ?>
                <a href="../../superadmin/index.php" class="btn btn-sm btn-outline-light">&larr; Super Admin Console</a>
            <?php else: ?>
                <a href="../../index.php" class="btn btn-sm btn-outline-light">&larr; Owner Dashboard</a>
            <?php endif; ?>
            <a href="../v1/index.php?route=docs/spec" target="_blank" class="btn btn-sm btn-warning text-dark fw-semibold">OpenAPI JSON</a>
        </div>
    </div>
</header>

<main class="container py-4">
    <?php foreach ($flashes as $f): ?>
        <div class="alert alert-<?= e($f['type']) ?> small"><?= e($f['message']) ?></div>
    <?php endforeach; ?>

    <?php if ($issuedPlainToken !== null): ?>
        <div class="alert alert-success border-2">
            <div class="fw-bold mb-1">Personal Bearer Token Generated (Shown Once)</div>
            <p class="small mb-2">Copy and store this secret token securely now. Only its SHA-256 hash is stored in MySQL.</p>
            <code class="d-block p-2 bg-dark text-warning rounded font-mono"><?= e($issuedPlainToken) ?></code>
        </div>
    <?php endif; ?>

    <div class="row g-4">
        <div class="col-lg-5">
            <div class="gym-card p-4 mb-4">
                <h2 class="h6 fw-bold mb-3">Generate Bearer API Token</h2>
                <form method="post" action="index.php">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="create_token">
                    <div class="mb-3">
                        <label class="form-label small fw-medium">Token Label</label>
                        <input type="text" name="label" class="form-control form-control-sm" placeholder="e.g. Android Gate Scanner" required>
                    </div>
                    <button type="submit" class="btn btn-gym-primary btn-sm">Issue New Bearer Token</button>
                </form>
            </div>

            <div class="gym-card p-4">
                <h2 class="h6 fw-bold mb-3">Active Personal Tokens (<?= count($tokens) ?>)</h2>
                <?php if (empty($tokens)): ?>
                    <div class="small text-muted">No API tokens generated yet.</div>
                <?php else: foreach ($tokens as $tk): ?>
                    <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center small">
                        <div>
                            <div class="fw-semibold"><?= e($tk['label']) ?></div>
                            <div class="text-muted">Expires: <?= e((string)$tk['expires_at']) ?></div>
                        </div>
                        <form method="post" action="index.php" class="m-0">
                            <?= csrf_field() ?>
                            <input type="hidden" name="action" value="revoke_token">
                            <input type="hidden" name="token_id" value="<?= (int)$tk['id'] ?>">
                            <button type="submit" class="btn btn-sm btn-outline-danger py-0 px-2">Revoke</button>
                        </form>
                    </div>
                <?php endforeach; endif; ?>
            </div>
        </div>

        <div class="col-lg-7">
            <div class="gym-card p-4">
                <h2 class="h5 fw-bold mb-3">REST Endpoints (Mobile / Webhooks / Scanner)</h2>
                <p class="small text-muted">All owner endpoints enforce strict server-derived <code>gym_id</code> isolation. Client-supplied <code>gym_id</code> values are never trusted for authorization.</p>
                <div class="table-responsive mb-4">
                    <table class="table table-sm align-middle small">
                        <thead class="table-light"><tr><th>Method</th><th>Endpoint</th><th>Auth Scope</th><th>Description</th></tr></thead>
                        <tbody>
                        <tr><td><span class="badge bg-success">GET</span></td><td class="font-mono">/api/v1/public/landing</td><td>Public</td><td>SaaS plans, FAQs &amp; CMS settings</td></tr>
                        <tr><td><span class="badge bg-primary">POST</span></td><td class="font-mono">/api/v1/auth/login</td><td>Public</td><td>Issue Bearer token via email + password</td></tr>
                        <tr><td><span class="badge bg-success">GET</span></td><td class="font-mono">/api/v1/owner/dashboard</td><td>Bearer / Session</td><td>Tenant-scoped KPIs &amp; subscription status</td></tr>
                        <tr><td><span class="badge bg-primary">GET/POST</span></td><td class="font-mono">/api/v1/owner/members</td><td>Bearer / Session</td><td>List/create tenant members + QR token</td></tr>
                        <tr><td><span class="badge bg-primary">POST</span></td><td class="font-mono">/api/v1/owner/attendance/qr-checkin</td><td>Bearer / Session</td><td>Verify QR token or member code &amp; log attendance</td></tr>
                        <tr><td><span class="badge bg-primary">POST</span></td><td class="font-mono">/api/v1/webhooks/payment</td><td>HMAC-SHA256</td><td>Verified online payment order settlement</td></tr>
                        <tr><td><span class="badge bg-success">GET</span></td><td class="font-mono">/api/v1/docs/spec</td><td>Authenticated</td><td>JSON OpenAPI specification (401 if guest)</td></tr>
                        </tbody>
                    </table>
                </div>

                <h3 class="h6 fw-bold mb-2">Quick cURL Verification Example</h3>
                <pre class="bg-dark text-light p-3 rounded small font-mono mb-0">curl -H "Authorization: Bearer YOUR_TOKEN" \
  "<?= e(rtrim((string)($platformCfg['base_url'] ?? 'https://gym.hemnity.in'), '/')) ?>/api/v1/owner/dashboard"</pre>
            </div>
        </div>
    </div>
</main>
</body>
</html>
