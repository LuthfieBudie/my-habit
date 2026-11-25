// =====================================================
// SYNC.JS — simpan data ke akun Google (Firebase) supaya bisa dipakai di perangkat lain
//   - tanpa login: aplikasi tetap jalan seperti biasa (data hanya di perangkat ini)
//   - sudah login: data dikirim ke Firestore (users/<uid akun>) dan diambil di perangkat lain
//   - memakai REST API Firebase (tanpa SDK) supaya ringan dan aplikasi tetap jalan offline
// =====================================================
(function () {
    const FIREBASE = {
        apiKey: "AIzaSyCCeiCPVVzPjeJ7wkJEtWvC0A1h_GKJ9SA",
        projectId: "my-habit-5b829",
    };
    const KUNCI_SESI = "myhabit_sync_v1";
    const urlDokumen = (uid) =>
        `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/users/${uid}`;

    let sesi = bacaSesi();
    let sedangSync = false;
    let adaPerubahanSaatSync = false;
    let sedangTerapkan = false;
    let timerKirim = null;
    let syncTerakhirDicoba = 0;

    function bacaSesi() {
        try { return JSON.parse(localStorage.getItem(KUNCI_SESI)) || null; } catch (err) { return null; }
    }

    function simpanSesi() {
        if (sesi) localStorage.setItem(KUNCI_SESI, JSON.stringify(sesi));
        else localStorage.removeItem(KUNCI_SESI);
    }

    function pesanError(hasil) {
        const kode = (hasil && hasil.error && (hasil.error.message || hasil.error.status)) || "Unknown error";
        if (/PERMISSION_DENIED/.test(kode)) return "Access denied by the database rules.";
        if (/INVALID_IDP_RESPONSE|INVALID_ID_TOKEN/.test(kode)) return "Google sign-in was rejected. Please try again.";
        return kode;
    }

    function dataKosong(data) {
        return !data || (!data.habits.length && !data.todos.length && !data.notes.length && !data.projects.length);
    }

    function namaPerangkat() {
        if (window.pywebview) return "Windows";
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return "Android";
        return "Browser";
    }

    // ---------- 1) ambil ID token Google (cara berbeda tiap platform) ----------
    async function ambilIdTokenGoogle() {
        // EXE: desktop.py membuka browser untuk login, lalu mengembalikan id_token
        if (window.pywebview && window.pywebview.api && window.pywebview.api.google_login) {
            const hasil = await window.pywebview.api.google_login();
            if (!hasil || hasil.error) throw new Error((hasil && hasil.error) || "Sign-in cancelled.");
            return hasil.id_token;
        }
        throw new Error("Sign in with Google isn't available here yet.");
    }

    // ---------- 2) tukar ID token Google dengan sesi Firebase ----------
    async function masukFirebase(idTokenGoogle) {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE.apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                postBody: `id_token=${encodeURIComponent(idTokenGoogle)}&providerId=google.com`,
                requestUri: "http://localhost",
                returnSecureToken: true,
            }),
        });
        const hasil = await res.json();
        if (!res.ok) throw new Error(pesanError(hasil));

        sesi = {
            uid: hasil.localId,
            email: hasil.email,
            nama: hasil.displayName || hasil.email,
            foto: hasil.photoUrl || "",
            idToken: hasil.idToken,
            refreshToken: hasil.refreshToken,
            kedaluwarsa: Date.now() + (Number(hasil.expiresIn) - 60) * 1000,
            versiServer: 0,
            // login pertama: data yang sudah ada di perangkat ini dianggap "belum terkirim"
            kotor: !dataKosong(window.MyHabitData.ekspor().data),
            berubahPada: Date.now(),
            terakhirSync: 0,
        };
        simpanSesi();
    }

    // token Firebase berlaku 1 jam → diperbarui otomatis pakai refreshToken
    async function tokenAktif() {
        if (Date.now() < sesi.kedaluwarsa) return sesi.idToken;
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sesi.refreshToken)}`,
        });
        const hasil = await res.json();
        if (!res.ok) {
            if (res.status === 400) keluar();       // sesi dicabut / akun dihapus → minta login ulang
            throw new Error("Please sign in again.");
        }
        sesi.idToken = hasil.id_token;
        sesi.refreshToken = hasil.refresh_token;
        sesi.kedaluwarsa = Date.now() + (Number(hasil.expires_in) - 60) * 1000;
        simpanSesi();
        return sesi.idToken;
    }

    // ---------- 3) baca / tulis dokumen users/<uid> di Firestore ----------
    async function ambilDariServer() {
        const res = await fetch(urlDokumen(sesi.uid), { headers: { Authorization: `Bearer ${await tokenAktif()}` } });
        if (res.status === 404) return null;
        const hasil = await res.json();
        if (!res.ok) throw new Error(pesanError(hasil));
        const kolom = hasil.fields || {};
        return {
            versi: Number((kolom.updated_at && kolom.updated_at.integerValue) || 0),
            data: kolom.data ? JSON.parse(kolom.data.stringValue) : null,
        };
    }

    async function kirimKeServer() {
        const versi = Math.max(Date.now(), sesi.versiServer + 1);
        const res = await fetch(urlDokumen(sesi.uid), {
            method: "PATCH",
            headers: { Authorization: `Bearer ${await tokenAktif()}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                fields: {
                    data: { stringValue: JSON.stringify(window.MyHabitData.ekspor()) },
                    updated_at: { integerValue: String(versi) },
                    device: { stringValue: namaPerangkat() },
                },
            }),
        });
        if (!res.ok) throw new Error(pesanError(await res.json()));
        sesi.versiServer = versi;
        sesi.kotor = false;
    }

    function terapkanDariServer(server) {
        sedangTerapkan = true;
        window.MyHabitData.impor(server.data);
        sesi.versiServer = server.versi;
        sesi.kotor = false;
        sesi.terakhirSync = Date.now();
        simpanSesi();
        location.reload();
    }

    // ---------- 4) sinkronisasi: siapa yang lebih baru, itu yang dipakai ----------
    async function sync() {
        if (!sesi || sedangSync || !navigator.onLine) return;
        sedangSync = true;
        adaPerubahanSaatSync = false;
        syncTerakhirDicoba = Date.now();
        tampilkanStatus("Syncing…");
        try {
            const server = await ambilDariServer();

            if (!server || !server.data) {
                await kirimKeServer();                                   // akun masih kosong → unggah data perangkat ini
            } else if (server.versi > sesi.versiServer) {                // ada perubahan dari perangkat lain
                if (sesi.kotor && sesi.versiServer === 0) {
                    const pakaiAkun = confirm(
                        "Your Google account already has My Habit data.\n\n" +
                        "OK = use the data from your account (replaces this device)\n" +
                        "Cancel = keep this device's data (replaces your account)"
                    );
                    if (pakaiAkun) return terapkanDariServer(server);
                    await kirimKeServer();
                } else if (sesi.kotor && sesi.berubahPada > server.versi) {
                    await kirimKeServer();                               // perubahan di perangkat ini lebih baru
                } else {
                    return terapkanDariServer(server);
                }
            } else if (sesi.kotor) {
                await kirimKeServer();
            }

            if (adaPerubahanSaatSync) sesi.kotor = true;                // ada perubahan baru selama proses → kirim lagi
            sesi.terakhirSync = Date.now();
            simpanSesi();
            tampilkanStatus();
        } catch (err) {
            tampilkanStatus(navigator.onLine ? "Sync failed: " + err.message : "Offline — will sync later");
        } finally {
            sedangSync = false;
            if (sesi && sesi.kotor && adaPerubahanSaatSync) jadwalkanKirim();
        }
    }

    function jadwalkanKirim() {
        clearTimeout(timerKirim);
        timerKirim = setTimeout(sync, 2500);
    }

    // setiap data berubah (dari localapi.js) → tandai & kirim beberapa detik kemudian
    window.addEventListener("myhabit:changed", () => {
        if (!sesi || sedangTerapkan) return;
        sesi.kotor = true;
        sesi.berubahPada = Date.now();
        simpanSesi();
        if (sedangSync) adaPerubahanSaatSync = true;
        else jadwalkanKirim();
    });

    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - syncTerakhirDicoba > 20000) sync();
    });

    // ---------- 5) tombol & tampilan di menu "Your data" ----------
    async function masuk() {
        const tombol = document.getElementById("signInBtn");
        tombol.disabled = true;
        tampilkanStatus("Finish signing in in your browser…");
        try {
            await masukFirebase(await ambilIdTokenGoogle());
            tampilkanStatus();
            await sync();
        } catch (err) {
            tampilkanStatus(err.message);
        } finally {
            tombol.disabled = false;
        }
    }

    function keluar() {
        sesi = null;
        simpanSesi();
        tampilkanStatus();
    }

    function waktuRelatif(ms) {
        const detik = Math.round((Date.now() - ms) / 1000);
        if (detik < 60) return "just now";
        if (detik < 3600) return Math.floor(detik / 60) + " min ago";
        if (detik < 86400) return Math.floor(detik / 3600) + " h ago";
        return Math.floor(detik / 86400) + " d ago";
    }

    let ikonAsli = null;
    function tampilkanAvatar() {
        const tombol = document.getElementById("menuBtn");
        if (!tombol) return;
        if (ikonAsli === null) ikonAsli = tombol.innerHTML;
        if (sesi && sesi.foto) {
            tombol.innerHTML = "";
            const gambar = document.createElement("img");
            gambar.src = sesi.foto;
            gambar.alt = "";
            gambar.className = "avatar-img";
            gambar.referrerPolicy = "no-referrer";
            gambar.onerror = () => { tombol.textContent = (sesi && sesi.nama ? sesi.nama[0] : "?").toUpperCase(); };
            tombol.appendChild(gambar);
        } else {
            tombol.innerHTML = ikonAsli;
        }
    }

    function tampilkanStatus(teks) {
        const status = document.getElementById("syncStatus");
        if (!status) return;
        const tampil = (id, ya) => { const el = document.getElementById(id); if (el) el.hidden = !ya; };

        tampil("signInBtn", !sesi);
        tampil("syncNowBtn", !!sesi);
        tampil("signOutBtn", !!sesi);

        if (!sesi) {
            status.textContent = teks || "Sign in with Google to keep your data in your account and use it on other devices.";
        } else {
            const info = sesi.terakhirSync ? `Last synced ${waktuRelatif(sesi.terakhirSync)}` : "Not synced yet";
            status.textContent = `${sesi.email}\n${teks || info}`;
        }
        tampilkanAvatar();
    }

    function pasangTombol() {
        const pasang = (id, fungsi) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fungsi); };
        pasang("signInBtn", masuk);
        pasang("syncNowBtn", sync);
        pasang("signOutBtn", () => {
            if (confirm("Sign out? Your data stays on this device, but it will no longer sync.")) keluar();
        });
        tampilkanStatus();
        if (sesi) sync();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pasangTombol);
    else pasangTombol();
})();
