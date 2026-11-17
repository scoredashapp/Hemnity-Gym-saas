<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$gymSettings  = get_gym_settings($pdo, $gymId);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);
    $memberId = (int)($_POST['member_id'] ?? 0);
    if ($memberId > 0) {
        $chk = $pdo->prepare('SELECT id, full_name FROM members WHERE id = :id AND gym_id = :gid LIMIT 1');
        $chk->execute([':id' => $memberId, ':gid' => $gymId]);
        $m = $chk->fetch();
        if ($m) {
            issue_member_qr_credential($pdo, $gymId, $memberId, (int)$currentAdmin['id']);
            log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'qr.reissued', 'member', (string)$memberId, $gymId);
            set_flash('success', 'Old QR pass revoked and new cryptographic QR pass issued for ' . $m['full_name'] . '.');
        }
    }
    redirect('id_cards.php' . ($memberId > 0 ? '?member_id=' . $memberId : ''));
}

$filterMemberId = (int)($_GET['member_id'] ?? 0);
$search         = clean_str($_GET['q'] ?? '', 80);
$statusFilter   = clean_str($_GET['status'] ?? '', 20);
$where  = ['m.gym_id = :gid'];
$params = [':gid' => $gymId];
if ($filterMemberId > 0) { $where[] = 'm.id = :mid'; $params[':mid'] = $filterMemberId; }
if ($search !== '') {
    $where[] = '(m.full_name LIKE :q1 OR m.member_code LIKE :q2 OR m.phone LIKE :q3)';
    $params[':q1'] = $params[':q2'] = $params[':q3'] = '%' . $search . '%';
}
if (in_array($statusFilter, ['Active', 'Expired', 'Inactive'], true)) { $where[] = 'm.status = :st'; $params[':st'] = $statusFilter; }
$stmt = $pdo->prepare(
    "SELECT m.*, p.plan_name,
            (SELECT q.credential_token FROM qr_credentials q WHERE q.member_id = m.id AND q.gym_id = m.gym_id AND q.status = 'Active' ORDER BY q.id DESC LIMIT 1) AS qr_token
     FROM members m
     LEFT JOIN membership_plans p ON p.id = m.plan_id
     WHERE " . implode(' AND ', $where) . "
     ORDER BY m.id DESC LIMIT 300"
);
$stmt->execute($params);
$members = $stmt->fetchAll();

foreach ($members as &$m) {
    if (empty($m['qr_token'])) {
        $m['qr_token'] = issue_member_qr_credential($pdo, $gymId, (int)$m['id'], (int)$currentAdmin['id']);
    }
}
unset($m);

$accent  = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($gymSettings['id_card_accent_color'] ?? '')) ? $gymSettings['id_card_accent_color'] : '#ea580c';
$logoUrl = (!empty($gymSettings['logo_path']) && is_file(__DIR__ . '/' . $gymSettings['logo_path'])) ? $gymSettings['logo_path'] : null;

