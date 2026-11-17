import { useEffect, useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install(): Promise<boolean> {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      return true;
    }
    return false;
  }

  return {
    canInstall: Boolean(installPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      {(canInstall || isIOS) && (
        <button
          type="button"
          onClick={() => (canInstall ? void install() : setShowIOSGuide(true))}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-semibold transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
          }`}
        >
          {isIOS && !canInstall ? (
            <Share className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          )}
          <span>Install App</span>
        </button>
      )}

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Install Hemnity Gym on iOS</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close install instructions"
                className="p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Tap the Safari <strong>Share</strong> icon in the toolbar, then choose{' '}
              <strong>Add to Home Screen</strong> to install Hemnity Gym as a standalone app.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 no-print"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>You are currently offline. Live tenant sync resumes automatically when reconnected.</span>
    </div>
  );
}
