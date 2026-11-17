<?php
declare(strict_types=1);

define('GYM_PATH_DEPTH', 1);
require_once dirname(__DIR__) . '/config.php';

$superAdmin  = require_super_admin();
$pdo         = db();
$platformCfg = get_platform_settings($pdo);

$allowedTabs = ['overview', 'gyms', 'plans', 'subscriptions', 'branding', 'apps', 'showcase', 'cms', 'tickets', 'audit'];
$tab = clean_str($_GET['tab'] ?? 'overview', 30);
if (!in_array($tab, $allowedTabs, true)) {
    $tab = 'overview';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action      = clean_str($_POST['action'] ?? '', 60);
    $redirectTab = clean_str($_POST['redirect_tab'] ?? $tab, 30);
    if (!in_array($redirectTab, $allowedTabs, true)) {
        $redirectTab = 'overview';
    }

    if ($action === 'toggle_gym_status') {
        $gymId     = (int)($_POST['gym_id'] ?? 0);
        $newStatus = clean_str($_POST['status'] ?? 'Active', 20);
        if ($gymId > 0 && in_array($newStatus, ['Active', 'Trial', 'Suspended', 'Pending'], true)) {
            $pdo->prepare('UPDATE gyms SET status = :st WHERE id = :gid')->execute([':st' => $newStatus, ':gid' => $gymId]);
            if ($newStatus === 'Suspended') {
                $pdo->prepare("UPDATE gym_saas_subscriptions SET status = 'Suspended' WHERE gym_id = :gid")->execute([':gid' => $gymId]);
            } elseif ($newStatus === 'Active') {
                $pdo->prepare("UPDATE gym_saas_subscriptions SET status = 'Active' WHERE gym_id = :gid AND status = 'Suspended'")->execute([':gid' => $gymId]);
            }
            log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.gym_status_changed', 'gym', (string)$gymId, $gymId, ['status' => $newStatus]);
            set_flash('success', 'Gym workspace status updated to ' . $newStatus . '.');
        }
        redirect('index.php?tab=' . $redirectTab);
    }

    if ($action === 'assign_gym_plan') {
        $gymId  = (int)($_POST['gym_id'] ?? 0);
        $planId = (int)($_POST['saas_plan_id'] ?? 0);
        $cycle  = clean_str($_POST['billing_cycle'] ?? 'monthly', 20);
        if (!in_array($cycle, ['monthly', 'quarterly', 'yearly'], true)) {
            $cycle = 'monthly';
        }
        if ($gymId > 0 && $planId > 0) {
            $days = $cycle === 'yearly' ? 365 : ($cycle === 'quarterly' ? 90 : 30);
            $pdo->prepare(
                "INSERT INTO gym_saas_subscriptions (gym_id, saas_plan_id, billing_cycle, status, current_period_start, current_period_end, grace_period_days)
                 VALUES (:gid, :pid, :cyc, 'Active', CURDATE(), DATE_ADD(CURDATE(), INTERVAL :days DAY), 7)
                 ON DUPLICATE KEY UPDATE saas_plan_id = VALUES(saas_plan_id), billing_cycle = VALUES(billing_cycle), status = 'Active', current_period_end = GREATEST(current_period_end, DATE_ADD(CURDATE(), INTERVAL :days2 DAY))"
            )->execute([':gid' => $gymId, ':pid' => $planId, ':cyc' => $cycle, ':days' => $days, ':days2' => $days]);
            $pdo->prepare("UPDATE gyms SET status = 'Active' WHERE id = :gid AND status IN ('Trial','Pending')")->execute([':gid' => $gymId]);
            log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.assign_plan', 'gym', (string)$gymId, $gymId, ['saas_plan_id' => $planId, 'cycle' => $cycle]);
            set_flash('success', 'Gym SaaS subscription plan updated.');
        }
        redirect('index.php?tab=' . $redirectTab);
    }

    if ($action === 'create_gym') {
        $gymName    = clean_str($_POST['gym_name'] ?? '', 150);
        $city       = clean_str($_POST['city'] ?? '', 100);
        $ownerName  = clean_str($_POST['owner_name'] ?? '', 120);
        $ownerEmail = strtolower(clean_str($_POST['owner_email'] ?? '', 190));
        $ownerPhone = clean_str($_POST['owner_phone'] ?? '', 30);
        $ownerPass  = (string)($_POST['owner_password'] ?? '');
        $planId     = (int)($_POST['saas_plan_id'] ?? 1);
        $status     = clean_str($_POST['status'] ?? 'Active', 20);
        if (!in_array($status, ['Active', 'Trial'], true)) {
            $status = 'Active';
        }

        if ($gymName === '' || $ownerName === '' || !filter_var($ownerEmail, FILTER_VALIDATE_EMAIL) || strlen($ownerPass) < 8) {
            set_flash('danger', 'Please enter valid gym details, owner email, and a password of at least 8 characters.');
        } else {
            $dup = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $dup->execute([':email' => $ownerEmail]);
            if ($dup->fetch()) {
                set_flash('danger', 'A user with email ' . $ownerEmail . ' already exists.');
            } else {
                $planStmt = $pdo->prepare('SELECT * FROM saas_plans WHERE id = :id LIMIT 1');
                $planStmt->execute([':id' => $planId]);
                $plan = $planStmt->fetch() ?: $pdo->query('SELECT * FROM saas_plans ORDER BY id ASC LIMIT 1')->fetch();

                $pdo->beginTransaction();
                try {
                    $hash = password_hash($ownerPass, PASSWORD_DEFAULT);
                    $pdo->prepare("INSERT INTO users (role, full_name, email, phone, password_hash, is_active, is_initial_setup_complete) VALUES ('gym_owner', :fn, :em, :ph, :pw, 1, 1)")
                        ->execute([':fn' => $ownerName, ':em' => $ownerEmail, ':ph' => $ownerPhone ?: null, ':pw' => $hash]);
                    $ownerId = (int)$pdo->lastInsertId();

                    $slug    = slugify_gym_name($gymName) . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
                    $gymCode = 'HEM-GYM-' . strtoupper(bin2hex(random_bytes(2)));
                    $pdo->prepare('INSERT INTO gyms (gym_code, slug, name, owner_user_id, email, phone, city, status) VALUES (:gc, :sl, :nm, :uid, :em, :ph, :ct, :st)')
                        ->execute([':gc' => $gymCode, ':sl' => $slug, ':nm' => $gymName, ':uid' => $ownerId, ':em' => $ownerEmail, ':ph' => $ownerPhone ?: null, ':ct' => $city ?: null, ':st' => $status]);
                    $newGymId = (int)$pdo->lastInsertId();

                    $pdo->prepare("INSERT INTO gym_owners (gym_id, user_id, role_label, is_primary) VALUES (:gid, :uid, 'Owner', 1)")
                        ->execute([':gid' => $newGymId, ':uid' => $ownerId]);

                    $pdo->prepare("INSERT INTO gym_settings (gym_id, gym_name, email, contact_number, currency_code, currency_symbol) VALUES (:gid, :nm, :em, :ph, 'INR', '₹')")
                        ->execute([':gid' => $newGymId, ':nm' => $gymName, ':em' => $ownerEmail, ':ph' => $ownerPhone ?: '']);

                    $days = $status === 'Trial' ? max(1, (int)($plan['trial_days'] ?? 14)) : 30;
                    $pdo->prepare("INSERT INTO gym_saas_subscriptions (gym_id, saas_plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, grace_period_days) VALUES (:gid, :pid, 'monthly', :st, :tr, CURDATE(), DATE_ADD(CURDATE(), INTERVAL :days DAY), 7)")
                        ->execute([
                            ':gid'  => $newGymId,
                            ':pid'  => (int)$plan['id'],
                            ':st'   => $status,
                            ':tr'   => $status === 'Trial' ? date('Y-m-d', strtotime('+' . $days . ' days')) : null,
                            ':days' => $days,
                        ]);

                    $pdo->prepare(
                        "INSERT INTO membership_plans (gym_id, plan_name, duration_days, price, description, is_active) VALUES
                         (:gid1, 'Monthly', 30, 1000.00, 'Full gym floor & cardio access for 30 days.', 1),
                         (:gid2, 'Quarterly', 90, 2700.00, '90-day strength & conditioning membership.', 1),
                         (:gid3, 'Yearly', 365, 9000.00, '365-day annual all-access membership.', 1)"
                    )->execute([':gid1' => $newGymId, ':gid2' => $newGymId, ':gid3' => $newGymId]);

                    $pdo->commit();
                    log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.create_gym', 'gym', (string)$newGymId, $newGymId, ['name' => $gymName]);
                    set_flash('success', 'Created gym workspace "' . $gymName . '" (' . $gymCode . ').');
                } catch (Throwable $ex) {
                    $pdo->rollBack();
                    set_flash('danger', 'Could not create gym workspace: ' . $ex->getMessage());
                }
            }
        }
        redirect('index.php?tab=gyms');
    }

    if ($action === 'save_saas_plan') {
        $planId      = (int)($_POST['plan_id'] ?? 0);
        $planName    = clean_str($_POST['plan_name'] ?? '', 100);
        $slug        = slugify_gym_name($_POST['slug'] ?: $planName);
        $tagline     = clean_str($_POST['tagline'] ?? '', 180);
        $monthly     = max(0, round((float)($_POST['monthly_price'] ?? 0), 2));
        $quarterly   = max(0, round((float)($_POST['quarterly_price'] ?? 0), 2));
        $yearly      = max(0, round((float)($_POST['yearly_price'] ?? 0), 2));
        $trialDays   = max(0, (int)($_POST['trial_days'] ?? 14));
        $maxMembers  = max(1, (int)($_POST['max_members'] ?? 150));
        $maxBranches = max(1, (int)($_POST['max_branches'] ?? 1));
        $discount    = max(0, min(90, round((float)($_POST['discount_percent'] ?? 0), 2)));
        $description = clean_str($_POST['description'] ?? '', 500);
        $isFeatured  = isset($_POST['is_featured']) ? 1 : 0;
        $isActive    = isset($_POST['is_active']) ? 1 : 0;

        if ($planName === '') {
            set_flash('danger', 'SaaS plan name is required.');
        } else {
            if ($planId > 0) {
                $pdo->prepare(
                    'UPDATE saas_plans SET plan_name = :pn, tagline = :tg, monthly_price = :mp, quarterly_price = :qp, yearly_price = :yp,
                     trial_days = :td, max_members = :mm, max_branches = :mb, discount_percent = :dp, description = :ds,
                     is_featured = :feat, is_active = :act WHERE id = :id'
                )->execute([
                    ':pn' => $planName, ':tg' => $tagline, ':mp' => $monthly, ':qp' => $quarterly, ':yp' => $yearly,
                    ':td' => $trialDays, ':mm' => $maxMembers, ':mb' => $maxBranches, ':dp' => $discount, ':ds' => $description,
                    ':feat' => $isFeatured, ':act' => $isActive, ':id' => $planId,
                ]);
                log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.update_saas_plan', 'saas_plan', (string)$planId, null, ['monthly_price' => $monthly]);
                set_flash('success', 'Updated SaaS plan "' . $planName . '". Changes are live on the public pricing page.');
            } else {
                $features = json_encode(['qr_attendance', 'member_portal', 'csv_exports', 'whatsapp_reminders', 'online_payments']);
                $pdo->prepare(
                    'INSERT INTO saas_plans (slug, plan_name, tagline, monthly_price, quarterly_price, yearly_price, trial_days, max_members, max_branches, discount_percent, enabled_features_json, description, is_featured, is_active, sort_order)
                     VALUES (:sl, :pn, :tg, :mp, :qp, :yp, :td, :mm, :mb, :dp, :feat_json, :ds, :feat, :act, 10)'
                )->execute([
                    ':sl' => $slug, ':pn' => $planName, ':tg' => $tagline, ':mp' => $monthly, ':qp' => $quarterly, ':yp' => $yearly,
                    ':td' => $trialDays, ':mm' => $maxMembers, ':mb' => $maxBranches, ':dp' => $discount, ':feat_json' => $features, ':ds' => $description,
                    ':feat' => $isFeatured, ':act' => $isActive,
                ]);
                set_flash('success', 'Created new SaaS plan "' . $planName . '".');
            }
        }
        redirect('index.php?tab=plans');
    }

    if ($action === 'record_saas_payment') {
        $gymId  = (int)($_POST['gym_id'] ?? 0);
        $amount = max(0, round((float)($_POST['amount'] ?? 0), 2));
        $cycle  = clean_str($_POST['billing_cycle'] ?? 'monthly', 20);
        $method = clean_str($_POST['payment_method'] ?? 'Online', 50);
        $ref    = clean_str($_POST['transaction_ref'] ?? '', 120);
        $extend = max(1, (int)($_POST['extend_days'] ?? 30));

        if ($gymId > 0 && $amount > 0) {
            $subStmt = $pdo->prepare('SELECT id, saas_plan_id FROM gym_saas_subscriptions WHERE gym_id = :gid LIMIT 1');
            $subStmt->execute([':gid' => $gymId]);
            $subRow = $subStmt->fetch();

            $invoice = 'HEM-INV-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $pdo->prepare(
                "INSERT INTO saas_subscription_payments (invoice_number, gym_id, subscription_id, saas_plan_id, billing_cycle, amount, currency, payment_method, transaction_ref, status, paid_at)
                 VALUES (:inv, :gid, :sid, :pid, :cyc, :amt, 'INR', :mth, :ref, 'Paid', NOW())"
            )->execute([
                ':inv' => $invoice,
                ':gid' => $gymId,
                ':sid' => $subRow['id'] ?? null,
                ':pid' => $subRow['saas_plan_id'] ?? null,
                ':cyc' => $cycle,
                ':amt' => $amount,
                ':mth' => $method,
                ':ref' => $ref ?: $invoice,
            ]);

            $pdo->prepare("UPDATE gym_saas_subscriptions SET status = 'Active', current_period_end = DATE_ADD(GREATEST(current_period_end, CURDATE()), INTERVAL :d DAY) WHERE gym_id = :gid")
                ->execute([':d' => $extend, ':gid' => $gymId]);
            $pdo->prepare("UPDATE gyms SET status = 'Active' WHERE id = :gid")->execute([':gid' => $gymId]);
            log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.record_saas_payment', 'saas_payment', $invoice, $gymId, ['amount' => $amount]);
            set_flash('success', 'Recorded SaaS invoice ' . $invoice . ' and extended gym subscription by ' . $extend . ' days.');
        }
        redirect('index.php?tab=subscriptions');
    }

    if ($action === 'save_youtube') {
        $url = clean_str((string)($_POST['youtube_url'] ?? ''), 255);
        if ($url !== '' && youtube_video_id($url) === null) {
            set_flash('danger', 'That does not look like a valid YouTube link.');
        } else {
            $pdo->prepare('UPDATE platform_settings SET youtube_url = :u, youtube_title = :t WHERE id = 1')->execute([':u' => $url ?: null, ':t' => clean_str((string)($_POST['youtube_title'] ?? ''), 150) ?: null]);
            set_flash('success', $url === '' ? 'Homepage video removed.' : 'Homepage YouTube video saved.');
        }
        redirect('index.php?tab=showcase');
    }
    if ($action === 'add_review') {
        $name = clean_str((string)($_POST['customer_name'] ?? ''), 120);
        $text = clean_str((string)($_POST['review_text'] ?? ''), 1500, true);
        if ($name === '' || $text === '') {
            set_flash('danger', 'Customer name and review text are required.');
            redirect('index.php?tab=showcase');
        }
        $photo = null;
        if (!empty($_FILES['photo']) && (int)($_FILES['photo']['error'] ?? 4) !== UPLOAD_ERR_NO_FILE) {
            $up = handle_image_upload($_FILES['photo'], 'showcase');
            if (!$up['ok']) { set_flash('danger', (string)$up['error']); redirect('index.php?tab=showcase'); }
            $photo = $up['path'];
        }
        $pdo->prepare('INSERT INTO landing_reviews (customer_name, customer_role, rating, review_text, photo_path, sort_order) VALUES (:n, :r, :rt, :t, :p, :s)')
            ->execute([':n' => $name, ':r' => clean_str((string)($_POST['customer_role'] ?? ''), 150) ?: null, ':rt' => max(1, min(5, (int)($_POST['rating'] ?? 5))), ':t' => $text, ':p' => $photo, ':s' => (int)($_POST['sort_order'] ?? 0)]);
        set_flash('success', 'Customer review added to the homepage.');
        redirect('index.php?tab=showcase');
    }
    if ($action === 'add_partner') {
        $name = clean_str((string)($_POST['partner_name'] ?? ''), 150);
        if ($name === '') { set_flash('danger', 'Partner / gym name is required.'); redirect('index.php?tab=showcase'); }
        $site = clean_str((string)($_POST['website_url'] ?? ''), 255);
        if ($site !== '' && !preg_match('#^https?://#i', $site)) { $site = 'https://' . $site; }
        $logo = null;
        if (!empty($_FILES['logo']) && (int)($_FILES['logo']['error'] ?? 4) !== UPLOAD_ERR_NO_FILE) {
            $up = handle_image_upload($_FILES['logo'], 'showcase');
            if (!$up['ok']) { set_flash('danger', (string)$up['error']); redirect('index.php?tab=showcase'); }
            $logo = $up['path'];
        }
        $pdo->prepare('INSERT INTO landing_partners (name, city, website_url, logo_path, sort_order) VALUES (:n, :c, :w, :l, :s)')
            ->execute([':n' => $name, ':c' => clean_str((string)($_POST['city'] ?? ''), 100) ?: null, ':w' => $site ?: null, ':l' => $logo, ':s' => (int)($_POST['sort_order'] ?? 0)]);
        set_flash('success', 'Trusted partner added to the homepage.');
        redirect('index.php?tab=showcase');
    }
    if (in_array($action, ['delete_review', 'toggle_review', 'delete_partner', 'toggle_partner'], true)) {
        $id = (int)($_POST['item_id'] ?? 0);
        $tbl = str_contains($action, 'review') ? 'landing_reviews' : 'landing_partners';
        $imgCol = $tbl === 'landing_reviews' ? 'photo_path' : 'logo_path';
        if ($id > 0) {
            if (str_starts_with($action, 'delete')) {
                $q = $pdo->prepare("SELECT {$imgCol} FROM {$tbl} WHERE id = :id"); $q->execute([':id' => $id]);
                $f = (string)$q->fetchColumn();
                if ($f !== '' && str_starts_with($f, 'uploads/showcase/')) { @unlink(dirname(__DIR__) . '/' . $f); }
                $pdo->prepare("DELETE FROM {$tbl} WHERE id = :id")->execute([':id' => $id]);
                set_flash('success', 'Removed.');
            } else {
                $pdo->prepare("UPDATE {$tbl} SET is_active = 1 - is_active WHERE id = :id")->execute([':id' => $id]);
                set_flash('success', 'Visibility updated.');
            }
        }
        redirect('index.php?tab=showcase');
    }

    if ($action === 'save_apps') {
        $cfgNow = $pdo->query('SELECT owner_apk_path, member_apk_path FROM platform_settings WHERE id = 1')->fetch() ?: [];
        foreach (['owner', 'member'] as $app) {
            $col = $app . '_apk_path';
            $old = (string)($cfgNow[$col] ?? '');
            $url = clean_str((string)($_POST[$app . '_apk_url'] ?? ''), 500);
            if ($url !== '' && !preg_match('#^https?://#i', $url)) {
                set_flash('danger', ucfirst($app) . ' app link must start with http:// or https://');
                redirect('index.php?tab=apps');
            }
            $ver = clean_str((string)($_POST[$app . '_apk_version'] ?? ''), 30);
            $pdo->prepare("UPDATE platform_settings SET {$app}_apk_url = :u, {$app}_apk_version = :v WHERE id = 1")->execute([':u' => $url ?: null, ':v' => $ver ?: null]);
            if (!empty($_POST['remove_' . $app])) {
                if ($old !== '' && str_starts_with($old, 'uploads/apps/')) { @unlink(dirname(__DIR__) . '/' . $old); }
                $pdo->prepare("UPDATE platform_settings SET {$col} = NULL WHERE id = 1")->execute();
            }
            $f = $_FILES[$app . '_apk'] ?? null;
            if ($f && (int)($f['error'] ?? 4) !== UPLOAD_ERR_NO_FILE) {
                if ((int)$f['error'] !== UPLOAD_ERR_OK) {
                    set_flash('danger', ucfirst($app) . ' APK upload failed (error ' . (int)$f['error'] . '). The file may exceed the server upload limit — use the link field instead.');
                    redirect('index.php?tab=apps');
                }
                if (strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION)) !== 'apk') {
                    set_flash('danger', ucfirst($app) . ': only .apk files are allowed.');
                    redirect('index.php?tab=apps');
                }
                $head = (string)file_get_contents((string)$f['tmp_name'], false, null, 0, 4);
                if ($head !== "PK\x03\x04") {
                    set_flash('danger', ucfirst($app) . ': file is not a valid APK.');
                    redirect('index.php?tab=apps');
                }
                $dir = dirname(__DIR__) . '/uploads/apps';
                if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
                $name = 'uploads/apps/hemnity-' . $app . '-' . bin2hex(random_bytes(6)) . '.apk';
                if (!move_uploaded_file((string)$f['tmp_name'], dirname(__DIR__) . '/' . $name)) {
                    set_flash('danger', 'Could not save the ' . $app . ' APK.');
                    redirect('index.php?tab=apps');
                }
                if ($old !== '' && str_starts_with($old, 'uploads/apps/')) { @unlink(dirname(__DIR__) . '/' . $old); }
                $pdo->prepare("UPDATE platform_settings SET {$col} = :p WHERE id = 1")->execute([':p' => $name]);
            }
        }
        log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.update_apps', 'platform_settings', '1', null);
        set_flash('success', 'Mobile app downloads updated.');
        redirect('index.php?tab=apps');
    }

    if ($action === 'save_branding') {
        $cfgNow  = $pdo->query('SELECT site_logo_path, favicon_path FROM platform_settings WHERE id = 1')->fetch() ?: [];
        $updates = [];
        foreach (['site_logo' => ['site_logo_path', 'remove_site_logo', 'Site logo'], 'favicon' => ['favicon_path', 'remove_favicon', 'Favicon']] as $field => [$col, $removeFlag, $label]) {
            $old = (string)($cfgNow[$col] ?? '');
            if (!empty($_POST[$removeFlag])) {
                if ($old !== '' && str_starts_with($old, 'uploads/branding/')) { @unlink(dirname(__DIR__) . '/' . $old); }
                $updates[$col] = null;
                continue;
            }
            if (isset($_FILES[$field]) && (int)($_FILES[$field]['error'] ?? 4) !== UPLOAD_ERR_NO_FILE) {
                $up = handle_image_upload($_FILES[$field], 'branding');
                if (!$up['ok']) {
                    set_flash('danger', $label . ': ' . $up['error']);
                    redirect('index.php?tab=branding');
                }
                if (!empty($up['path'])) {
                    if ($old !== '' && str_starts_with($old, 'uploads/branding/')) { @unlink(dirname(__DIR__) . '/' . $old); }
                    $updates[$col] = $up['path'];
                }
            }
        }
        foreach ($updates as $col => $val) {
            $pdo->prepare('UPDATE platform_settings SET ' . $col . ' = :v WHERE id = 1')->execute([':v' => $val]);
        }
        log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.update_branding', 'platform_settings', '1', null);
        set_flash('success', 'Site logo & favicon updated. Refresh the browser (Ctrl+F5) to see the new icon.');
        redirect('index.php?tab=branding');
    }

    if ($action === 'save_cms') {
        $stmt = $pdo->prepare(
            'UPDATE platform_settings SET
               brand_name = :bn, software_name = :sn, hero_badge = :hb, hero_title = :ht, hero_subtitle = :hs,
               hero_cta_primary = :hcp, hero_cta_secondary = :hcs, intro_title = :it, intro_body = :ib,
               announcement_banner = :ab, support_email = :se, support_phone = :sp, support_address = :sa,
               seo_title = :st, seo_description = :sd, default_grace_period_days = :gp,
               maintenance_mode = :mm, legal_privacy_summary = :lp, legal_terms_summary = :lt
             WHERE id = 1'
        );
        $stmt->execute([
            ':bn'  => clean_str($_POST['brand_name'] ?? 'Hemnity', 80),
            ':sn'  => clean_str($_POST['software_name'] ?? 'Hemnity Gym Management Software', 150),
            ':hb'  => clean_str($_POST['hero_badge'] ?? '', 160),
            ':ht'  => clean_str($_POST['hero_title'] ?? '', 300),
            ':hs'  => clean_str($_POST['hero_subtitle'] ?? '', 2000, true),
            ':hcp' => clean_str($_POST['hero_cta_primary'] ?? 'Start Free Trial', 80),
            ':hcs' => clean_str($_POST['hero_cta_secondary'] ?? 'Owner Login', 80),
            ':it'  => clean_str($_POST['intro_title'] ?? '', 255),
            ':ib'  => clean_str($_POST['intro_body'] ?? '', 2000, true),
            ':ab'  => clean_str($_POST['announcement_banner'] ?? '', 500) ?: null,
            ':se'  => clean_str($_POST['support_email'] ?? '', 190),
            ':sp'  => clean_str($_POST['support_phone'] ?? '', 40),
            ':sa'  => clean_str($_POST['support_address'] ?? '', 300),
            ':st'  => clean_str($_POST['seo_title'] ?? '', 190),
            ':sd'  => clean_str($_POST['seo_description'] ?? '', 500),
            ':gp'  => max(0, min(60, (int)($_POST['default_grace_period_days'] ?? 7))),
            ':mm'  => isset($_POST['maintenance_mode']) ? 1 : 0,
            ':lp'  => clean_str($_POST['legal_privacy_summary'] ?? '', 3000, true),
            ':lt'  => clean_str($_POST['legal_terms_summary'] ?? '', 3000, true),
        ]);
        log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.update_cms', 'platform_settings', '1', null);
        set_flash('success', 'Public SaaS landing CMS & legal policies updated.');
        redirect('index.php?tab=cms');
    }

    if ($action === 'add_faq') {
        $q = clean_str($_POST['question'] ?? '', 300);
        $a = clean_str($_POST['answer'] ?? '', 2000, true);
        if ($q !== '' && $a !== '') {
            $pdo->prepare('INSERT INTO platform_faqs (question, answer, sort_order, is_active) VALUES (:q, :a, 10, 1)')
                ->execute([':q' => $q, ':a' => $a]);
            set_flash('success', 'Added FAQ to public landing page.');
        }
        redirect('index.php?tab=cms');
    }

    if ($action === 'delete_faq') {
        $faqId = (int)($_POST['faq_id'] ?? 0);
        if ($faqId > 0) {
            $pdo->prepare('DELETE FROM platform_faqs WHERE id = :id')->execute([':id' => $faqId]);
            set_flash('success', 'Removed FAQ item.');
        }
        redirect('index.php?tab=cms');
    }

    if ($action === 'reply_ticket') {
        $tid    = (int)($_POST['ticket_id'] ?? 0);
        $status = clean_str($_POST['status'] ?? 'In Progress', 30);
        $reply  = clean_str($_POST['admin_reply'] ?? '', 2000, true);
        if ($tid > 0 && in_array($status, ['Open', 'In Progress', 'Resolved'], true)) {
            $pdo->prepare('UPDATE support_tickets SET status = :st, admin_reply = :rp WHERE id = :id')
                ->execute([':st' => $status, ':rp' => $reply ?: null, ':id' => $tid]);
            log_audit_event($pdo, 'super_admin', (int)$superAdmin['id'], 'superadmin.reply_ticket', 'support_ticket', (string)$tid, null, ['status' => $status]);
            set_flash('success', 'Support ticket #' . $tid . ' updated.');
        }
        redirect('index.php?tab=tickets');
    }
}

