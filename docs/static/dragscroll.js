// =====================================================
// DRAGSCROLL.JS
//  1) saat menarik item (to-do, habit, arsip, project) ke dekat tepi atas / bawah layar,
//     halaman ikut bergulir → item bisa dibawa ke Habit Tracker atau kartu lain yang jauh
//  2) di HP: TAHAN item ±0,4 detik lalu geser (drag bawaan browser tidak jalan dengan jari).
//     yang dikirim adalah event drag biasa, jadi kode drag di script.js tidak perlu diubah
// =====================================================
(function () {
    const TEPI = 90;            // jarak dari tepi layar (px) yang memicu gulir otomatis
    const KECEPATAN = 18;       // px per frame di paling tepi
    const TAHAN_MS = 400;       // lama menahan jari sebelum mulai drag di HP

    // ---------- (1) GULIR OTOMATIS ----------
    let posisiY = null;         // posisi kursor / jari terakhir selama drag (null = tidak sedang drag)
    let jalan = false;

    function gulir() {
        if (posisiY === null) {
            jalan = false;
            return;
        }
        let geser = 0;
        if (posisiY < TEPI) geser = -KECEPATAN * (1 - posisiY / TEPI);
        else if (posisiY > innerHeight - TEPI) geser = KECEPATAN * (1 - (innerHeight - posisiY) / TEPI);
        if (geser) {
            scrollBy(0, geser);
            if (sentuh.aktif) kirimDragOver();     // HP: kotak di bawah jari ikut berubah saat bergulir
        }
        requestAnimationFrame(gulir);
    }

    function mulaiGulir(y) {
        posisiY = y;
        if (!jalan) {
            jalan = true;
            requestAnimationFrame(gulir);
        }
    }

    const berhentiGulir = () => { posisiY = null; };

    // laptop: drag bawaan browser
    document.addEventListener("dragover", (e) => { if (e.isTrusted) mulaiGulir(e.clientY); }, true);
    document.addEventListener("dragend", berhentiGulir, true);
    document.addEventListener("drop", berhentiGulir, true);

    // ---------- (2) DRAG DENGAN JARI (HP) ----------
    const sentuh = { calon: null, aktif: false, sumber: null, bayangan: null, target: null, x: 0, y: 0, timer: null, awalX: 0, awalY: 0 };

    // pengganti e.dataTransfer (script.js memanggil setData & effectAllowed)
    const dataPalsu = () => ({ effectAllowed: "move", dropEffect: "move", setData() {}, getData: () => "", types: [] });

    function kirim(el, jenis, relatedTarget = null) {
        if (!el) return null;
        const e = new Event(jenis, { bubbles: true, cancelable: true });
        Object.defineProperties(e, {
            clientX: { value: sentuh.x },
            clientY: { value: sentuh.y },
            dataTransfer: { value: dataPalsu() },
            relatedTarget: { value: relatedTarget }
        });
        el.dispatchEvent(e);
        return e;
    }

    // elemen di bawah jari (bayangan disembunyikan sebentar supaya tidak ikut terdeteksi)
    function elemenDiBawahJari() {
        if (sentuh.bayangan) sentuh.bayangan.style.display = "none";
        const el = document.elementFromPoint(sentuh.x, sentuh.y);
        if (sentuh.bayangan) sentuh.bayangan.style.display = "";
        return el;
    }

    function kirimDragOver() {
        const baru = elemenDiBawahJari();
        if (baru !== sentuh.target) {
            kirim(sentuh.target, "dragleave", baru);
            kirim(baru, "dragenter", sentuh.target);
            sentuh.target = baru;
        }
        const e = kirim(baru, "dragover");
        sentuh.bolehDrop = !!(e && e.defaultPrevented);   // script.js memanggil preventDefault kalau boleh di-drop
    }

    function buatBayangan(el) {
        const kotak = el.getBoundingClientRect();
        const b = el.cloneNode(true);
        Object.assign(b.style, {
            position: "fixed", left: kotak.left + "px", top: kotak.top + "px",
            width: kotak.width + "px", margin: "0", zIndex: "9999", pointerEvents: "none",
            opacity: "0.9", transform: "scale(1.03)", boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
            background: getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)" ? "#fff" : "",
            borderRadius: "12px"
        });
        b.dataset.selisihX = sentuh.x - kotak.left;
        b.dataset.selisihY = sentuh.y - kotak.top;
        document.body.appendChild(b);
        return b;
    }

    function mulaiDragJari() {
        const el = sentuh.calon;
        if (!el) return;
        sentuh.aktif = true;
        sentuh.sumber = el;
        kirim(el, "dragstart");
        sentuh.bayangan = buatBayangan(el);
        if (navigator.vibrate) navigator.vibrate(25);      // getar kecil: tanda drag dimulai
        mulaiGulir(sentuh.y);
        kirimDragOver();
    }

    function selesai() {
        clearTimeout(sentuh.timer);
        if (sentuh.aktif) {
            if (sentuh.bolehDrop) kirim(sentuh.target, "drop");
            else kirim(sentuh.target, "dragleave");
            kirim(sentuh.sumber, "dragend");
        }
        if (sentuh.bayangan) sentuh.bayangan.remove();
        Object.assign(sentuh, { calon: null, aktif: false, sumber: null, bayangan: null, target: null, bolehDrop: false });
        berhentiGulir();
    }

    document.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return selesai();
        const el = e.target.closest('[draggable="true"]');
        if (!el || e.target.closest("button, input, select, textarea, a")) return;
        const t = e.touches[0];
        Object.assign(sentuh, { calon: el, x: t.clientX, y: t.clientY, awalX: t.clientX, awalY: t.clientY });
        sentuh.timer = setTimeout(mulaiDragJari, TAHAN_MS);
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
        if (!sentuh.calon) return;
        const t = e.touches[0];
        sentuh.x = t.clientX;
        sentuh.y = t.clientY;

        if (!sentuh.aktif) {
            // jari sudah bergeser sebelum waktunya = mau menggulir halaman, bukan drag
            if (Math.hypot(t.clientX - sentuh.awalX, t.clientY - sentuh.awalY) > 10) selesai();
            return;
        }

        e.preventDefault();      // jangan gulir halaman dengan jari selama drag (gulir otomatis yang jalan)
        const b = sentuh.bayangan;
        b.style.left = sentuh.x - b.dataset.selisihX + "px";
        b.style.top = sentuh.y - b.dataset.selisihY + "px";
        posisiY = sentuh.y;
        kirimDragOver();
    }, { passive: false });

    document.addEventListener("touchend", selesai);
    document.addEventListener("touchcancel", selesai);

    // drag bawaan browser HP (kalau ada) dimatikan supaya tidak dobel dengan versi jari
    document.addEventListener("dragstart", (e) => { if (e.isTrusted && sentuh.calon) e.preventDefault(); }, true);
    // menu "tahan lama" (salin / bagikan) tidak muncul saat mau drag
    document.addEventListener("contextmenu", (e) => { if (sentuh.calon) e.preventDefault(); }, true);
})();
