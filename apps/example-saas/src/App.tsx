import { Link, Route, Routes, useLocation } from 'react-router-dom';
import GitHubPage from './pages/GitHubPage';
import HomePage from './pages/HomePage';
import PostsPage from './pages/PostsPage';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg transition-colors ${
        isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg" />
              <h1 className="text-xl font-bold text-gray-900">AI Assistant Hub</h1>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                Example SaaS
              </span>
            </div>
            <nav className="flex items-center gap-2">
              <NavLink to="/">Home</NavLink>
              <NavLink to="/github">GitHub</NavLink>
              <NavLink to="/posts">Posts API</NavLink>
              <a
                href="http://localhost:5173"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
              >
                Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/github" element={<GitHubPage />} />
          <Route path="/posts" element={<PostsPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          This is an example SaaS application demonstrating Authlane integration.
          <br />
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Open Authlane Dashboard →
          </a>
        </div>
      </footer>
    </div>
  );
}




