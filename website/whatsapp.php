<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);
$styles = [
    'post_json'        => 'POST JSON  — {"apikey":"…","phone":"…","message":"…"}',
    'post_form'        => 'POST Form  — apikey=…&phone=…&message=…',
    'post_json_bearer' => 'POST JSON + Bearer header (key sent as Authorization)',
    'get_url'          => 'GET URL template — use {phone} {message} {key} in the URL',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);
    $action = clean_str($_POST['action'] ?? 'save', 20);

    if (in_array($action, ['save', 'test'], true)) {
        $cur   = whatsapp_get_settings($pdo, $gymId);
        $style = array_key_exists($_POST['request_style'] ?? '', $styles) ? (string)$_POST['request_style'] : 'post_json';
        $newKey = trim((string)($_POST['api_key'] ?? ''));
        $days  = implode(',', array_unique(array_filter(array_map('intval', preg_split('/[\s,]+/', (string)($_POST['notify_days_before'] ?? '')) ?: []), static fn($n) => $n > 0 && $n <= 60)));
        $pdo->prepare(
            'INSERT INTO whatsapp_settings (gym_id, is_enabled, api_url, api_key_enc, request_style, key_param, phone_param, message_param, country_code, notify_days_before, send_on_expiry, repeat_after_expiry_days, tpl_expiring, tpl_expired)
             VALUES (:g, :en, :url, :key, :st, :kp, :pp, :mp, :cc, :nd, :soe, :rep, :t1, :t2)
             ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), api_url = VALUES(api_url), api_key_enc = VALUES(api_key_enc), request_style = VALUES(request_style),
               key_param = VALUES(key_param), phone_param = VALUES(phone_param), message_param = VALUES(message_param), country_code = VALUES(country_code),
               notify_days_before = VALUES(notify_days_before), send_on_expiry = VALUES(send_on_expiry), repeat_after_expiry_days = VALUES(repeat_after_expiry_days),
               tpl_expiring = VALUES(tpl_expiring), tpl_expired = VALUES(tpl_expired)'
        )->execute([
            ':g' => $gymId, ':en' => isset($_POST['is_enabled']) ? 1 : 0,
            ':url' => clean_str($_POST['api_url'] ?? '', 500),
            ':key' => $newKey !== '' ? encrypt_secret($newKey) : (string)($cur['api_key_enc'] ?? ''),
            ':st' => $style,
            ':kp' => clean_str($_POST['key_param'] ?? 'apikey', 40) ?: 'apikey',
            ':pp' => clean_str($_POST['phone_param'] ?? 'phone', 40) ?: 'phone',
            ':mp' => clean_str($_POST['message_param'] ?? 'message', 40) ?: 'message',
            ':cc' => preg_replace('/\D+/', '', (string)($_POST['country_code'] ?? '91')) ?: '91',
            ':nd' => $days !== '' ? $days : '3,1',
            ':soe' => isset($_POST['send_on_expiry']) ? 1 : 0,
            ':rep' => max(0, min(60, (int)($_POST['repeat_after_expiry_days'] ?? 7))),
            ':t1' => clean_str($_POST['tpl_expiring'] ?? '', 1000, true),
            ':t2' => clean_str($_POST['tpl_expired'] ?? '', 1000, true),
        ]);
        log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'whatsapp.settings_saved', 'gym', (string)$gymId, $gymId);

        if ($action === 'test') {
            $to = clean_str($_POST['test_phone'] ?? '', 30);
            $cfg = whatsapp_get_settings($pdo, $gymId);
            $msg = whatsapp_render_template((string)$cfg['tpl_expiring'], ['name' => 'Test Member', 'gym' => $gymSettings['gym_name'], 'plan' => 'Monthly', 'expiry' => format_date(date('Y-m-d', strtotime('+3 days'))), 'days' => 3, 'member_id' => 'TEST-0001', 'days_ago' => 0]);
            $res = whatsapp_send($cfg, $to, $msg);
            $pdo->prepare('INSERT INTO whatsapp_logs (gym_id, member_id, kind, phone, message, status, http_code, response, log_date) VALUES (:g, NULL, \'test\', :p, :m, :s, :c, :r, CURDATE())')
                ->execute([':g' => $gymId, ':p' => $to, ':m' => $msg, ':s' => $res['ok'] ? 'sent' : 'failed', ':c' => $res['code'], ':r' => $res['response']]);
            set_flash($res['ok'] ? 'success' : 'danger', ($res['ok'] ? 'Test message accepted by the gateway' : 'Test message FAILED') . ' (HTTP ' . $res['code'] . '): ' . mb_substr($res['response'], 0, 300));
        } else {
            set_flash('success', 'WhatsApp automation settings saved.');
        }
        redirect('whatsapp.php');
    }
    if ($action === 'run_now') {
        $r = whatsapp_run_daily($pdo, $gymId);
        set_flash('success', sprintf('Reminder run finished — sent: %d, failed: %d, skipped: %d.', $r['sent'], $r['failed'], $r['skipped']));
        redirect('whatsapp.php');
    }
}

