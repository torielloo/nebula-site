import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/AppErrorBoundary.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
)

// Mantém o Nébula instalável como aplicativo sem voltar ao cache antigo.
// O worker atual não intercepta fetch nem guarda bundles: ele só fornece a
// camada PWA necessária e limpa caches legados.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('nebula-os-')).map((key) => caches.delete(key))))
        .catch(() => {});
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
