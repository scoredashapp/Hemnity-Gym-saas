# Hemnity Gym Owner — Native Android Application

**Hemnity Gym Owner** (`in.hemnity.gym.owner`) is a dedicated native Kotlin + Jetpack Compose Android application built exclusively for **Gym Owners** on the **Hemnity Gym Management SaaS** platform (`https://gym.hemnity.in/api/v1/`).

> **Scope & Role Isolation:** This app is strictly for Gym Owners (`owner`, `gym_owner`, `admin`). Gym Member and Hemnity Super Admin accounts are rejected upon server authentication.

## Features

- **Splash & Session Validation**: Animated black & orange branding (`#0B0B0F` / `#FF6B00`) with automatic Android Keystore token validation & refresh.
- **Gym Owner Login**: Email/password login (`POST /api/v1/auth/login`) and Personal Bearer Token mode, show/hide password, forgot password modal, server-confirmed role enforcement, and live SaaS plans preview (`GET /api/v1/public/landing`).
- **Dashboard (`GET /api/v1/owner/dashboard`)**: Pull-to-refresh KPIs, gym name/logo, SaaS subscription status banner, Total/Active/Expired members, Today's attendance, Monthly revenue, Pending fees, Membership Health bar chart, Expiring memberships, and Recent payments.
- **Members Directory (`GET/POST /api/v1/owner/members`)**:
  - Photo, Name, Member ID, Phone, Assigned Plan (`Unassigned` fallback), Expiry Date, Due badge, and Status badge.
  - Search, status/unassigned filters, and sorting (Name, Expiry, Newest, Dues) + Pull-to-Refresh on both Directory and Member Details.
  - Add Member & Assign/Renew Plan with **active-only server plans**, auto duration/start/expiry calculation, real-time `MembershipFeeCalculator` (`Remaining Due = max(0, Final Fee - Amount Paid)`, `Paid`/`Partial`/`Unpaid` rules, discount/override authorization reason, idempotency key).
  - Historical fee mismatch transparency card + View & Export ID Card action.
- **QR Attendance (`POST /api/v1/owner/attendance/qr-checkin`)**: Live **CameraX + ML Kit Barcode Scanning** (`FORMAT_QR_CODE`) with stale-closure-free `rememberUpdatedState` + `AtomicBoolean` single-scan locking, camera permission/unavailable fallbacks, torch toggle, manual Member ID/QR code check-in, explicit invalid/revoked/duplicate/expired/cross-tenant/network error cards, pull-to-refresh log, and immediate dashboard/attendance sync.
- **Member ID Card Generator**: Renders complete **Front + Back** black-and-orange ID cards with all 10 required fields (Gym Logo, Gym Name, Member Photo, Member Name, Member ID, Plan, Joining Date, Expiry Date, Status, high-contrast QR code) plus verified **Save PNG** (SAF), **Save PDF** (white page margin + `%PDF-` verification), **Print Card** (`PrintManager`), **Share** (`FileProvider`), and **Reissue QR**.
- **Payments, Plans, Reports, Notifications, Subscription & Settings**: Pull-to-refresh enabled across all screens, Cash/UPI manual payment recording, PDF receipt & report exports, live OpenAPI Spec Inspector (`GET /api/v1/docs/spec`), theme switcher, and Sign Out.

## Backend Extensions Included

- `backend/migrations/001_owner_app_extensions.sql` — Idempotent MySQL 8.0/MariaDB schema migration.
- `backend/php_extensions/api_v1_owner_extensions.php` — Tenant-scoped PHP 8.1+ PDO controller ready for cPanel deployment.

## Build & Test

- Compile Debug APK: `gradle :app:assembleDebug`
- Run Unit & Robolectric Tests: `gradle :app:testDebugUnitTest`
- Release APK: Provide `KEYSTORE_PATH`, `STORE_PASSWORD`, and `KEY_PASSWORD` environment variables before running `gradle :app:assembleRelease`.

## Documentation

- [API Integration Audit](docs/API_INTEGRATION.md)
- [PHP Backend Extension Specification](docs/PHP_BACKEND_EXTENSIONS.md)