$pageTitle   = 'ID Cards & QR Passes';
$pageHeading = 'Printable Member ID Cards';
require __DIR__ . '/includes/header.php';
?>
<style>
    :root { --card-accent: <?= e($accent) ?>; }
    .idc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 22px; }
    .idc-wrap { background: #fff; border: 1px solid var(--gym-border, #e5e7eb); border-radius: 14px; padding: 12px; }
    .idc-wrap.selected { outline: 3px solid var(--card-accent); }
    .idc-pair { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .idc, .idc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    .idc { width: 85.6mm; height: 54mm; border-radius: 3.2mm; overflow: hidden; position: relative; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); flex: 0 0 auto; }
    .idc-front { background: linear-gradient(135deg, #0b0b12 0%, #1f2937 55%, var(--card-accent) 140%); }
    .idc-front::before { content: ''; position: absolute; right: -14mm; top: -14mm; width: 42mm; height: 42mm; border-radius: 50%; background: var(--card-accent); opacity: .85; }
    .idc-front::after { content: ''; position: absolute; left: -10mm; bottom: -16mm; width: 36mm; height: 36mm; border-radius: 50%; background: rgba(255,255,255,.07); }
    .idc-top { position: relative; z-index: 2; display: flex; align-items: center; gap: 2.2mm; padding: 3mm 4mm 0; }
    .idc-logo { width: 9mm; height: 9mm; border-radius: 2mm; background: #fff; object-fit: cover; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--card-accent); font-size: 14pt; }
    .idc-gym { font-weight: 800; font-size: 9.5pt; line-height: 1.1; text-transform: uppercase; letter-spacing: .02em; text-shadow: 0 1px 2px rgba(0,0,0,.35); max-width: 52mm; }
    .idc-tag { font-size: 5.6pt; letter-spacing: .18em; opacity: .9; font-weight: 700; }
    .idc-mid { position: relative; z-index: 2; display: flex; gap: 3.5mm; padding: 3mm 4mm 0; align-items: flex-start; }
    .idc-photo { width: 21mm; height: 26mm; border-radius: 2.4mm; background: #fff; border: 0.7mm solid #fff; object-fit: cover; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; color: var(--card-accent); font-size: 22pt; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
    .idc-info { min-width: 0; flex: 1; }
    .idc-name { font-weight: 800; font-size: 11pt; line-height: 1.15; word-break: break-word; }
    .idc-id { font-family: 'JetBrains Mono', monospace; font-size: 7pt; color: #fed7aa; margin: .6mm 0 1.6mm; letter-spacing: .04em; font-weight: 700; }
    .idc-row { font-size: 6.6pt; line-height: 1.45; opacity: .95; }
    .idc-row b { color: #fff; }
    .idc-qr { position: absolute; z-index: 3; right: 3.2mm; bottom: 3mm; background: #fff; padding: 1mm; border-radius: 1.8mm; width: 20mm; height: 20mm; display: flex; align-items: center; justify-content: center; }
    .idc-qr svg, .idc-qr img { width: 100% !important; height: 100% !important; }
    .idc-status { position: absolute; z-index: 3; left: 4mm; bottom: 3mm; font-size: 6pt; font-weight: 800; letter-spacing: .1em; padding: .7mm 2.4mm; border-radius: 10mm; text-transform: uppercase; }
    .idc-status.Active { background: #22c55e; color: #052e16; }
    .idc-status.Expired { background: #ef4444; color: #fff; }
    .idc-status.Inactive { background: #9ca3af; color: #111; }
    .idc-back { background: #fff; color: #111827; border: 0.3mm solid #e5e7eb; }
    .idc-back .idc-bar { height: 9mm; background: linear-gradient(90deg, #0b0b12, var(--card-accent)); color: #fff; display: flex; align-items: center; padding: 0 4mm; font-weight: 800; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; }
    .idc-back .idc-bbody { padding: 2.4mm 4mm; font-size: 6.4pt; line-height: 1.5; }
    .idc-back .idc-bbody li { margin-bottom: .7mm; }
    .idc-back .idc-strip { position: absolute; left: 0; right: 0; bottom: 0; height: 5.5mm; background: var(--card-accent); color: #fff; font-size: 6pt; font-weight: 700; display: flex; align-items: center; justify-content: center; letter-spacing: .06em; }
    .idc-sel { position: absolute; top: 6px; left: 6px; z-index: 5; }
    .idc-wrap { position: relative; }

    @media print {
        @page { size: A4; margin: 8mm; }
        body.gym-body { background: #fff !important; }
        .idc-grid { display: block; }
        .idc-wrap { border: none !important; padding: 0 !important; margin: 0 0 5mm !important; break-inside: avoid; page-break-inside: avoid; outline: none !important; }
        .idc-pair { justify-content: flex-start; gap: 6mm; flex-wrap: nowrap; }
        .idc { box-shadow: none; }
        .idc-wrap.skip-print { display: none !important; }
        .idc-sel, .idc-actions { display: none !important; }
        body.print-fronts-only .idc-back { display: none !important; }
    }
</style>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 no-print">
    <div><h1 class="h4 fw-bold mb-1">Member ID Cards &amp; QR Passes</h1><p class="text-muted small mb-0">Full-colour photo ID cards (CR80). Print one card, a selection, or the whole batch.</p></div>
    <div class="d-flex flex-wrap gap-2">
        <?php if ($filterMemberId > 0): ?><a href="id_cards.php" class="btn btn-light border btn-sm">Show All Members</a><?php endif; ?>
        <button type="button" class="btn btn-gym-dark btn-sm" id="btnPrintSelected"><i class="bi bi-check2-square me-1"></i>Print Selected (<span id="selCount">0</span>)</button>
        <button type="button" class="btn btn-gym-primary btn-sm" id="btnPrintAll"><i class="bi bi-printer me-1"></i>Print All Shown (<?= count($members) ?>)</button>
    </div>
</div>

<form method="get" action="id_cards.php" class="gym-card mb-3 no-print"><div class="gym-card-body py-3">
    <div class="row g-2 align-items-end">
        <div class="col-sm-5"><label class="form-label small text-muted mb-1">Search</label><input type="text" class="form-control" name="q" value="<?= e($search) ?>" placeholder="Name / Member ID / phone"></div>
        <div class="col-6 col-sm-3"><label class="form-label small text-muted mb-1">Status</label><select class="form-select" name="status"><option value="">All</option><?php foreach (['Active','Expired','Inactive'] as $st): ?><option value="<?= $st ?>" <?= $statusFilter === $st ? 'selected' : '' ?>><?= $st ?></option><?php endforeach; ?></select></div>
        <div class="col-6 col-sm-4 d-flex gap-2 align-items-center">
            <button class="btn btn-gym-dark flex-fill">Filter</button>
            <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="optBack" checked><label class="form-check-label small" for="optBack">Back side</label></div>
        </div>
    </div>
    <div class="mt-2"><label class="small"><input type="checkbox" id="selAll" class="form-check-input me-1">Select all shown</label></div>
</div></form>

<?php if (empty($members)): ?>
    <div class="gym-card p-5 text-center text-muted no-print">No members match. <a href="member_add.php">Add a member</a> first.</div>
<?php endif; ?>

<div class="idc-grid" id="idcGrid">
<?php foreach ($members as $m):
    $qrPayload = 'HEMNITY:QR:' . $gymId . ':' . $m['member_code'] . ':' . $m['qr_token'];
    $hasPhoto  = !empty($m['photo_path']) && is_file(__DIR__ . '/' . $m['photo_path']);
    $status    = in_array($m['status'], ['Active', 'Expired', 'Inactive'], true) ? $m['status'] : 'Active';
?>
    <div class="idc-wrap" data-id="<?= (int)$m['id'] ?>">
        <input type="checkbox" class="form-check-input idc-sel" aria-label="Select <?= e($m['full_name']) ?>">
        <div class="idc-pair">
            <div class="idc idc-front">
                <div class="idc-top">
                    <?php if ($logoUrl): ?><img class="idc-logo" src="<?= e($logoUrl) ?>" alt=""><?php else: ?><div class="idc-logo"><?= e(strtoupper(substr((string)$gymSettings['gym_name'], 0, 1))) ?></div><?php endif; ?>
                    <div><div class="idc-gym"><?= e($gymSettings['gym_name']) ?></div><div class="idc-tag">MEMBER ID CARD</div></div>
                </div>
                <div class="idc-mid">
                    <?php if ($hasPhoto): ?><img class="idc-photo" src="<?= e($m['photo_path']) ?>" alt="<?= e($m['full_name']) ?>"><?php else: ?><div class="idc-photo"><?= e(strtoupper(substr((string)$m['full_name'], 0, 1))) ?></div><?php endif; ?>
                    <div class="idc-info">
                        <div class="idc-name"><?= e($m['full_name']) ?></div>
                        <div class="idc-id"><?= e($m['member_code']) ?></div>
                        <div class="idc-row">Plan: <b><?= e($m['plan_name'] ?? 'Unassigned') ?></b></div>
                        <div class="idc-row">Joined: <b><?= e(format_date($m['joining_date'] ?? null)) ?></b></div>
                        <?php if (!empty($gymSettings['id_card_show_expiry'])): ?><div class="idc-row">Valid till: <b><?= e(format_date($m['membership_expiry_date'])) ?></b></div><?php endif; ?>
                        <div class="idc-row">Phone: <b><?= e($m['phone']) ?></b></div>
                    </div>
                </div>
                <div class="idc-status <?= e($status) ?>"><?= e($status) ?></div>
                <div class="idc-qr" data-qr-value="<?= e($qrPayload) ?>" data-qr-size="96"></div>
            </div>
            <div class="idc idc-back">
                <div class="idc-bar"><?= e($gymSettings['gym_name']) ?></div>
                <div class="idc-bbody">
                    <ul class="ps-3 mb-1">
                        <li>This card is non-transferable and must be shown at the front desk.</li>
                        <li>Scan the QR code at reception to mark attendance.</li>
                        <li>Report a lost card immediately — it will be deactivated.</li>
                    </ul>
                    <?php if (!empty($gymSettings['address'])): ?><div><b>Address:</b> <?= e($gymSettings['address']) ?></div><?php endif; ?>
                    <div><b>Contact:</b> <?= e($gymSettings['contact_number'] ?? '') ?></div>
                    <?php if (!empty($gymSettings['operating_hours'])): ?><div><b>Hours:</b> <?= e($gymSettings['operating_hours']) ?></div><?php endif; ?>
                </div>
                <div class="idc-strip"><?= e($m['member_code']) ?> &nbsp;•&nbsp; Powered by <?= e($platformCfg['brand_name'] ?? 'Hemnity') ?></div>
            </div>
        </div>
        <div class="idc-actions d-flex align-items-center justify-content-between gap-2 mt-2 no-print">
            <button type="button" class="btn btn-sm btn-gym-primary js-print-one"><i class="bi bi-printer me-1"></i>Print This Card</button>
            <form method="post" action="id_cards.php" class="m-0" data-confirm="Revoke current QR pass and issue a new token for <?= e($m['full_name']) ?>?">
                <?= csrf_field() ?><input type="hidden" name="member_id" value="<?= (int)$m['id'] ?>">
                <button type="submit" class="btn btn-sm btn-outline-danger">Revoke &amp; Reissue</button>
            </form>
        </div>
    </div>
<?php endforeach; ?>
</div>

<script>
(function () {
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.idc-wrap'));
    var selCount = document.getElementById('selCount');
    function refresh() {
        var n = 0;
        wraps.forEach(function (w) { var on = w.querySelector('.idc-sel').checked; w.classList.toggle('selected', on); if (on) n++; });
        selCount.textContent = n;
    }
    function printWraps(list) {
        if (!list.length) { alert('Please select at least one card.'); return; }
        wraps.forEach(function (w) { w.classList.toggle('skip-print', list.indexOf(w) === -1); });
        document.body.classList.toggle('print-fronts-only', !document.getElementById('optBack').checked);
        var cleanup = function () { wraps.forEach(function (w) { w.classList.remove('skip-print'); }); window.removeEventListener('afterprint', cleanup); };
        window.addEventListener('afterprint', cleanup);
        window.print();
    }
    wraps.forEach(function (w) { w.querySelector('.idc-sel').addEventListener('change', refresh); w.querySelector('.js-print-one').addEventListener('click', function () { printWraps([w]); }); });
    document.getElementById('selAll').addEventListener('change', function (e) { wraps.forEach(function (w) { w.querySelector('.idc-sel').checked = e.target.checked; }); refresh(); });
    document.getElementById('btnPrintSelected').addEventListener('click', function () { printWraps(wraps.filter(function (w) { return w.querySelector('.idc-sel').checked; })); });
    document.getElementById('btnPrintAll').addEventListener('click', function () { printWraps(wraps); });
    document.getElementById('optBack').addEventListener('change', function (e) { document.querySelectorAll('.idc-back').forEach(function (b) { b.style.display = e.target.checked ? '' : 'none'; }); });
})();
</script>
<?php require __DIR__ . '/includes/footer.php'; ?>
