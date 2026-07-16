import { useState } from 'react';
import { authlane, type GitHubRepository } from '@/lib/authlane';

export default function GitHubPage() {
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRepositories() {
    setLoading(true);
    setError(null);

    const result = await authlane.listGitHubRepositories();
    if (result.error) setError(result.error.message);
    else setRepos(result.data ?? []);
    setLoading(false);
  }

  async function handleConnect() {
    const result = await authlane.createConnectSession('github');
    if (result.data?.connectUrl) {
      window.open(result.data.connectUrl, '_blank', 'width=600,height=700');
    } else {
      alert(`Failed to get authorization URL: ${result.error?.message || 'Unknown error'}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">GitHub Integration</h2>
          <p className="text-gray-600 mt-1">
            Fetch repositories without exposing provider credentials to the browser
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Connect GitHub
          </button>
          <button
            onClick={fetchRepositories}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Fetch Repos'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">How This Demo Works</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Click "Connect GitHub" to authorize via OAuth (opens popup)</li>
          <li>After connecting, click "Fetch Repos" to retrieve your repositories</li>
          <li>The SaaS backend obtains a lease and calls GitHub; the browser receives only data</li>
        </ol>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Repositories */}
      {repos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Your Repositories ({repos.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {repos.map((repo) => (
              <a
                key={repo.id}
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900 hover:text-indigo-600">
                    {repo.name}
                    {repo.private && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        Private
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <span>⭐</span>
                    <span>{repo.stargazers_count}</span>
                  </div>
                </div>
                {repo.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">{repo.description}</p>
                )}
                {repo.language && <p className="text-xs text-gray-500 mt-2">{repo.language}</p>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && repos.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="text-4xl mb-4">📦</div>
          <p className="text-gray-600">
            Connect your GitHub account and click "Fetch Repos" to see your repositories
          </p>
        </div>
      )}
    </div>
  );
}
