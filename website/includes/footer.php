<?php
declare(strict_types=1);

if (!defined('GYM_APP_INIT')) {
    http_response_code(403);
    exit('403 Forbidden');
}
?>
        </main>

        <footer class="gym-footer no-print">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 small text-muted">
                <span>&copy; <?= date('Y') ?> <?= e($gymSettings['gym_name'] ?? 'GYM') ?> &middot; <?= e($platformCfg['software_name'] ?? 'Hemnity Gym Management Software') ?></span>
                <span>Currency: <strong class="font-mono"><?= e(($gymSettings['currency_code'] ?? 'INR') . ' (' . ($gymSettings['currency_symbol'] ?? '₹') . ')') ?></strong></span>
            </div>
        </footer>
    </div>
</div>

<!-- Reusable Confirmation Modal -->
<div class="modal fade no-print" id="gymConfirmModal" tabindex="-1" aria-labelledby="gymConfirmModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
            <div class="modal-header border-bottom">
                <h5 class="modal-title fw-semibold" id="gymConfirmModalLabel">Confirm Action</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="gymConfirmModalBody">
                Are you sure you want to proceed?
            </div>
            <div class="modal-footer border-top">
                <button type="button" class="btn btn-light border" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-danger" id="gymConfirmModalSubmit">Confirm</button>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<script src="<?= e(app_href('assets/js/app.js')) ?>"></script>
</body>
</html>
