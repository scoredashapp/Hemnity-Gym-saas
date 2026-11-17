# Hemnity Gym Owner — API Integration & Live Audit Report

**Base URL:** `https://gym.hemnity.in/api/v1/`

## 1. Live Backend Audit Results

Audited directly against `https://gym.hemnity.in/api/v1`:

| Endpoint | Method | Live Status | Notes |
| --- | --- | --- | --- |
| `/public/landing` | `GET` | **200 OK (Confirmed)** | Returns `{ platform, plans, faqs }`. |
| `/auth/login` | `POST` | **Confirmed** | Requires `email` and `password`. App rejects `member` and `superadmin` roles. |
| `/owner/dashboard` | `GET` | **Confirmed (Bearer Auth)** | Returns `gym_id`, `gym_name`, `subscription` (`effective_status`, `enabled_features_json`), and `kpis`. |
| `/owner/members` | `GET`, `POST` | **Confirmed (Bearer Auth)** | Returns member directory with `member_code`, `membership_start_date`, `membership_expiry_date`, `plan_name`, `active_qr_token`. |
| `/owner/attendance/qr-checkin` | `POST` | **Confirmed (Bearer Auth)** | Validates `credential_token` or `member_code`. Unknown/revoked credentials (`404` non-route), expired (`422`), duplicate (`409`), and cross-tenant (`403`) errors map directly to scan result cards. |
| `/docs/spec` | `GET` | **Confirmed (Bearer Auth)** | Protected OpenAPI spec inspectable in Settings. |
| `/webhooks/payment` | `POST` | **Server-to-Server Only** | Protected by HMAC-SHA256; never invoked from Android. |
| `/owner/plans`, `/owner/attendance`, `/owner/payments`, `/owner/reports`, `/owner/settings`, `/owner/subscription`, `/owner/notifications` | `GET`/`POST`/`PUT` | **404 Not Found on live server** | Ready-to-deploy PHP controller & SQL migration included under `backend/`; app renders non-crashing extension guidance & live-derived fallbacks where safe. |

## 2. Recent Integration Upgrades

- **QR Credential Extraction**: Supports raw `HQR-*` / `hem_qr_*` tokens, JSON payloads (`{credential_token, qr_token, member_code}`), and URL query/path payloads, with single-scan atomic locking + cooldown to prevent duplicate submissions.
- **Membership Plans & Auto Fee Calculation**: Active-only plan selection (`isActive == true`), automatic start/expiry date calculation, real-time `Remaining Due = max(0, Final Fee - Amount Paid)`, explicit discount/override authorization reason validation, `Paid`/`Partial`/`Unpaid` status derivation, and `idempotency_key` deduplication.
- **Price Mismatch Transparency**: Displays historical `assigned_fee` / `final_fee`, `fee_source` (`plan_default`, `historical_price`, `custom_override`, `duplicated_assignment`), and catalog `plan_current_price` side-by-side without mutating past records.
- **Pull-to-Refresh Preservation**: Material 3 `PullToRefreshBox` preserves loaded screen state while refreshing and displays inline retry banners on transient failures.
