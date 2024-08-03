importScripts(
    './js/filestore.js'
);

const BASE_DIR = 'rsmf';
let fileStore;

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
     if (fileStore == null) fileStore = new FileStore([BASE_DIR]);
     if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope + fileStore.getBasePath())) {
         event.respondWith(lookup(url, fileStore, event));
     }
});

function lookup(url, fileStore, event) {

    return Promise.resolve()
        .then(() => {
            let pathname = url.href.replace(self.registration.scope + fileStore.getBasePath(), '');
            pathname = decodeURI(pathname);
            console.debug(pathname);
            return fileStore.getFileHandle(pathname);
        })
        .then(fileHandle => fileHandle.getFile())
        .then(file => {
            console.debug(file);
            return new Response(file.stream());
        })
        .catch(reason => {
            console.error(reason);
            return Response.error();
        });
}
