import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold text-green-700">Authlane</div>
          <div className="space-x-6">
            <Link href="#features" className="text-gray-700 hover:text-green-700">
              Features
            </Link>
            <Link href="#integrations" className="text-gray-700 hover:text-green-700">
              Integrations
            </Link>
            <Link href="https://docs.authlane.com" className="text-gray-700 hover:text-green-700">
              Docs
            </Link>
            <Link
              href="https://dashboard.authlane.com"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-6">
          OAuth Made Simple
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Unified OAuth infrastructure for your apps. Connect to 50+ services with a single API.
          Built for developers who value simplicity and security.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="https://dashboard.authlane.com/signup"
            className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 text-lg"
          >
            Start Building Free
          </Link>
          <Link
            href="https://docs.authlane.com"
            className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-gray-50 text-lg border-2 border-green-600"
          >
            View Documentation
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-4">No credit card required</p>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-16">Why Authlane?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">🔐</div>
            <h3 className="text-2xl font-semibold mb-3">Secure by Default</h3>
            <p className="text-gray-600">
              Enterprise-grade encryption, automatic token refresh, and best-in-class security practices built in.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-2xl font-semibold mb-3">Lightning Fast</h3>
            <p className="text-gray-600">
              Sub-100ms response times with Redis caching and optimized database queries.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-2xl font-semibold mb-3">Developer First</h3>
            <p className="text-gray-600">
              Clean APIs, comprehensive docs, SDKs for all major languages, and excellent DX.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">🔄</div>
            <h3 className="text-2xl font-semibold mb-3">Auto Token Refresh</h3>
            <p className="text-gray-600">
              Never worry about expired tokens. Automatic refresh with intelligent retry logic.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-2xl font-semibold mb-3">Built-in Analytics</h3>
            <p className="text-gray-600">
              Track OAuth flows, monitor success rates, and get insights into your integrations.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm">
            <div className="text-4xl mb-4">🪝</div>
            <h3 className="text-2xl font-semibold mb-3">Webhooks</h3>
            <p className="text-gray-600">
              Real-time notifications for connection events, token refreshes, and errors.
            </p>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="container mx-auto px-4 py-20 bg-white rounded-3xl">
        <h2 className="text-4xl font-bold text-center mb-16">Supported Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {[
            'GitHub', 'Google', 'Slack', 'Notion', 'Linear',
            'Jira', 'HubSpot', 'Salesforce', 'Stripe', 'Discord',
            'Gmail', 'Google Calendar', 'Google Drive', 'Airtable', 'Sentry',
            'Pipedrive', 'Microsoft', 'Zoom', 'Dropbox', 'Figma'
          ].map((integration) => (
            <div key={integration} className="flex items-center justify-center p-4 border rounded-lg hover:shadow-md transition">
              <span className="font-semibold text-gray-700">{integration}</span>
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-gray-600">
          + 30 more integrations and growing
        </p>
      </section>

      {/* Code Example Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-16">Simple to Use</h2>
        <div className="bg-gray-900 text-white p-8 rounded-xl max-w-3xl mx-auto">
          <pre className="overflow-x-auto">
            <code>{`// Initialize OAuth flow
const authUrl = await authlane.oauth.getAuthUrl({
  provider: 'github',
  userId: 'user_123',
  redirectUri: 'https://yourapp.com/callback'
});

// Exchange code for tokens
const connection = await authlane.oauth.exchangeCode({
  code: req.query.code,
  provider: 'github'
});

// Use the connection
const repos = await authlane.tools.execute({
  connectionId: connection.id,
  tool: 'github_list_repos'
});`}</code>
          </pre>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-16">Simple, Transparent Pricing</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-sm border-2 border-gray-200">
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-gray-600 mb-6">Perfect for side projects</p>
            <div className="text-4xl font-bold mb-6">$0</div>
            <ul className="space-y-3 mb-8">
              <li>✓ 1,000 OAuth flows/month</li>
              <li>✓ 5 integrations</li>
              <li>✓ Community support</li>
              <li>✓ Basic analytics</li>
            </ul>
            <button className="w-full py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold">
              Start Free
            </button>
          </div>
          <div className="bg-green-600 text-white p-8 rounded-xl shadow-lg transform scale-105">
            <h3 className="text-2xl font-bold mb-2">Pro</h3>
            <p className="text-green-100 mb-6">For growing startups</p>
            <div className="text-4xl font-bold mb-6">$99/mo</div>
            <ul className="space-y-3 mb-8">
              <li>✓ 50,000 OAuth flows/month</li>
              <li>✓ All integrations</li>
              <li>✓ Priority support</li>
              <li>✓ Advanced analytics</li>
              <li>✓ Webhooks</li>
              <li>✓ Custom branding</li>
            </ul>
            <button className="w-full py-3 bg-white text-green-600 rounded-lg font-semibold">
              Start Pro Trial
            </button>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border-2 border-gray-200">
            <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
            <p className="text-gray-600 mb-6">For large organizations</p>
            <div className="text-4xl font-bold mb-6">Custom</div>
            <ul className="space-y-3 mb-8">
              <li>✓ Unlimited OAuth flows</li>
              <li>✓ All integrations</li>
              <li>✓ Dedicated support</li>
              <li>✓ SLA guarantee</li>
              <li>✓ On-premise option</li>
              <li>✓ Custom integrations</li>
            </ul>
            <button className="w-full py-3 bg-gray-900 text-white rounded-lg font-semibold">
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6">Ready to simplify your OAuth?</h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Join hundreds of developers building better integrations with Authlane.
        </p>
        <Link
          href="https://dashboard.authlane.com/signup"
          className="inline-block px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 text-lg"
        >
          Get Started Free
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">Authlane</h3>
              <p className="text-gray-400">
                Making OAuth simple and secure for developers worldwide.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="#features">Features</Link></li>
                <li><Link href="#integrations">Integrations</Link></li>
                <li><Link href="/pricing">Pricing</Link></li>
                <li><Link href="https://docs.authlane.com">Documentation</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about">About</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li><Link href="/careers">Careers</Link></li>
                <li><Link href="/contact">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
                <li><Link href="/security">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>&copy; 2025 Authlane. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
