import { useCallback, useEffect, useState } from 'react';

interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // JSONPlaceholder is a public API - no authentication needed
      const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=12');

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Public API Demo</h2>
          <p className="text-gray-600 mt-1">JSONPlaceholder - No authentication required</p>
        </div>
        <button
          onClick={fetchPosts}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* How it works */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-800 mb-2">Public APIs in Authlane</h3>
        <p className="text-sm text-green-700">
          Some services like JSONPlaceholder, REST Countries, or PokéAPI don't require any
          authentication. Authlane lists them with{' '}
          <code className="bg-green-100 px-1 rounded">authType: "none"</code> so your users know
          they can use them immediately without any setup.
        </p>
      </div>

      {/* API Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-2">API Endpoint</h3>
        <code className="text-sm bg-gray-200 px-2 py-1 rounded">
          GET https://jsonplaceholder.typicode.com/posts
        </code>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-40 bg-gray-200 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Posts */}
      {!loading && posts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Post #{post.id}
                </span>
                <span className="text-xs text-gray-400">User {post.userId}</span>
              </div>
              <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{post.title}</h3>
              <p className="text-sm text-gray-600 line-clamp-3">{post.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {!loading && posts.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {posts.length} posts from JSONPlaceholder API
        </div>
      )}
    </div>
  );
}
