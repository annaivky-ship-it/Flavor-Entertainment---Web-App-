
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportError } from './services/errorReporter';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Catch errors that escape React (event handlers in third-party scripts,
// async promise rejections that nothing awaits). The reporter is
// best-effort and silently drops on its own failures.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    void reportError(event.error || event.message, { component: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    void reportError(event.reason, { component: 'unhandledrejection' });
  });
}

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
