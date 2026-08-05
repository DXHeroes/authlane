import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { Widget } from './components/Widget';
import './styles/index.css';

/**
 * What the popup shows after the provider hands control back.
 *
 * `window.close()` only works when the browser opened this window from script, so the
 * screen has to stand on its own for every case where it does not.
 */
function CallbackComplete() {
  return (
    <div className="widget">
      <div className="widget-notice" role="status">
        <span className="widget-notice__icon widget-notice__icon--success">
          <Check size={20} aria-hidden="true" />
        </span>
        <h2 className="widget-notice__title">Connected</h2>
        <p className="widget-notice__body">
          You can close this window and go back to where you started.
        </p>
      </div>
    </div>
  );
}

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

  return isCallback ? <CallbackComplete /> : <Widget />;
};
