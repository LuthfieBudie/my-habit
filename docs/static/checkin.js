// =====================================================
// HALAMAN CHECK-IN
// data sama dengan dashboard: check-in di sini masuk ke my_habit.db di laptop,
// jadi ikut muncul di Habit Tracker. Laptop sleep → disimpan dulu di HP (offline.js)
// =====================================================
const $ = (id) => document.getElementById(id);

const habitGrid    = $("habitGrid");
const scheduleGrid = $("scheduleGrid");
const progressBar  = $("progressBar");
const progressText = $("progressText");

const addModal = $("addModal");
const addForm  = $("addForm");
const addName  = $("addName");
const addTimes = $("addTimes");
const addDate  = $("addDate");
const addError = $("addError");

const JUMLAH_MINGGU = 10;   // heatmap menampilkan 10 minggu terakhir

// warna kartu (r, g, b) — dipakai bergantian sesuai urutan kartu
const WARNA = [
    "140, 140, 235",   // ungu muda
    "88, 214, 92",     // hijau
    "250, 204, 21",    // kuning
    "255, 128, 32",    // oranye
    "56, 170, 210",    // biru
    "255, 72, 120"     // pink
];

// ---------- tanggal ----------
const hariIni = new Date();
hariIni.setHours(0, 0, 0, 0);

function tambahHari(d, jumlah) {
    const hasil = new Date(d);
    hasil.setDate(hasil.getDate() + jumlah);
    return hasil;
}

function seninDari(d) {
    return tambahHari(d, -((d.getDay() + 6) % 7));   // Senin = awal minggu
}

function toKey(d) {
    const bulan = String(d.getMonth() + 1).padStart(2, "0");
    const tgl = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${bulan}-${tgl}`;
}

function formatTanggal(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// ---------- jadwal (sama seperti di script.js dashboard) ----------
function isAktif(habit, d) {
    const key = toKey(d);
    if (habit.start_date && key < habit.start_date) return false;
    if (habit.archived_at && key >= habit.archived_at) return false;
    if (habit.stopped_at && key > habit.stopped_at) return false;
    return true;
}

function isTerjadwal(habit, d) {
    if (!isAktif(habit, d)) return false;
    const key = toKey(d);
    switch (habit.schedule_type) {
        case "weekday": return d.getDay() >= 1 && d.getDay() <= 5;
        case "range":   return key >= habit.start_date && key <= habit.end_date;
        case "once":    return key === habit.start_date;
        default:        return true;
    }
}

function isSchedule(habit) {
    return habit.schedule_type === "once" || habit.schedule_type === "range";
}

function centangSeminggu(habit, d) {
    const awal = toKey(seninDari(d));
    const akhir = toKey(tambahHari(seninDari(d), 6));
    return habit.checks.filter((k) => k >= awal && k <= akhir).length;
}

// berapa hari berturut-turut habit ini dikerjakan (hari di luar jadwal dilewati)
function hitungStreak(habit) {
    let d = new Date(hariIni);
    if (!habit.checks.includes(toKey(d))) d = tambahHari(d, -1);   // hari ini belum = streak belum putus

    let streak = 0;
    for (let i = 0; i < 366 && isAktif(habit, d); i++, d = tambahHari(d, -1)) {
        if (!isTerjadwal(habit, d)) continue;
        if (!habit.checks.includes(toKey(d))) break;
        streak++;
    }
    return streak;
}

// =====================================================
// DATA
// =====================================================
let habits = [];
let online = true;      // laptop bisa dihubungi?

async function loadHabits() {
    // 1) tampilkan salinan yang tersimpan di HP dulu → langsung muncul walau laptop sleep
    const salinan = Offline.bacaData();
    if (salinan) {
        habits = salinan;
        terapkanAntrean();
        render();
    }
    // 2) lalu sync dengan laptop
    await sinkronkan();
}

// kirim antrean ke laptop, lalu ambil data terbaru dari laptop
async function sinkronkan() {
    const hasil = await kirimAntrean();
    if (hasil.ok) {
        try {
            const semua = await Offline.kirim("/api/habits");
            habits = semua.filter((h) => !h.archived_at);   // arsip tidak ditampilkan
            online = true;
        } catch (err) {
            if (err instanceof Offline.OfflineError) online = false;
        }
    }
    terapkanAntrean();         // perubahan yang belum terkirim tetap terlihat
    Offline.simpanData(habits);
    render();
    renderStatus();
    if (detailId) renderDetail();
}

// kirim antrean saja (dipakai setiap kali check-in)
async function kirimAntrean() {
    const hasil = await Offline.sinkron(gantiHabit, (op, pesan) => {
        // laptop menolak perubahan (misalnya habit sudah dihapus di dashboard)
        if (op.type === "create") habits = habits.filter((h) => h.id !== op.tempId);
        tampilkanPesan(`A change couldn't be saved: ${pesan}`);
    });
    if (!hasil.sibuk) online = hasil.ok;
    renderStatus();
    return hasil;
}

