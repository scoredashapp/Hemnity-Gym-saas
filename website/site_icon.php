<?php
declare(strict_types=1);

// Serves the Super Admin uploaded favicon (or logo) or a built-in default icon.
$GLOBALS['HEMNITY_NO_FILTER'] = true;
require_once __DIR__ . '/config.php';

$cfg  = [];
try {
    $cfg = get_platform_settings(db());
} catch (Throwable $e) {
    $cfg = [];
}

foreach (['favicon_path', 'site_logo_path'] as $key) {
    $rel = (string)($cfg[$key] ?? '');
    $abs = __DIR__ . '/' . $rel;
    if ($rel !== '' && str_starts_with($rel, 'uploads/') && is_file($abs)) {
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($abs) ?: 'image/png';
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=86400');
        readfile($abs);
        exit;
    }
}

header('Content-Type: image/svg+xml');
header('Cache-Control: public, max-age=86400');
echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#0c0e12"/><rect x="4" y="4" width="56" height="56" rx="11" fill="url(#g)"/><path d="M18 20v24M46 20v24M18 32h28" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/></svg>';
