/* Nébula OS — Service Worker de instalação sem cache de bundles.
   Ele mantém a experiência PWA/aplicativo instalável, mas deliberadamente não
   intercepta fetch. Assim o site continua buscando a versão atual no servidor. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nebula-os-")).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Sem fetch handler: nenhuma resposta do site é armazenada por este worker.