// satu perubahan diterima laptop → pakai versi dari laptop (ID asli, jam asli)
function gantiHabit(dariServer, idLama) {
    const posisi = habits.findIndex((h) => h.id === idLama);
    if (posisi >= 0) habits[posisi] = dariServer;
    else habits.push(dariServer);
    if (detailId === idLama) detailId = dariServer.id;

    terapkanAntrean();
    Offline.simpanData(habits);
    render();
    if (detailId) renderDetail();
}

// ---------- perubahan lokal (dipakai saat online maupun offline) ----------
function terapkanCentang(habit, tanggal, selesai, waktu) {
    habit.check_times = habit.check_times || {};
    const sudah = habit.checks.includes(tanggal);
    if (selesai && !sudah) {
        habit.checks = [...habit.checks, tanggal].sort();
        habit.check_times[tanggal] = waktu.slice(11, 16);        // "2026-11-17T23:30:05" → "23:30"
    } else if (!selesai && sudah) {
        habit.checks = habit.checks.filter((k) => k !== tanggal);
        delete habit.check_times[tanggal];
    }
}

function habitSementara(op) {
    return { ...op.data, id: op.tempId, checks: [], check_times: {}, archived_at: null, stopped_at: null, sort_order: 9999 };
}

// pasang semua perubahan yang masih di antrean ke daftar habits
function terapkanAntrean() {
    Offline.antrean().forEach((op) => {
        if (op.type === "create" && !habits.some((h) => h.id === op.tempId)) habits.push(habitSementara(op));
        if (op.type === "check") {
            const habit = habits.find((h) => h.id === op.habitId);
            if (habit) terapkanCentang(habit, op.date, op.done, op.at);
        }
    });
}

// jam sekarang dalam format "2026-11-17T23:30:05" (jam HP)
function waktuSekarang() {
    const d = new Date();
    const dua = (n) => String(n).padStart(2, "0");
    return `${toKey(d)}T${dua(d.getHours())}:${dua(d.getMinutes())}:${dua(d.getSeconds())}`;
}

// ---------- status offline / sync (bar di atas) ----------
function renderStatus() {
    const bar = $("offlineBar");
    const sisa = Offline.antrean().length;

    if (!online) {
        bar.textContent = sisa
            ? `Offline — ${sisa} change${sisa > 1 ? "s" : ""} saved on this phone, will sync when your laptop is back`
            : "Offline — showing saved data. Check-ins still work.";
        bar.className = "ci-offline show";
    } else if (sisa) {
        bar.textContent = `Syncing ${sisa} change${sisa > 1 ? "s" : ""}…`;
        bar.className = "ci-offline show syncing";
    } else {
        bar.className = "ci-offline";
    }
}

let timerPesan;
function tampilkanPesan(teks) {
    const bar = $("offlineBar");
    bar.textContent = teks;
    bar.className = "ci-offline show error";
    clearTimeout(timerPesan);
    timerPesan = setTimeout(renderStatus, 4000);
}

// coba sync lagi: saat sinyal kembali, saat aplikasi dibuka lagi, dan setiap 30 detik kalau masih ada antrean
window.addEventListener("online", sinkronkan);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sinkronkan();
});
setInterval(() => {
    if (!online || Offline.antrean().length) sinkronkan();
}, 30000);

// =====================================================
// TAMPILAN
// =====================================================
function render() {
    isiGrid(habitGrid, habits.filter((h) => !isSchedule(h)), "No habits yet — tap Add to create one");
    isiGrid(scheduleGrid, habits.filter(isSchedule), "Nothing scheduled");
    renderProgress();
}

