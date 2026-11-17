import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Lock, Terminal } from 'lucide-react';
import { apiRequest } from '../utils/api';

interface ApiDocsViewProps {
  onBack: () => void;
}

export function ApiDocsView({ onBack }: ApiDocsViewProps) {
  const [spec, setSpec] = useState<{
    info: { title: string; version: string; baseUrl: string; authSchemes: string[] };
    endpoints: Array<{ method: string; path: string; auth: string; summary: string }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [deviceName, setDeviceName] = useState('Hemnity Android Scanner App');
  const [issuedToken, setIssuedToken] = useState('');
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    apiRequest<{
      info: { title: string; version: string; baseUrl: string; authSchemes: string[] };
      endpoints: Array<{ method: string; path: string; auth: string; summary: string }>;
    }>('/api/v1/docs/spec')
      .then((res) => setSpec(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unauthorized'));
  }, []);

  async function issueMobileToken(e: React.FormEvent) {
    e.preventDefault();
    setIssuing(true);
    try {
      const res = await apiRequest<{ access_token: string }>('/api/v1/auth/token', {
        method: 'POST',
        body: JSON.stringify({ device_name: deviceName }),
      });
      setIssuedToken(res.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue Bearer token.');
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Workspace</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
            <Lock className="w-3.5 h-3.5 text-orange-600" />
            <span>Authenticated Admin/Owner Access Only</span>
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{error}</div>
        )}

        {spec && (
          <>
            <div className="bg-[#0c0e12] text-white rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400">
                <Terminal className="w-4 h-4" />
                <span>Hemnity REST API v{spec.info.version}</span>
              </div>
              <h1 className="text-2xl font-bold">{spec.info.title}</h1>
              <p className="text-xs text-neutral-400 font-mono">Base URL: {spec.info.baseUrl}</p>
            </div>

            {/* Bearer Token Generator for Android Owner / Member Apps */}
            <form onSubmit={issueMobileToken} className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <KeyRound className="w-4 h-4 text-orange-600" />
                <span>Issue 90-Day Mobile Bearer API Token</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-neutral-200 text-sm"
                />
                <button
                  type="submit"
                  disabled={issuing}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {issuing ? 'Generating...' : 'Generate Bearer Token'}
                </button>
              </div>
              {issuedToken && (
                <div className="p-3 rounded-lg bg-neutral-900 text-emerald-400 font-mono text-xs break-all">
                  Authorization: Bearer {issuedToken}
                </div>
              )}
            </form>

            {/* Endpoint Reference Table */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 font-semibold">
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Endpoint</th>
                    <th className="py-3 px-4">Auth</th>
                    <th className="py-3 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {spec.endpoints.map((ep) => (
                    <tr key={`${ep.method}-${ep.path}`}>
                      <td className="py-3 px-4 font-mono font-bold text-orange-600 whitespace-nowrap">{ep.method}</td>
                      <td className="py-3 px-4 font-mono text-neutral-900 whitespace-nowrap">{ep.path}</td>
                      <td className="py-3 px-4 text-neutral-600 whitespace-nowrap">{ep.auth}</td>
                      <td className="py-3 px-4 text-neutral-700">{ep.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
