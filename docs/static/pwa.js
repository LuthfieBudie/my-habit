// =====================================================
// PWA.JS (versi lokal) — daftarkan service worker supaya:
//   - My Habit bisa di-install di HP / laptop
//   - tetap bisa dibuka tanpa internet
// =====================================================
if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker:", err));
}