$stats = [
    'total_gyms'     => (int)$pdo->query('SELECT COUNT(*) FROM gyms')->fetchColumn(),
    'active_gyms'    => (int)$pdo->query("SELECT COUNT(*) FROM gyms WHERE status = 'Active'")->fetchColumn(),
    'trial_gyms'     => (int)$pdo->query("SELECT COUNT(*) FROM gyms WHERE status = 'Trial'")->fetchColumn(),
    'suspended_gyms' => (int)$pdo->query("SELECT COUNT(*) FROM gyms WHERE status = 'Suspended'")->fetchColumn(),
    'total_owners'   => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'gym_owner'")->fetchColumn(),
    'total_members'  => (int)$pdo->query('SELECT COUNT(*) FROM members')->fetchColumn(),
    'saas_revenue'   => (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM saas_subscription_payments WHERE status = 'Paid'")->fetchColumn(),
    'open_tickets'   => (int)$pdo->query("SELECT COUNT(*) FROM support_tickets WHERE status != 'Resolved'")->fetchColumn(),
];

$saasPlans = $pdo->query('SELECT * FROM saas_plans ORDER BY sort_order ASC, id ASC')->fetchAll();
$gyms = $pdo->query(
    'SELECT g.*, u.full_name AS owner_name, u.email AS owner_email,
            sub.status AS sub_status, sub.current_period_end, sub.saas_plan_id, sp.plan_name,
            (SELECT COUNT(*) FROM members m WHERE m.gym_id = g.id) AS member_count
     FROM gyms g
     LEFT JOIN users u ON u.id = g.owner_user_id
     LEFT JOIN gym_saas_subscriptions sub ON sub.gym_id = g.id
     LEFT JOIN saas_plans sp ON sp.id = sub.saas_plan_id
     ORDER BY g.id DESC'
)->fetchAll();

$saasPayments = $pdo->query(
    'SELECT p.*, g.name AS gym_name, sp.plan_name
     FROM saas_subscription_payments p
     INNER JOIN gyms g ON g.id = p.gym_id
     LEFT JOIN saas_plans sp ON sp.id = p.saas_plan_id
     ORDER BY p.id DESC LIMIT 60'
)->fetchAll();

$faqs = $pdo->query('SELECT * FROM platform_faqs ORDER BY sort_order ASC, id ASC')->fetchAll();
$tickets = $pdo->query(
    'SELECT t.*, g.name AS gym_name
     FROM support_tickets t
     LEFT JOIN gyms g ON g.id = t.gym_id
     ORDER BY t.id DESC LIMIT 80'
)->fetchAll();

$auditLogs = $pdo->query(
    'SELECT a.*, g.name AS gym_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN gyms g ON g.id = a.gym_id
     LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.id DESC LIMIT 80'
)->fetchAll();

$flashes = pull_flashes();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hemnity Super Admin Console — <?= e($platformCfg['software_name'] ?? 'Hemnity Gym') ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="../assets/css/style.css" rel="stylesheet">
</head>
<body class="gym-body">
<header class="bg-dark text-white border-bottom border-secondary border-opacity-25">
    <div class="container-fluid px-4 py-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3">
            <?= brand_mark_html($platformCfg) ?>
            <div>
                <div class="fw-bold"><?= e($platformCfg['brand_name'] ?? 'Hemnity') ?> Super Admin Console</div>
                <div class="small text-secondary"><?= e($platformCfg['base_url'] ?? 'https://gym.hemnity.in') ?> &middot; Multi-Tenant Control Plane</div>
            </div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
            <a href="../index.php?landing=1" class="btn btn-sm btn-outline-light">Public Site</a>
            <a href="../api/docs/index.php" class="btn btn-sm btn-outline-light">API Docs</a>
            <form method="post" action="../logout.php" class="m-0">
                <?= csrf_field() ?>
                <button type="submit" class="btn btn-sm btn-danger">Sign Out</button>
            </form>
        </div>
    </div>
    <div class="bg-black bg-opacity-25 px-4">
        <ul class="nav nav-pills gap-1 py-2 small">
            <?php
            $tabItems = [
                'overview'      => ['Overview', 'bi-speedometer2'],
                'gyms'          => ['Gyms (' . $stats['total_gyms'] . ')', 'bi-buildings'],
                'plans'         => ['SaaS Plans', 'bi-tags'],
                'subscriptions' => ['Subscriptions & Invoices', 'bi-receipt'],
                'branding'      => ['Site Logo & Favicon', 'bi-image'],
                'apps'          => ['Mobile Apps (APK)', 'bi-android2'],
                'showcase'      => ['Reviews, Video & Partners', 'bi-stars'],
                'cms'           => ['Landing CMS & FAQs', 'bi-layout-text-window'],
                'tickets'       => ['Support Tickets (' . $stats['open_tickets'] . ')', 'bi-life-preserver'],
                'audit'         => ['Audit Logs', 'bi-shield-check'],
            ];
            foreach ($tabItems as $k => [$label, $icon]): ?>
                <li class="nav-item">
                    <a href="index.php?tab=<?= e($k) ?>" class="nav-link py-1 px-3 <?= $tab === $k ? 'active bg-warning text-dark fw-semibold' : 'text-light' ?>">
                        <i class="bi <?= e($icon) ?> me-1"></i><?= e($label) ?>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
</header>

<main class="container-fluid px-4 py-4">
    <?php foreach ($flashes as $f): ?>
        <div class="alert alert-<?= e($f['type']) ?> alert-dismissible fade show">
            <?= e($f['message']) ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    <?php endforeach; ?>

    <?php if ($tab === 'overview'): ?>
        <div class="row g-3 mb-4">
            <div class="col-6 col-lg-3">
                <div class="gym-card p-3">
                    <div class="small text-muted">Total Registered Gyms</div>
                    <div class="fs-3 fw-bold font-mono"><?= $stats['total_gyms'] ?></div>
                    <div class="small text-success"><?= $stats['active_gyms'] ?> Active &middot; <?= $stats['trial_gyms'] ?> Trial &middot; <?= $stats['suspended_gyms'] ?> Suspended</div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="gym-card p-3">
                    <div class="small text-muted">Total Gym Owners</div>
                    <div class="fs-3 fw-bold font-mono"><?= $stats['total_owners'] ?></div>
                    <div class="small text-muted">Isolated owner tenants</div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="gym-card p-3">
                    <div class="small text-muted">Total Members Across Gyms</div>
                    <div class="fs-3 fw-bold font-mono"><?= $stats['total_members'] ?></div>
                    <div class="small text-muted">Active tenant isolation enforced</div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="gym-card p-3">
                    <div class="small text-muted">SaaS Subscription Revenue</div>
                    <div class="fs-3 fw-bold font-mono">₹<?= number_format($stats['saas_revenue'], 2) ?></div>
                    <div class="small text-muted"><?= $stats['open_tickets'] ?> open support tickets</div>
                </div>
            </div>
        </div>

        <div class="gym-card p-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2 class="h6 fw-bold m-0">Registered Gym Tenants</h2>
                <a href="index.php?tab=gyms" class="btn btn-sm btn-outline-secondary">Manage All Gyms</a>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 small">
                    <thead class="table-light">
                    <tr>
                        <th>Code</th>
                        <th>Gym Workspace</th>
                        <th>Owner</th>
                        <th>SaaS Plan</th>
                        <th>Members</th>
                        <th>Period End</th>
                        <th>Status</th>
                    </tr>
                    </thead>
                    <tbody>
                    <?php foreach (array_slice($gyms, 0, 10) as $g): ?>
                        <tr>
                            <td class="font-mono"><?= e($g['gym_code']) ?></td>
                            <td><div class="fw-semibold"><?= e($g['name']) ?></div><div class="text-muted"><?= e($g['city'] ?: '—') ?></div></td>
                            <td><div><?= e($g['owner_name'] ?: '—') ?></div><div class="text-muted"><?= e($g['owner_email'] ?: '') ?></div></td>
                            <td><?= e($g['plan_name'] ?: 'Unassigned') ?></td>
                            <td class="font-mono"><?= (int)$g['member_count'] ?></td>
                            <td><?= e(format_date($g['current_period_end'] ?? null)) ?></td>
                            <td><span class="badge bg-<?= $g['status'] === 'Active' ? 'success' : ($g['status'] === 'Suspended' ? 'danger' : 'warning text-dark') ?>"><?= e($g['status']) ?></span></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

    <?php elseif ($tab === 'gyms'): ?>
        <div class="row g-4">
            <div class="col-lg-4">
                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Provision New Gym Workspace</h2>
                    <form method="post" action="index.php?tab=gyms">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="create_gym">
                        <input type="hidden" name="redirect_tab" value="gyms">
                        <div class="mb-2"><label class="form-label small fw-medium">Gym Name *</label><input type="text" name="gym_name" class="form-control form-control-sm" required></div>
                        <div class="mb-2"><label class="form-label small fw-medium">City</label><input type="text" name="city" class="form-control form-control-sm"></div>
                        <div class="mb-2"><label class="form-label small fw-medium">Owner Full Name *</label><input type="text" name="owner_name" class="form-control form-control-sm" required></div>
                        <div class="mb-2"><label class="form-label small fw-medium">Owner Email *</label><input type="email" name="owner_email" class="form-control form-control-sm" required></div>
                        <div class="mb-2"><label class="form-label small fw-medium">Owner Phone</label><input type="text" name="owner_phone" class="form-control form-control-sm"></div>
                        <div class="mb-2"><label class="form-label small fw-medium">Initial Password (min 8) *</label><input type="password" name="owner_password" class="form-control form-control-sm" minlength="8" required></div>
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label small fw-medium">SaaS Plan</label>
                                <select name="saas_plan_id" class="form-select form-select-sm">
                                    <?php foreach ($saasPlans as $sp): ?>
                                        <option value="<?= (int)$sp['id'] ?>"><?= e($sp['plan_name']) ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label small fw-medium">Initial Status</label>
                                <select name="status" class="form-select form-select-sm">
                                    <option value="Active">Active</option>
                                    <option value="Trial">Trial</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-gym-primary btn-sm w-100">Create Gym Workspace</button>
                    </form>
                </div>
            </div>
            <div class="col-lg-8">
                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">All Registered Gyms (<?= count($gyms) ?>)</h2>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle small mb-0">
                            <thead class="table-light">
                            <tr>
                                <th>Gym</th>
                                <th>Owner</th>
                                <th>Plan &amp; Quota</th>
                                <th>Status Action</th>
                            </tr>
                            </thead>
                            <tbody>
                            <?php foreach ($gyms as $g): ?>
                                <tr>
                                    <td>
                                        <div class="fw-semibold"><?= e($g['name']) ?></div>
                                        <div class="font-mono text-muted"><?= e($g['gym_code']) ?></div>
                                    </td>
                                    <td>
                                        <div><?= e($g['owner_name'] ?: '—') ?></div>
                                        <div class="text-muted"><?= e($g['owner_email'] ?: '') ?></div>
                                    </td>
                                    <td>
                                        <form method="post" action="index.php?tab=gyms" class="d-flex gap-1 align-items-center">
                                            <?= csrf_field() ?>
                                            <input type="hidden" name="action" value="assign_gym_plan">
                                            <input type="hidden" name="redirect_tab" value="gyms">
                                            <input type="hidden" name="gym_id" value="<?= (int)$g['id'] ?>">
                                            <select name="saas_plan_id" class="form-select form-select-sm" style="width: 120px;">
                                                <?php foreach ($saasPlans as $sp): ?>
                                                    <option value="<?= (int)$sp['id'] ?>" <?= (int)$g['saas_plan_id'] === (int)$sp['id'] ? 'selected' : '' ?>><?= e($sp['plan_name']) ?></option>
                                                <?php endforeach; ?>
                                            </select>
                                            <button type="submit" class="btn btn-sm btn-outline-secondary">Save</button>
                                        </form>
                                        <div class="text-muted mt-1"><?= (int)$g['member_count'] ?> members &middot; Ends <?= e(format_date($g['current_period_end'] ?? null)) ?></div>
                                    </td>
                                    <td>
                                        <form method="post" action="index.php?tab=gyms" class="d-flex gap-1">
                                            <?= csrf_field() ?>
                                            <input type="hidden" name="action" value="toggle_gym_status">
                                            <input type="hidden" name="redirect_tab" value="gyms">
                                            <input type="hidden" name="gym_id" value="<?= (int)$g['id'] ?>">
                                            <select name="status" class="form-select form-select-sm" style="width: 115px;">
                                                <?php foreach (['Active', 'Trial', 'Suspended', 'Pending'] as $stOpt): ?>
                                                    <option value="<?= e($stOpt) ?>" <?= $g['status'] === $stOpt ? 'selected' : '' ?>><?= e($stOpt) ?></option>
                                                <?php endforeach; ?>
                                            </select>
                                            <button type="submit" class="btn btn-sm btn-dark">Apply</button>
                                        </form>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    <?php elseif ($tab === 'plans'): ?>
        <div class="row g-4">
            <?php foreach ($saasPlans as $sp): ?>
                <div class="col-lg-4">
                    <form method="post" action="index.php?tab=plans" class="gym-card p-4 h-100">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="save_saas_plan">
                        <input type="hidden" name="redirect_tab" value="plans">
                        <input type="hidden" name="plan_id" value="<?= (int)$sp['id'] ?>">
                        <input type="hidden" name="slug" value="<?= e($sp['slug']) ?>">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="badge bg-dark font-mono"><?= e($sp['slug']) ?></span>
                            <div class="form-check form-switch m-0">
                                <input class="form-check-input" type="checkbox" name="is_active" id="act_<?= (int)$sp['id'] ?>" <?= (int)$sp['is_active'] === 1 ? 'checked' : '' ?>>
                                <label class="form-check-label small" for="act_<?= (int)$sp['id'] ?>">Active</label>
                            </div>
                        </div>
                        <div class="mb-2"><label class="form-label small fw-medium">Plan Name</label><input type="text" name="plan_name" class="form-control form-control-sm" value="<?= e($sp['plan_name']) ?>" required></div>
                        <div class="mb-2"><label class="form-label small fw-medium">Tagline</label><input type="text" name="tagline" class="form-control form-control-sm" value="<?= e($sp['tagline']) ?>"></div>
                        <div class="row g-2 mb-2">
                            <div class="col-4"><label class="form-label small">Monthly (₹)</label><input type="number" step="0.01" name="monthly_price" class="form-control form-control-sm" value="<?= e($sp['monthly_price']) ?>"></div>
                            <div class="col-4"><label class="form-label small">Quarterly (₹)</label><input type="number" step="0.01" name="quarterly_price" class="form-control form-control-sm" value="<?= e($sp['quarterly_price']) ?>"></div>
                            <div class="col-4"><label class="form-label small">Yearly (₹)</label><input type="number" step="0.01" name="yearly_price" class="form-control form-control-sm" value="<?= e($sp['yearly_price']) ?>"></div>
                        </div>
                        <div class="row g-2 mb-2">
                            <div class="col-4"><label class="form-label small">Max Members</label><input type="number" name="max_members" class="form-control form-control-sm" value="<?= (int)$sp['max_members'] ?>"></div>
                            <div class="col-4"><label class="form-label small">Branches</label><input type="number" name="max_branches" class="form-control form-control-sm" value="<?= (int)$sp['max_branches'] ?>"></div>
                            <div class="col-4"><label class="form-label small">Trial Days</label><input type="number" name="trial_days" class="form-control form-control-sm" value="<?= (int)$sp['trial_days'] ?>"></div>
                        </div>
                        <div class="mb-2"><label class="form-label small">Description</label><textarea name="description" class="form-control form-control-sm" rows="2"><?= e($sp['description']) ?></textarea></div>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" name="is_featured" id="feat_<?= (int)$sp['id'] ?>" <?= (int)$sp['is_featured'] === 1 ? 'checked' : '' ?>>
                            <label class="form-check-label small" for="feat_<?= (int)$sp['id'] ?>">Highlight as Featured / Most Popular</label>
                        </div>
                        <button type="submit" class="btn btn-gym-primary btn-sm w-100">Update SaaS Plan</button>
                    </form>
                </div>
            <?php endforeach; ?>
        </div>

    <?php elseif ($tab === 'subscriptions'): ?>
        <div class="row g-4">
            <div class="col-lg-4">
                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Record SaaS Payment / Extend Gym</h2>
                    <form method="post" action="index.php?tab=subscriptions">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="record_saas_payment">
                        <input type="hidden" name="redirect_tab" value="subscriptions">
                        <div class="mb-2">
                            <label class="form-label small fw-medium">Select Gym</label>
                            <select name="gym_id" class="form-select form-select-sm" required>
                                <?php foreach ($gyms as $g): ?>
                                    <option value="<?= (int)$g['id'] ?>"><?= e($g['name']) ?> (<?= e($g['gym_code']) ?>)</option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="row g-2 mb-2">
                            <div class="col-6"><label class="form-label small">Amount (₹)</label><input type="number" step="0.01" name="amount" class="form-control form-control-sm" value="2499" required></div>
                            <div class="col-6"><label class="form-label small">Extend Days</label><input type="number" name="extend_days" class="form-control form-control-sm" value="30" required></div>
                        </div>
                        <div class="row g-2 mb-2">
                            <div class="col-6">
                                <label class="form-label small">Billing Cycle</label>
                                <select name="billing_cycle" class="form-select form-select-sm">
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label small">Method</label>
                                <select name="payment_method" class="form-select form-select-sm">
                                    <option value="Razorpay">Razorpay</option>
                                    <option value="UPI">UPI</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Manual">Manual</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-3"><label class="form-label small">Transaction Ref</label><input type="text" name="transaction_ref" class="form-control form-control-sm" placeholder="Optional UTR / Payment ID"></div>
                        <button type="submit" class="btn btn-gym-primary btn-sm w-100">Record Invoice &amp; Activate</button>
                    </form>
                </div>
            </div>
            <div class="col-lg-8">
                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">SaaS Billing Invoices</h2>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle small mb-0">
                            <thead class="table-light">
                            <tr><th>Invoice #</th><th>Gym</th><th>Plan</th><th>Amount</th><th>Method / Ref</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                            <?php if (empty($saasPayments)): ?>
                                <tr><td colspan="6" class="text-center text-muted py-4">No SaaS billing invoices recorded yet.</td></tr>
                            <?php else: foreach ($saasPayments as $sp): ?>
                                <tr>
                                    <td class="font-mono"><?= e($sp['invoice_number']) ?></td>
                                    <td><?= e($sp['gym_name']) ?></td>
                                    <td><?= e($sp['plan_name'] ?: '—') ?> (<?= e($sp['billing_cycle']) ?>)</td>
                                    <td class="font-mono fw-semibold">₹<?= number_format((float)$sp['amount'], 2) ?></td>
                                    <td><?= e($sp['payment_method']) ?> <span class="text-muted"><?= e($sp['transaction_ref']) ?></span></td>
                                    <td><span class="badge bg-success"><?= e($sp['status']) ?></span></td>
                                </tr>
                            <?php endforeach; endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    <?php elseif ($tab === 'branding'): ?>
        <?php
        $brandCfg = $pdo->query('SELECT site_logo_path, favicon_path, brand_name FROM platform_settings WHERE id = 1')->fetch() ?: [];
        $logoRel  = (string)($brandCfg['site_logo_path'] ?? '');
        $favRel   = (string)($brandCfg['favicon_path'] ?? '');
        ?>
        <div class="row g-4">
            <div class="col-lg-7">
                <form method="post" action="index.php?tab=branding" enctype="multipart/form-data" class="gym-card p-4">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="save_branding">
                    <input type="hidden" name="redirect_tab" value="branding">
                    <h2 class="h6 fw-bold mb-1">Site Logo &amp; Favicon Management</h2>
                    <p class="small text-muted mb-4">The logo appears on the public landing page and all sign-in screens. The favicon is the small icon in the browser tab (falls back to the logo, then to the default Hemnity icon).</p>

                    <div class="mb-4 pb-3 border-bottom">
                        <label class="form-label fw-medium">Site Logo</label>
                        <div class="d-flex align-items-center gap-3 mb-2">
                            <div class="border rounded-3 bg-light d-flex align-items-center justify-content-center" style="width:140px;height:72px;">
                                <?php if ($logoRel !== '' && is_file(dirname(__DIR__) . '/' . $logoRel)): ?><img src="../<?= e($logoRel) ?>" alt="Site logo" style="max-width:130px;max-height:62px;object-fit:contain;"><?php else: ?><span class="small text-muted">Default mark</span><?php endif; ?>
                            </div>
                            <div class="flex-grow-1">
                                <input type="file" class="form-control form-control-sm" name="site_logo" accept=".jpg,.jpeg,.png,.webp">
                                <div class="form-text">PNG / JPG / WEBP up to 2 MB. Wide logos (about 3:1) look best.</div>
                            </div>
                        </div>
                        <?php if ($logoRel !== ''): ?><div class="form-check"><input class="form-check-input" type="checkbox" id="rm_logo" name="remove_site_logo" value="1"><label class="form-check-label small" for="rm_logo">Remove current logo</label></div><?php endif; ?>
                    </div>

                    <div class="mb-4">
                        <label class="form-label fw-medium">Favicon (browser tab icon)</label>
                        <div class="d-flex align-items-center gap-3 mb-2">
                            <div class="border rounded-3 bg-light d-flex align-items-center justify-content-center" style="width:72px;height:72px;">
                                <img src="../site_icon?v=<?= time() ?>" alt="Current favicon" style="width:40px;height:40px;object-fit:contain;">
                            </div>
                            <div class="flex-grow-1">
                                <input type="file" class="form-control form-control-sm" name="favicon" accept=".png,.jpg,.jpeg,.webp">
                                <div class="form-text">Square image, 128x128 px or larger recommended (PNG).</div>
                            </div>
                        </div>
                        <?php if ($favRel !== ''): ?><div class="form-check"><input class="form-check-input" type="checkbox" id="rm_fav" name="remove_favicon" value="1"><label class="form-check-label small" for="rm_fav">Remove custom favicon</label></div><?php endif; ?>
                    </div>
                    <button type="submit" class="btn btn-gym-primary"><i class="bi bi-cloud-upload me-1"></i>Save Branding</button>
                </form>
            </div>
            <div class="col-lg-5">
                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Live Preview</h2>
                    <div class="border rounded-3 p-3 mb-3 d-flex align-items-center gap-2 bg-white"><?= brand_mark_html(['site_logo_path' => $logoRel, 'brand_name' => $brandCfg['brand_name'] ?? 'Hemnity']) ?><span class="fw-bold"><?= e($platformCfg['software_name'] ?? '') ?></span></div>
                    <div class="small text-muted">Navbar preview. Changes apply instantly across the public site, owner login, member login and super admin login.</div>
                </div>
            </div>
        </div>

    <?php elseif ($tab === 'apps'): ?>
        <?php $appCfg = $pdo->query('SELECT * FROM platform_settings WHERE id = 1')->fetch() ?: []; ?>
        <div class="row g-4"><div class="col-lg-8">
            <form method="post" action="index.php?tab=apps" enctype="multipart/form-data" class="gym-card p-4">
                <?= csrf_field() ?><input type="hidden" name="action" value="save_apps"><input type="hidden" name="redirect_tab" value="apps">
                <h2 class="h6 fw-bold mb-1">Android App Downloads</h2>
                <p class="small text-muted mb-4">Gym owners and members see a <strong>Download Android App</strong> button after they log in. Upload the APK file here, or paste an external download link (a link takes priority over an uploaded file).</p>
                <?php foreach (['owner' => 'Gym Owner App', 'member' => 'Gym Member App'] as $app => $title):
                    $info = app_download_info($appCfg, $app); ?>
                    <div class="border rounded-3 p-3 mb-3">
                        <div class="fw-semibold mb-2"><i class="bi bi-android2 text-success me-1"></i><?= e($title) ?>
                            <?php if ($info): ?><span class="badge text-bg-success ms-2">Live</span><?php else: ?><span class="badge text-bg-secondary ms-2">Not set</span><?php endif; ?></div>
                        <div class="row g-2">
                            <div class="col-md-8"><label class="form-label small">Upload APK file</label><input type="file" class="form-control form-control-sm" name="<?= $app ?>_apk" accept=".apk"><?php if (!empty($appCfg[$app . '_apk_path'])): ?><div class="form-text">Current file: <code><?= e(basename((string)$appCfg[$app . '_apk_path'])) ?></code> (<?= e(number_format(((int)@filesize(dirname(__DIR__) . '/' . $appCfg[$app . '_apk_path'])) / 1048576, 1)) ?> MB)</div><div class="form-check mt-1"><input class="form-check-input" type="checkbox" id="rm_<?= $app ?>" name="remove_<?= $app ?>" value="1"><label class="form-check-label small" for="rm_<?= $app ?>">Remove uploaded file</label></div><?php endif; ?></div>
                            <div class="col-md-4"><label class="form-label small">Version label</label><input type="text" class="form-control form-control-sm" name="<?= $app ?>_apk_version" value="<?= e($appCfg[$app . '_apk_version'] ?? '') ?>" placeholder="1.0.0"></div>
                            <div class="col-12"><label class="form-label small">…or external download link</label><input type="url" class="form-control form-control-sm" name="<?= $app ?>_apk_url" value="<?= e($appCfg[$app . '_apk_url'] ?? '') ?>" placeholder="https://github.com/…/Hemnity-Gym-<?= e(ucfirst($app)) ?>.apk"></div>
                        </div>
                    </div>
                <?php endforeach; ?>
                <button class="btn btn-gym-primary"><i class="bi bi-cloud-upload me-1"></i>Save App Downloads</button>
                <div class="form-text mt-2">If the upload fails for large files, ask your host to raise <code>upload_max_filesize</code>/<code>post_max_size</code>, or use the link field.</div>
            </form>
        </div></div>

    <?php elseif ($tab === 'showcase'): ?>
        <?php
        $scCfg   = $pdo->query('SELECT youtube_url, youtube_title FROM platform_settings WHERE id = 1')->fetch() ?: [];
        $reviews = $pdo->query('SELECT * FROM landing_reviews ORDER BY sort_order ASC, id DESC')->fetchAll();
        $partners = $pdo->query('SELECT * FROM landing_partners ORDER BY sort_order ASC, id DESC')->fetchAll();
        $ytId = youtube_video_id($scCfg['youtube_url'] ?? null);
        $rowForm = static function (string $action, int $id, string $csrf, string $label, string $cls): string {
            return '<form method="post" action="index.php?tab=showcase" class="d-inline m-0">' . $csrf . '<input type="hidden" name="action" value="' . $action . '"><input type="hidden" name="item_id" value="' . $id . '"><button class="btn btn-sm ' . $cls . '">' . $label . '</button></form>';
        };
        ?>
        <div class="row g-4">
            <div class="col-lg-6">
                <form method="post" action="index.php?tab=showcase" class="gym-card p-4 mb-4">
                    <?= csrf_field() ?><input type="hidden" name="action" value="save_youtube">
                    <h2 class="h6 fw-bold mb-1"><i class="bi bi-youtube text-danger me-1"></i>Homepage YouTube Video</h2>
                    <p class="small text-muted">Paste any YouTube link (watch, youtu.be, shorts). It plays on the landing page. Leave empty to hide the video section.</p>
                    <div class="mb-2"><label class="form-label small">YouTube link</label><input type="text" name="youtube_url" class="form-control form-control-sm" value="<?= e($scCfg['youtube_url'] ?? '') ?>" placeholder="https://www.youtube.com/watch?v=..."></div>
                    <div class="mb-3"><label class="form-label small">Section heading (optional)</label><input type="text" name="youtube_title" class="form-control form-control-sm" value="<?= e($scCfg['youtube_title'] ?? '') ?>" placeholder="See Hemnity Gym in action"></div>
                    <?php if ($ytId): ?><div class="ratio ratio-16x9 mb-3 rounded overflow-hidden"><iframe src="https://www.youtube-nocookie.com/embed/<?= e($ytId) ?>" title="Preview" allowfullscreen loading="lazy"></iframe></div><?php endif; ?>
                    <button class="btn btn-gym-primary btn-sm">Save Video</button>
                </form>

                <form method="post" action="index.php?tab=showcase" enctype="multipart/form-data" class="gym-card p-4">
                    <?= csrf_field() ?><input type="hidden" name="action" value="add_review">
                    <h2 class="h6 fw-bold mb-3"><i class="bi bi-chat-quote me-1"></i>Add Customer Review</h2>
                    <div class="row g-2">
                        <div class="col-md-6"><label class="form-label small">Customer name *</label><input type="text" name="customer_name" class="form-control form-control-sm" required></div>
                        <div class="col-md-6"><label class="form-label small">Gym / designation</label><input type="text" name="customer_role" class="form-control form-control-sm" placeholder="Owner, FitZone Gym, Pune"></div>
                        <div class="col-12"><label class="form-label small">Review *</label><textarea name="review_text" rows="3" class="form-control form-control-sm" required></textarea></div>
                        <div class="col-4"><label class="form-label small">Rating</label><select name="rating" class="form-select form-select-sm"><?php for ($i = 5; $i >= 1; $i--): ?><option value="<?= $i ?>"><?= $i ?> ★</option><?php endfor; ?></select></div>
                        <div class="col-4"><label class="form-label small">Order</label><input type="number" name="sort_order" value="0" class="form-control form-control-sm"></div>
                        <div class="col-4"><label class="form-label small">Photo</label><input type="file" name="photo" accept=".jpg,.jpeg,.png,.webp" class="form-control form-control-sm"></div>
                    </div>
                    <button class="btn btn-gym-primary btn-sm mt-3">Add Review</button>
                </form>
            </div>

            <div class="col-lg-6">
                <form method="post" action="index.php?tab=showcase" enctype="multipart/form-data" class="gym-card p-4 mb-4">
                    <?= csrf_field() ?><input type="hidden" name="action" value="add_partner">
                    <h2 class="h6 fw-bold mb-3"><i class="bi bi-patch-check me-1"></i>Add Trusted Partner / Gym</h2>
                    <div class="row g-2">
                        <div class="col-md-8"><label class="form-label small">Gym / partner name *</label><input type="text" name="partner_name" class="form-control form-control-sm" required></div>
                        <div class="col-md-4"><label class="form-label small">City</label><input type="text" name="city" class="form-control form-control-sm"></div>
                        <div class="col-md-6"><label class="form-label small">Website (optional)</label><input type="text" name="website_url" class="form-control form-control-sm" placeholder="https://"></div>
                        <div class="col-md-3"><label class="form-label small">Order</label><input type="number" name="sort_order" value="0" class="form-control form-control-sm"></div>
                        <div class="col-md-3"><label class="form-label small">Logo</label><input type="file" name="logo" accept=".jpg,.jpeg,.png,.webp" class="form-control form-control-sm"></div>
                    </div>
                    <button class="btn btn-gym-primary btn-sm mt-3">Add Partner</button>
                </form>

                <div class="gym-card p-4 mb-4">
                    <h2 class="h6 fw-bold mb-3">Reviews (<?= count($reviews) ?>)</h2>
                    <?php if (!$reviews): ?><div class="small text-muted">No reviews yet.</div><?php endif; ?>
                    <?php foreach ($reviews as $r): ?>
                        <div class="d-flex gap-2 align-items-start border-bottom py-2 <?= $r['is_active'] ? '' : 'opacity-50' ?>">
                            <div class="flex-grow-1 small"><strong><?= e($r['customer_name']) ?></strong> <span class="text-warning"><?= str_repeat('★', (int)$r['rating']) ?></span><div class="text-muted"><?= e(mb_substr((string)$r['review_text'], 0, 110)) ?></div></div>
                            <div class="text-nowrap"><?= $rowForm('toggle_review', (int)$r['id'], csrf_field(), $r['is_active'] ? 'Hide' : 'Show', 'btn-outline-secondary') ?> <?= $rowForm('delete_review', (int)$r['id'], csrf_field(), 'Delete', 'btn-outline-danger') ?></div>
                        </div>
                    <?php endforeach; ?>
                </div>

                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Trusted Partners (<?= count($partners) ?>)</h2>
                    <?php if (!$partners): ?><div class="small text-muted">No partners yet.</div><?php endif; ?>
                    <?php foreach ($partners as $pt): ?>
                        <div class="d-flex gap-2 align-items-center border-bottom py-2 <?= $pt['is_active'] ? '' : 'opacity-50' ?>">
                            <?php if (!empty($pt['logo_path'])): ?><img src="../<?= e($pt['logo_path']) ?>" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:8px;background:#fff;border:1px solid #e5e7eb"><?php endif; ?>
                            <div class="flex-grow-1 small"><strong><?= e($pt['name']) ?></strong><div class="text-muted"><?= e($pt['city'] ?? '') ?></div></div>
                            <div class="text-nowrap"><?= $rowForm('toggle_partner', (int)$pt['id'], csrf_field(), $pt['is_active'] ? 'Hide' : 'Show', 'btn-outline-secondary') ?> <?= $rowForm('delete_partner', (int)$pt['id'], csrf_field(), 'Delete', 'btn-outline-danger') ?></div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>

    <?php elseif ($tab === 'cms'): ?>
        <div class="row g-4">
            <div class="col-lg-7">
                <form method="post" action="index.php?tab=cms" class="gym-card p-4">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="save_cms">
                    <input type="hidden" name="redirect_tab" value="cms">
                    <h2 class="h6 fw-bold mb-3">Landing Page Content, SEO &amp; Policies</h2>
                    <div class="row g-2 mb-2">
                        <div class="col-md-4"><label class="form-label small fw-medium">Brand Name</label><input type="text" name="brand_name" class="form-control form-control-sm" value="<?= e($platformCfg['brand_name']) ?>"></div>
                        <div class="col-md-8"><label class="form-label small fw-medium">Software Name</label><input type="text" name="software_name" class="form-control form-control-sm" value="<?= e($platformCfg['software_name']) ?>"></div>
                    </div>
                    <div class="mb-2"><label class="form-label small fw-medium">Announcement Banner (optional)</label><input type="text" name="announcement_banner" class="form-control form-control-sm" value="<?= e($platformCfg['announcement_banner']) ?>"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Hero Badge</label><input type="text" name="hero_badge" class="form-control form-control-sm" value="<?= e($platformCfg['hero_badge']) ?>"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Hero Title</label><input type="text" name="hero_title" class="form-control form-control-sm" value="<?= e($platformCfg['hero_title']) ?>"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Hero Subtitle</label><textarea name="hero_subtitle" class="form-control form-control-sm" rows="2"><?= e($platformCfg['hero_subtitle']) ?></textarea></div>
                    <div class="row g-2 mb-2">
                        <div class="col-md-6"><label class="form-label small">Primary CTA</label><input type="text" name="hero_cta_primary" class="form-control form-control-sm" value="<?= e($platformCfg['hero_cta_primary']) ?>"></div>
                        <div class="col-md-6"><label class="form-label small">Secondary CTA</label><input type="text" name="hero_cta_secondary" class="form-control form-control-sm" value="<?= e($platformCfg['hero_cta_secondary']) ?>"></div>
                    </div>
                    <div class="mb-2"><label class="form-label small fw-medium">Intro Title</label><input type="text" name="intro_title" class="form-control form-control-sm" value="<?= e($platformCfg['intro_title']) ?>"></div>
                    <div class="mb-2"><label class="form-label small fw-medium">Intro Body</label><textarea name="intro_body" class="form-control form-control-sm" rows="2"><?= e($platformCfg['intro_body']) ?></textarea></div>
                    <div class="row g-2 mb-2">
                        <div class="col-md-4"><label class="form-label small">Support Email</label><input type="email" name="support_email" class="form-control form-control-sm" value="<?= e($platformCfg['support_email']) ?>"></div>
                        <div class="col-md-4"><label class="form-label small">Support Phone</label><input type="text" name="support_phone" class="form-control form-control-sm" value="<?= e($platformCfg['support_phone']) ?>"></div>
                        <div class="col-md-4"><label class="form-label small">Default Grace Days</label><input type="number" name="default_grace_period_days" class="form-control form-control-sm" value="<?= (int)$platformCfg['default_grace_period_days'] ?>"></div>
                    </div>
                    <div class="mb-2"><label class="form-label small">Support Address</label><input type="text" name="support_address" class="form-control form-control-sm" value="<?= e($platformCfg['support_address']) ?>"></div>
                    <div class="mb-2"><label class="form-label small">SEO Meta Title</label><input type="text" name="seo_title" class="form-control form-control-sm" value="<?= e($platformCfg['seo_title']) ?>"></div>
                    <div class="mb-2"><label class="form-label small">SEO Meta Description</label><textarea name="seo_description" class="form-control form-control-sm" rows="2"><?= e($platformCfg['seo_description']) ?></textarea></div>
                    <div class="mb-2"><label class="form-label small">Privacy Policy Summary</label><textarea name="legal_privacy_summary" class="form-control form-control-sm" rows="2"><?= e($platformCfg['legal_privacy_summary']) ?></textarea></div>
                    <div class="mb-3"><label class="form-label small">Terms of Service Summary</label><textarea name="legal_terms_summary" class="form-control form-control-sm" rows="2"><?= e($platformCfg['legal_terms_summary']) ?></textarea></div>
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" name="maintenance_mode" id="maintMode" <?= (int)$platformCfg['maintenance_mode'] === 1 ? 'checked' : '' ?>>
                        <label class="form-check-label small" for="maintMode">Enable Maintenance Mode Flag</label>
                    </div>
                    <button type="submit" class="btn btn-gym-primary btn-sm">Save CMS &amp; Platform Settings</button>
                </form>
            </div>

            <div class="col-lg-5">
                <div class="gym-card p-4 mb-4">
                    <h2 class="h6 fw-bold mb-3">Add Public FAQ</h2>
                    <form method="post" action="index.php?tab=cms">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="add_faq">
                        <input type="hidden" name="redirect_tab" value="cms">
                        <div class="mb-2"><label class="form-label small">Question</label><input type="text" name="question" class="form-control form-control-sm" required></div>
                        <div class="mb-3"><label class="form-label small">Answer</label><textarea name="answer" class="form-control form-control-sm" rows="3" required></textarea></div>
                        <button type="submit" class="btn btn-dark btn-sm">Add FAQ Item</button>
                    </form>
                </div>

                <div class="gym-card p-4">
                    <h2 class="h6 fw-bold mb-3">Published FAQs (<?= count($faqs) ?>)</h2>
                    <?php foreach ($faqs as $fq): ?>
                        <div class="border rounded p-2 mb-2 small">
                            <div class="fw-semibold"><?= e($fq['question']) ?></div>
                            <div class="text-muted mt-1"><?= e($fq['answer']) ?></div>
                            <form method="post" action="index.php?tab=cms" class="mt-2">
                                <?= csrf_field() ?>
                                <input type="hidden" name="action" value="delete_faq">
                                <input type="hidden" name="redirect_tab" value="cms">
                                <input type="hidden" name="faq_id" value="<?= (int)$fq['id'] ?>">
                                <button type="submit" class="btn btn-sm btn-outline-danger py-0 px-2">Delete</button>
                            </form>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>

    <?php elseif ($tab === 'tickets'): ?>
        <div class="gym-card p-4">
            <h2 class="h6 fw-bold mb-3">Support Tickets &amp; Landing Inquiries</h2>
            <?php if (empty($tickets)): ?>
                <div class="text-muted small py-4 text-center">No support tickets logged yet.</div>
            <?php else: foreach ($tickets as $tk): ?>
                <form method="post" action="index.php?tab=tickets" class="border rounded p-3 mb-3 small">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="reply_ticket">
                    <input type="hidden" name="redirect_tab" value="tickets">
                    <input type="hidden" name="ticket_id" value="<?= (int)$tk['id'] ?>">
                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                        <div>
                            <span class="badge bg-dark me-1">#<?= (int)$tk['id'] ?></span>
                            <strong><?= e($tk['subject']) ?></strong>
                            <span class="text-muted ms-2"><?= e($tk['gym_name'] ?: 'Public Inquiry') ?> &middot; <?= e($tk['sender_name']) ?> (<?= e($tk['sender_email']) ?>)</span>
                        </div>
                        <span class="badge bg-<?= $tk['status'] === 'Resolved' ? 'success' : ($tk['status'] === 'In Progress' ? 'warning text-dark' : 'danger') ?>"><?= e($tk['status']) ?></span>
                    </div>
                    <p class="mb-2 text-secondary"><?= e($tk['message']) ?></p>
                    <div class="row g-2 align-items-end">
                        <div class="col-md-7"><input type="text" name="admin_reply" class="form-control form-control-sm" placeholder="Reply to gym owner..." value="<?= e($tk['admin_reply']) ?>"></div>
                        <div class="col-md-3">
                            <select name="status" class="form-select form-select-sm">
                                <?php foreach (['Open', 'In Progress', 'Resolved'] as $ts): ?>
                                    <option value="<?= e($ts) ?>" <?= $tk['status'] === $ts ? 'selected' : '' ?>><?= e($ts) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-2"><button type="submit" class="btn btn-sm btn-gym-primary w-100">Update</button></div>
                    </div>
                </form>
            <?php endforeach; endif; ?>
        </div>

    <?php elseif ($tab === 'audit'): ?>
        <div class="gym-card p-4">
            <h2 class="h6 fw-bold mb-3">Platform &amp; Tenant Audit Trail (Latest 80)</h2>
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle small mb-0">
                    <thead class="table-light">
                    <tr><th>Time</th><th>Actor</th><th>Gym</th><th>Action</th><th>Target</th><th>IP</th></tr>
                    </thead>
                    <tbody>
                    <?php foreach ($auditLogs as $log): ?>
                        <tr>
                            <td class="font-mono text-muted"><?= e($log['created_at']) ?></td>
                            <td><span class="badge bg-light text-dark border"><?= e($log['actor_role']) ?></span> <?= e($log['actor_email'] ?: 'system') ?></td>
                            <td><?= e($log['gym_name'] ?: 'Platform') ?></td>
                            <td class="font-mono"><?= e($log['action']) ?></td>
                            <td class="text-muted"><?= e($log['target_type']) ?> <?= e($log['target_id']) ?></td>
                            <td class="font-mono text-muted"><?= e($log['ip_address']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    <?php endif; ?>
</main>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
