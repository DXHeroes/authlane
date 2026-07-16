import ConnectionStatus from '@/components/ConnectionStatus';

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to AI Assistant Hub</h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          This is an example SaaS application that demonstrates how to integrate with
          <span className="font-semibold text-indigo-600"> Authlane</span> for managing third-party
          service connections.
        </p>
      </div>

      {/* Info cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
            <span className="text-2xl">🔗</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Connect Services</h3>
          <p className="text-sm text-gray-600">
            Connect your GitHub, Slack, and other services using OAuth. Authlane handles the
            authentication flow securely.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <span className="text-2xl">🌐</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Public APIs</h3>
          <p className="text-sm text-gray-600">
            Use public APIs like JSONPlaceholder without any authentication. Perfect for testing and
            demos.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <span className="text-2xl">🔑</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Secure Credentials</h3>
          <p className="text-sm text-gray-600">
            All credentials are encrypted at rest. Access tokens are automatically refreshed when
            needed.
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Your Connections</h2>
        <ConnectionStatus />
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">How Authlane Integration Works</h2>
        <div className="space-y-4 text-sm text-gray-700">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
              1
            </span>
            <p>
              <strong>Configure services</strong> in the Authlane dashboard - enable services and
              add OAuth credentials
            </p>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
              2
            </span>
            <p>
              <strong>Connect services</strong> from this app - users click "Connect" and complete
              OAuth flow
            </p>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
              3
            </span>
            <p>
              <strong>Call providers from your backend</strong> - issue an access-only lease,
              perform the provider request, and return only application data to the browser
            </p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid md:grid-cols-2 gap-4">
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
        >
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <span className="text-xl">⚙️</span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Authlane Dashboard</p>
            <p className="text-sm text-gray-500">Configure services and view connections</p>
          </div>
        </a>

        <a
          href="http://localhost:3000/api/v1/services"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
        >
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-xl">📡</span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Authlane API</p>
            <p className="text-sm text-gray-500">View available services endpoint</p>
          </div>
        </a>
      </div>
    </div>
  );
}
