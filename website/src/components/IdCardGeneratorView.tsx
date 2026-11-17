import { useCallback, useEffect, useState } from 'react';
import { IdCard, Printer, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { GymSettings, MemberRow } from '../types/gym';
import { QrCodeImg } from './QrCodeImg';
import { StatusIndicator } from './StatusIndicator';

interface IdCardGeneratorViewProps {
  preselectedMemberId?: number;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function IdCardGeneratorView({ preselectedMemberId, onNotify }: IdCardGeneratorViewProps) {
  const [cards, setCards] = useState<MemberRow[]>([]);
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>(preselectedMemberId ? [preselectedMemberId] : []);
  const [showExpiry, setShowExpiry] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reissuingId, setReissuingId] = useState<number | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ settings: GymSettings; cards: MemberRow[] }>('/api/v1/owner/id-cards');
      setSettings(res.settings);
      setCards(res.cards);
      if (preselectedMemberId) {
        setSelectedIds([preselectedMemberId]);
      } else if (res.cards.length > 0 && selectedIds.length === 0) {
        setSelectedIds(res.cards.slice(0, 6).map((c) => c.id));
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to load ID cards.');
    } finally {
      setLoading(false);
    }
  }, [preselectedMemberId, onNotify]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  async function handleReissueQr(member: MemberRow) {
    setReissuingId(member.id);
    try {
      const res = await apiRequest<{ ok: boolean; token: string }>(`/api/v1/owner/members/${member.id}/qr-reissue`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Owner reissued QR pass from ID Card Studio' }),
      });
      setCards((prev) =>
        prev.map((c) => (c.id === member.id ? { ...c, qr_token: res.token, qr_status: 'Active' } : c))
      );
      onNotify('success', `Previous QR pass revoked and fresh cryptographic QR issued for ${member.full_name}.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to reissue QR token.');
    } finally {
      setReissuingId(null);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const filtered = cards.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.member_code.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  });

  const printableCards = filtered.filter((c) => selectedIds.includes(c.id));
  const accent = settings?.id_card_accent_color || '#0c0e12';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <IdCard className="w-5 h-5 text-orange-600" />
            <span>Gym Member ID Card &amp; QR Pass Generator</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Print individual PVC (CR80) or A4 bulk member ID sheets with revocable cryptographic QR check-in passes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-700">
            <input
              type="checkbox"
              checked={showExpiry}
              onChange={(e) => setShowExpiry(e.target.checked)}
              className="rounded border-neutral-300 text-orange-600"
            />
            <span>Show Expiry Date</span>
          </label>
          <button
            type="button"
            onClick={() => setSelectedIds(filtered.map((c) => c.id))}
            className="px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700"
          >
            Select All ({filtered.length})
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={printableCards.length === 0}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Print Selected ({printableCards.length})</span>
          </button>
        </div>
      </div>

      {/* Filter & Selection List */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3 no-print">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter members by name, member ID, or phone..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pt-1">
          {filtered.map((m) => {
            const active = selectedIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleSelect(m.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#0c0e12] text-white border-[#0c0e12]'
                    : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {m.full_name} ({m.member_code})
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-500">Loading member QR credentials...</div>
      ) : printableCards.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-sm text-neutral-500">
          Select one or more members above to preview and print their ID cards.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 print:grid-cols-2 print:gap-4">
          {printableCards.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col justify-between break-inside-avoid"
            >
              <div className="px-4 py-3 text-white flex items-center justify-between gap-2" style={{ backgroundColor: accent }}>
                <div className="flex items-center gap-2 min-w-0">
                  {settings?.logo_path ? (
                    <img
                      src={settings.logo_path}
                      alt={settings.gym_name}
                      className="w-7 h-7 rounded-md object-cover bg-white/10 shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-md bg-neutral-950/30 border border-white/25 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {settings?.gym_name?.charAt(0) || 'G'}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{settings?.gym_name || 'GYM'}</div>
                    <div className="text-[10px] opacity-85">MEMBER ACCESS CARD</div>
                  </div>
                </div>
                <div className="bg-white/95 rounded-md px-2 py-0.5 shrink-0">
                  <StatusIndicator status={m.display_status} />
                </div>
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {m.photo_path ? (
                    <img
                      src={m.photo_path}
                      alt={m.full_name}
                      className="w-14 h-14 rounded-xl object-cover border border-neutral-200 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-base font-bold text-neutral-500 shrink-0">
                      {m.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-bold text-neutral-900 truncate">{m.full_name}</div>
                    <div className="text-xs font-mono font-semibold text-orange-600">{m.member_code}</div>
                    <div className="text-[11px] text-neutral-600 truncate">{m.plan_name || 'Standard Plan'}</div>
                    {showExpiry && (
                      <div className="text-[11px] text-neutral-500 font-mono">
                        Exp: {m.membership_expiry_date || '—'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-1.5 rounded-xl border border-neutral-200 bg-white shrink-0">
                  <QrCodeImg value={m.qr_token || ''} size={86} alt={`QR for ${m.full_name}`} />
                </div>
              </div>

              <div className="px-4 py-2.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between gap-2 text-[11px] text-neutral-500 no-print">
                <span className="font-mono truncate">Token: {m.qr_token ? `${m.qr_token.slice(0, 10)}...` : 'None'}</span>
                <button
                  type="button"
                  disabled={reissuingId === m.id}
                  onClick={() => void handleReissueQr(m)}
                  className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-semibold shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${reissuingId === m.id ? 'animate-spin' : ''}`} />
                  <span>Revoke &amp; Reissue QR</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
