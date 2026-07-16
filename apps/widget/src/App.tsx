import { useEffect } from 'react';
import { Widget } from './components/Widget';
import './styles/index.css';

export const App = () => {
  const isCallback = window.location.pathname === '/connect/callback';
  useEffect(() => {
    if (!isCallback) return;
    const query = new URLSearchParams(window.location.search);
    const serviceId = query.get('serviceId');
    if (serviceId && window.opener) {
      window.opener.postMessage({ type: 'oauth:success', serviceId }, window.location.origin);
      window.close();
    }
  }, [isCallback]);

  return isCallback ? (
    <div className="widget">Connection completed. You can close this window.</div>
  ) : (
    <Widget />
  );
};
