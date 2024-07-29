self.addEventListener('install', function(event) {
    // The promise that skipWaiting() returns can be safely ignored.
    self.skipWaiting();

    // Perform any other actions required for your
    // service worker to install, potentially inside
    // of event.waitUntil();
});

self.addEventListener('activate', function(event) {
    // Claim any clients immediately, so that the page will be under SW control without reloading.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
     let url = new URL(event.request.url);
     console.info(url);
     if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope + 'rsmf/')) {
         event.respondWith(lookup(url, event));
     }
});

function lookup(url, event) {
    return navigator.storage.getDirectory()
        .then(opfsRoot => {
            let pathname = url.href.replace(self.registration.scope + 'rsmf/', ''); // FIXME configurable basePath
            pathname = decodeURI(pathname);
            console.info(pathname);
            return opfsRoot.getFileHandle(pathname); // FIXME can throw
        })
        .then(fileHandle => fileHandle.getFile())
        .then(file => {
            console.info(file);
            return new Response(file.stream());
        })
        .catch(reason => {
            console.error(reason);
            return Response.error();
        });
}