function isiGrid(grid, daftar, teksKosong) {
    grid.innerHTML = "";
    if (daftar.length === 0) {
        const p = document.createElement("p");
        p.className = "ci-empty";
        p.textContent = teksKosong;
        grid.appendChild(p);
        return;
    }
    daftar.forEach((habit, i) => grid.appendChild(buatKartu(habit, i)));
}

function buatKartu(habit, urutan) {
    const kartu = document.createElement("article");
    kartu.className = "ci-card";
    kartu.style.setProperty("--c", WARNA[urutan % WARNA.length]);   // kartu ke-1 ungu, ke-2 hijau, dst.

    // judul
    const nama = document.createElement("div");
    nama.className = "ci-name";
    const titik = document.createElement("i");
    titik.className = "ci-dot";
    const teks = document.createElement("span");
    teks.textContent = habit.name;
    nama.append(titik, teks);
    nama.title = habit.name;

    // ⏳ = ada perubahan yang belum terkirim ke laptop
    if (Offline.menunggu(habit.id)) {
        const jam = document.createElement("span");
        jam.className = "ci-pending";
        jam.textContent = "⏳";
        jam.title = "Waiting to sync";
        nama.appendChild(jam);
    }

    kartu.append(nama, buatHeatmap(habit), buatTombol(habit));

    // ketuk kartu (selain tombol Check-In) → buka detail
    kartu.addEventListener("click", (e) => {
        if (e.target.closest(".ci-btn")) return;
        bukaDetail(habit.id, WARNA[urutan % WARNA.length]);
    });
    return kartu;
}

// kotak-kotak 10 minggu terakhir: kolom = minggu, baris = Senin..Minggu
function buatHeatmap(habit) {
    const heat = document.createElement("div");
    heat.className = "ci-heat";

    const mulai = tambahHari(seninDari(hariIni), -7 * (JUMLAH_MINGGU - 1));

    for (let i = 0; i < JUMLAH_MINGGU * 7; i++) {
        heat.appendChild(buatSel(habit, tambahHari(mulai, i)));
    }
    return heat;
}

// satu kotak heatmap untuk tanggal d
function buatSel(habit, d) {
    const key = toKey(d);
    const sel = document.createElement("span");
    sel.className = "ci-cell";

    if (d <= hariIni) {
        if (habit.checks.includes(key)) {
            sel.classList.add("done");
            if (d.getDate() % 3 === 0) sel.classList.add("soft");   // variasi warna
        } else if (isTerjadwal(habit, d) && habit.schedule_type !== "per_week") {
            sel.classList.add("miss");
        }
    }

    if (d.getTime() === hariIni.getTime()) sel.classList.add("today");
    const jam = habit.check_times && habit.check_times[key];
    sel.title = formatTanggal(key) + (jam ? ` · ${jam}` : "");
    return sel;
}

function buatTombol(habit) {
    const btn = document.createElement("button");
    btn.className = "ci-btn";

    const key = toKey(hariIni);
    const sudah = habit.checks.includes(key);
    const perMinggu = habit.schedule_type === "per_week";
    const mingguIni = centangSeminggu(habit, hariIni);

    // tidak bisa check-in hari ini?
    let alasan = "";
    if (habit.stopped_at && key > habit.stopped_at) alasan = "Stopped";
    else if (habit.start_date && key < habit.start_date) alasan = `Starts ${formatTanggal(habit.start_date)}`;
    else if (!isTerjadwal(habit, hariIni)) {
        alasan = habit.schedule_type === "once" && habit.start_date > key
            ? `On ${formatTanggal(habit.start_date)}`
            : "Not today";
    } else if (perMinggu && !sudah && mingguIni >= habit.times_per_week) {
        alasan = "Weekly goal reached";
    }

    if (alasan && !sudah) {
        btn.disabled = true;
        btn.textContent = alasan;
        return btn;
    }

    if (sudah) {
        // sudah check-in: ✓, ditambah streak (atau x/target untuk habit per minggu)
        btn.classList.add("done");
        btn.innerHTML = `<span class="ci-check">✓</span>`;
        const streak = hitungStreak(habit);
        const tambahan = perMinggu ? `${mingguIni} / ${habit.times_per_week}` : streak > 1 ? `x ${streak}` : "";
        if (tambahan) btn.insertAdjacentHTML("beforeend", `<span class="ci-times">${tambahan}</span>`);
        btn.title = "Tap again to undo";
    } else {
        btn.textContent = perMinggu ? `Check-In · ${mingguIni}/${habit.times_per_week}` : "Check-In";
    }

    btn.addEventListener("click", () => checkIn(habit));
    return btn;
}

