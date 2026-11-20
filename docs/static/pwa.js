// =====================================================
// PWA.JS (versi lokal) — daftarkan service worker supaya:
//   - My Habit bisa di-install di HP / laptop
//   - tetap bisa dibuka tanpa internet
// Di aplikasi APK (Capacitor) file sudah ada di dalam APK,
// jadi service worker tidak dipakai (supaya update APK tidak tertahan cache lama)
// =====================================================
const diAplikasiAndroid = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

if (!diAplikasiAndroid && "serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker:", err));
}
