#!/usr/bin/env python3
"""
Builds a clean, ready-to-upload cPanel ZIP archive (`public/gym-cpanel.zip` and `gym-cpanel.zip`)
containing ONLY the Core PHP 8.1+, MySQL schemas/migration scripts, `.htaccess`, Bootstrap/CSS/JS,
PWA manifest/service worker, safe `uploads/` structure, and `README.md` — with zero Node.js/npm files.
"""
import os
import zipfile

CPANEL_FILES = [
    ".htaccess",
    "README.md",
    "database.sql",
    "database_saas.sql",
    "database_migration.sql",
    "config.php",
    "manifest.webmanifest",
    "sw.js",
    "offline.html",
    "setup_admin.php",
    "index.php",
    "login.php",
    "logout.php",
    "change_password.php",
    "members.php",
    "member_add.php",
    "member_edit.php",
    "member_view.php",
    "membership_plans.php",
    "plan_add.php",
    "plan_edit.php",
    "payments.php",
    "payment_add.php",
    "receipt.php",
    "attendance.php",
    "id_cards.php",
    "reports.php",
    "settings.php",
    "owner_register.php",
    "owner_subscription.php",
    "member/login.php",
    "member/index.php",
    "superadmin/login.php",
    "superadmin/index.php",
    "api/v1/index.php",
    "api/docs/index.php",
    "includes/header.php",
    "includes/sidebar.php",
    "includes/footer.php",
    "assets/css/style.css",
    "assets/js/app.js",
    "uploads/.htaccess",
]

EMPTY_UPLOAD_DIRS = [
    "uploads/members/.gitkeep",
    "uploads/logos/.gitkeep",
]


def build_zip(output_path: str) -> int:
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel_path in CPANEL_FILES:
            if not os.path.isfile(rel_path):
                raise FileNotFoundError(f"Missing required cPanel file: {rel_path}")
            zf.write(rel_path, arcname=rel_path)
            count += 1
        for keep_path in EMPTY_UPLOAD_DIRS:
            zf.writestr(keep_path, "")
            count += 1
    return count


if __name__ == "__main__":
    n1 = build_zip("public/gym-cpanel.zip")
    n2 = build_zip("gym-cpanel.zip")
    print(f"Packaged {n1} entries into public/gym-cpanel.zip and gym-cpanel.zip")
