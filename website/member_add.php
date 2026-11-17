<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(true);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();
$subInfo      = $currentAdmin['subscription'];

$plansStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE gym_id = :gid AND is_active = 1 ORDER BY duration_days ASC, id ASC');
$plansStmt->execute([':gid' => $gymId]);
$plans = $plansStmt->fetchAll();

$today       = date('Y-m-d');
$defaultPlan = $plans[0] ?? null;
$defaultExp  = $defaultPlan
    ? (new DateTimeImmutable($today))->modify('+' . (int)$defaultPlan['duration_days'] . ' days')->format('Y-m-d')
    : '';

$form = [
    'member_code'            => generate_member_code($pdo, $gymId),
    'full_name'              => '',
    'phone'                  => '',
    'email'                  => '',
    'gender'                 => '',
    'date_of_birth'          => '',
    'address'                => '',
    'emergency_contact'      => '',
    'joining_date'           => $today,
    'plan_id'                => $defaultPlan ? (string)$defaultPlan['id'] : '',
    'membership_start_date'  => $today,
    'membership_expiry_date' => $defaultExp,
    'status'                 => 'Active',
    'notes'                  => '',
];

$errors = [];
if ($subInfo && empty($subInfo['can_add_more_members'])) {
    $errors[] = sprintf('Member quota reached (%d/%d). Upgrade your Hemnity SaaS plan to register additional members.', (int)$subInfo['current_members'], (int)$subInfo['max_members']);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && empty($errors)) {
    verify_csrf();

    foreach ($form as $key => $_) {
        $form[$key] = ($key === 'address' || $key === 'notes')
            ? clean_str($_POST[$key] ?? '', 1000, true)
            : clean_str($_POST[$key] ?? '', 190);
    }

    if ($form['full_name'] === '' || strlen($form['full_name']) < 2) {
        $errors[] = 'Full name is required (minimum 2 characters).';
    }
    $digitsOnly = preg_replace('/\D+/', '', $form['phone']) ?? '';
    if (strlen($digitsOnly) < 7 || strlen($digitsOnly) > 15) {
        $errors[] = 'Please enter a valid phone number (7 to 15 digits).';
    }
    if ($form['email'] !== '' && !filter_var($form['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please enter a valid email address or leave it blank.';
    }
    if (!in_array($form['gender'], ['', 'Male', 'Female', 'Other', 'Prefer not to say'], true)) {
        $errors[] = 'Invalid gender selection.';
    }
    if ($form['date_of_birth'] !== '' && !is_valid_date($form['date_of_birth'])) {
        $errors[] = 'Date of birth must be a valid YYYY-MM-DD date.';
    }
    if (!is_valid_date($form['joining_date'])) {
        $errors[] = 'Joining date is required and must be valid.';
    }

    $selectedPlan = null;
    if ($form['plan_id'] !== '') {
        $pStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE id = :id AND gym_id = :gid LIMIT 1');
        $pStmt->execute([':id' => (int)$form['plan_id'], ':gid' => $gymId]);
        $selectedPlan = $pStmt->fetch() ?: null;
        if (!$selectedPlan) {
            $errors[] = 'Selected membership plan does not belong to your gym.';
        }
    }

    if ($selectedPlan) {
        if (!is_valid_date($form['membership_start_date']) || !is_valid_date($form['membership_expiry_date'])) {
            $errors[] = 'Membership start and expiry dates are required.';
        } elseif ($form['membership_expiry_date'] < $form['membership_start_date']) {
            $errors[] = 'Membership expiry date cannot be earlier than start date.';
        }
    }

    if (!in_array($form['status'], ['Active', 'Expired', 'Inactive'], true)) {
        $errors[] = 'Invalid membership status.';
    }

    $uploadedPhotoPath = null;
    if (!empty($_FILES['photo']) && ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $uploadResult = handle_image_upload($_FILES['photo'], 'members');
        if (!$uploadResult['ok']) {
            $errors[] = (string)$uploadResult['error'];
        } else {
            $uploadedPhotoPath = $uploadResult['path'];
        }
    }

    if (empty($errors)) {
        try {
            $pdo->beginTransaction();

            $memberCode = $form['member_code'] !== '' ? strtoupper($form['member_code']) : generate_member_code($pdo, $gymId);
            $dupStmt    = $pdo->prepare('SELECT 1 FROM members WHERE gym_id = :gid AND member_code = :code LIMIT 1');
            $dupStmt->execute([':gid' => $gymId, ':code' => $memberCode]);
            if ($dupStmt->fetchColumn()) {
                $memberCode = generate_member_code($pdo, $gymId);
            }

            $statusToSave = $form['status'];
            if ($statusToSave === 'Active' && $form['membership_expiry_date'] !== '' && $form['membership_expiry_date'] < $today) {
                $statusToSave = 'Expired';
            }

            $insertMember = $pdo->prepare(
                'INSERT INTO members (
                    gym_id, member_code, full_name, photo_path, phone, email, gender, date_of_birth,
                    address, emergency_contact, joining_date, plan_id,
                    membership_start_date, membership_expiry_date, status, notes
                ) VALUES (
                    :gid, :member_code, :full_name, :photo_path, :phone, :email, :gender, :dob,
                    :address, :emergency_contact, :joining_date, :plan_id,
                    :start_date, :expiry_date, :status, :notes
                )'
            );
            $insertMember->execute([
                ':gid'               => $gymId,
                ':member_code'       => $memberCode,
                ':full_name'         => $form['full_name'],
                ':photo_path'        => $uploadedPhotoPath,
                ':phone'             => $form['phone'],
                ':email'             => $form['email'] !== '' ? $form['email'] : null,
                ':gender'            => $form['gender'] !== '' ? $form['gender'] : null,
                ':dob'               => $form['date_of_birth'] !== '' ? $form['date_of_birth'] : null,
                ':address'           => $form['address'] !== '' ? $form['address'] : null,
                ':emergency_contact' => $form['emergency_contact'] !== '' ? $form['emergency_contact'] : null,
                ':joining_date'      => $form['joining_date'],
                ':plan_id'           => $selectedPlan ? (int)$selectedPlan['id'] : null,
                ':start_date'        => $selectedPlan ? $form['membership_start_date'] : null,
                ':expiry_date'       => $selectedPlan ? $form['membership_expiry_date'] : null,
                ':status'            => $statusToSave,
                ':notes'             => $form['notes'] !== '' ? $form['notes'] : null,
            ]);

            $newMemberId = (int)$pdo->lastInsertId();
            issue_member_qr_credential($pdo, $gymId, $newMemberId, (int)$currentAdmin['id']);

            if ($selectedPlan) {
                $histStatus = ($form['membership_expiry_date'] < $today) ? 'Expired' : 'Active';
                $pdo->prepare(
                    'INSERT INTO memberships (
                        gym_id, member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
                        start_date, expiry_date, action_type, status, notes, created_by
                    ) VALUES (
                        :gid, :member_id, :plan_id, :plan_name, :plan_price,
                        :start_date, :expiry_date, :action_type, :status, :notes, :created_by
                    )'
                )->execute([
                    ':gid'         => $gymId,
                    ':member_id'   => $newMemberId,
                    ':plan_id'     => (int)$selectedPlan['id'],
                    ':plan_name'   => (string)$selectedPlan['plan_name'],
                    ':plan_price'  => (string)$selectedPlan['price'],
                    ':start_date'  => $form['membership_start_date'],
                    ':expiry_date' => $form['membership_expiry_date'],
                    ':action_type' => 'Initial',
                    ':status'      => $histStatus,
                    ':notes'       => 'Initial plan assignment on member registration.',
                    ':created_by'  => (int)$currentAdmin['id'],
                ]);
            }

            $pdo->commit();
            log_audit_event($pdo, 'gym_owner', (int)$currentAdmin['id'], 'member.created', 'member', (string)$newMemberId, $gymId, ['member_code' => $memberCode]);
            set_flash('success', sprintf('Member %s (%s) registered with an active QR check-in pass.', $form['full_name'], $memberCode));
            redirect('member_view.php?id=' . $newMemberId);
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[Hemnity Add Member Error] ' . $ex->getMessage());
            $errors[] = 'Could not save member record. Please verify inputs and try again.';
        }
    }
}

