/**
 * Hemnity Gym Management Software — Progressive Client-Side UI Enhancements
 * Includes QR matrix rendering, PWA registration, confirmation modal, & revenue chart.
 */
(function () {
    'use strict';

    // 1. Mobile Sidebar Drawer Toggle
    var sidebar = document.getElementById('gymSidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    var toggleBtn = document.getElementById('sidebarToggleBtn');
    var closeBtn = document.getElementById('sidebarCloseBtn');

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
    }

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function () {
            sidebar.classList.toggle('show');
            if (backdrop) backdrop.classList.toggle('show');
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // 2. Accessible Confirmation Modal for Delete / Deactivate / Refund Forms
    var confirmModalEl = document.getElementById('gymConfirmModal');
    var confirmBodyEl = document.getElementById('gymConfirmModalBody');
    var confirmSubmitBtn = document.getElementById('gymConfirmModalSubmit');
    var pendingForm = null;

    if (confirmModalEl && typeof bootstrap !== 'undefined') {
        var confirmModal = new bootstrap.Modal(confirmModalEl);
        document.querySelectorAll('form[data-confirm]').forEach(function (form) {
            form.addEventListener('submit', function (e) {
                if (form.dataset.confirmed === '1') {
                    return;
                }
                e.preventDefault();
                pendingForm = form;
                if (confirmBodyEl) {
                    confirmBodyEl.textContent = form.getAttribute('data-confirm') || 'Are you sure you want to continue?';
                }
                confirmModal.show();
            });
        });

        if (confirmSubmitBtn) {
            confirmSubmitBtn.addEventListener('click', function () {
                if (pendingForm) {
                    pendingForm.dataset.confirmed = '1';
                    pendingForm.submit();
                }
            });
        }
    }

    // 3. Auto-Calculate Membership Expiry Date When Plan or Start Date Changes
    var planSelect = document.querySelector('[data-plan-selector]');
    var startDateInput = document.querySelector('[data-start-date]');
    var expiryDateInput = document.querySelector('[data-expiry-date]');
    var amountInput = document.querySelector('[data-plan-amount]');
    var totalInput = document.querySelector('[data-plan-total]');

    function recalculatePlanDetails() {
        if (!planSelect) return;
        var selectedOption = planSelect.options[planSelect.selectedIndex];
        if (!selectedOption) return;

        var durationDays = parseInt(selectedOption.getAttribute('data-duration') || '0', 10);
        var planPrice = selectedOption.getAttribute('data-price');

        if (durationDays > 0 && startDateInput && expiryDateInput && startDateInput.value) {
            var parts = startDateInput.value.split('-');
            if (parts.length === 3) {
                var dt = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
                dt.setUTCDate(dt.getUTCDate() + durationDays);
                var yyyy = dt.getUTCFullYear();
                var mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
                var dd = String(dt.getUTCDate()).padStart(2, '0');
                expiryDateInput.value = yyyy + '-' + mm + '-' + dd;
            }
        }

        if (planPrice !== null && planPrice !== '') {
            if (amountInput && (!amountInput.dataset.userEdited)) {
                amountInput.value = planPrice;
            }
            if (totalInput) {
                totalInput.value = planPrice;
            }
        }
    }

    if (planSelect) planSelect.addEventListener('change', recalculatePlanDetails);
    if (startDateInput) startDateInput.addEventListener('change', recalculatePlanDetails);
    if (amountInput) {
        amountInput.addEventListener('input', function () {
            amountInput.dataset.userEdited = '1';
        });
    }

    // 4. Lightweight Zero-Dependency SVG Bar Chart for Monthly Revenue
    var chartContainer = document.getElementById('monthlyRevenueChart');
    if (chartContainer && chartContainer.dataset.series) {
        try {
            var series = JSON.parse(chartContainer.dataset.series);
            var currencySymbol = chartContainer.dataset.currency || '₹';
            if (Array.isArray(series) && series.length > 0) {
                var maxVal = 0;
                series.forEach(function (item) {
                    var v = parseFloat(item.total) || 0;
                    if (v > maxVal) maxVal = v;
                });
                if (maxVal <= 0) maxVal = 1000;

                var html = '<div class="d-flex align-items-end justify-content-between gap-2 pt-3" style="height:210px;">';
                series.forEach(function (item) {
                    var val = parseFloat(item.total) || 0;
                    var pct = Math.max(4, Math.round((val / maxVal) * 100));
                    var formatted = currencySymbol + val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                    html += '<div class="d-flex flex-column align-items-center flex-fill h-100 justify-content-end" title="' + item.label + ': ' + formatted + '">' +
                        '<div class="small font-mono text-muted mb-1" style="font-size:11px;">' + (val > 0 ? formatted : '') + '</div>' +
                        '<div style="width:100%;max-width:42px;height:' + pct + '%;background:' + (val > 0 ? '#ea580c' : '#e5e7eb') + ';border-radius:6px 6px 2px 2px;"></div>' +
                        '<div class="small text-muted mt-2 text-nowrap" style="font-size:11px;">' + item.label + '</div>' +
                        '</div>';
                });
                html += '</div>';
                chartContainer.innerHTML = html;
            }
        } catch (err) {
            // Keep server-rendered revenue summary table visible
        }
    }

    // 5. Render Scannable QR Codes for ID Cards & Member Digital Passes
    document.querySelectorAll('[data-qr-value]').forEach(function (el) {
        var value = el.getAttribute('data-qr-value');
        var size = parseInt(el.getAttribute('data-qr-size') || '120', 10);
        if (!value) return;
        if (typeof window.qrcode === 'function') {
            try {
                var qr = window.qrcode(0, 'M');
                qr.addData(value);
                qr.make();
                var svg = qr.createSvgTag({ cellSize: Math.max(2, Math.floor(size / 33)), margin: 2 });
                el.innerHTML = svg;
                var svgEl = el.querySelector('svg');
                if (svgEl) {
                    svgEl.setAttribute('width', String(size));
                    svgEl.setAttribute('height', String(size));
                }
            } catch (e) {
                el.textContent = value;
            }
        }
    });

    // 6. PWA Service Worker & Install Button
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
    }
    var deferredPrompt = null;
    var installBtn = document.getElementById('pwaInstallBtn');
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.classList.remove('d-none');
    });
    if (installBtn) {
        installBtn.addEventListener('click', function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
                deferredPrompt = null;
                installBtn.classList.add('d-none');
            });
        });
    }
})();
