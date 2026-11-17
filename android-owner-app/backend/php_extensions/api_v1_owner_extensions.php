<?php
declare(strict_types=1);

/**
 * Hemnity Gym Owner — PHP 8.1+ PDO Extension Router
 * Drop-in handler for /api/v1/owner/* endpoints missing from v1 core.
 *
 * Security invariants:
 * - Derives $gymId exclusively from authenticated Bearer token / session ($authUser['gym_id']).
 * - Rejects non-owner roles (member, superadmin) with HTTP 403.
 * - Never returns gateway secret keys in API responses.
 * - Computes final_fee & remaining_due server-side inside SQL transactions.
 */

final class OwnerApiExtensionController
{
    public function __construct(private PDO $pdo) {}

    public function handle(string $method, string $path, array $authUser): void
    {
        $role = strtolower((string)($authUser['role'] ?? ''));
        if (!in_array($role, ['owner', 'gym_owner', 'admin'], true)) {
            $this->json(403, ['error' => 'Only authorized Gym Owners can access /owner endpoints.']);
            return;
        }
        $gymId = (int)($authUser['gym_id'] ?? 0);
        if ($gymId <= 0) {
            $this->json(403, ['error' => 'Authenticated account is not bound to a valid gym tenant.']);
            return;
        }
        $userId = (int)($authUser['id'] ?? 0);
        $input = $this->readJsonInput();

        // Dispatch routes cleanly
        if ($path === 'owner/plans' && $method === 'GET') {
            $this->listPlans($gymId);
        } elseif ($path === 'owner/plans' && $method === 'POST') {
            $this->createPlan($gymId, $input);
        } elseif (preg_match('#^owner/plans/(\d+)$#', $path, $m) && $method === 'PUT') {
            $this->updatePlan($gymId, (int)$m[1], $input);
        } elseif ($path === 'owner/members' && $method === 'GET') {
            $this->listMembers($gymId, $_GET['search'] ?? null);
        } elseif ($path === 'owner/members' && $method === 'POST') {
            $this->createMemberWithPlan($gymId, $userId, $input);
        } elseif (preg_match('#^owner/members/(\d+)$#', $path, $m) && $method === 'PUT') {
            $this->updateMemberProfile($gymId, (int)$m[1], $input);
        } elseif (preg_match('#^owner/members/(\d+)/status$#', $path, $m) && $method === 'POST') {
            $this->setMemberStatus($gymId, (int)$m[1], $input);
        } elseif (preg_match('#^owner/members/(\d+)/renew$#', $path, $m) && $method === 'POST') {
            $this->assignOrRenewMemberPlan($gymId, $userId, (int)$m[1], $input);
        } elseif (preg_match('#^owner/members/(\d+)/reissue-qr$#', $path, $m) && $method === 'POST') {
            $this->reissueQr($gymId, (int)$m[1]);
        } elseif (preg_match('#^owner/members/(\d+)/payments$#', $path, $m) && $method === 'GET') {
            $this->memberPayments($gymId, (int)$m[1]);
        } elseif (preg_match('#^owner/members/(\d+)/attendance$#', $path, $m) && $method === 'GET') {
            $this->memberAttendance($gymId, (int)$m[1]);
        } elseif ($path === 'owner/attendance' && $method === 'GET') {
            $this->listAttendance($gymId, $_GET['date'] ?? date('Y-m-d'));
        } elseif ($path === 'owner/attendance/qr-checkin' && $method === 'POST') {
            $this->qrCheckIn($gymId, $input);
        } elseif ($path === 'owner/payments' && $method === 'GET') {
            $this->listPayments($gymId, $_GET['status'] ?? null, $_GET['search'] ?? null);
        } elseif ($path === 'owner/payments' && $method === 'POST') {
            $this->recordManualPayment($gymId, $input);
        } elseif ($path === 'owner/reports' && $method === 'GET') {
            $this->reportsSummary($gymId, $_GET['from'] ?? null, $_GET['to'] ?? null);
        } elseif ($path === 'owner/settings' && $method === 'GET') {
            $this->getSettings($gymId, (string)($authUser['email'] ?? ''));
        } elseif ($path === 'owner/settings' && $method === 'PUT') {
            $this->updateSettings($gymId, $input);
        } elseif ($path === 'owner/subscription' && $method === 'GET') {
            $this->getSubscription($gymId);
        } elseif ($path === 'owner/notifications' && $method === 'GET') {
            $this->getNotifications($gymId);
        } else {
            $this->json(404, ['error' => 'API endpoint not found.', 'route' => $path]);
        }
    }

