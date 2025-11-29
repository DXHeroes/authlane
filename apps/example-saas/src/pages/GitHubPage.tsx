import { useState } from 'react'
import { authlane, type Credentials } from '@/lib/authlane'

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  language: string | null
  private: boolean
}

export default function GitHubPage() {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)

  async function fetchRepositories() {
    setLoading(true)
    setError(null)

    // Step 1: Get credentials from Authlane
    const credResult = await authlane.getCredentials('github')
    
    if (credResult.error) {
      setError(`Failed to get GitHub credentials: ${credResult.error.message}`)
      setLoading(false)
      return
    }

    if (!credResult.data?.accessToken) {
      setError('No GitHub access token available. Please connect GitHub first.')
      setLoading(false)
      return
    }

    setCredentials(credResult.data)

    // Step 2: Use credentials to call GitHub API directly
    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=10&sort=updated', {
        headers: {
          Authorization: `Bearer ${credResult.data.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      setRepos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    const result = await authlane.getAuthUrl('github')
    if (result.data?.url) {
      window.open(result.data.url, '_blank', 'width=600,height=700')
    } else {
      alert('Failed to get authorization URL: ' + (result.error?.message || 'Unknown error'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">GitHub Integration</h2>
          <p className="text-gray-600 mt-1">
            Fetch your repositories using credentials from Authlane
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
          <li>Authlane provides the access token, this app calls GitHub API directly</li>
        </ol>
      </div>

      {/* Credentials info */}
      {credentials && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">✓ Credentials Retrieved from Authlane</h3>
          <div className="text-sm text-green-700 font-mono">
            <p>Access Token: {credentials.accessToken?.substring(0, 20)}...</p>
            {credentials.expiresAt && (
              <p>Expires: {new Date(credentials.expiresAt).toLocaleString()}</p>
            )}
          </div>
        </div>
      )}

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
                {repo.language && (
                  <p className="text-xs text-gray-500 mt-2">{repo.language}</p>
                )}
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
  )
}

