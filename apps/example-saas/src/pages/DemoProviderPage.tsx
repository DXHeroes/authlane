import { useState } from 'react';
import ConnectDialog from '@/components/ConnectDialog';
import { authlane, type DemoResources } from '@/lib/authlane';

export default function DemoProviderPage() {
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [resources, setResources] = useState<DemoResources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const result = await authlane.createConnectSession('authlane-demo');
    if (result.data?.connectUrl) setConnectUrl(result.data.connectUrl);
    else setError(result.error?.message ?? 'Could not create a secure connection session');
  }

  async function loadResources() {
    setLoading(true);
    setError(null);
    const result = await authlane.listDemoResources();
    if (result.error) setError(result.error.message);
    else setResources(result.data);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {connectUrl && (
        <ConnectDialog
          connectUrl={connectUrl}
          serviceName="Authlane Demo Provider"
          onClose={() => setConnectUrl(null)}
          onConnected={loadResources}
          onError={setError}
        />
      )}

      <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-8 text-white shadow-xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
          Complete local security demo
        </p>
        <h2 className="max-w-3xl text-3xl font-bold">OAuth, encrypted storage and token refresh</h2>
        <p className="mt-3 max-w-2xl text-indigo-100">
          This provider runs only on localhost. The Example SaaS backend obtains a short-lived
          credential lease; provider tokens never enter browser JavaScript.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={connect}
            className="rounded-lg bg-white px-5 py-3 font-semibold text-indigo-900 hover:bg-indigo-50"
          >
            Connect Demo Provider
          </button>
          <button
            type="button"
            onClick={loadResources}
            disabled={loading}
            className="rounded-lg border border-indigo-300 px-5 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load resources through BFF'}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Request failed</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-950">Sanitized provider data</h3>
            <p className="text-sm text-gray-500">
              Only business data returned by the BFF appears here.
            </p>
          </div>
          {resources && (
            <span
              data-testid="token-generation"
              className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800"
            >
              Token generation {resources.generation}
            </span>
          )}
        </div>
        {resources ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {resources.resources.map((resource) => (
              <article key={resource.id} className="rounded-xl border border-gray-200 p-4">
                <h4 className="font-semibold text-gray-900">{resource.name}</h4>
                <p className="mt-1 text-sm capitalize text-gray-500">{resource.status}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-gray-50 p-6 text-center text-gray-500">
            Connect the provider, then load resources.
          </p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['1', 'PKCE S256', 'The authorization code is bound to a one-time verifier.'],
          ['2', 'Envelope encryption', 'OAuth credentials are never stored as database plaintext.'],
          [
            '3',
            'Server-side lease',
            'The browser receives resources, never access or refresh tokens.',
          ],
        ].map(([number, title, copy]) => (
          <article key={number} className="rounded-xl border border-gray-200 bg-white p-5">
            <span className="text-sm font-bold text-indigo-600">{number}</span>
            <h3 className="mt-2 font-semibold text-gray-950">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{copy}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