// ringkasan: berapa habit hari ini yang sudah selesai
function renderProgress() {
    const key = toKey(hariIni);
    const hariIniSaja = habits.filter((h) => {
        if (!isTerjadwal(h, hariIni)) return false;
        if (h.schedule_type === "per_week" && !h.checks.includes(key)) {
            return centangSeminggu(h, hariIni) < h.times_per_week;   // target minggu tercapai → tidak dihitung
        }
        return true;
    });
    const selesai = hariIniSaja.filter((h) => h.checks.includes(key)).length;
    const total = hariIniSaja.length;

    progressText.textContent = `${selesai} / ${total}`;
    progressBar.style.width = total === 0 ? "0%" : (selesai / total) * 100 + "%";
}

$("todayLabel").textContent = hariIni.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

// =====================================================
// CHECK-IN (sama dengan mencentang checkbox hari ini di dashboard)
// =====================================================
// langsung tampil di HP, masuk antrean, lalu dikirim ke laptop (kalau laptop sedang sleep → nanti)
function checkIn(habit) {
    const tanggal = toKey(hariIni);
    const selesai = !habit.checks.includes(tanggal);
    const waktu = waktuSekarang();

    terapkanCentang(habit, tanggal, selesai, waktu);
    Offline.antreCentang(habit.id, tanggal, selesai, waktu);
    Offline.simpanData(habits);
    render();
    if (detailId) renderDetail();

    kirimAntrean();
}

// =====================================================
// TAMBAH HABIT (masuk ke Habit Tracker / Schedule di dashboard)
// =====================================================
function nilaiRadio(nama) {
    return document.querySelector(`input[name="${nama}"]:checked`).value;
}

function aturForm() {
    const jadwal = nilaiRadio("addSchedule");
    $("perWeekBox").classList.toggle("show", jadwal === "per_week");
    $("onceBox").classList.toggle("show", jadwal === "once");
}

document.querySelectorAll('input[name="addSchedule"]').forEach((r) => r.addEventListener("change", aturForm));

let editId = null;   // null = tambah habit baru, angka = id habit yang diedit

function bukaModal(habit = null) {
    editId = habit ? habit.id : null;
    addForm.reset();
    addError.textContent = "";
    $("addTitle").textContent = habit ? "Edit habit" : "New habit";
    addDate.value = toKey(hariIni);

    // "Date range" tidak ada di form ini → jadwalnya dikunci, ubah lewat dashboard
    const rentang = habit && habit.schedule_type === "range";
    $("scheduleSeg").style.display = rentang ? "none" : "";
    $("rangeNote").style.display = rentang ? "block" : "none";

    if (habit) {
        addName.value = habit.name;
        if (!rentang) document.querySelector(`input[name="addSchedule"][value="${habit.schedule_type}"]`).checked = true;
        if (habit.times_per_week) addTimes.value = habit.times_per_week;
        if (habit.schedule_type === "once") addDate.value = habit.start_date;
        document.querySelector(`input[name="addPriority"][value="${habit.priority}"]`).checked = true;
    }

    aturForm();
    addModal.classList.add("show");
    addName.focus();
}

function tutupModal() {
    addModal.classList.remove("show");
}

$("addBtn").addEventListener("click", () => bukaModal());
$("closeAdd").addEventListener("click", tutupModal);
addModal.addEventListener("click", (e) => {
    if (e.target === addModal) tutupModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (addModal.classList.contains("show")) tutupModal();
    else tutupDetail();
});

addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lama = editId ? habits.find((h) => h.id === editId) : null;
    let data;

    if (lama && lama.schedule_type === "range") {
        // jadwal rentang tanggal tidak diubah di sini
        data = { ...lama, name: addName.value.trim(), priority: nilaiRadio("addPriority") };
    } else {
        const jadwal = nilaiRadio("addSchedule");
        // tanggal mulai: habit baru → hari ini, edit → tetap seperti sebelumnya
        const mulai = lama ? lama.start_date : toKey(hariIni);
        data = {
            name: addName.value.trim(),
            schedule_type: jadwal,
            times_per_week: jadwal === "per_week" ? Number(addTimes.value) : null,
            start_date: jadwal === "once" ? addDate.value : (lama && lama.schedule_type === "once" ? toKey(hariIni) : mulai),
            end_date: jadwal === "once" ? addDate.value : null,
            priority: nilaiRadio("addPriority")
        };
    }

    if (data.name === "") return (addError.textContent = "Name is required");
    if (data.schedule_type === "once" && !data.start_date) return (addError.textContent = "Please choose a date");

    // HABIT BARU → masuk antrean (bisa saat offline), ID sementara "tmp-..." sampai terkirim
    if (!editId) {
        const idSementara = "tmp-" + Date.now();
        Offline.antreHabitBaru(idSementara, data);
        habits.push(habitSementara({ tempId: idSementara, data }));
        Offline.simpanData(habits);
        render();
        tutupModal();
        kirimAntrean();
        return;
    }

    // EDIT → harus tersambung ke laptop
    try {
        const hasil = await Offline.kirim("/api/habits/" + editId, { method: "PUT", body: JSON.stringify(data) });
        habits[habits.findIndex((h) => h.id === hasil.id)] = hasil;
        terapkanAntrean();
        Offline.simpanData(habits);
        render();
        if (detailId) renderDetail();
        tutupModal();
    } catch (err) {
        addError.textContent = err instanceof Offline.OfflineError
            ? "You're offline — editing needs a connection to your laptop"
            : err.message;
    }
});

// =====================================================
// DETAIL HABIT: heatmap besar + Streak, Total, Avg. Log Time, Goal Progress
// =====================================================
const MINGGU_DETAIL = 20;        // heatmap detail: 20 minggu per halaman
let detailId = null;             // id habit yang sedang dibuka
let geserHalaman = 0;            // 0 = 20 minggu terakhir, 1 = 20 minggu sebelumnya, dst.

function bukaDetail(id, warna) {
    detailId = id;
    geserHalaman = 0;
    $("detailBox").style.setProperty("--c", warna);   // warna sama dengan kartunya
    renderDetail();
    $("detail").classList.add("show");
    document.body.style.overflow = "hidden";           // halaman di belakang tidak ikut ter-scroll
    $("detail").scrollTop = 0;
}

function tutupDetail() {
    detailId = null;
    $("detail").classList.remove("show");
    document.body.style.overflow = "";
}

$("closeDetail").addEventListener("click", tutupDetail);
$("editBtn").addEventListener("click", () => {
    // habit yang dibuat offline belum punya ID asli → belum bisa diedit
    if (String(detailId).startsWith("tmp-")) return tampilkanPesan("This habit is still waiting to sync — try again later");
    bukaModal(habits.find((h) => h.id === detailId));
});
$("olderBtn").addEventListener("click", () => { geserHalaman++; renderDetail(); });
$("newerBtn").addEventListener("click", () => { geserHalaman--; renderDetail(); });

function renderDetail() {
    const habit = habits.find((h) => h.id === detailId);
    if (!habit) return tutupDetail();

    $("detailName").textContent = habit.name;
    renderHeatBesar(habit);
    renderStreak(habit);
    renderTotal(habit);
    renderJamRata(habit);
    renderGoal(habit);
    renderRecords(habit);
}

// ---------- heatmap besar ----------
function renderHeatBesar(habit) {
    const heat = $("detailHeat");
    heat.innerHTML = "";

    const seninTerakhir = tambahHari(seninDari(hariIni), -7 * MINGGU_DETAIL * geserHalaman);
    const mulai = tambahHari(seninTerakhir, -7 * (MINGGU_DETAIL - 1));
    const akhir = tambahHari(seninTerakhir, 6);

    for (let i = 0; i < MINGGU_DETAIL * 7; i++) {
        heat.appendChild(buatSel(habit, tambahHari(mulai, i)));
    }

    const format = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    $("detailRange").textContent = `${format(mulai)} — ${format(akhir > hariIni ? hariIni : akhir)}`;

    // tidak bisa maju melewati minggu ini, dan tidak perlu mundur sebelum ada data
    $("newerBtn").disabled = geserHalaman === 0;
    const pertama = tanggalPertama(habit);
    $("olderBtn").disabled = !pertama || pertama >= mulai;
}

