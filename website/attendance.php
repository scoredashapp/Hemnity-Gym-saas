<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(false);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

$today = date('Y-m-d');
$nowHm = date('H:i');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    require_owner_tenant(true);
    $action = clean_str($_POST['action'] ?? '', 40);

    if ($action === 'qr_or_code_checkin') {
        $isAjax = ($_POST['ajax'] ?? '') === '1';
        $finish = static function (string $type, string $msg, ?array $member = null) use ($isAjax): never {
            if ($isAjax) {
                while (ob_get_level() > 0) { ob_end_clean(); }
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['type' => $type, 'message' => $msg, 'member' => $member], JSON_UNESCAPED_UNICODE);
                exit;
            }
            set_flash($type, $msg);
            redirect('attendance.php');
        };
        $scanInput = trim((string)($_POST['scan_payload'] ?? ''));
        if ($scanInput === '') {
            $finish('danger', 'Please scan a member QR pass or enter a Member ID.');
        }

        // Parse HEMNITY:QR:<gym_id>:<member_code>:<token> or raw token or member_code
        $token = $scanInput;
        if (str_starts_with($scanInput, 'HEMNITY:QR:')) {
            $parts = explode(':', $scanInput);
            $token = end($parts) ?: '';
        }

        $qrStmt = $pdo->prepare(
            'SELECT q.id AS qr_id, q.gym_id AS qr_gym_id, q.status AS qr_status, m.*
             FROM qr_credentials q
             INNER JOIN members m ON m.id = q.member_id
             WHERE q.credential_token = :tok
             LIMIT 1'
        );
        $qrStmt->execute([':tok' => $token]);
        $qrRow = $qrStmt->fetch();

        $targetMember = null;
        $qrCredId     = null;
        $methodLabel  = 'QR Scan';

        if ($qrRow) {
            if ((int)$qrRow['qr_gym_id'] !== $gymId) {
                log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'attendance.cross_tenant_qr_rejected', 'qr', $token, $gymId);
                $finish('danger', 'Security Alert: This QR pass belongs to a different gym workspace and was rejected.');
            }
            if ($qrRow['qr_status'] !== 'Active') {
                $finish('danger', 'This QR pass has been revoked. Please issue a new ID card pass for ' . $qrRow['full_name'] . '.');
            }
            $targetMember = $qrRow;
            $qrCredId     = (int)$qrRow['qr_id'];
        } else {
            // Fallback keyboard lookup by Member ID scoped strictly to $gymId
            $mStmt = $pdo->prepare('SELECT * FROM members WHERE gym_id = :gid AND UPPER(member_code) = :code LIMIT 1');
            $mStmt->execute([':gid' => $gymId, ':code' => strtoupper($scanInput)]);
            $targetMember = $mStmt->fetch() ?: null;
            $methodLabel  = 'Keyboard Code';
        }

        if (!$targetMember) {
            $finish('danger', 'No member or active QR token matched "' . $scanInput . '" in your gym.');
        }

        $_SESSION['last_verified_member_id'] = (int)$targetMember['id'];
        $memberCard = static fn(array $mm): array => [
            'name' => $mm['full_name'], 'code' => $mm['member_code'], 'status' => $mm['status'],
            'expiry' => $mm['membership_expiry_date'] ?? null,
            'photo' => (!empty($mm['photo_path']) && is_file(__DIR__ . '/' . $mm['photo_path'])) ? $mm['photo_path'] : null,
        ];

        $dupStmt = $pdo->prepare('SELECT check_in_time FROM attendance WHERE gym_id = :gid AND member_id = :mid AND attendance_date = :adate LIMIT 1');
        $dupStmt->execute([':gid' => $gymId, ':mid' => (int)$targetMember['id'], ':adate' => $today]);
        $existingTime = $dupStmt->fetchColumn();

        if ($existingTime !== false) {
            $finish('warning', sprintf('Already checked in today at %s: %s (%s).', substr((string)$existingTime, 0, 5), $targetMember['full_name'], $targetMember['member_code']), $memberCard($targetMember));
        } else {
            $pdo->prepare(
                'INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, qr_credential_id, remarks, recorded_by)
                 VALUES (:gid, :mid, :adate, :ctime, :method, :qrid, :remarks, :uid)'
            )->execute([
                ':gid' => $gymId, ':mid' => (int)$targetMember['id'], ':adate' => $today,
                ':ctime' => date('H:i:s'), ':method' => $methodLabel, ':qrid' => $qrCredId,
                ':remarks' => $methodLabel . ' front-desk verification', ':uid' => (int)$currentAdmin['id'],
            ]);
            $note = ($targetMember['status'] !== 'Active') ? ' [Member Status: ' . $targetMember['status'] . ']' : '';
            $finish('success', sprintf('%s check-in recorded for %s (%s).%s', $methodLabel, $targetMember['full_name'], $targetMember['member_code'], $note), $memberCard($targetMember));
        }
    } elseif ($action === 'check_in') {
        $memberId    = (int)($_POST['member_id'] ?? 0);
        $attDate     = clean_str($_POST['attendance_date'] ?? $today, 20);
        $checkInTime = normalize_time($_POST['check_in_time'] ?? $nowHm);
        $remarks     = clean_str($_POST['remarks'] ?? '', 255);

        $memStmt = $pdo->prepare('SELECT id, full_name, member_code, status FROM members WHERE id = :id AND gym_id = :gid LIMIT 1');
        $memStmt->execute([':id' => $memberId, ':gid' => $gymId]);
        $member = $memStmt->fetch();

        if (!$member) {
            set_flash('danger', 'Please select a valid member from your gym.');
        } elseif (!is_valid_date($attDate) || $checkInTime === null) {
            set_flash('danger', 'Please provide a valid check-in date and time.');
        } else {
            $dupStmt = $pdo->prepare('SELECT check_in_time FROM attendance WHERE gym_id = :gid AND member_id = :mid AND attendance_date = :adate LIMIT 1');
            $dupStmt->execute([':gid' => $gymId, ':mid' => $memberId, ':adate' => $attDate]);
            $existingTime = $dupStmt->fetchColumn();

            if ($existingTime !== false) {
                set_flash('warning', sprintf('Duplicate prevented: %s already checked in on %s at %s.', $member['full_name'], format_date($attDate), substr((string)$existingTime, 0, 5)));
            } else {
                $pdo->prepare('INSERT INTO attendance (gym_id, member_id, attendance_date, check_in_time, check_in_method, remarks, recorded_by) VALUES (:gid, :mid, :adate, :ctime, \'Manual\', :remarks, :uid)')
                    ->execute([':gid' => $gymId, ':mid' => $memberId, ':adate' => $attDate, ':ctime' => $checkInTime, ':remarks' => $remarks !== '' ? $remarks : null, ':uid' => (int)$currentAdmin['id']]);
                $_SESSION['last_verified_member_id'] = $memberId;
                set_flash('success', sprintf('Attendance marked for %s (%s).', $member['full_name'], $member['member_code']));
            }
        }
        redirect('attendance.php');
    } elseif ($action === 'correct') {
        $attId        = (int)($_POST['attendance_id'] ?? 0);
        $attDate      = clean_str($_POST['attendance_date'] ?? '', 20);
        $checkInTime  = normalize_time($_POST['check_in_time'] ?? '');
        $checkOutTime = ($_POST['check_out_time'] ?? '') !== '' ? normalize_time($_POST['check_out_time']) : null;
        $remarks      = clean_str($_POST['remarks'] ?? '', 255);

        if ($attId > 0 && is_valid_date($attDate) && $checkInTime !== null) {
            $pdo->prepare('UPDATE attendance SET attendance_date = :adate, check_in_time = :cin, check_out_time = :cout, remarks = :remarks WHERE id = :id AND gym_id = :gid')
                ->execute([':adate' => $attDate, ':cin' => $checkInTime, ':cout' => $checkOutTime, ':remarks' => $remarks !== '' ? $remarks : null, ':id' => $attId, ':gid' => $gymId]);
            set_flash('success', 'Attendance record corrected.');
        }
        redirect('attendance.php');
    } elseif ($action === 'delete') {
        $attId = (int)($_POST['attendance_id'] ?? 0);
        if ($attId > 0) {
            $pdo->prepare('DELETE FROM attendance WHERE id = :id AND gym_id = :gid')->execute([':id' => $attId, ':gid' => $gymId]);
            set_flash('success', 'Attendance entry removed.');
        }
        redirect('attendance.php');
    }
}

