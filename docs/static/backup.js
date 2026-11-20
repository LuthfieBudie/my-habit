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

    // ---------- EXPORT: unduh semua data sebagai file .json ----------
    document.getElementById("exportBtn").addEventListener("click", () => {
        const isi = JSON.stringify(window.MyHabitData.ekspor(), null, 2);
        const tautan = document.createElement("a");
        tautan.href = URL.createObjectURL(new Blob([isi], { type: "application/json" }));
        tautan.download = `my-habit-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(tautan);
        tautan.click();
        tautan.remove();
        setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
        menu.classList.remove("show");
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