// tanggal paling awal habit ini (start_date atau centang pertama)
function tanggalPertama(habit) {
    const kandidat = [];
    if (habit.start_date) kandidat.push(habit.start_date);
    if (habit.checks.length) kandidat.push([...habit.checks].sort()[0]);
    if (!kandidat.length) return null;
    const [y, m, d] = kandidat.sort()[0].split("-").map(Number);
    return new Date(y, m - 1, d);
}

// ---------- STREAK: berturut-turut tanpa bolong (bolong = mulai lagi dari 0) ----------
function renderStreak(habit) {
    if (habit.schedule_type === "per_week") {
        // habit "X kali per minggu" dihitung per MINGGU yang targetnya tercapai
        const { sekarang, terpanjang } = streakMingguan(habit);
        $("statStreak").innerHTML = `${sekarang}<small>wk</small>`;
        $("statStreakFoot").innerHTML = `Longest: <b>${terpanjang} wk</b>`;
        return;
    }

    $("statStreak").textContent = hitungStreak(habit);
    $("statStreakFoot").innerHTML = `Longest: <b>${streakTerpanjang(habit)}</b>`;
}

// streak terpanjang sepanjang sejarah (hari di luar jadwal dilewati, tidak memutus)
function streakTerpanjang(habit) {
    const awal = tanggalPertama(habit);
    if (!awal) return 0;

    let terpanjang = 0;
    let jalan = 0;
    for (let d = new Date(awal); d <= hariIni; d = tambahHari(d, 1)) {
        if (!isTerjadwal(habit, d)) continue;
        if (habit.checks.includes(toKey(d))) {
            jalan++;
            terpanjang = Math.max(terpanjang, jalan);
        } else if (d < hariIni) {
            jalan = 0;   // hari ini yang belum dicentang tidak dihitung putus
        }
    }
    return terpanjang;
}

function streakMingguan(habit) {
    const awal = tanggalPertama(habit);
    if (!awal) return { sekarang: 0, terpanjang: 0 };

    let terpanjang = 0;
    let jalan = 0;
    const mingguIni = seninDari(hariIni).getTime();

    for (let senin = seninDari(awal); senin <= hariIni; senin = tambahHari(senin, 7)) {
        const tercapai = centangSeminggu(habit, senin) >= habit.times_per_week;
        if (tercapai) {
            jalan++;
            terpanjang = Math.max(terpanjang, jalan);
        } else if (senin.getTime() !== mingguIni) {
            jalan = 0;   // minggu ini belum selesai → belum dianggap putus
        }
    }
    return { sekarang: jalan, terpanjang };
}

// ---------- TOTAL CHECK-INS ----------
function renderTotal(habit) {
    $("statTotal").textContent = habit.checks.length;
    const pertama = tanggalPertama(habit);
    const teks = pertama
        ? pertama.toLocaleDateString("en-US", {
            month: "short", day: "numeric",
            year: pertama.getFullYear() !== hariIni.getFullYear() ? "numeric" : undefined
        })
        : "–";
    $("statTotalFoot").innerHTML = `Started: <b>${teks}</b>`;
}

// ---------- AVG. LOG TIME: rata-rata jam check-in ----------
function renderJamRata(habit) {
    const jam = Object.values(habit.check_times || {});
    if (!jam.length) {
        $("statTime").textContent = "–";
        $("statTimeFoot").textContent = "No times yet";
        return;
    }

    // ubah "14:05" → 845 menit, rata-ratakan, lalu ubah lagi ke jam
    const menit = jam.map((j) => {
        const [h, m] = j.split(":").map(Number);
        return h * 60 + m;
    });
    const rata = Math.round(menit.reduce((a, b) => a + b, 0) / menit.length);
    const h24 = Math.floor(rata / 60);
    const m = String(rata % 60).padStart(2, "0");
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

    $("statTime").textContent = `${h12}:${m}`;
    $("statTimeFoot").innerHTML = `<b>${h24 < 12 ? "AM" : "PM"}</b> · from ${jam.length} check-in${jam.length > 1 ? "s" : ""}`;
}

