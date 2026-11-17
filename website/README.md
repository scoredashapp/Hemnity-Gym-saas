# Hemnity Gym Management Software (Multi-Tenant SaaS — cPanel PHP 8.1+ & MySQL)

**Hemnity Gym Management Software** (`Parent Brand: Hemnity`, production URL `https://gym.hemnity.in`) is a complete, multi-tenant gym SaaS platform built with **Core PHP 8.1+ (PDO)**, **MySQL 8.0+ / MariaDB 10.4+**, **HTML5**, **CSS3**, **JavaScript**, and **Bootstrap 5**. It runs cleanly on standard **cPanel shared hosting** with **phpMyAdmin** — requiring **no Node.js, npm, Composer, SSH, or terminal access**, inside either the domain root (`public_html/`) or any subfolder (`public_html/gym/`).

---

## Platform Portals & Strict Tenant Isolation

1. **Public SaaS Landing Page (`index.php?landing=1`)** — DB-driven subscription plans (`saas_plans`), FAQs (`platform_faqs`), CMS hero/legal summaries (`platform_settings`), contact support ticket submission (`support_tickets`), and self-service **Gym Workspace Registration** (`owner_register.php`).
2. **Hemnity Super Admin Console (`superadmin/login.php` & `superadmin/index.php`)** — Multi-tenant overview KPIs, gym provisioning/suspension, DB-driven SaaS plan pricing editor, billing invoices, landing CMS & FAQ manager, support ticket desk, and platform audit trail.
3. **Gym Owner Workspace (`login.php` & `index.php`)** — Strictly `gym_id`-scoped Dashboard, Members CRUD + Quota check, Plans, Payments + Refunds + Printable Receipts, QR Attendance & Photo Verification Desk, Printable PVC/A4 ID Cards (`id_cards.php`), 7 Reports + CSV Export, AES-256 Encrypted Payment Gateway Settings (`settings.php`), and Subscription Billing (`owner_subscription.php`).
4. **Gym Member Self-Service Portal (`member/login.php` & `member/index.php`)** — Multi-gym membership switcher, mobile digital QR pass, attendance history, payment receipts, and online plan renewal.
5. **Protected REST API & PWA (`api/v1/`, `api/docs/`, `manifest.webmanifest`, `sw.js`)** — Versioned Bearer-token & session REST API, HMAC-SHA256 payment webhook handler, authenticated API docs + token generator, and installable offline-aware PWA.

---

## Project File Structure (42 cPanel Files)

```text
public_html/ (or public_html/gym/)
├── .htaccess                  # Apache/LiteSpeed security rules & /api/v1/ clean routing
├── config.php                 # PDO DB connection, AES-256 crypto, CSRF, XSS & tenant auth guards
├── database_saas.sql          # Fresh Multi-Tenant SaaS MySQL schema & sample plans/FAQs/CMS
├── database_migration.sql     # Safe idempotent upgrade script from single-gym `database.sql`
├── database.sql               # Legacy single-gym reference schema
├── manifest.webmanifest       # PWA Web App Manifest
├── sw.js / offline.html       # PWA Service Worker & offline fallback
├── setup_admin.php            # One-time secure Super Admin & Owner setup (DELETE AFTER USE)
├── index.php                  # Public SaaS Landing Page OR Gym Owner Tenant Dashboard
├── login.php / logout.php     # Owner sign-in (with legacy `admins` auto-migration) & sign-out
├── change_password.php        # Account password update
├── owner_register.php         # Self-service gym registration + SaaS trial onboarding
├── owner_subscription.php     # Owner SaaS plan upgrade, member quota & billing invoices
├── members.php / member_add.php / member_edit.php / member_view.php
├── membership_plans.php / plan_add.php / plan_edit.php
├── payments.php / payment_add.php / receipt.php
├── attendance.php             # Revocable QR token scanner + Member ID check-in
├── id_cards.php               # Printable PVC/A4 QR ID Cards + Revoke & Reissue QR
├── reports.php                # 7 tenant-scoped operational/financial reports + CSV export
├── settings.php               # White-label gym profile, QR toggles & encrypted payment gateways
├── member/
│   ├── login.php
│   └── index.php              # Multi-gym member portal, QR pass, receipts & renewal
├── superadmin/
│   ├── login.php
│   └── index.php              # Hemnity Super Admin multi-tenant control plane
├── api/
│   ├── v1/index.php           # JSON REST API v1 (Bearer auth, QR check-in, HMAC webhooks)
│   └── docs/index.php         # Authenticated Developer Docs & Personal Bearer Token manager
├── includes/ (header.php, sidebar.php, footer.php)
├── assets/ (css/style.css, js/app.js)
└── uploads/ (.htaccess, members/, logos/)
```