$preselectedMemberId = (int)($_GET['member_id'] ?? 0);
$editAttendanceId    = (int)($_GET['edit_id'] ?? 0);
$search              = clean_str($_GET['q'] ?? '', 100);
$dateFrom            = clean_str($_GET['from'] ?? $today, 20);
$dateTo              = clean_str($_GET['to'] ?? $today, 20);

$membersListStmt = $pdo->prepare("SELECT id, member_code, full_name, status FROM members WHERE gym_id = :gid AND status != 'Inactive' ORDER BY full_name ASC");
$membersListStmt->execute([':gid' => $gymId]);
$membersList = $membersListStmt->fetchAll();

$todayCountStmt = $pdo->prepare('SELECT COUNT(*) FROM attendance WHERE gym_id = :gid AND attendance_date = :today');
$todayCountStmt->execute([':gid' => $gymId, ':today' => $today]);
$todayCount = (int)$todayCountStmt->fetchColumn();

$lastVerified = null;
if (!empty($_SESSION['last_verified_member_id'])) {
    $lvStmt = $pdo->prepare('SELECT m.*, p.plan_name FROM members m LEFT JOIN membership_plans p ON p.id = m.plan_id WHERE m.id = :id AND m.gym_id = :gid LIMIT 1');
    $lvStmt->execute([':id' => (int)$_SESSION['last_verified_member_id'], ':gid' => $gymId]);
    $lastVerified = $lvStmt->fetch() ?: null;
}

