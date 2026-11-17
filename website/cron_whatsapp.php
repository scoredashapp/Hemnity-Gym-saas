<?php
declare(strict_types=1);

// Daily WhatsApp expiry reminders. Run from cPanel cron:
//   /usr/local/bin/php /home/USER/public_html/cron_whatsapp.php
// or via URL: https://your-domain/cron_whatsapp?key=<token shown on the WhatsApp page>
$GLOBALS['HEMNITY_NO_FILTER'] = true;
require_once __DIR__ . '/config.php';

if (PHP_SAPI !== 'cli') {
    $key = (string)($_GET['key'] ?? '');
    if (!hash_equals(hemnity_cron_token(), $key)) {
        http_response_code(403);
        header('Content-Type: text/plain');
        exit("Forbidden\n");
    }
    header('Content-Type: text/plain; charset=utf-8');
}

set_time_limit(600);
$pdo = db();
sync_expired_memberships($pdo);
$r = whatsapp_run_daily($pdo);
echo date('c') . ' ' . json_encode($r) . "\n";