---

## Option A: Fresh Multi-Tenant SaaS Installation on cPanel

1. **Create MySQL Database & User** in **cPanel → MySQL® Databases**, grant **ALL PRIVILEGES**, and note any cPanel prefix (e.g. `cpaneluser_hemnity`).
2. **Import `database_saas.sql`** via **phpMyAdmin** (comment out `CREATE DATABASE` / `USE` if shared hosting disables database creation inside phpMyAdmin). Zero plaintext admin passwords are inserted.
3. **Upload & Extract `gym-cpanel.zip`** into `public_html/` (or `public_html/gym/`). Ensure **Show Hidden Files (dotfiles)** is enabled so `/.htaccess` and `/uploads/.htaccess` exist.
4. **Create `config.local.php`** alongside `config.php` (never exposed publicly, blocked by `.htaccess`):
   ```php
   <?php
   return [
       'host'           => 'localhost',
       'port'           => '3306',
       'dbname'         => 'cpaneluser_hemnity',
       'username'       => 'cpaneluser_gymuser',
       'password'       => 'YOUR_STRONG_DB_PASSWORD',
       'encryption_key' => 'GENERATE_A_RANDOM_64_CHAR_HEX_KEY_HERE',
       'base_url'       => 'https://gym.hemnity.in',
   ];
   ```
5. **Run Initial Platform Setup**: Visit `/setup_admin.php`, create your **Hemnity Super Admin** and **Primary Gym Owner** credentials (hashed via `password_hash()`), then **immediately delete `setup_admin.php`** and any `.sql` files from `public_html/`.

---

## Option B: Safe Upgrade from Existing Single-Gym Installation (Zero Data Loss)

1. **Mandatory Pre-Upgrade Backup**:
   - Open **phpMyAdmin → Export** on your existing database and save a full `.sql` backup locally.
   - Open **cPanel File Manager**, compress and download a ZIP backup of your `uploads/` folder and existing `.php` files.
2. **Import `database_migration.sql`** into your **existing** database in **phpMyAdmin**.
   - Preserves 100% of existing `members`, `membership_plans`, `memberships`, `payments`, `attendance`, and `gym_settings` rows under `gym_id = 1`.
   - Migrates existing `admins` rows into `users` (`role = 'gym_owner'`) and `gym_owners` (`gym_id = 1`).
   - Issues active cryptographic tokens in `qr_credentials` for all existing members without dropping any data.
3. **Upload Upgraded PHP Files** (do not overwrite your existing `uploads/` images).
4. **Verify & Provision Super Admin**: Log in at `login.php` with your existing owner email/password, then open `setup_admin.php` once to register your **Hemnity Super Admin** account if none exists yet, and delete `setup_admin.php`.
5. **Rollback Instructions**: If you ever need to revert, drop tables in phpMyAdmin, import your pre-upgrade `.sql` backup, and restore your backed-up PHP files.

---

## Security & Daily Maintenance Checklist

- **Tenant Authorization**: Every query, CSV export, QR check-in, receipt, and file operation derives `gym_id` strictly from authenticated server state (`require_owner_tenant()` / `gym_owners`), never trusting client-submitted `gym_id`.
- **Encrypted Gateway Secrets**: Payment gateway keys and webhook secrets are encrypted using AES-256-GCM / AES-256-CBC (`config.local.php -> encryption_key`) and returned masked in UI responses.
- **Webhook Verification**: `/api/v1/webhooks/payment` validates `X-Hemnity-Signature` / `X-Razorpay-Signature` via `hash_hmac('sha256', ...)` before marking orders `Paid`.
- **HTTPS & Backups**: Enable AutoSSL + Force HTTPS Redirect in cPanel and schedule daily database/uploads backups via JetBackup or cPanel Cron.