$editingRow = null;
if ($editAttendanceId > 0) {
    $eStmt = $pdo->prepare('SELECT a.*, m.full_name, m.member_code FROM attendance a INNER JOIN members m ON m.id = a.member_id WHERE a.id = :id AND a.gym_id = :gid LIMIT 1');
    $eStmt->execute([':id' => $editAttendanceId, ':gid' => $gymId]);
    $editingRow = $eStmt->fetch() ?: null;
}

$where  = ['a.gym_id = :gid'];
$params = [':gid' => $gymId];
if ($search !== '') {
    $where[]       = '(m.full_name LIKE :q1 OR m.member_code LIKE :q2 OR m.phone LIKE :q3)';
    $like          = '%' . $search . '%';
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
}
if (is_valid_date($dateFrom)) {
    $where[]         = 'a.attendance_date >= :from';
    $params[':from'] = $dateFrom;
}
if (is_valid_date($dateTo)) {
    $where[]       = 'a.attendance_date <= :to';
    $params[':to'] = $dateTo;
}

$whereSql = 'WHERE ' . implode(' AND ', $where);
$listStmt = $pdo->prepare(
    "SELECT a.*, m.full_name, m.member_code, m.phone, m.status AS member_status
     FROM attendance a INNER JOIN members m ON m.id = a.member_id {$whereSql}
     ORDER BY a.attendance_date DESC, a.check_in_time DESC, a.id DESC LIMIT 40"
);
foreach ($params as $k => $v) {
    $listStmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
}
$listStmt->execute();
$attendanceRows = $listStmt->fetchAll();

$pageTitle   = 'QR Attendance';
$pageHeading = 'QR & Front-Desk Attendance';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div><h1 class="h4 fw-bold mb-1">QR &amp; Daily Attendance Desk</h1><p class="text-muted small mb-0">Verify member QR tokens or Member IDs with photo inspection.</p></div>
    <div class="px-3 py-2 bg-white border rounded-3"><span class="small text-muted me-2">Today's Check-Ins:</span><strong class="font-mono fs-5"><?= $todayCount ?></strong></div>
</div>