$cfg  = whatsapp_get_settings($pdo, $gymId);
$logs = $pdo->prepare('SELECT l.*, m.full_name FROM whatsapp_logs l LEFT JOIN members m ON m.id = l.member_id WHERE l.gym_id = :g ORDER BY l.id DESC LIMIT 40');
$logs->execute([':g' => $gymId]);
$logs = $logs->fetchAll();
$base = rtrim((string)($dbConfig['base_url'] ?? ''), '/');
$cronUrl = $base . '/cron_whatsapp?key=' . hemnity_cron_token();
$cronCmd = '/usr/local/bin/php ' . __DIR__ . '/cron_whatsapp.php';

$pageTitle   = 'WhatsApp Automation';
$pageHeading = 'WhatsApp Automation';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1"><i class="bi bi-whatsapp text-success me-2"></i>WhatsApp Automation</h1><p class="text-muted small mb-0">Connect your WhatsApp gateway (API URL + key), test it, and send automatic membership-expiry messages every day.</p></div>
    <form method="post" action="whatsapp.php" class="m-0"><?= csrf_field() ?><input type="hidden" name="action" value="run_now"><button class="btn btn-outline-success btn-sm"><i class="bi bi-play-circle me-1"></i>Run Reminders Now</button></form>
</div>

<form method="post" action="whatsapp.php">
<?= csrf_field() ?>
<div class="row g-4">
    <div class="col-lg-6">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">1. API Connection</h2></div>
            <div class="gym-card-body">
                <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="is_enabled" name="is_enabled" value="1" <?= !empty($cfg['is_enabled']) ? 'checked' : '' ?>><label class="form-check-label fw-medium" for="is_enabled">Enable automatic daily reminders</label></div>
                <div class="mb-2"><label class="form-label small fw-medium">API URL *</label><input type="text" class="form-control font-mono" name="api_url" value="<?= e($cfg['api_url']) ?>" placeholder="https://your-gateway.com/api/send"></div>
                <div class="mb-2"><label class="form-label small fw-medium">API Key / Token <?= !empty($cfg['api_key_enc']) ? '<span class="text-success">(saved: ' . e(mask_secret($cfg['api_key_enc'])) . ')</span>' : '' ?></label><input type="password" class="form-control font-mono" name="api_key" placeholder="<?= !empty($cfg['api_key_enc']) ? 'Leave blank to keep the saved key' : 'Paste your API key' ?>" autocomplete="new-password"></div>
                <div class="mb-2"><label class="form-label small fw-medium">Request Style</label>
                    <select class="form-select" name="request_style" id="request_style"><?php foreach ($styles as $k => $label): ?><option value="<?= e($k) ?>" <?= $cfg['request_style'] === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select></div>
                <div class="row g-2 mb-2">
                    <div class="col-4"><label class="form-label small">Key field</label><input type="text" class="form-control form-control-sm font-mono" name="key_param" value="<?= e($cfg['key_param']) ?>"></div>
                    <div class="col-4"><label class="form-label small">Phone field</label><input type="text" class="form-control form-control-sm font-mono" name="phone_param" value="<?= e($cfg['phone_param']) ?>"></div>
                    <div class="col-4"><label class="form-label small">Message field</label><input type="text" class="form-control form-control-sm font-mono" name="message_param" value="<?= e($cfg['message_param']) ?>"></div>
                </div>
                <div class="mb-3"><label class="form-label small fw-medium">Default Country Code</label><input type="text" class="form-control font-mono" style="max-width:120px" name="country_code" value="<?= e($cfg['country_code']) ?>"></div>
                <div class="border rounded-3 p-3 bg-light">
                    <div class="fw-semibold small mb-2"><i class="bi bi-send-check me-1"></i>Test your API</div>
                    <div class="input-group input-group-sm"><input type="text" class="form-control font-mono" name="test_phone" placeholder="Your WhatsApp number e.g. 9876543210"><button type="submit" name="action" value="test" class="btn btn-success">Save &amp; Send Test</button></div>
                    <div class="form-text">Saves the settings above, then sends a sample reminder to this number and shows the gateway's response.</div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-lg-6">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">2. Schedule &amp; Message Templates</h2></div>
            <div class="gym-card-body">
                <div class="row g-2 mb-3">
                    <div class="col-sm-6"><label class="form-label small fw-medium">Remind before expiry (days)</label><input type="text" class="form-control font-mono" name="notify_days_before" value="<?= e($cfg['notify_days_before']) ?>" placeholder="3,1"><div class="form-text">Comma separated, e.g. 7,3,1</div></div>
                    <div class="col-sm-6"><label class="form-label small fw-medium">After expiry: repeat daily for</label><div class="input-group"><input type="number" min="0" max="60" class="form-control font-mono" name="repeat_after_expiry_days" value="<?= (int)$cfg['repeat_after_expiry_days'] ?>"><span class="input-group-text">days</span></div><div class="form-text">0 = send only once on expiry day</div></div>
                </div>
                <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="soe" name="send_on_expiry" value="1" <?= !empty($cfg['send_on_expiry']) ? 'checked' : '' ?>><label class="form-check-label small" for="soe">Also send on the expiry day</label></div>
                <div class="mb-2"><label class="form-label small fw-medium">Template — membership expiring</label><textarea class="form-control" rows="4" name="tpl_expiring"><?= e($cfg['tpl_expiring']) ?></textarea></div>
                <div class="mb-2"><label class="form-label small fw-medium">Template — membership expired</label><textarea class="form-control" rows="4" name="tpl_expired"><?= e($cfg['tpl_expired']) ?></textarea></div>
                <div class="small text-muted">Variables: <code>{name}</code> <code>{gym}</code> <code>{plan}</code> <code>{expiry}</code> <code>{days}</code> <code>{days_ago}</code> <code>{member_id}</code></div>
            </div>
        </div>
        <div class="d-flex justify-content-end mb-4"><button type="submit" name="action" value="save" class="btn btn-gym-primary px-4"><i class="bi bi-check2-circle me-1"></i>Save WhatsApp Settings</button></div>
    </div>
