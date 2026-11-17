/* Hemnity UX helpers: show/hide toggle on every password field. */
(function () {
    'use strict';
    function attach(input) {
        if (input.dataset.pwToggle === '1' || input.type !== 'password') return;
        input.dataset.pwToggle = '1';
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:block;width:100%;';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        input.style.paddingRight = '2.6rem';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Show or hide password');
        btn.tabIndex = -1;
        btn.style.cssText = 'position:absolute;top:50%;right:.5rem;transform:translateY(-50%);border:0;background:transparent;padding:.25rem .4rem;color:#6b7280;cursor:pointer;line-height:1;font-size:1.05rem;';
        var eye = '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>';
        var eyeOff = '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709z"/><path d="m13.646 14.354-12-12 .708-.708 12 12-.708.708z"/></svg>';
        btn.innerHTML = eye;
        btn.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = show ? eyeOff : eye;
        });
        wrap.appendChild(btn);
    }
    function run() { document.querySelectorAll('input[type="password"]').forEach(attach); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
