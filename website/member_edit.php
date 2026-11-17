<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$currentAdmin = require_owner_tenant(true);
$gymId        = (int)$currentAdmin['gym_id'];
$pdo          = db();

$memberId = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
if ($memberId <= 0) {
    redirect('members.php');
}

$stmt = $pdo->prepare('SELECT * FROM members WHERE id = :id AND gym_id = :gid LIMIT 1');
$stmt->execute([':id' => $memberId, ':gid' => $gymId]);
$member = $stmt->fetch();

if (!$member) {
    set_flash('danger', 'Member not found in your gym workspace.');
    redirect('members.php');
}

$plansStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price, is_active FROM membership_plans WHERE gym_id = :gid ORDER BY is_active DESC, duration_days ASC');
$plansStmt->execute([':gid' => $gymId]);
$plans = $plansStmt->fetchAll();

$form = [
    'full_name'              => (string)$member['full_name'],
    'phone'                  => (string)$member['phone'],
    'email'                  => (string)($member['email'] ?? ''),
    'gender'                 => (string)($member['gender'] ?? ''),
    'date_of_birth'          => (string)($member['date_of_birth'] ?? ''),
    'address'                => (string)($member['address'] ?? ''),
    'emergency_contact'      => (string)($member['emergency_contact'] ?? ''),
    'joining_date'           => (string)$member['joining_date'],
    'plan_id'                => (string)($member['plan_id'] ?? ''),
    'membership_start_date'  => (string)($member['membership_start_date'] ?? ''),
    'membership_expiry_date' => (string)($member['membership_expiry_date'] ?? ''),
    'status'                 => (string)$member['status'],
    'notes'                  => (string)($member['notes'] ?? ''),
];

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    foreach ($form as $key => $_) {
        $form[$key] = ($key === 'address' || $key === 'notes')
            ? clean_str($_POST[$key] ?? '', 1000, true)
            : clean_str($_POST[$key] ?? '', 190);
    }

    if ($form['full_name'] === '' || strlen($form['full_name']) < 2) {
        $errors[] = 'Full name is required.';
    }
    $digitsOnly = preg_replace('/\D+/', '', $form['phone']) ?? '';
    if (strlen($digitsOnly) < 7 || strlen($digitsOnly) > 15) {
        $errors[] = 'Please enter a valid phone number.';
    }
    if ($form['email'] !== '' && !filter_var($form['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please enter a valid email address.';
    }
    if ($form['date_of_birth'] !== '' && !is_valid_date($form['date_of_birth'])) {
        $errors[] = 'Invalid date of birth.';
    }
    if (!is_valid_date($form['joining_date'])) {
        $errors[] = 'Valid joining date is required.';
    }

    $selectedPlan = null;
    if ($form['plan_id'] !== '') {
        $pStmt = $pdo->prepare('SELECT id, plan_name, duration_days, price FROM membership_plans WHERE id = :id AND gym_id = :gid LIMIT 1');
        $pStmt->execute([':id' => (int)$form['plan_id'], ':gid' => $gymId]);
        $selectedPlan = $pStmt->fetch() ?: null;
        if (!$selectedPlan) {
            $errors[] = 'Selected membership plan is invalid for this gym.';
        }
    }

    if ($selectedPlan) {
        if (!is_valid_date($form['membership_start_date']) || !is_valid_date($form['membership_expiry_date'])) {
            $errors[] = 'Valid start and expiry dates are required.';
        } elseif ($form['membership_expiry_date'] < $form['membership_start_date']) {
            $errors[] = 'Expiry date cannot be earlier than start date.';
        }
    }

    $photoPath = $member['photo_path'];
    if (!empty($_POST['remove_photo'])) {
        $photoPath = null;
    }
    if (!empty($_FILES['photo']) && ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $uploadResult = handle_image_upload($_FILES['photo'], 'members');
        if (!$uploadResult['ok']) {
            $errors[] = (string)$uploadResult['error'];
        } else {
            $photoPath = $uploadResult['path'];
        }
    }

    if (empty($errors)) {
        try {
            $pdo->beginTransaction();

            $today        = date('Y-m-d');
            $statusToSave = $form['status'];
            if ($statusToSave === 'Active' && $form['membership_expiry_date'] !== '' && $form['membership_expiry_date'] < $today) {
                $statusToSave = 'Expired';
            }

            $pdo->prepare(
                'UPDATE members SET
                    full_name = :full_name, photo_path = :photo_path, phone = :phone, email = :email,
                    gender = :gender, date_of_birth = :dob, address = :address,
                    emergency_contact = :emergency_contact, joining_date = :joining_date,
                    plan_id = :plan_id, membership_start_date = :start_date,
                    membership_expiry_date = :expiry_date, status = :status, notes = :notes
                 WHERE id = :id AND gym_id = :gid'
            )->execute([
                ':full_name'         => $form['full_name'],
                ':photo_path'        => $photoPath,
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
                ':id'                => $memberId,
                ':gid'               => $gymId,
            ]);

            $planChanged   = (int)($member['plan_id'] ?? 0) !== (int)($selectedPlan['id'] ?? 0);
            $expiryChanged = (string)($member['membership_expiry_date'] ?? '') !== $form['membership_expiry_date'];

            if ($selectedPlan && ($planChanged || $expiryChanged)) {
                $actionType = $planChanged ? 'Plan Change' : 'Extension';
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
                    ':member_id'   => $memberId,
                    ':plan_id'     => (int)$selectedPlan['id'],
                    ':plan_name'   => (string)$selectedPlan['plan_name'],
                    ':plan_price'  => (string)$selectedPlan['price'],
                    ':start_date'  => $form['membership_start_date'],
                    ':expiry_date' => $form['membership_expiry_date'],
                    ':action_type' => $actionType,
                    ':status'      => $histStatus,
                    ':notes'       => 'Updated via Member Edit form.',
                    ':created_by'  => (int)$currentAdmin['id'],
                ]);
            }

            $pdo->commit();
            set_flash('success', 'Member details updated.');
            redirect('member_view.php?id=' . $memberId);
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $errors[] = 'Failed to update member details.';
        }
    }
}

