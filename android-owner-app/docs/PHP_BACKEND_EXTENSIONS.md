# Hemnity Gym Owner — PHP 8.1+ Backend Extension & SQL Migration Guide

During live auditing of `https://gym.hemnity.in/api/v1/`, the core owner endpoints (`/auth/login`, `/owner/dashboard`, `/owner/members`, `/owner/attendance/qr-checkin`, `/docs/spec`) are live, while extended routes currently return `404 {"error":"API endpoint not found."}`.

Ready-to-deploy backend artifacts are now included in this repository:
- **SQL Migration:** `backend/migrations/001_owner_app_extensions.sql`
- **PHP 8.1+ PDO Controller:** `backend/php_extensions/api_v1_owner_extensions.php`

---

## 1. Mandatory Authorization & Tenant Isolation Rules

1. Authenticate Bearer token / session on every `/owner/*` route.
2. Require `in_array($authUser['role'], ['owner', 'gym_owner', 'admin'], true)`. Reject `member` and `superadmin` with HTTP `403`.
3. Scope every SQL query strictly to `WHERE gym_id = :auth_gym_id` derived from the authenticated token/session—never trust client-submitted `gym_id`.
4. Never return encrypted payment gateway secret keys (`gateway_secret_encrypted`) in any API response.
5. Enforce idempotency (`idempotency_key`), transactional member/payment creation, and server-side recomputation of `final_fee` and `remaining_due = max(0, final_fee - amount_paid)`.
6. Preserve historical `assigned_fee` / `final_fee` and `fee_source` snapshots on `members` + `fee_audit_logs` whenever catalog prices on `membership_plans` change.

---

## 2. Extended Owner & Auth Endpoints Implemented in `api_v1_owner_extensions.php`

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/v1/owner/plans` | `GET`, `POST` | List & create active/inactive gym plans (`duration_days`, `price`, `plan_type`, `is_active`). |
| `/api/v1/owner/plans/{id}` | `PUT` | Toggle `is_active` or edit plan details scoped to `gym_id`. |
| `/api/v1/owner/members` | `GET`, `POST` | List members (including `plan_current_price`, `assigned_fee`, `final_fee`, `remaining_due`, `fee_source`, `active_qr_token`) & transactionally create member + plan + initial payment + audit log. |
| `/api/v1/owner/members/{id}` | `PUT` | Update member `full_name`, `email`, `phone` scoped to `gym_id`. |
| `/api/v1/owner/members/{id}/status` | `POST` | Suspend or reactivate member (`status`: `active` / `suspended`). |
| `/api/v1/owner/members/{id}/renew` | `POST` | Assign or renew active plan with validated discount/override, dates, payment status & audit entry. |
| `/api/v1/owner/members/{id}/reissue-qr` | `POST` | Revoke previous QR credential & generate new cryptographic `HQR-*` token. |
| `/api/v1/owner/members/{id}/payments` | `GET` | Member payment history & receipt numbers. |
| `/api/v1/owner/members/{id}/attendance` | `GET` | Member check-in history. |
| `/api/v1/owner/attendance` | `GET` | Today's check-ins & gym attendance log. |
| `/api/v1/owner/attendance/qr-checkin` | `POST` | Verify `credential_token` or `member_code`, reject invalid/revoked (`404`), expired/suspended (`422`), cross-tenant (`403`), or duplicate daily check-in (`409`). |
| `/api/v1/owner/payments` | `GET`, `POST` | List verified payments (`status`, `search` filters) & record manual Cash/UPI desk payments updating `remaining_due`. |
| `/api/v1/owner/reports` | `GET` | Server-aggregated member, attendance, revenue, expiry & dues reports (`from`, `to`). |
| `/api/v1/owner/settings` | `GET`, `PUT` | Gym profile, operating hours, and boolean `gateway_configured` status. |
| `/api/v1/owner/subscription` | `GET` | Gym Owner SaaS plan, limits & enabled features. |
| `/api/v1/owner/notifications` | `GET` | Expiry alerts & announcements feed. |