<div class="row g-4">
    <div class="col-lg-4">
        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0"><i class="bi bi-camera-video me-1"></i>Scan with Phone Camera</h2></div>
            <div class="gym-card-body">
                <div id="camReader" class="rounded-3 overflow-hidden bg-dark mb-2" style="min-height:0;"></div>
                <div id="camResult" class="small mb-2" aria-live="polite"></div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-gym-primary flex-fill" id="camStart"><i class="bi bi-qr-code-scan me-1"></i>Start Camera Scan</button>
                    <button type="button" class="btn btn-light border d-none" id="camStop">Stop</button>
                </div>
                <div class="form-text mt-2">Allow camera permission when asked. Point at the member's QR card — attendance is marked instantly. Works on any phone browser over HTTPS.</div>
            </div>
        </div>

        <div class="gym-card mb-4">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0"><i class="bi bi-qr-code-scan me-1"></i>QR Token / Keyboard Scan</h2></div>
            <div class="gym-card-body">
                <form method="post" action="attendance.php">
                    <?= csrf_field() ?><input type="hidden" name="action" value="qr_or_code_checkin">
                    <div class="mb-3">
                        <label for="scan_payload" class="form-label small fw-medium">Scan QR Token or Type Member ID</label>
                        <input type="text" class="form-control font-mono" id="scan_payload" name="scan_payload" placeholder="HQR-... or GYM-2026-0001" autofocus required>
                    </div>
                    <button type="submit" class="btn btn-gym-primary w-100">Verify &amp; Check In</button>
                </form>

                <?php if ($lastVerified): ?>
                    <div class="mt-3 pt-3 border-top d-flex align-items-center gap-3">
                        <?php if (!empty($lastVerified['photo_path']) && is_file(__DIR__ . '/' . $lastVerified['photo_path'])): ?>
                            <img src="<?= e($lastVerified['photo_path']) ?>" alt="<?= e($lastVerified['full_name']) ?>" class="gym-avatar">
                        <?php else: ?>
                            <span class="gym-avatar"><?= e(strtoupper(substr($lastVerified['full_name'], 0, 1))) ?></span>
                        <?php endif; ?>
                        <div class="small min-w-0">
                            <div class="fw-bold text-truncate"><?= e($lastVerified['full_name']) ?></div>
                            <div class="font-mono text-muted"><?= e($lastVerified['member_code']) ?> &middot; <?= e($lastVerified['status']) ?></div>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </div>

        <?php if ($editingRow): ?>
            <div class="gym-card mb-4">
                <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Correct Record</h2><a href="attendance.php" class="btn btn-sm btn-light border">Cancel</a></div>
                <div class="gym-card-body">
                    <form method="post" action="attendance.php">
                        <?= csrf_field() ?><input type="hidden" name="action" value="correct"><input type="hidden" name="attendance_id" value="<?= (int)$editingRow['id'] ?>">
                        <div class="mb-2"><label class="form-label small">Date</label><input type="date" class="form-control font-mono" name="attendance_date" value="<?= e($editingRow['attendance_date']) ?>" required></div>
                        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label small">In</label><input type="time" class="form-control font-mono" name="check_in_time" value="<?= e(substr((string)$editingRow['check_in_time'], 0, 5)) ?>" required></div><div class="col-6"><label class="form-label small">Out</label><input type="time" class="form-control font-mono" name="check_out_time" value="<?= e($editingRow['check_out_time'] ? substr((string)$editingRow['check_out_time'], 0, 5) : '') ?>"></div></div>
                        <div class="mb-3"><label class="form-label small">Remarks</label><input type="text" class="form-control" name="remarks" value="<?= e($editingRow['remarks'] ?? '') ?>"></div>
                        <button type="submit" class="btn btn-gym-primary w-100">Save Correction</button>
                    </form>
                </div>
            </div>
        <?php endif; ?>

        <div class="gym-card">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Manual Roster Check-In</h2></div>
            <div class="gym-card-body">
                <form method="post" action="attendance.php">
                    <?= csrf_field() ?><input type="hidden" name="action" value="check_in">
                    <div class="mb-2"><label class="form-label small fw-medium">Member</label><select class="form-select" name="member_id" required><option value="">-- Choose Member --</option><?php foreach ($membersList as $m): ?><option value="<?= (int)$m['id'] ?>" <?= $preselectedMemberId === (int)$m['id'] ? 'selected' : '' ?>><?= e($m['full_name']) ?> (<?= e($m['member_code']) ?>)</option><?php endforeach; ?></select></div>
                    <div class="row g-2 mb-2"><div class="col-7"><label class="form-label small">Date</label><input type="date" class="form-control font-mono" name="attendance_date" value="<?= e($today) ?>" required></div><div class="col-5"><label class="form-label small">Time</label><input type="time" class="form-control font-mono" name="check_in_time" value="<?= e($nowHm) ?>" required></div></div>
                    <div class="mb-3"><label class="form-label small">Remarks</label><input type="text" class="form-control" name="remarks"></div>
                    <button type="submit" class="btn btn-gym-dark w-100">Record Check-In</button>
                </form>
            </div>
        </div>
    </div>

    <div class="col-lg-8">
        <div class="gym-card mb-4"><div class="gym-card-body py-3">
            <form method="get" action="attendance.php" class="row g-2 align-items-end">
                <div class="col-sm-4"><label class="form-label small text-muted mb-1">Member Search</label><input type="text" class="form-control" name="q" value="<?= e($search) ?>" placeholder="Name / ID..."></div>
                <div class="col-6 col-sm-3"><label class="form-label small text-muted mb-1">From</label><input type="date" class="form-control font-mono" name="from" value="<?= e($dateFrom) ?>"></div>
                <div class="col-6 col-sm-3"><label class="form-label small text-muted mb-1">To</label><input type="date" class="form-control font-mono" name="to" value="<?= e($dateTo) ?>"></div>
                <div class="col-sm-2 d-flex gap-1"><button type="submit" class="btn btn-gym-dark flex-fill">Filter</button><a href="attendance.php?from=&amp;to=" class="btn btn-light border">All</a></div>
            </form>
        </div></div>

        <div class="gym-card">
            <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Attendance Log (<?= count($attendanceRows) ?>)</h2></div>
            <div class="table-responsive"><table class="table gym-table">
                <thead><tr><th>Member</th><th>Date</th><th>In</th><th>Method</th><th>Remarks</th><th class="text-end">Actions</th></tr></thead>
                <tbody>
                    <?php if (empty($attendanceRows)): ?><tr><td colspan="6" class="text-center py-5 text-muted">No attendance records found.</td></tr>
                    <?php else: foreach ($attendanceRows as $att): ?>
                        <tr>
                            <td><a href="member_view.php?id=<?= (int)$att['member_id'] ?>" class="fw-semibold text-dark text-decoration-none"><?= e($att['full_name']) ?></a><div class="small text-muted font-mono"><?= e($att['member_code']) ?></div></td>
                            <td class="font-mono small"><?= e(format_date($att['attendance_date'])) ?></td>
                            <td class="font-mono small fw-semibold"><?= e(substr((string)$att['check_in_time'], 0, 5)) ?></td>
                            <td class="small"><?= e($att['check_in_method'] ?? 'Manual') ?></td>
                            <td class="small text-muted"><?= e($att['remarks'] ?: '—') ?></td>
                            <td class="text-end text-nowrap">
                                <a href="attendance.php?<?= e(http_build_query(['edit_id' => (int)$att['id'], 'q' => $search, 'from' => $dateFrom, 'to' => $dateTo])) ?>" class="btn btn-sm btn-light border">Edit</a>
                                <form method="post" action="attendance.php" class="d-inline m-0" data-confirm="Remove check-in?"><?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="attendance_id" value="<?= (int)$att['id'] ?>"><button type="submit" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button></form>
                            </td>
                        </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table></div>
        </div>
    </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