$pageTitle   = 'Edit Member';
$pageHeading = 'Edit Member';
require __DIR__ . '/includes/header.php';
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
    <div><h1 class="h4 fw-bold mb-1">Edit Member — <?= e($member['full_name']) ?></h1><p class="text-muted small mb-0 font-mono"><?= e($member['member_code']) ?></p></div>
    <a href="member_view.php?id=<?= (int)$memberId ?>" class="btn btn-light border">Back to Profile</a>
</div>

<?php if (!empty($errors)): ?>
    <div class="alert alert-danger"><ul class="mb-0 ps-3 small"><?php foreach ($errors as $err): ?><li><?= e($err) ?></li><?php endforeach; ?></ul></div>
<?php endif; ?>

<form method="post" action="member_edit.php?id=<?= (int)$memberId ?>" enctype="multipart/form-data" novalidate>
    <?= csrf_field() ?>
    <input type="hidden" name="id" value="<?= (int)$memberId ?>">
    <div class="row g-4">
        <div class="col-lg-8">
            <div class="gym-card">
                <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Member Details</h2></div>
                <div class="gym-card-body">
                    <div class="row g-3">
                        <div class="col-md-4"><label class="form-label fw-medium">Member ID</label><input type="text" class="form-control font-mono bg-light" value="<?= e($member['member_code']) ?>" readonly></div>
                        <div class="col-md-8"><label class="form-label fw-medium">Full Name *</label><input type="text" class="form-control" name="full_name" value="<?= e($form['full_name']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Phone Number *</label><input type="tel" class="form-control font-mono" name="phone" value="<?= e($form['phone']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Email Address</label><input type="email" class="form-control" name="email" value="<?= e($form['email']) ?>"></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Gender</label><select class="form-select" name="gender"><option value="">Optional...</option><?php foreach (['Male', 'Female', 'Other', 'Prefer not to say'] as $g): ?><option value="<?= e($g) ?>" <?= $form['gender'] === $g ? 'selected' : '' ?>><?= e($g) ?></option><?php endforeach; ?></select></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Date of Birth</label><input type="date" class="form-control font-mono" name="date_of_birth" value="<?= e($form['date_of_birth']) ?>"></div>
                        <div class="col-md-4"><label class="form-label fw-medium">Joining Date *</label><input type="date" class="form-control font-mono" name="joining_date" value="<?= e($form['joining_date']) ?>" required></div>
                        <div class="col-md-6"><label class="form-label fw-medium">Emergency Contact</label><input type="text" class="form-control" name="emergency_contact" value="<?= e($form['emergency_contact']) ?>"></div>
                        <div class="col-md-6">
                            <label class="form-label fw-medium">Replace Profile Photo</label>
                            <input type="file" class="form-control" name="photo" accept=".jpg,.jpeg,.png,.webp">
                            <?php if (!empty($member['photo_path'])): ?><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="remove_photo" name="remove_photo" value="1"><label class="form-check-label small text-muted" for="remove_photo">Remove current photo</label></div><?php endif; ?>
                        </div>
                        <div class="col-12"><label class="form-label fw-medium">Address</label><textarea class="form-control" name="address" rows="2"><?= e($form['address']) ?></textarea></div>
                        <div class="col-12"><label class="form-label fw-medium">Notes</label><textarea class="form-control" name="notes" rows="2"><?= e($form['notes']) ?></textarea></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-lg-4">
            <div class="gym-card">
                <div class="gym-card-header"><h2 class="h6 fw-bold mb-0">Plan &amp; Status</h2></div>
                <div class="gym-card-body">
                    <div class="mb-3"><label class="form-label fw-medium">Membership Plan</label><select class="form-select" name="plan_id" data-plan-selector><option value="">-- Unassigned --</option><?php foreach ($plans as $plan): ?><option value="<?= (int)$plan['id'] ?>" data-duration="<?= (int)$plan['duration_days'] ?>" data-price="<?= e($plan['price']) ?>" <?= (string)$form['plan_id'] === (string)$plan['id'] ? 'selected' : '' ?>><?= e($plan['plan_name']) ?> — <?= e(format_money($plan['price'])) ?></option><?php endforeach; ?></select></div>
                    <div class="mb-3"><label class="form-label fw-medium">Start Date</label><input type="date" class="form-control font-mono" name="membership_start_date" value="<?= e($form['membership_start_date']) ?>" data-start-date></div>
                    <div class="mb-3"><label class="form-label fw-medium">Expiry Date</label><input type="date" class="form-control font-mono" name="membership_expiry_date" value="<?= e($form['membership_expiry_date']) ?>" data-expiry-date></div>
                    <div class="mb-4"><label class="form-label fw-medium">Status</label><select class="form-select" name="status"><option value="Active" <?= $form['status'] === 'Active' ? 'selected' : '' ?>>Active</option><option value="Expired" <?= $form['status'] === 'Expired' ? 'selected' : '' ?>>Expired</option><option value="Inactive" <?= $form['status'] === 'Inactive' ? 'selected' : '' ?>>Inactive</option></select></div>
                    <div class="d-grid gap-2"><button type="submit" class="btn btn-gym-primary py-2">Save Changes</button><a href="member_view.php?id=<?= (int)$memberId ?>" class="btn btn-light border">Cancel</a></div>
                </div>
            </div>
        </div>
    </div>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>