</div>
</form>

<div class="gym-card mb-4">
    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">3. Daily Automation (cPanel Cron)</h2></div>
    <div class="gym-card-body small">
        <p class="mb-2">Messages go out automatically once a day. Add <strong>one</strong> of these in cPanel &rarr; <em>Cron Jobs</em> (schedule: <code>0 9 * * *</code> = every day 9:00 AM):</p>
        <div class="mb-2"><span class="text-muted">Command:</span> <code class="user-select-all"><?= e($cronCmd) ?></code></div>
        <div class="mb-2"><span class="text-muted">or URL (wget/curl):</span> <code class="user-select-all"><?= e($cronUrl) ?></code></div>
        <div class="text-muted">Last automatic run: <strong><?= e($cfg['last_run_at'] ?: 'never') ?></strong>. Each member gets at most one message per day per type.</div>
    </div>
</div>

<div class="gym-card">
    <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Recent Messages</h2></div>
    <div class="table-responsive"><table class="table gym-table mb-0">
        <thead><tr><th>Time</th><th>Member</th><th>Type</th><th>Phone</th><th>Status</th><th>Gateway response</th></tr></thead>
        <tbody>
        <?php if (!$logs): ?><tr><td colspan="6" class="text-center text-muted py-4">No messages sent yet.</td></tr><?php endif; ?>
        <?php foreach ($logs as $l): ?>
            <tr><td class="small font-mono"><?= e($l['created_at']) ?></td><td><?= e($l['full_name'] ?? '—') ?></td><td><?= e($l['kind']) ?></td><td class="font-mono small"><?= e($l['phone']) ?></td>
            <td><span class="badge text-bg-<?= $l['status'] === 'sent' ? 'success' : 'danger' ?>"><?= e($l['status']) ?></span></td><td class="small text-muted text-truncate" style="max-width:260px" title="<?= e($l['response']) ?>"><?= e(mb_substr((string)$l['response'], 0, 80)) ?></td></tr>
        <?php endforeach; ?>
        </tbody></table></div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
