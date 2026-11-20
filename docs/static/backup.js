// =====================================================
// BACKUP.JS — menu Export / Import data di dashboard
// data versi lokal hanya ada di perangkat ini, jadi Export = cadangan & cara pindah perangkat
// =====================================================
(function () {
    const tombol = document.getElementById("menuBtn");
    const menu = document.getElementById("dataMenu");
    const inputFile = document.getElementById("importFile");
    if (!tombol || !menu) return;

    tombol.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("show");
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => menu.classList.remove("show"));

    // ---------- EXPORT: simpan semua data sebagai file .json ----------
    document.getElementById("exportBtn").addEventListener("click", async () => {
        const isi = JSON.stringify(window.MyHabitData.ekspor(), null, 2);
        const namaFile = `my-habit-backup-${new Date().toISOString().slice(0, 10)}.json`;
        menu.classList.remove("show");

        // di aplikasi APK: link download tidak jalan, jadi tulis file lalu buka menu Share
        // (pilih Drive, Files, WhatsApp, dll untuk menyimpan backup)
        const plugin = window.Capacitor && window.Capacitor.Plugins;
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && plugin && plugin.Filesystem && plugin.Share) {
            try {
                const hasil = await plugin.Filesystem.writeFile({
                    path: namaFile, data: isi, directory: "CACHE", encoding: "utf8",
                });
                await plugin.Share.share({ title: "My Habit backup", url: hasil.uri, dialogTitle: "Save backup to…" });
            } catch (err) {
                if (!/cancel/i.test(err && err.message)) alert("Could not export: " + (err.message || err));
            }
            return;
        }

        // di browser / exe: unduh langsung
        const tautan = document.createElement("a");
        tautan.href = URL.createObjectURL(new Blob([isi], { type: "application/json" }));
        tautan.download = namaFile;
        document.body.appendChild(tautan);
        tautan.click();
        tautan.remove();
        setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
    });

    // ---------- IMPORT: ganti semua data dengan isi file backup ----------
    document.getElementById("importBtn").addEventListener("click", () => inputFile.click());

    inputFile.addEventListener("change", async () => {
        const file = inputFile.files[0];
        inputFile.value = "";
        if (!file) return;
        if (!confirm("Replace ALL data on this device with this backup?\nThis can't be undone.")) return;
        try {
            window.MyHabitData.impor(JSON.parse(await file.text()));
            alert("Backup restored.");
            location.reload();
        } catch (err) {
            alert(err.message || "Could not read this file.");
        }
    });
})();