<script>
(function () {
    var csrf = <?= json_encode(csrf_token()) ?>;
    var reader = null, busy = false, lastText = '', lastAt = 0;
    var startBtn = document.getElementById('camStart'), stopBtn = document.getElementById('camStop'), out = document.getElementById('camResult');
    function show(type, msg, m) {
        var cls = type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'danger');
        var photo = m && m.photo ? '<img src="' + m.photo + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover" class="me-2">' : '';
        out.innerHTML = '<div class="alert alert-' + cls + ' d-flex align-items-center py-2 mb-0">' + photo + '<div>' + msg.replace(/</g, '&lt;') + '</div></div>';
        if (navigator.vibrate) navigator.vibrate(type === 'success' ? 80 : [60, 40, 60]);
    }
    function onScan(text) {
        var now = Date.now();
        if (busy || (text === lastText && now - lastAt < 4000)) return;
        busy = true; lastText = text; lastAt = now;
        var fd = new FormData();
        fd.append('csrf_token', csrf); fd.append('_csrf', csrf); fd.append('action', 'qr_or_code_checkin'); fd.append('ajax', '1'); fd.append('scan_payload', text);
        fetch('attendance', { method: 'POST', body: fd, credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (j) { show(j.type, j.message, j.member); })
            .catch(function () { show('danger', 'Network error — try again.'); })
            .finally(function () { setTimeout(function () { busy = false; }, 1800); });
    }
    function stop() {
        if (!reader) return;
        reader.stop().catch(function () {}).then(function () { reader.clear(); reader = null; startBtn.classList.remove('d-none'); stopBtn.classList.add('d-none'); document.getElementById('camReader').style.minHeight = '0'; });
    }
    startBtn.addEventListener('click', function () {
        if (typeof Html5Qrcode === 'undefined') { show('danger', 'Scanner library failed to load. Check internet connection.'); return; }
        document.getElementById('camReader').style.minHeight = '260px';
        reader = new Html5Qrcode('camReader');
        reader.start({ facingMode: 'environment' }, { fps: 10, qrbox: function (w, h) { var s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } }, onScan, function () {})
            .then(function () { startBtn.classList.add('d-none'); stopBtn.classList.remove('d-none'); out.innerHTML = ''; })
            .catch(function (err) { reader = null; document.getElementById('camReader').style.minHeight = '0'; show('danger', 'Camera could not start: ' + err + '. Allow camera permission and use HTTPS.'); });
    });
    stopBtn.addEventListener('click', stop);
})();
</script>
<?php require __DIR__ . '/includes/footer.php'; ?>