$pageTitle   = 'Add Member';
$pageHeading = 'Add Member';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Register New Member</h1><p class="text-muted small mb-0">Creates member profile, initial plan history, and a revocable QR pass for <?= e($currentAdmin['gym_name']) ?>.</p></div>
    <a href="members.php" class="btn btn-light border">Back to Members</a>
</div>

<?php if (!empty($errors)): ?>
    <div class="alert alert-danger"><ul class="mb-0 ps-3 small"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div>
<?php endif; ?>

<form method="post" action="member_add.php" enctype="multipart/form-data" novalidate>
    <?= csrf_field() ?>
    <div class="row g-4">
        <div class="col-lg-8">
            <div class="gym-card mb-4">
                <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Personal &amp; Contact Information</h2></div>
                <div class="gym-card-body">
                    <div class="row g-3">
                        <div class="col-md-4"><label class="form-label fw-medium">Member ID</label><input type="text" class="form-control font-mono bg-light" name="member_code" value="<?= e($form['member_code']) ?>" readonly></div>
                        <div class="col-md-8"><label class="form-label fw-medium">Full Name *</label><input type="text" class="form-control" name="full_name" value="<?= e($form['full_name']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Phone Number *</label><input type="tel" class="form-control font-mono" name="phone" value="<?= e($form['phone']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Email Address</label><input type="email" class="form-control" name="email" value="<?= e($form['email']) ?>"></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Gender</label><select class="form-select" name="gender"><option value="">Optional...</option><?php foreach (['Male', 'Female', 'Other', 'Prefer not to say'] as $g): ?><option value="<?= e($g) ?>" <?= $form['gender'] === $g ? 'selected' : '' ?>><?= e($g) ?></option><?php endforeach; ?></select></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Date of Birth</label><input type="date" class="form-control font-mono" name="date_of_birth" value="<?= e($form['date_of_birth']) ?>"></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Joining Date *</label><input type="date" class="form-control font-mono" name="joining_date" value="<?= e($form['joining_date']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Emergency Contact</label><input type="text" class="form-control" name="emergency_contact" value="<?= e($form['emergency_contact']) ?>"></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Profile Photo (Optional)</label><input type="file" class="form-control" name="photo" accept=".jpg,.jpeg,.png,.webp"></div>
                        <div class="col-12"><label class="form-label fw-medium">Address</label><textarea class="form-control" name="address" rows="2"><?= e($form['address']) ?></textarea></div>
                        <div class="col-12"><label class="form-label fw-medium">Notes</label><textarea class="form-control" name="notes" rows="2"><?= e($form['notes']) ?></textarea></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="gym-card">
                <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Membership Assignment</h2></div>
                <div class="gym-card-body">
                    <div class="mb-3"><label class="form-label fw-medium">Plan</label><select class="form-select" name="plan_id" data-plan-selector><option value="">-- Unassigned --</option><?php foreach ($plans as $plan): ?><option value="<?= (int)$plan['id'] ?>" data-duration="<?= (int)$plan['duration_days'] ?>" data-price="<?= e($plan['price']) ?>" <?= (string)$form['plan_id'] === (string)$plan['id'] ? 'selected' : '' ?>><?= e($plan['plan_name']) ?> — <?= e(format_money($plan['price'])) ?></option><?php endforeach; ?></select></div>
                    <div class="mb-3"><label class="form-label fw-medium">Start Date</label><input type="date" class="form-control font-mono" name="membership_start_date" value="<?= e($form['membership_start_date']) ?>" data-start-date></div>
                    <div class="mb-3"><label class="form-label fw-medium">Expiry Date</label><input type="date" class="form-control font-mono" name="membership_expiry_date" value="<?= e($form['membership_expiry_date']) ?>" data-expiry-date></div>
                    <div class="mb-4"><label class="form-label fw-medium">Status</label><select class="form-select" name="status"><option value="Active" <?= $form['status'] === 'Active' ? 'selected' : '' ?>>Active</option><option value="Expired" <?= $form['status'] === 'Expired' ? 'selected' : '' ?>>Expired</option><option value="Inactive" <?= $form['status'] === 'Inactive' ? 'selected' : '' ?>>Inactive</option></select></div>
                    <div class="d-grid gap-2"><button type="submit" class="btn btn-gym-primary py-2" <?= ($subInfo && empty($subInfo['can_add_more_members'])) ? 'disabled' : '' ?>>Save Member Profile</button><a href="members.php" class="btn btn-light border">Cancel</a></div>
                </div>
            </div>
        </div>
    </div>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>
