const BASE_DIR = 'rsmf';

self.addEventListener('install', function(event) {
    // The promise that skipWaiting() returns can be safely ignored.
    self.skipWaiting();

    // Perform any other actions required for your
    // service worker to install, potentially inside
    // of event.waitUntil();
});

self.addEventListener('activate', async (event) => {
    // Claim any clients immediately, so that the page will be under SW control without reloading.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
     let url = new URL(event.request.url);
     console.debug(url);
     if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope + BASE_DIR)) {
         event.respondWith(lookup(url, event));
     }
});

function lookup(url, event) {

    return Promise.resolve()
        .then(() => {
            return self.caches.match(event.request)
        })
        .catch(reason => {
            console.error(reason);
            return Response.error();
        });
}
