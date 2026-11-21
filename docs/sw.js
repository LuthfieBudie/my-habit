// =====================================================
// SERVICE WORKER (versi lokal)
// semua file aplikasi disimpan di perangkat → My Habit tetap jalan tanpa internet.
// data habit TIDAK di sini (data ada di localStorage, diurus localapi.js)
// =====================================================
const VERSI = "my-habit-local-v4";     // naikkan setiap kali file aplikasi diubah
const FILE_APLIKASI = [
    "./",
    "index.html",
    "checkin.html",
    "manifest.json",
    "static/style.css",
    "static/script.js",
    "static/checkin.css",
    "static/checkin.js",
    "static/offline.js",
    "static/localapi.js",
    "static/pwa.js",
    "static/backup.js",
    "static/dragscroll.js",
    "static/icons/icon-192.png",
    "static/icons/icon-512.png",
    "static/icons/maskable-512.png",
    "static/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(VERSI).then((c) => c.addAll(FILE_APLIKASI)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((nama) => Promise.all(nama.filter((n) => n !== VERSI).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

// tampilkan dari simpanan dulu (cepat & bisa offline), sambil memperbarui simpanan di belakang
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
    if (url.origin !== self.location.origin && !font) return;

    event.respondWith(
        caches.open(VERSI).then(async (cache) => {
            const simpanan = await cache.match(req, { ignoreSearch: true });
            const terbaru = fetch(req)
                .then((res) => {
                    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
                    return res;
                })
                .catch(() => simpanan || Response.error());
            return simpanan || terbaru;
        })
    );
});