// ---------- GOAL PROGRESS: sama dengan Percentage di tabel Analysis (bulan ini) ----------
function renderGoal(habit) {
    const awal = new Date(hariIni.getFullYear(), hariIni.getMonth(), 1);
    const hasil = hitungHabit(habit, awal, hariIni);
    const persen = hasil.target === 0 ? 0 : Math.round((hasil.selesai / hasil.target) * 100);

    $("statGoal").textContent = persen + "%";
    $("statGoalBar").style.width = Math.min(persen, 100) + "%";
    $("statGoalFoot").innerHTML = `<b>${Math.round(hasil.selesai)} / ${Math.round(hasil.target)}</b> this month`;
}

// target & selesai dari tanggal awal sampai akhir (sama seperti hitungHabit di dashboard)
function hitungHabit(habit, awal, akhir) {
    if (habit.schedule_type === "per_week") return hitungPerMinggu(habit, awal, akhir);

    let target = 0;
    let selesai = 0;
    for (let d = new Date(awal); d <= akhir; d = tambahHari(d, 1)) {
        if (!isTerjadwal(habit, d)) continue;
        target++;
        if (habit.checks.includes(toKey(d))) selesai++;
    }
    return { target, selesai };
}

function hitungPerMinggu(habit, awal, akhir) {
    const x = habit.times_per_week;
    const hariPerMinggu = {};
    for (let d = new Date(awal); d <= akhir; d = tambahHari(d, 1)) {
        if (!isAktif(habit, d)) continue;
        const kunci = toKey(seninDari(d));
        hariPerMinggu[kunci] = (hariPerMinggu[kunci] || 0) + 1;
    }

    let target = 0;
    let selesai = 0;
    Object.entries(hariPerMinggu).forEach(([kunciSenin, hari]) => {
        const [y, m, d] = kunciSenin.split("-").map(Number);
        const sudah = Math.min(centangSeminggu(habit, new Date(y, m - 1, d)), x);
        target += x * (hari / 7);
        selesai += sudah * (hari / 7);
    });
    return { target, selesai };
}

// ---------- RECORDS: daftar check-in terbaru, dikelompokkan per bulan ----------
function renderRecords(habit) {
    const wadah = $("records");
    wadah.innerHTML = "";

    const urut = [...habit.checks].sort().reverse();   // terbaru di atas
    if (!urut.length) {
        const p = document.createElement("p");
        p.className = "ci-empty";
        p.textContent = "No check-ins yet";
        wadah.appendChild(p);
        return;
    }

    // kelompokkan: { "2026-11": ["2026-11-17", ...], ... }
    const perBulan = {};
    urut.forEach((key) => (perBulan[key.slice(0, 7)] ||= []).push(key));

    Object.entries(perBulan).forEach(([bulan, daftar]) => {
        const [y, m] = bulan.split("-").map(Number);

        const judul = document.createElement("div");
        judul.className = "ci-month";
        const nama = document.createElement("span");
        nama.textContent = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const jumlah = document.createElement("b");
        jumlah.textContent = daftar.length;
        judul.append(nama, jumlah);
        wadah.appendChild(judul);

        daftar.forEach((key) => {
            const baris = document.createElement("div");
            baris.className = "ci-record";
            const tgl = document.createElement("span");
            tgl.textContent = formatTanggal(key);
            const jam = document.createElement("span");
            jam.textContent = keJam12(habit.check_times && habit.check_times[key]);
            baris.append(tgl, jam);
            wadah.appendChild(baris);
        });
    });
}

// "14:05" → "2:05 PM"  (centang lama tanpa jam → "–")
function keJam12(jam) {
    if (!jam) return "–";
    const [h, m] = jam.split(":").map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// =====================================================
// TEMA DARK / LIGHT (disimpan di browser, jadi tetap saat dibuka lagi)
// =====================================================
const meta = document.querySelector('meta[name="theme-color"]');

function pakaiTema(tema) {
    document.documentElement.dataset.theme = tema;     // <html data-theme="light">
    localStorage.setItem("ciTheme", tema);
    meta.content = tema === "light" ? "#f0f1f3" : "#000000";   // warna bar atas browser HP
}

$("themeBtn").addEventListener("click", () => {
    const sekarang = document.documentElement.dataset.theme;
    pakaiTema(sekarang === "light" ? "dark" : "light");
});

pakaiTema(document.documentElement.dataset.theme);

// =====================================================
// JALANKAN
// =====================================================
loadHabits();
