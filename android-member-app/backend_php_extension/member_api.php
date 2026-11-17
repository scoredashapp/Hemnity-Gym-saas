<?php
/**
 * Hemnity Gym Member REST API v1 Extension (PHP 8.1+ / PDO)
 *
 * Mount inside your existing /api/v1/ router for routes:
 *  - GET    /api/v1/auth/me
 *  - POST   /api/v1/auth/refresh
 *  - POST   /api/v1/auth/logout
 *  - POST   /api/v1/auth/forgot-password
 *  - GET    /api/v1/member/dashboard
 *  - GET    /api/v1/member/gyms
 *  - GET    /api/v1/member/memberships
 *  - POST   /api/v1/member/memberships/renew
 *  - GET    /api/v1/member/attendance
 *  - GET    /api/v1/member/id-card
 *  - GET    /api/v1/member/payments
 *  - POST   /api/v1/member/payments/initiate
 *  - GET    /api/v1/member/payments/{id}/verify
 *  - GET    /api/v1/member/payments/{id}/receipt
 *  - GET    /api/v1/member/profile
 *  - PATCH  /api/v1/member/profile
 *  - POST   /api/v1/member/profile/change-password
 *  - GET    /api/v1/member/notifications
 *  - POST   /api/v1/member/notifications/{id}/read
 *  - POST   /api/v1/member/notifications/read-all
 *  - PATCH  /api/v1/member/notifications/preferences
 *  - POST   /api/v1/member/devices/token
 *  - DELETE /api/v1/member/devices/token
 *
 * Security Rules:
 *  1. Member identity MUST come strictly from verified Bearer JWT / PHP session.
 *  2. Never trust client-supplied member_id.
 *  3. Reject role !== 'member' with HTTP 403.
 *  4. Validate requested gym_id against member's authorized gym memberships.
 */

declare(strict_types=1);

function hemnityJson(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function hemnityRequireMemberAuth(PDO $pdo): array
{
    $auth = hemnityAuthenticateRequest($pdo); // Integrate with your existing JWT/Session verifier
    if (!$auth) {
        hemnityJson(401, ['error' => 'Authentication required.']);
    }
    $role = strtolower((string)($auth['role'] ?? ''));
    if (!in_array($role, ['member', 'gym_member'], true)) {
        hemnityJson(403, ['error' => 'Only Gym Member accounts may access member API endpoints.']);
    }
    return $auth; // ['member_id' => ..., 'role' => 'member', 'email' => ...]
}

function hemnityResolveAuthorizedGymId(PDO $pdo, int $memberId): int
{
    $requestedGymId = $_SERVER['HTTP_X_GYM_ID'] ?? ($_GET['gym_id'] ?? null);
    if ($requestedGymId !== null && $requestedGymId !== '') {
        $stmt = $pdo->prepare(
            'SELECT gym_id FROM memberships WHERE member_id = :member_id AND gym_id = :gym_id LIMIT 1'
        );
        $stmt->execute([
            ':member_id' => $memberId,
            ':gym_id' => (int)$requestedGymId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            hemnityJson(403, ['error' => 'Unauthorized gym selection.']);
        }
        return (int)$row['gym_id'];
    }

    $stmt = $pdo->prepare(
        'SELECT gym_id FROM memberships WHERE member_id = :member_id ORDER BY expiry_date DESC LIMIT 1'
    );
    $stmt->execute([':member_id' => $memberId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        hemnityJson(404, ['error' => 'No gym membership found for this account.']);
    }
    return (int)$row['gym_id'];
}

function hemnityIssueSecureQrToken(PDO $pdo, int $memberId, int $gymId, int $membershipId): array
{
    // Cryptographically random non-predictable QR credential matching live Hemnity HQR format
    // Stored in member_qr_tokens so POST /api/v1/owner/attendance/qr-checkin can validate it
    $token = 'HQR-' . strtoupper(bin2hex(random_bytes(16)));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 900);

    $stmt = $pdo->prepare(
        'INSERT INTO member_qr_tokens (member_id, gym_id, membership_id, qr_token, expires_at)
         VALUES (:member_id, :gym_id, :membership_id, :qr_token, :expires_at)'
    );
    $stmt->execute([
        ':member_id' => $memberId,
        ':gym_id' => $gymId,
        ':membership_id' => $membershipId,
        ':qr_token' => $token,
        ':expires_at' => $expiresAt,
    ]);

    return [
        'active_qr_token' => $token,
        'qr_payload' => $token,
        'qr_token' => $token,
        'qr_expires_at' => $expiresAt . 'Z',
    ];
}