    private function listPlans(int $gymId): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT p.id, p.name, p.name AS plan_name, p.duration_days, p.price, p.plan_type,
                    p.description, p.is_active,
                    (SELECT COUNT(*) FROM members m WHERE m.gym_id = p.gym_id AND m.plan_id = p.id AND m.status = 'Active') AS active_members
             FROM membership_plans p
             WHERE p.gym_id = :gym_id
             ORDER BY p.is_active DESC, p.duration_days ASC, p.id ASC"
        );
        $stmt->execute(['gym_id' => $gymId]);
        $this->json(200, ['gym_id' => $gymId, 'plans' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function createPlan(int $gymId, array $input): void
    {
        $name = trim((string)($input['plan_name'] ?? $input['name'] ?? ''));
        $price = (float)($input['price'] ?? -1);
        $days = (int)($input['duration_days'] ?? 0);
        if ($name === '' || $price < 0 || $days <= 0) {
            $this->json(422, ['error' => 'Valid plan_name, non-negative price, and positive duration_days are required.']);
            return;
        }
        $stmt = $this->pdo->prepare(
            "INSERT INTO membership_plans (gym_id, name, duration_days, price, plan_type, description, is_active)
             VALUES (:gym_id, :name, :days, :price, :plan_type, :description, 1)"
        );
        $stmt->execute([
            'gym_id' => $gymId,
            'name' => $name,
            'days' => $days,
            'price' => round($price, 2),
            'plan_type' => trim((string)($input['plan_type'] ?? 'Monthly')),
            'description' => trim((string)($input['description'] ?? '')),
        ]);
        $id = (int)$this->pdo->lastInsertId();
        $this->json(201, [
            'message' => 'Plan created.',
            'plan' => [
                'id' => $id,
                'name' => $name,
                'duration_days' => $days,
                'price' => number_format($price, 2, '.', ''),
                'is_active' => true,
            ],
        ]);
    }

    private function updatePlan(int $gymId, int $planId, array $input): void
    {
        $stmt = $this->pdo->prepare("SELECT id FROM membership_plans WHERE id = :id AND gym_id = :gym_id");
        $stmt->execute(['id' => $planId, 'gym_id' => $gymId]);
        if (!$stmt->fetch()) {
            $this->json(404, ['error' => 'Plan not found for your gym.']);
            return;
        }
        if (array_key_exists('is_active', $input)) {
            $upd = $this->pdo->prepare("UPDATE membership_plans SET is_active = :active WHERE id = :id AND gym_id = :gym_id");
            $upd->execute(['active' => !empty($input['is_active']) ? 1 : 0, 'id' => $planId, 'gym_id' => $gymId]);
        }
        $this->json(200, ['message' => 'Plan updated.']);
    }

    private function listMembers(int $gymId, ?string $search): void
    {
        $sql = "SELECT m.id, m.member_code, m.full_name, m.phone, m.email, m.photo_url, m.status,
                       m.membership_start_date, m.membership_expiry_date, m.joining_date,
                       COALESCE(p.name, m.plan_name) AS plan_name,
                       p.price AS plan_current_price,
                       m.assigned_fee, m.discount_amount, m.final_fee, m.amount_paid,
                       m.remaining_due, m.payment_status, m.fee_source, m.adjustment_reason,
                       m.active_qr_token
                FROM members m
                LEFT JOIN membership_plans p ON p.id = m.plan_id AND p.gym_id = m.gym_id
                WHERE m.gym_id = :gym_id";
        $params = ['gym_id' => $gymId];
        if ($search !== null && trim($search) !== '') {
            $sql .= " AND (m.full_name LIKE :q OR m.member_code LIKE :q OR m.phone LIKE :q)";
            $params['q'] = '%' . trim($search) . '%';
        }
        $sql .= " ORDER BY m.id DESC";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $this->json(200, ['gym_id' => $gymId, 'members' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function createMemberWithPlan(int $gymId, int $userId, array $input): void
    {
        $fullName = trim((string)($input['full_name'] ?? $input['name'] ?? ''));
        $phone = trim((string)($input['phone'] ?? ''));
        if ($fullName === '' || $phone === '') {
            $this->json(422, ['error' => 'Full name and phone are required.']);
            return;
        }
        $idempotencyKey = trim((string)($input['idempotency_key'] ?? ''));
        if ($idempotencyKey !== '') {
            $dup = $this->pdo->prepare("SELECT * FROM members WHERE gym_id = :gym_id AND idempotency_key = :ikey LIMIT 1");
            $dup->execute(['gym_id' => $gymId, 'ikey' => $idempotencyKey]);
            if ($existing = $dup->fetch(PDO::FETCH_ASSOC)) {
                $this->json(200, ['member' => $existing, 'idempotent_replay' => true]);
                return;
            }
        }

        $planId = isset($input['plan_id']) && $input['plan_id'] !== '' ? (int)$input['plan_id'] : null;
        $plan = null;
        if ($planId !== null) {
            $pStmt = $this->pdo->prepare(
                "SELECT * FROM membership_plans WHERE id = :id AND gym_id = :gym_id AND is_active = 1 LIMIT 1"
            );
            $pStmt->execute(['id' => $planId, 'gym_id' => $gymId]);
            $plan = $pStmt->fetch(PDO::FETCH_ASSOC);
            if (!$plan) {
                $this->json(422, ['error' => 'Selected membership plan is inactive or does not belong to this gym.']);
                return;
            }
        }

        $fee = $this->computeValidatedFees($plan ? (float)$plan['price'] : 0.0, $input);
        if (isset($fee['error'])) {
            $this->json(422, ['error' => $fee['error']]);
            return;
        }

        $startDate = $plan ? date('Y-m-d') : null;
        $expiryDate = $plan ? date('Y-m-d', strtotime('+' . (int)$plan['duration_days'] . ' days')) : null;
        $qrToken = 'HQR-' . strtoupper(bin2hex(random_bytes(10)));
        $memberCode = 'GYM-' . date('Y') . '-' . random_int(1000, 9999);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                "INSERT INTO members (
                    gym_id, member_code, full_name, email, phone, plan_id, plan_name,
                    status, joining_date, membership_start_date, membership_expiry_date,
                    assigned_fee, discount_amount, final_fee, amount_paid, remaining_due,
                    payment_status, fee_source, adjustment_reason, active_qr_token, idempotency_key
                ) VALUES (
                    :gym_id, :code, :name, :email, :phone, :plan_id, :plan_name,
                    :status, :joining, :start_date, :expiry_date,
                    :assigned_fee, :discount, :final_fee, :paid, :due,
                    :pay_status, :fee_source, :reason, :qr, :ikey
                )"
            );
            $stmt->execute([
                'gym_id' => $gymId,
                'code' => $memberCode,
                'name' => $fullName,
                'email' => trim((string)($input['email'] ?? '')),
                'phone' => $phone,
                'plan_id' => $planId,
                'plan_name' => $plan['name'] ?? null,
                'status' => $plan ? 'Active' : 'Unassigned',
                'joining' => date('Y-m-d'),
                'start_date' => $startDate,
                'expiry_date' => $expiryDate,
                'assigned_fee' => $fee['assigned_fee'],
                'discount' => $fee['discount'],
                'final_fee' => $fee['final_fee'],
                'paid' => $fee['amount_paid'],
                'due' => $fee['remaining_due'],
                'pay_status' => $fee['payment_status'],
                'fee_source' => $fee['fee_source'],
                'reason' => $fee['reason'],
                'qr' => $qrToken,
                'ikey' => $idempotencyKey !== '' ? $idempotencyKey : null,
            ]);
            $memberId = (int)$this->pdo->lastInsertId();

            if ($fee['amount_paid'] > 0) {
                $this->insertPaymentRow(
                    $gymId,
                    $memberId,
                    $planId,
                    $plan['name'] ?? 'Membership',
                    $fee['amount_paid'],
                    (string)($input['payment_method'] ?? 'cash'),
                    $fee['payment_status'],
                    $idempotencyKey !== '' ? $idempotencyKey : null
                );
            }
            $this->insertFeeAudit($gymId, $memberId, $planId, $plan ? (float)$plan['price'] : 0.0, $fee, $userId);
            $this->pdo->commit();

            $this->json(201, [
                'message' => 'Member created.',
                'member' => [
                    'id' => $memberId,
                    'member_code' => $memberCode,
                    'full_name' => $fullName,
                    'phone' => $phone,
                    'plan_name' => $plan['name'] ?? null,
                    'status' => $plan ? 'Active' : 'Unassigned',
                    'membership_start_date' => $startDate,
                    'membership_expiry_date' => $expiryDate,
                    'assigned_fee' => $fee['assigned_fee'],
                    'final_fee' => $fee['final_fee'],
                    'amount_paid' => $fee['amount_paid'],
                    'remaining_due' => $fee['remaining_due'],
                    'payment_status' => $fee['payment_status'],
                    'fee_source' => $fee['fee_source'],
                    'active_qr_token' => $qrToken,
                ],
            ]);
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            $this->json(500, ['error' => 'Transaction failed while creating member.']);
        }
    }

    private function assignOrRenewMemberPlan(int $gymId, int $userId, int $memberId, array $input): void
    {
        $planId = (int)($input['plan_id'] ?? 0);
        if ($planId <= 0) {
            $this->json(422, ['error' => 'Active plan_id is required.']);
            return;
        }
        $mStmt = $this->pdo->prepare("SELECT * FROM members WHERE id = :id AND gym_id = :gym_id LIMIT 1");
        $mStmt->execute(['id' => $memberId, 'gym_id' => $gymId]);
        $member = $mStmt->fetch(PDO::FETCH_ASSOC);
        if (!$member) {
            $this->json(404, ['error' => 'Member not found for your gym.']);
            return;
        }
        $pStmt = $this->pdo->prepare(
            "SELECT * FROM membership_plans WHERE id = :id AND gym_id = :gym_id AND is_active = 1 LIMIT 1"
        );
        $pStmt->execute(['id' => $planId, 'gym_id' => $gymId]);
        $plan = $pStmt->fetch(PDO::FETCH_ASSOC);
        if (!$plan) {
            $this->json(422, ['error' => 'Selected plan is deactivated or unavailable for your gym.']);
            return;
        }

        $fee = $this->computeValidatedFees((float)$plan['price'], $input);
        if (isset($fee['error'])) {
            $this->json(422, ['error' => $fee['error']]);
            return;
        }

        $startDate = date('Y-m-d');
        $expiryDate = date('Y-m-d', strtotime('+' . (int)$plan['duration_days'] . ' days'));
        $ikey = trim((string)($input['idempotency_key'] ?? ''));

        $this->pdo->beginTransaction();
        try {
            $upd = $this->pdo->prepare(
                "UPDATE members
                 SET plan_id = :plan_id, plan_name = :plan_name, status = 'Active',
                     membership_start_date = :start_date, membership_expiry_date = :expiry_date,
                     assigned_fee = :assigned_fee, discount_amount = :discount,
                     final_fee = :final_fee, amount_paid = :paid, remaining_due = :due,
                     payment_status = :pay_status, fee_source = :fee_source, adjustment_reason = :reason
                 WHERE id = :id AND gym_id = :gym_id"
            );
            $upd->execute([
                'plan_id' => $planId,
                'plan_name' => $plan['name'],
                'start_date' => $startDate,
                'expiry_date' => $expiryDate,
                'assigned_fee' => $fee['assigned_fee'],
                'discount' => $fee['discount'],
                'final_fee' => $fee['final_fee'],
                'paid' => $fee['amount_paid'],
                'due' => $fee['remaining_due'],
                'pay_status' => $fee['payment_status'],
                'fee_source' => $fee['fee_source'],
                'reason' => $fee['reason'],
                'id' => $memberId,
                'gym_id' => $gymId,
            ]);
            if ($fee['amount_paid'] > 0) {
                $this->insertPaymentRow(
                    $gymId,
                    $memberId,
                    $planId,
                    $plan['name'],
                    $fee['amount_paid'],
                    (string)($input['payment_method'] ?? 'cash'),
                    $fee['payment_status'],
                    $ikey !== '' ? $ikey : null
                );
            }
            $this->insertFeeAudit($gymId, $memberId, $planId, (float)$plan['price'], $fee, $userId);
            $this->pdo->commit();
            $this->json(200, ['message' => 'Membership plan assigned successfully.']);
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            $this->json(500, ['error' => 'Failed to assign membership plan.']);
        }
    }

    private function updateMemberProfile(int $gymId, int $memberId, array $input): void
    {
        $name = trim((string)($input['full_name'] ?? $input['name'] ?? ''));
        $phone = trim((string)($input['phone'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $stmt = $this->pdo->prepare(
            "UPDATE members SET full_name = :name, phone = :phone, email = :email WHERE id = :id AND gym_id = :gym_id"
        );
        $stmt->execute(['name' => $name, 'phone' => $phone, 'email' => $email, 'id' => $memberId, 'gym_id' => $gymId]);
        $m = $this->pdo->prepare("SELECT * FROM members WHERE id = :id AND gym_id = :gym_id");
        $m->execute(['id' => $memberId, 'gym_id' => $gymId]);
        $this->json(200, ['member' => $m->fetch(PDO::FETCH_ASSOC)]);
    }

    private function setMemberStatus(int $gymId, int $memberId, array $input): void
    {
        $status = strtolower(trim((string)($input['status'] ?? ''))) === 'active' ? 'Active' : 'Suspended';
        $stmt = $this->pdo->prepare("UPDATE members SET status = :status WHERE id = :id AND gym_id = :gym_id");
        $stmt->execute(['status' => $status, 'id' => $memberId, 'gym_id' => $gymId]);
        $this->json(200, ['message' => "Member marked $status.", 'status' => $status]);
    }

    private function reissueQr(int $gymId, int $memberId): void
    {
        $newQr = 'HQR-' . strtoupper(bin2hex(random_bytes(10)));
        $stmt = $this->pdo->prepare("UPDATE members SET active_qr_token = :qr WHERE id = :id AND gym_id = :gym_id");
        $stmt->execute(['qr' => $newQr, 'id' => $memberId, 'gym_id' => $gymId]);
        if ($stmt->rowCount() === 0) {
            $this->json(404, ['error' => 'Member not found for your gym.']);
            return;
        }
        $this->json(200, ['qr_token' => $newQr]);
    }

    private function qrCheckIn(int $gymId, array $input): void
    {
        $token = trim((string)($input['credential_token'] ?? $input['qr_token'] ?? ''));
        $code = trim((string)($input['member_code'] ?? ''));
        if ($token === '' && $code === '') {
            $this->json(422, ['error' => 'credential_token or member_code is required.']);
            return;
        }
        if ($token !== '') {
            $stmt = $this->pdo->prepare("SELECT * FROM members WHERE active_qr_token = :tok LIMIT 1");
            $stmt->execute(['tok' => $token]);
        } else {
            $stmt = $this->pdo->prepare("SELECT * FROM members WHERE gym_id = :gym_id AND member_code = :code LIMIT 1");
            $stmt->execute(['gym_id' => $gymId, 'code' => $code]);
        }
        $member = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$member) {
            $this->json(404, ['error' => 'Invalid or revoked QR credential.']);
            return;
        }
        if ((int)$member['gym_id'] !== $gymId) {
            $this->json(403, ['error' => 'Unauthorized: member belongs to another gym.']);
            return;
        }
        if (strtolower((string)$member['status']) !== 'active' ||
            (!empty($member['membership_expiry_date']) && $member['membership_expiry_date'] < date('Y-m-d'))) {
            $this->json(422, ['error' => 'Membership is expired or suspended.', 'member' => $member]);
            return;
        }
        $dup = $this->pdo->prepare(
            "SELECT id, checked_in_at FROM attendance_logs WHERE gym_id = :gym_id AND member_id = :mid AND DATE(checked_in_at) = CURDATE() LIMIT 1"
        );
        $dup->execute(['gym_id' => $gymId, 'mid' => $member['id']]);
        if ($existing = $dup->fetch(PDO::FETCH_ASSOC)) {
            $this->json(409, [
                'error' => 'Member already checked in today.',
                'duplicate' => true,
                'member' => $member,
                'checked_in_at' => $existing['checked_in_at'],
            ]);
            return;
        }
        $now = date('Y-m-d H:i:s');
        $ins = $this->pdo->prepare(
            "INSERT INTO attendance_logs (gym_id, member_id, checked_in_at, method, status)
             VALUES (:gym_id, :mid, :ts, :method, 'Checked In')"
        );
        $ins->execute([
            'gym_id' => $gymId,
            'mid' => $member['id'],
            'ts' => $now,
            'method' => $token !== '' ? 'qr_scan' : 'manual_code',
        ]);
        $this->json(200, [
            'message' => 'Attendance recorded.',
            'checked_in_at' => $now,
            'member' => $member,
        ]);
    }

    private function listAttendance(int $gymId, string $date): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT a.id, m.full_name AS member_name, m.member_code, a.checked_in_at, a.method, a.status
             FROM attendance_logs a
             JOIN members m ON m.id = a.member_id AND m.gym_id = a.gym_id
             WHERE a.gym_id = :gym_id AND DATE(a.checked_in_at) = :d
             ORDER BY a.checked_in_at DESC"
        );
        $stmt->execute(['gym_id' => $gymId, 'd' => $date]);
        $this->json(200, ['records' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function memberAttendance(int $gymId, int $memberId): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT id, checked_in_at, method, status FROM attendance_logs
             WHERE gym_id = :gym_id AND member_id = :mid ORDER BY checked_in_at DESC LIMIT 50"
        );
        $stmt->execute(['gym_id' => $gymId, 'mid' => $memberId]);
        $this->json(200, ['records' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function memberPayments(int $gymId, int $memberId): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT id, receipt_number, plan_name, amount, payment_method, status, paid_at
             FROM member_payments WHERE gym_id = :gym_id AND member_id = :mid ORDER BY id DESC"
        );
        $stmt->execute(['gym_id' => $gymId, 'mid' => $memberId]);
        $this->json(200, ['payments' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function listPayments(int $gymId, ?string $status, ?string $search): void
    {
        $sql = "SELECT p.id, p.receipt_number, m.full_name AS member_name, p.plan_name,
                       p.amount, p.payment_method, p.status, p.paid_at
                FROM member_payments p
                LEFT JOIN members m ON m.id = p.member_id AND m.gym_id = p.gym_id
                WHERE p.gym_id = :gym_id";
        $params = ['gym_id' => $gymId];
        if ($status !== null && trim($status) !== '') {
            $sql .= " AND LOWER(p.status) = :status";
            $params['status'] = strtolower(trim($status));
        }
        if ($search !== null && trim($search) !== '') {
            $sql .= " AND (m.full_name LIKE :q OR p.receipt_number LIKE :q)";
            $params['q'] = '%' . trim($search) . '%';
        }
        $sql .= " ORDER BY p.id DESC LIMIT 100";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $this->json(200, ['payments' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function recordManualPayment(int $gymId, array $input): void
    {
        $key = trim((string)($input['member_id'] ?? ''));
        $amount = (float)($input['amount'] ?? 0);
        if ($key === '' || $amount <= 0) {
            $this->json(422, ['error' => 'Valid member_id/code and positive amount are required.']);
            return;
        }
        $mStmt = $this->pdo->prepare(
            "SELECT * FROM members WHERE gym_id = :gym_id AND (id = :id OR member_code = :code) LIMIT 1"
        );
        $mStmt->execute(['gym_id' => $gymId, 'id' => ctype_digit($key) ? (int)$key : -1, 'code' => $key]);
        $member = $mStmt->fetch(PDO::FETCH_ASSOC);
        if (!$member) {
            $this->json(404, ['error' => 'Member not found for your gym.']);
            return;
        }

        $this->pdo->beginTransaction();
        try {
            $newPaid = (float)$member['amount_paid'] + $amount;
            $finalFee = (float)($member['final_fee'] ?? $newPaid);
            $newDue = max(0.0, $finalFee - $newPaid);
            $newStatus = $newDue <= 0.01 ? 'Paid' : 'Partial';
            $upd = $this->pdo->prepare(
                "UPDATE members SET amount_paid = :paid, remaining_due = :due, payment_status = :status WHERE id = :id AND gym_id = :gym_id"
            );
            $upd->execute([
                'paid' => round($newPaid, 2),
                'due' => round($newDue, 2),
                'status' => $newStatus,
                'id' => $member['id'],
                'gym_id' => $gymId,
            ]);
            $receipt = $this->insertPaymentRow(
                $gymId,
                (int)$member['id'],
                isset($input['plan_id']) ? (int)$input['plan_id'] : ($member['plan_id'] ? (int)$member['plan_id'] : null),
                (string)($member['plan_name'] ?? 'Manual Settlement'),
                $amount,
                (string)($input['payment_method'] ?? 'cash'),
                'Paid',
                null
            );
            $this->pdo->commit();
            $this->json(201, [
                'payment' => [
                    'id' => $receipt['id'],
                    'receipt_number' => $receipt['receipt_number'],
                    'member_name' => $member['full_name'],
                    'amount' => number_format($amount, 2, '.', ''),
                    'status' => 'Paid',
                    'payment_method' => $input['payment_method'] ?? 'cash',
                    'paid_at' => date('Y-m-d H:i:s'),
                ],
            ]);
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            $this->json(500, ['error' => 'Failed to record manual payment.']);
        }
    }

    private function reportsSummary(int $gymId, ?string $from, ?string $to): void
    {
        $fromDate = $from ?: date('Y-m-01');
        $toDate = $to ?: date('Y-m-d');
        $stmt = $this->pdo->prepare(
            "SELECT
                (SELECT COUNT(*) FROM members WHERE gym_id = :g1) AS total_members,
                (SELECT COUNT(*) FROM members WHERE gym_id = :g2 AND status = 'Active') AS active_members,
                (SELECT COUNT(*) FROM attendance_logs WHERE gym_id = :g3 AND DATE(checked_in_at) BETWEEN :f1 AND :t1) AS total_attendance,
                (SELECT COUNT(*) FROM members WHERE gym_id = :g4 AND membership_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_soon,
                (SELECT COALESCE(SUM(amount), 0) FROM member_payments WHERE gym_id = :g5 AND DATE(paid_at) BETWEEN :f2 AND :t2) AS total_collected,
                (SELECT COALESCE(SUM(remaining_due), 0) FROM members WHERE gym_id = :g6) AS total_pending"
        );
        $stmt->execute([
            'g1' => $gymId, 'g2' => $gymId, 'g3' => $gymId, 'g4' => $gymId, 'g5' => $gymId, 'g6' => $gymId,
            'f1' => $fromDate, 't1' => $toDate, 'f2' => $fromDate, 't2' => $toDate,
        ]);
        $data = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $data['period'] = "$fromDate to $toDate";
        $this->json(200, ['data' => $data]);
    }

    private function getSettings(int $gymId, string $ownerEmail): void
    {
        $stmt = $this->pdo->prepare("SELECT id, name, logo_url, phone, address, operating_hours, gateway_provider, (gateway_secret_encrypted IS NOT NULL) AS gateway_configured FROM gyms WHERE id = :id LIMIT 1");
        $stmt->execute(['id' => $gymId]);
        $gym = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $gym['owner_email'] = $ownerEmail;
        $this->json(200, ['settings' => $gym]);
    }

    private function updateSettings(int $gymId, array $input): void
    {
        $stmt = $this->pdo->prepare("UPDATE gyms SET phone = :phone, address = :addr, operating_hours = :hours WHERE id = :id");
        $stmt->execute([
            'phone' => trim((string)($input['phone'] ?? '')),
            'addr' => trim((string)($input['address'] ?? '')),
            'hours' => trim((string)($input['operating_hours'] ?? '')),
            'id' => $gymId,
        ]);
        $this->json(200, ['message' => 'Settings saved.']);
    }

    private function getSubscription(int $gymId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM gym_saas_subscriptions WHERE gym_id = :id ORDER BY id DESC LIMIT 1");
        $stmt->execute(['id' => $gymId]);
        $this->json(200, ['subscription' => $stmt->fetch(PDO::FETCH_ASSOC) ?: []]);
    }

    private function getNotifications(int $gymId): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT id, full_name, member_code, membership_expiry_date
             FROM members WHERE gym_id = :gym_id AND membership_expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
             ORDER BY membership_expiry_date ASC LIMIT 30"
        );
        $stmt->execute(['gym_id' => $gymId]);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $items[] = [
                'id' => 'exp_' . $row['id'],
                'title' => 'Membership Expiry Alert: ' . $row['full_name'],
                'message' => $row['member_code'] . ' expires on ' . $row['membership_expiry_date'],
                'category' => 'Expiry',
                'created_at' => $row['membership_expiry_date'],
                'is_read' => false,
            ];
        }
        $this->json(200, ['notifications' => $items]);
    }

    private function computeValidatedFees(float $catalogPrice, array $input): array
    {
        $discount = (float)($input['discount_amount'] ?? 0);
        $paid = (float)($input['amount_paid'] ?? 0);
        $reason = trim((string)($input['adjustment_reason'] ?? ''));
        $overrideFee = array_key_exists('final_fee', $input) && $input['final_fee'] !== '' ? (float)$input['final_fee'] : null;

        if ($discount < 0 || $paid < 0) {
            return ['error' => 'Negative fee, discount, or payment values are not allowed.'];
        }
        $computedFinal = $overrideFee !== null ? max(0.0, $overrideFee) : max(0.0, $catalogPrice - $discount);
        $hasAdjustment = $discount > 0.009 || ($overrideFee !== null && abs($overrideFee - $catalogPrice) > 0.009);
        if ($hasAdjustment && $reason === '') {
            return ['error' => 'An adjustment_reason is required for discounts or custom fee overrides.'];
        }
        if ($paid > $computedFinal + 0.009) {
            return ['error' => 'Amount paid cannot exceed final membership fee.'];
        }
        $remaining = max(0.0, $computedFinal - $paid);
        $payStatus = $computedFinal <= 0.009 || $remaining <= 0.009 ? 'Paid' : ($paid > 0.009 ? 'Partial' : 'Unpaid');
        $feeSource = $hasAdjustment ? 'custom_override' : 'plan_default';

        return [
            'assigned_fee' => round($catalogPrice, 2),
            'discount' => round($discount, 2),
            'final_fee' => round($computedFinal, 2),
            'amount_paid' => round($paid, 2),
            'remaining_due' => round($remaining, 2),
            'payment_status' => $payStatus,
            'fee_source' => $feeSource,
            'reason' => $reason !== '' ? $reason : null,
        ];
    }

    private function insertPaymentRow(
        int $gymId,
        int $memberId,
        ?int $planId,
        string $planName,
        float $amount,
        string $method,
        string $status,
        ?string $ikey
    ): array {
        $receipt = 'RCPT-' . date('Ymd') . '-' . random_int(1000, 9999);
        $stmt = $this->pdo->prepare(
            "INSERT INTO member_payments (gym_id, member_id, plan_id, plan_name, receipt_number, amount, payment_method, status, idempotency_key, paid_at)
             VALUES (:gym_id, :mid, :pid, :pname, :rcpt, :amt, :method, :status, :ikey, NOW())"
        );
        $stmt->execute([
            'gym_id' => $gymId,
            'mid' => $memberId,
            'pid' => $planId,
            'pname' => $planName,
            'rcpt' => $receipt,
            'amt' => round($amount, 2),
            'method' => strtolower($method),
            'status' => $status,
            'ikey' => $ikey,
        ]);
        return ['id' => (int)$this->pdo->lastInsertId(), 'receipt_number' => $receipt];
    }

    private function insertFeeAudit(int $gymId, int $memberId, ?int $planId, float $catalogPrice, array $fee, int $actorUserId): void
    {
        $stmt = $this->pdo->prepare(
            "INSERT INTO fee_audit_logs (gym_id, member_id, plan_id, catalog_plan_price, assigned_fee, discount_amount, final_fee, amount_paid, remaining_due, fee_source, adjustment_reason, actor_user_id)
             VALUES (:gym_id, :mid, :pid, :cprice, :afee, :disc, :ffee, :paid, :due, :src, :reason, :actor)"
        );
        $stmt->execute([
            'gym_id' => $gymId,
            'mid' => $memberId,
            'pid' => $planId,
            'cprice' => round($catalogPrice, 2),
            'afee' => $fee['assigned_fee'],
            'disc' => $fee['discount'],
            'ffee' => $fee['final_fee'],
            'paid' => $fee['amount_paid'],
            'due' => $fee['remaining_due'],
            'src' => $fee['fee_source'],
            'reason' => $fee['reason'],
            'actor' => $actorUserId ?: null,
        ]);
    }

    private function readJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (!is_string($raw) || trim($raw) === '') {
            return $_POST ?: [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function json(int $code, array $payload): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
