import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiRequest } from '../utils/api';

const REPORT_TABS = [
  { key: 'summary', label: 'Active vs Expired' },
  { key: 'registrations', label: 'New Registrations' },
  { key: 'revenue', label: 'Revenue Breakdown' },
  { key: 'payments', label: 'Payment History' },
  { key: 'attendance', label: 'Attendance History' },
  { key: 'renewals', label: 'Renewals & Extensions' },
  { key: 'dues', label: 'Outstanding Dues' },
];

export function ReportsView({
  initialTab = 'summary',
  onNotify,
}: {
  initialTab?: string;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const [tab, setTab] = useState(initialTab);
  const [granularity, setGranularity] = useState('monthly');
  const [from, setFrom] = useState(ninetyDaysAgo);
  const [to, setTo] = useState(today);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Array<string | number>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadReport = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      tab,
      granularity,
      from,
      to,
    });
    apiRequest<{
      headers: string[];
      rows: Array<Array<string | number>>;
    }>(`/api/reports?${qs.toString()}`)
      .then((res) => {
        setHeaders(res.headers);
        setRows(res.rows);
      })
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Unable to generate report.');
      })
      .finally(() => setLoading(false));
  }, [tab, granularity, from, to, onNotify]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const csvDownloadUrl = `/api/reports?${new URLSearchParams({
    tab,
    granularity,
    from,
    to,
    export: 'csv',
  }).toString()}`;

  const activeLabel = REPORT_TABS.find((t) => t.key === tab)?.label || 'Report';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Analytics &amp; Financial Reports
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Audit memberships, registrations, revenue, attendance, renewals, and dues with authenticated CSV exports.
          </p>
        </div>

        <a
          href={csvDownloadUrl}
          download
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Export CSV</span>
        </a>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-neutral-200 p-1.5 rounded-xl">
        {REPORT_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              tab === item.key
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Date Range & Granularity Controls */}
      {tab !== 'summary' && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="rep_from" className="block text-xs font-medium text-neutral-500 mb-1">
                From Date
              </label>
              <input
                id="rep_from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rep_to" className="block text-xs font-medium text-neutral-500 mb-1">
                To Date
              </label>
              <input
                id="rep_to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>

            {tab === 'revenue' && (
              <div>
                <label htmlFor="rep_gran" className="block text-xs font-medium text-neutral-500 mb-1">
                  Revenue Grouping
                </label>
                <select
                  id="rep_gran"
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="daily">Daily Revenue</option>
                  <option value="monthly">Monthly Revenue</option>
                  <option value="yearly">Yearly Revenue</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">{activeLabel}</h2>
          <span className="text-xs font-mono tabular-nums text-neutral-500">{rows.length} row(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                {headers.map((h, idx) => (
                  <th key={idx} className="px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Generating report...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} className="px-4 py-10 text-center text-sm text-neutral-500">
                    No records found for this date range.
                  </td>
                </tr>
              ) : (
                rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-neutral-50/80">
                    {row.map((cell, cIdx) => {
                      const isNumericLike =
                        typeof cell === 'number' ||
                        /^-?\d+(\.\d+)?%?$/.test(String(cell)) ||
                        /^\d{4}-\d{2}/.test(String(cell)) ||
                        String(cell).startsWith('GYM-') ||
                        String(cell).startsWith('RCP-');
                      return (
                        <td
                          key={cIdx}
                          className={`px-4 py-3 whitespace-nowrap ${
                            isNumericLike ? 'font-mono tabular-nums text-xs text-neutral-800' : 'text-neutral-800'
                          }`}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
