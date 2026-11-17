# Hemnity Gym Member (Android)

Native Kotlin + Jetpack Compose companion application exclusively for **Hemnity Gym** members, built for multi-tenant isolation against `https://gym.hemnity.in/api/v1/`.

- **Package / Application ID**: `in.hemnity.gym.member`
- **Minimum SDK**: Android 7.0 (API 24)
- **Target / Compile SDK**: Android 16 (API 36)
- **Architecture**: Clean MVVM + Repository Pattern + Navigation Compose + Retrofit/OkHttp/Moshi + Android Keystore AES-256-GCM encrypted token storage

## Core Features

1. **Animated Splash & Session Validation**: Validates encrypted tokens via `/auth/me` and `/auth/refresh`, routing directly to Dashboard or Login.
2. **Member-Only Login & Role Guard**: Connects to `POST /api/v1/auth/login` and strictly blocks `owner`, `gym_owner`, `super_admin`, and `admin` roles.
3. **Member Dashboard**: Displays welcome header, active membership hero card, remaining days countdown, total/monthly visits, pending fees, and quick actions.
4. **Multi-Gym Switching (`My Gyms`)**: Switch between independent gyms registered under the same member account with `X-Gym-Id` + `gym_id` isolation.
5. **Membership Details & Renewal History**: Displays plan duration, dates, semantic status (`Active`, `Expiring Soon`, `Expired`, `Suspended`), and conditional online renewal.
6. **Attendance Calendar & History**: Month-by-month calendar with attended, holiday, future, and unrecorded states (never presumptively marking unrecorded days absent).
7. **Digital Gym ID Card**: Renders ISO QR codes exclusively from server-issued cryptographic `qr_payload`, with full-screen QR mode and MediaStore/FileProvider PNG card export.
8. **Payments & PDF Receipts**: Total paid, pending fees, server-verified online payment checks, and receipt PDF downloads.
9. **Profile, Notifications & Security**: Backend-governed profile editing, password change, notification center & settings, Android 13+ notification permission flow, and secure logout.

## Build & Verification Instructions

```bash
# Assemble Debug APK
gradle :app:assembleDebug

# Run unit & Robolectric UI tests
gradle :app:testDebugUnitTest

# Assemble Release APK (requires signing environment variables KEYSTORE_PATH, STORE_PASSWORD, KEY_PASSWORD)
gradle :app:assembleRelease
```

The Debug APK output is located at:
`app/build/outputs/apk/debug/app-debug.apk`

## Backend PHP Extensions

See `/docs/API_INTEGRATION.md` and `/backend_php_extension/` for the companion PHP 8.1+ PDO controller and non-destructive MySQL schema extensions required on `https://gym.hemnity.in` for any member endpoints returning HTTP 404.
