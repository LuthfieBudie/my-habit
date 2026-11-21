function drawLineChart(container, data, color) {
    container.chartData = data;
    container.chartColor = color;
    renderChart(container);

    if (!container.chartObserved) {
        new ResizeObserver(() => renderChart(container)).observe(container);
        container.chartObserved = true;
    }
}

function renderChart(container) {
    const data = container.chartData;
    const color = container.chartColor;
    const svgNS = "http://www.w3.org/2000/svg";

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!data || width === 0 || height === 0) return;

    container.innerHTML = "";

    const pad = { top: 10, right: 8, bottom: 20, left: 8 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const angka = data.values.filter((v) => v !== null);
    const max = data.max ?? Math.max(...angka);
    const min = data.min ?? Math.min(...angka);
    const range = max - min || 1;
    const n = data.labels.length;

    const semua = data.labels.map((label, i) => ({
        x: n === 1 ? pad.left + w / 2 : pad.left + (i / (n - 1)) * w,
        y: data.values[i] === null ? null : pad.top + h - ((data.values[i] - min) / range) * h * 0.85 - h * 0.075,
        value: data.values[i],
        label: label
    }));
    const points = semua.filter((p) => p.value !== null);

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    const gradId = "grad-" + container.id;
    svg.innerHTML = `
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
        </defs>`;

    for (let i = 0; i <= 2; i++) {
        const y = pad.top + (h / 2) * i;
        const grid = document.createElementNS(svgNS, "line");
        grid.setAttribute("x1", pad.left);
        grid.setAttribute("x2", width - pad.right);
        grid.setAttribute("y1", y);
        grid.setAttribute("y2", y);
        grid.setAttribute("class", "chart-grid");
        svg.appendChild(grid);
    }

    const step = Math.ceil(n / Math.max(1, Math.floor(w / 34)));
    semua.forEach((p, i) => {
        if (i % step !== 0 && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < step) return;  
        const t = document.createElementNS(svgNS, "text");
        t.setAttribute("x", p.x);
        t.setAttribute("y", height - 4);
        t.setAttribute("class", "chart-label");
        let anchor = "middle";
        if (n > 1 && i === 0) anchor = "start";
        if (n > 1 && i === n - 1) anchor = "end";
        t.setAttribute("text-anchor", anchor);
        t.textContent = p.label;
        svg.appendChild(t);
    });

    container.appendChild(svg);
    if (points.length === 0) return;  

    const linePath = smoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    const areaPath = `${linePath} L ${last.x} ${pad.top + h} L ${first.x} ${pad.top + h} Z`;

    const area = document.createElementNS(svgNS, "path");
    area.setAttribute("d", areaPath);
    area.setAttribute("fill", `url(#${gradId})`);
    svg.appendChild(area);

    const line = document.createElementNS(svgNS, "path");
    line.setAttribute("d", linePath);
    line.setAttribute("class", "chart-line");
    line.setAttribute("stroke", color);
    svg.appendChild(line);

    const endDot = createDot(svgNS, last, color);
    svg.appendChild(endDot);

    const hoverLine = document.createElementNS(svgNS, "line");
    hoverLine.setAttribute("y1", pad.top);
    hoverLine.setAttribute("y2", pad.top + h);
    hoverLine.setAttribute("class", "chart-hover-line");
    const hoverDot = createDot(svgNS, last, color);
    hoverLine.style.opacity = 0;
    hoverDot.style.opacity = 0;
    svg.appendChild(hoverLine);
    svg.appendChild(hoverDot);

    const tip = document.createElement("div");
    tip.className = "chart-tip";
    container.appendChild(tip);

    svg.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let nearest = points[0];
        points.forEach((p) => {
            if (Math.abs(p.x - mx) < Math.abs(nearest.x - mx)) nearest = p;
        });

        hoverLine.setAttribute("x1", nearest.x);
        hoverLine.setAttribute("x2", nearest.x);
        hoverDot.setAttribute("cx", nearest.x);
        hoverDot.setAttribute("cy", nearest.y);
        hoverLine.style.opacity = 1;
        hoverDot.style.opacity = 1;
        endDot.style.opacity = 0;

        tip.innerHTML = `<b>${nearest.value}${data.unit}</b> ${nearest.label}`;
        tip.style.opacity = 1;
        const tipX = Math.min(Math.max(nearest.x, tip.offsetWidth / 2), width - tip.offsetWidth / 2);
        tip.style.left = tipX + "px";
        tip.style.top = (nearest.y - 10) + "px";
    });

    svg.addEventListener("mouseleave", () => {
        hoverLine.style.opacity = 0;
        hoverDot.style.opacity = 0;
        endDot.style.opacity = 1;
        tip.style.opacity = 0;
    });
}

function createDot(svgNS, p, color) {
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#fff");
    dot.setAttribute("stroke", color);
    dot.setAttribute("stroke-width", 2.5);
    return dot;
}

function smoothPath(points) {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const t = 0.18;
        const c1x = p1.x + (p2.x - p0.x) * t;
        const c1y = p1.y + (p2.y - p0.y) * t;
        const c2x = p2.x - (p3.x - p1.x) * t;
        const c2y = p2.y - (p3.y - p1.y) * t;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

const $ = (id) => document.getElementById(id);

const habitCard   = $("habitCard");
const addHabitBtn = $("addHabitBtn");
const trackerHead = $("trackerHead");
const trackerBody = $("trackerBody");

const scheduleCard   = $("scheduleCard");
const addScheduleBtn = $("addScheduleBtn");
const scheduleHead   = $("scheduleHead");
const scheduleBody   = $("scheduleBody");

const todoCard    = $("todoCard");
const addTodoBtn  = $("addTodoBtn");
const todoList    = $("todoList");
const archiveCard = $("archiveCard");
const archiveList = $("archiveList");

const itemModal      = $("itemModal");
const itemModalTitle = $("itemModalTitle");
const closeItemBtn   = $("closeItemBtn");
const cancelItemBtn  = $("cancelItemBtn");
const itemDangerBtn  = $("itemDangerBtn");
const itemForm       = $("itemForm");
const itemName       = $("itemName");
const startBox       = $("startBox");
const startFrom      = $("startFrom");
const customBox      = $("customBox");
const perWeekField   = $("perWeekField");
const rangeField     = $("rangeField");
const timesPerWeek   = $("timesPerWeek");
const startDate      = $("startDate");
const endDate        = $("endDate");
const itemError      = $("itemError");

const monthBtn      = $("monthBtn");
const monthModal    = $("monthModal");
const closeMonthBtn = $("closeMonthBtn");
const thisMonthBtn  = $("thisMonthBtn");
const monthForm     = $("monthForm");
const monthSelect   = $("monthSelect");
const yearSelect    = $("yearSelect");
const monthLabel    = $("monthLabel");

const monthlyChart = $("monthlyChart");
const monthlyStat  = $("monthlyStat");
const monthlyTag   = $("monthlyTag");
const monthlyLabel = $("monthlyLabel");

const weeklyChart = $("weeklyChart");
const weeklyStat  = $("weeklyStat");
const weeklyTag   = $("weeklyTag");
const weeklyLabel = $("weeklyLabel");

const dailyChart = $("dailyChart");
const dailyStat  = $("dailyStat");
const dailyTag   = $("dailyTag");
const dailyLabel = $("dailyLabel");

const overallPie     = $("overallPie");
const overallPercent = $("overallPercent");
const overallDone    = $("overallDone");
const overallMissed  = $("overallMissed");

const topbar = $("topbar");

const onceBox  = $("onceBox");
const onceDate = $("onceDate");

const notifBtn   = $("notifBtn");
const notifBadge = $("notifBadge");
const notifPanel = $("notifPanel");
const notifList  = $("notifList");
const notifDate  = $("notifDate");

const calendarGrid  = $("calendarGrid");
const calendarLabel = $("calendarLabel");
const calFilter     = $("calFilter");

const projectList        = $("projectList");
const addProjectBtn      = $("addProjectBtn");
const projectModal       = $("projectModal");
const projectModalTitle  = $("projectModalTitle");
const closeProjectBtn    = $("closeProjectBtn");
const cancelProjectBtn   = $("cancelProjectBtn");
const deleteProjectBtn   = $("deleteProjectBtn");
const projectForm        = $("projectForm");
const projectName        = $("projectName");
const projectDeadline    = $("projectDeadline");
const projectError       = $("projectError");

const notesList = $("notesList");
const notesDate = $("notesDate");
const noteForm  = $("noteForm");
const noteInput = $("noteInput");

const compareSlots = [
    { el: $("compareSlotA"), select: $("compareSelectA"), chart: $("compareChartA"),
      stat: $("compareStatA"), clear: $("compareClearA"), color: "#7b1cff", pilih: null },
    { el: $("compareSlotB"), select: $("compareSelectB"), chart: $("compareChartB"),
      stat: $("compareStatB"), clear: $("compareClearB"), color: "#ff9f1c", pilih: null }
];

const topList      = $("topList");
const leastList    = $("leastList");
const analysisBody = $("analysisBody");

const namaHari        = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const namaHariSingkat = ["S", "M", "T", "W", "T", "F", "S"];
const namaHariPendek  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const namaBulanPendek = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const hariIni = new Date();
hariIni.setHours(0, 0, 0, 0);

let viewYear  = hariIni.getFullYear();
let viewMonth = hariIni.getMonth();
let dates = [];

function tambahHari(d, jumlah) {
    const hasil = new Date(d);
    hasil.setDate(hasil.getDate() + jumlah);
    return hasil;
}

function seninDari(d) {
    const urutan = (d.getDay() + 6) % 7;   
    return tambahHari(d, -urutan);
}

function mingguKe(d) {
    const tglSatu = new Date(d.getFullYear(), d.getMonth(), 1);
    const geser = (tglSatu.getDay() + 6) % 7;
    return Math.floor((d.getDate() - 1 + geser) / 7);
}

function buatDaftarTanggal() {
    const tanggal = [];
    const jumlahHari = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let tgl = 1; tgl <= jumlahHari; tgl++) {
        tanggal.push(new Date(viewYear, viewMonth, tgl));
    }
    return tanggal;
}

function isHariIni(d) {
    return d.toDateString() === hariIni.toDateString();
}

function sedangLihatBulanIni() {
    return viewYear === hariIni.getFullYear() && viewMonth === hariIni.getMonth();
}

function toKey(d) {
    const tahun = d.getFullYear();
    const bulan = String(d.getMonth() + 1).padStart(2, "0");
    const tgl   = String(d.getDate()).padStart(2, "0");
    return `${tahun}-${bulan}-${tgl}`;
}

function formatTanggal(key) {
    const [y, m, d] = key.split("-").map(Number);
    return `${d} ${namaBulanPendek[m - 1]}`;
}

function dariKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function selisihHari(a, b) {
    return Math.round((b - a) / 86400000);  
}









let habits = [];  
let todos = [];
let projects = [];








function isSchedule(habit) {
    return habit.schedule_type === "once" || habit.schedule_type === "range";
}






function habitTracker() {
    return habits.filter((h) => !h.archived_at);
}







function habitArsip() {
    const awalBulan = toKey(dates[0]);
    const akhirBulan = toKey(dates[dates.length - 1]);
    const diTodo = new Set(todos.map((t) => t.habit_id));

    return habits.filter((h) =>
        h.archived_at &&
        h.archived_at >= awalBulan &&
        h.archived_at <= akhirBulan &&
        !diTodo.has(h.id)
    );
}









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
        case "weekday":
            return d.getDay() >= 1 && d.getDay() <= 5;  
        case "range":
            return key >= habit.start_date && key <= habit.end_date;
        case "once":
            return key === habit.start_date;        
        default:
            return true;  
    }
}




function centangSeminggu(habit, d) {
    const senin = seninDari(d);
    const awalKey = toKey(senin);
    const akhirKey = toKey(tambahHari(senin, 6));
    return habit.checks.filter((key) => key >= awalKey && key <= akhirKey).length;
}







function teksJadwal(item) {
    if (item.schedule_type === "once") {
        return `Once (${formatTanggal(item.start_date)})`;
    }
    if (item.schedule_type === "range") {
        return `${formatTanggal(item.start_date)} – ${formatTanggal(item.end_date)}`;
    }

    const nama = { weekday: "Weekday", per_week: `${item.times_per_week}x / week` }[item.schedule_type] || "Everyday";
    return item.start_date ? `${nama} (from ${formatTanggal(item.start_date)})` : nama;
}

const teksPrioritas = { crucial: "Critical", important: "Important", normal: "Routine" };

function buatTitikPrioritas(priority) {
    const dot = document.createElement("i");
    dot.className = "p-dot " + priority;
    dot.title = teksPrioritas[priority];
    return dot;
}





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
        const sudah = Math.min(centangSeminggu(habit, dariKey(kunciSenin)), x);
        const porsi = hari / 7;         
        target += x * porsi;
        selesai += sudah * porsi;
    });

    return { target, selesai };
}

function hitungPeriode(awal, akhir) {
    const batasAkhir = akhir > hariIni ? hariIni : akhir;
    let target = 0;
    let selesai = 0;

    if (batasAkhir >= awal) {
        habits.forEach((habit) => {
            const hasil = hitungHabit(habit, awal, batasAkhir);
            target += hasil.target;
            selesai += hasil.selesai;
        });
    }

    const persen = target === 0 ? 0 : Math.round((selesai / target) * 100);
    return { target, selesai, persen };
}

function setTag(el, selisih) {
    el.textContent = (selisih >= 0 ? "+" : "") + selisih + "%";
    el.classList.toggle("lime", selisih >= 0);
    el.classList.toggle("red", selisih < 0);
}

function updateStats() {
    updateMonthly();
    updateWeekly();
    updateDaily();
    updateOverall();
    updateTopLeast();
    updateAnalysis();
    renderCompare();
    renderNotif();
    renderCalendar();
}





function updateMonthly() {
    const values = [];

    for (let m = 0; m < 12; m++) {
        const awal = new Date(viewYear, m, 1);
        values.push(awal > hariIni ? null : hitungPeriode(awal, new Date(viewYear, m + 1, 0)).persen);
    }

    const sekarang = hitungPeriode(new Date(viewYear, viewMonth, 1), new Date(viewYear, viewMonth + 1, 0)).persen;
    const sebelumnya = hitungPeriode(new Date(viewYear, viewMonth - 1, 1), new Date(viewYear, viewMonth, 0)).persen;

    monthlyStat.textContent = sekarang + "%";
    setTag(monthlyTag, sekarang - sebelumnya);
    monthlyLabel.textContent = `${namaBulanPendek[viewMonth]} ${viewYear}`;

    drawLineChart(monthlyChart, { labels: namaBulanPendek, values, unit: "%", min: 0, max: 100 }, "#7b1cff");
}





function daftarMinggu() {
    const minggu = [];  
    dates.forEach((d) => {
        const i = mingguKe(d);
        if (!minggu[i]) minggu[i] = { awal: d, akhir: d };
        minggu[i].akhir = d;
    });
    return minggu;
}

function updateWeekly() {
    const minggu = daftarMinggu();
    const labels = minggu.map((_, i) => "W" + (i + 1));
    const values = minggu.map((m) => (m.awal > hariIni ? null : hitungPeriode(m.awal, m.akhir).persen));

    const idx = sedangLihatBulanIni() ? mingguKe(hariIni) : minggu.length - 1;
    const sekarang = values[idx] ?? 0;

    const sebelumnya = idx > 0
        ? values[idx - 1]
        : hitungPeriode(tambahHari(minggu[0].awal, -7), tambahHari(minggu[0].awal, -1)).persen;

    weeklyStat.textContent = sekarang + "%";
    setTag(weeklyTag, sekarang - sebelumnya);
    weeklyLabel.textContent = "Week " + (idx + 1);

    drawLineChart(weeklyChart, { labels, values, unit: "%", min: 0, max: 100 }, "#7b1cff");
}







function hariAcuan() {
    return sedangLihatBulanIni() ? hariIni : dates[dates.length - 1];
}

function updateDaily() {
    const acuan = hariAcuan();
    const senin = seninDari(acuan);
    const labels = [];
    const values = [];

    for (let i = 0; i < 7; i++) {
        const d = tambahHari(senin, i);
        labels.push(namaHariPendek[d.getDay()]);
        values.push(d > acuan || d > hariIni ? null : hitungPeriode(senin, d).persen);
    }

    const tglKemarin = tambahHari(acuan, -1);
    const sekarang = hitungPeriode(senin, acuan).persen;
    const kemarin = hitungPeriode(seninDari(tglKemarin), tglKemarin).persen;

    dailyStat.textContent = sekarang + "%";
    setTag(dailyTag, sekarang - kemarin);
    dailyLabel.textContent = `${formatTanggal(toKey(senin))} – ${formatTanggal(toKey(tambahHari(senin, 6)))}`;

    drawLineChart(dailyChart, { labels, values, unit: "%", min: 0, max: 100 }, "#7b1cff");
}







function updateOverall() {
    let target = 0;
    let selesai = 0;

    habitTracker().forEach((habit) => {
        const hasil = hasilBulanIni(habit);
        target += hasil.sampaiKini;
        selesai += hasil.selesai;
    });

    const persen = target === 0 ? 0 : Math.round((selesai / target) * 100);
    overallPie.style.setProperty("--persen", persen);
    overallPercent.textContent = persen + "%";
    overallDone.textContent = Math.round(selesai);
    overallMissed.textContent = Math.max(Math.round(target - selesai), 0);
}






function hasilBulanIni(habit) {
    const awal = dates[0];
    const akhir = dates[dates.length - 1];
    const goal = hitungHabit(habit, awal, akhir).target;

    const batas = akhir > hariIni ? hariIni : akhir;
    const kini = batas >= awal ? hitungHabit(habit, awal, batas) : { target: 0, selesai: 0 };
    const persen = kini.target === 0 ? 0 : Math.round((kini.selesai / kini.target) * 100);

    return { goal, sampaiKini: kini.target, selesai: kini.selesai, persen };
}

function isiDaftar(listEl, daftarHabit) {
    listEl.innerHTML = "";

    if (daftarHabit.length === 0) {
        const li = document.createElement("li");
        li.className = "rank-empty";
        li.textContent = "No habits yet";
        listEl.appendChild(li);
        return;
    }

    daftarHabit.forEach((habit, i) => {
        const li = document.createElement("li");

        const nomor = document.createElement("span");
        nomor.className = "rank-no";
        nomor.textContent = (i + 1) + ".";

        const nama = document.createElement("span");
        nama.className = "rank-text";
        nama.textContent = habit.name;

        li.append(nomor, nama);
        listEl.appendChild(li);
    });
}

function updateTopLeast() {
    const urut = habitTracker()
        .filter((h) => !isSchedule(h))
        .sort((a, b) => hasilBulanIni(b).persen - hasilBulanIni(a).persen);
    isiDaftar(topList, urut.slice(0, 3));
    isiDaftar(leastList, urut.slice(-3).reverse());
}





function updateAnalysis() {
    analysisBody.innerHTML = "";
    const daftar = habitTracker();

    if (daftar.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "analysis-empty";
        td.textContent = "No habits yet";
        tr.appendChild(td);
        analysisBody.appendChild(tr);
        return;
    }

    daftar.forEach((habit) => {
        const hasil = hasilBulanIni(habit);
        const goal = Math.round(hasil.goal);
        const done = Math.round(hasil.selesai);
        const left = Math.max(Math.round(hasil.sampaiKini) - done, 0);

        const tr = document.createElement("tr");
        const isiKolom = [habit.name, goal, done, left, hasil.persen + "%"];

        tr.draggable = true;
        pasangDrag(tr, { type: "analysis", id: habit.id });
        pasangUrut(
            tr,
            () => sedangDrag && sedangDrag.type === "analysis" && sedangDrag.id !== habit.id,
            (diAtas) => pindahUrutan(sedangDrag.id, habit.id, diAtas)
        );

        isiKolom.forEach((isi, i) => {
            const td = document.createElement("td");
            td.textContent = isi;
            if (i === 0) td.className = "analysis-name";
            if (i === 4) td.className = "analysis-percent";
            tr.appendChild(td);
        });

        analysisBody.appendChild(tr);
    });
}






function persenHabit(habit, awal, akhir) {
    const batas = akhir > hariIni ? hariIni : akhir;
    if (batas < awal) return null;
    const hasil = hitungHabit(habit, awal, batas);
    return hasil.target === 0 ? null : Math.round((hasil.selesai / hasil.target) * 100);
}






function isiPilihanCompare() {
    const diTodo = new Set(todos.map((t) => t.habit_id));

    compareSlots.forEach((slot) => {
        slot.select.innerHTML = "";
        slot.select.appendChild(new Option("Choose a habit…", ""));

        habits.filter((h) => !diTodo.has(h.id)).forEach((h) => {
            const label = h.archived_at ? `${h.name} (archived)` : h.name;
            slot.select.appendChild(new Option(label, "h:" + h.id));
        });

        todos.forEach((t) => {
            slot.select.appendChild(new Option(`${t.name} (to-do)`, "t:" + t.id));
        });
    });
}






function isiSlot(pilih) {
    if (!pilih) return null;

    const [jenis, idTeks] = pilih.split(":");
    const id = Number(idTeks);

    if (jenis === "h") {
        const diTodo = new Set(todos.map((t) => t.habit_id));
        const habit = habits.find((h) => h.id === id && !diTodo.has(h.id));
        return habit ? { nama: habit.name, habit } : null;
    }

    const todo = todos.find((t) => t.id === id);
    if (!todo) return null;
    const habitLama = habits.find((h) => h.id === todo.habit_id) || null;
    return { nama: todo.name, habit: habitLama };
}

function renderCompare() {
    const minggu = daftarMinggu();
    const labels = minggu.map((_, i) => "W" + (i + 1));

    compareSlots.forEach((slot) => {
        const isi = isiSlot(slot.pilih);
        if (!isi) slot.pilih = null;

        slot.select.value = slot.pilih || "";
        slot.el.classList.toggle("empty", !isi);
        slot.el.classList.toggle("nodata", !!isi && !isi.habit);

        if (!isi || !isi.habit) {
            slot.chart.innerHTML = "";
            slot.chart.chartData = null;
            slot.stat.textContent = "–";
            return;
        }

        const values = minggu.map((m) => persenHabit(isi.habit, m.awal, m.akhir));
        const bulanIni = persenHabit(isi.habit, dates[0], dates[dates.length - 1]);
        slot.stat.textContent = bulanIni === null ? "–" : bulanIni + "%";
        slot.stat.style.color = slot.color;

        drawLineChart(slot.chart, { labels, values, unit: "%", min: 0, max: 100 }, slot.color);
    });
}

compareSlots.forEach((slot) => {
    slot.select.addEventListener("change", () => {
        slot.pilih = slot.select.value || null;
        renderCompare();
    });

    slot.clear.addEventListener("click", () => {
        slot.pilih = null;
        renderCompare();
    });
});




function buildHeader() {
    buatHeader(trackerHead);
    buatHeader(scheduleHead);
}

function buatHeader(thead) {
    thead.innerHTML = "";

    const weekRow = document.createElement("tr");
    const dateRow = document.createElement("tr");
    const dayRow  = document.createElement("tr");

    const habitTh = document.createElement("th");
    habitTh.textContent = "Habit";
    habitTh.rowSpan = 3;
    habitTh.className = "habit-col";
    weekRow.appendChild(habitTh);

    daftarMinggu().forEach((m, w) => {
        const th = document.createElement("th");
        th.textContent = "Week " + (w + 1);
        th.colSpan = m.akhir.getDate() - m.awal.getDate() + 1;
        th.className = "week week-start";
        if (sedangLihatBulanIni() && w === mingguKe(hariIni)) th.classList.add("current-week");
        weekRow.appendChild(th);
    });

    dates.forEach((d) => {
        const dateTh = document.createElement("th");
        dateTh.textContent = d.getDate();

        const dayTh = document.createElement("th");
        dayTh.textContent = namaHariSingkat[d.getDay()];
        dayTh.title = namaHari[d.getDay()];

        aturKelasSel(dateTh, d);
        aturKelasSel(dayTh, d);

        dateRow.appendChild(dateTh);
        dayRow.appendChild(dayTh);
    });

    thead.append(weekRow, dateRow, dayRow);
}

function aturKelasSel(sel, d) {
    if (isHariIni(d)) sel.classList.add("today");
    if (d.getDay() === 1 || d.getDate() === 1) sel.classList.add("week-start");
    if (d.getDay() === 0 || d.getDay() === 6) sel.classList.add("weekend");
}

function renderHabits() {
    const aktif = habitTracker();
    isiTabel(trackerBody, aktif.filter((h) => !isSchedule(h)), "No habits yet — click + to add one");
    isiTabel(scheduleBody, aktif.filter(isSchedule), "Nothing scheduled — add one with Once or Date range");
    renderArchive();
    isiPilihanCompare();
    updateStats();
}

function geserKeHariIni() {
    document.querySelectorAll(".tracker-wrap").forEach((wrap) => {
        const kolomHariIni = wrap.querySelector("thead th.today");
        if (!kolomHariIni || wrap.scrollWidth <= wrap.clientWidth) return;
        const kolomNama = wrap.querySelector("thead .habit-col");
        wrap.scrollLeft = kolomHariIni.offsetLeft - kolomNama.offsetWidth - 60;
    });
}

function isiTabel(tbody, daftar, teksKosong) {
    tbody.innerHTML = "";

    if (daftar.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = dates.length + 1;
        td.className = "tracker-empty";
        td.textContent = teksKosong;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    daftar.forEach((habit) => tbody.appendChild(createHabitRow(habit)));
}

function createHabitRow(habit) {
    const tr = document.createElement("tr");
    if (habit.stopped_at) tr.classList.add("stopped");
    pasangUrutBaris(tr, habit);

    const nameTd = document.createElement("td");
    nameTd.className = "habit-col";
    nameTd.draggable = true;
    pasangDrag(nameTd, { type: "habit", id: habit.id });

    const wrap = document.createElement("div");
    wrap.className = "habit-name";

    const text = document.createElement("span");
    text.className = "name-text";
    text.textContent = habit.name;
    text.title = `${habit.name} • ${teksJadwal(habit)} • ${teksPrioritas[habit.priority]}`
        + (habit.stopped_at ? ` • stopped on ${formatTanggal(habit.stopped_at)}` : "");
    text.addEventListener("click", () => openItemModal("habit", habit));

    const archiveBtn = document.createElement("button");
    archiveBtn.className = "delete-btn";
    archiveBtn.textContent = "✕";
    archiveBtn.title = "Archive";
    archiveBtn.addEventListener("click", () => archiveHabit(habit.id));

    const stopBtn = document.createElement("button");
    stopBtn.className = "stop-btn";
    stopBtn.title = habit.stopped_at ? "Resume this habit" : "Stop from tomorrow";
    stopBtn.innerHTML = habit.stopped_at ? IKON_PLAY : IKON_STOP;
    stopBtn.addEventListener("click", () => stopHabit(habit));

    wrap.append(buatTitikPrioritas(habit.priority), text, stopBtn, archiveBtn);
    nameTd.appendChild(wrap);
    tr.appendChild(nameTd);

    dates.forEach((d) => {
        const td = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        const key = toKey(d);
        checkbox.checked = habit.checks.includes(key);
        checkbox.disabled = d > hariIni || !isTerjadwal(habit, d);

        const penuh = habit.schedule_type === "per_week" && !checkbox.checked
            && centangSeminggu(habit, d) >= habit.times_per_week;
        if (penuh && !checkbox.disabled) {
            checkbox.disabled = true;
            checkbox.classList.add("penuh");
            checkbox.title = "Weekly goal reached";
        }

        checkbox.addEventListener("change", () => toggleCheck(habit, key, checkbox));

        aturKelasSel(td, d);
        td.appendChild(checkbox);
        tr.appendChild(td);
    });

    return tr;
}





const IKON_STOP = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`;
const IKON_PLAY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none"/></svg>`;







function buatItemList(item, tombol) {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "item-info";

    const nama = document.createElement("span");
    nama.className = "item-name";
    nama.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "item-meta";
    meta.textContent = `${teksJadwal(item)} • ${teksPrioritas[item.priority]}`;

    info.append(nama, meta);
    li.append(buatTitikPrioritas(item.priority), info);

    tombol.forEach(([teks, aksi]) => {
        const btn = document.createElement("button");
        btn.className = "item-btn";
        btn.textContent = teks;
        btn.addEventListener("click", aksi);
        li.appendChild(btn);
    });

    return li;
}

function tampilkanKosong(listEl, teks) {
    const li = document.createElement("li");
    li.className = "item-empty";
    li.textContent = teks;
    listEl.appendChild(li);
}

function renderTodos() {
    isiPilihanCompare();
    renderCompare();
    todoList.innerHTML = "";
    if (todos.length === 0) return tampilkanKosong(todoList, "No to-dos yet");

    todos.forEach((todo) => {
        const li = buatItemList(todo, [["Edit", () => openItemModal("todo", todo)]]);
        li.draggable = true;
        pasangDrag(li, { type: "todo", id: todo.id });
        todoList.appendChild(li);
    });
}

function renderArchive() {
    archiveList.innerHTML = "";
    const daftar = habitArsip();
    if (daftar.length === 0) return tampilkanKosong(archiveList, "Archive is empty");

    daftar.forEach((habit) => {
        const li = buatItemList(habit, [
            ["Restore", () => restoreHabit(habit.id)],
            ["Delete", () => deleteHabit(habit.id)]
        ]);
        li.draggable = true;
        pasangDrag(li, { type: "arsip", id: habit.id });  
        archiveList.appendChild(li);
    });
}






let sedangDrag = null;   

function pasangDrag(el, info) {
    el.addEventListener("dragstart", (e) => {
        sedangDrag = info;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", info.type);  
        el.classList.add("dragging");
    });

    el.addEventListener("dragend", () => {
        sedangDrag = null;
        el.classList.remove("dragging");
        document.querySelectorAll(".drop-active").forEach((z) => z.classList.remove("drop-active"));
        document.querySelectorAll(".drop-before, .drop-after").forEach((r) => r.classList.remove("drop-before", "drop-after"));
    });
}




function pasangUrut(el, bolehDrop, saatDrop) {
    el.addEventListener("dragover", (e) => {
        if (!bolehDrop()) return;
        e.preventDefault();

        const kotak = el.getBoundingClientRect();
        const diAtas = e.clientY < kotak.top + kotak.height / 2;
        el.classList.toggle("drop-before", diAtas);
        el.classList.toggle("drop-after", !diAtas);
    });

    el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove("drop-before", "drop-after");
    });

    el.addEventListener("drop", (e) => {
        if (!bolehDrop()) return;
        e.preventDefault();
        const diAtas = el.classList.contains("drop-before");
        el.classList.remove("drop-before", "drop-after");
        saatDrop(diAtas);
    });
}




function pasangUrutBaris(tr, habit) {
    pasangUrut(
        tr,
        () => {
            if (!sedangDrag || sedangDrag.type !== "habit" || sedangDrag.id === habit.id) return false;
            const diDrag = habits.find((h) => h.id === sedangDrag.id);
            return isSchedule(diDrag) === isSchedule(habit);
        },
        (diAtas) => pindahUrutan(sedangDrag.id, habit.id, diAtas)
    );
}




function pasangDropZone(zone, terimaJenis, saatDrop) {
    const jenis = [].concat(terimaJenis);   
    const cocok = () => sedangDrag && jenis.includes(sedangDrag.type);

    zone.addEventListener("dragover", (e) => {
        if (!cocok()) return;
        e.preventDefault();   
        zone.classList.add("drop-active");
    });

    zone.addEventListener("dragleave", (e) => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop-active");
    });

    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drop-active");
        if (cocok()) saatDrop(sedangDrag.id, sedangDrag.type);  
    });
}

[habitCard, scheduleCard].forEach((card) => {
    pasangDropZone(card, ["todo", "arsip"], (id, jenis) => {
        if (jenis === "todo") convertTodo(id);
        else restoreHabit(id);
    });
});

pasangDropZone(todoCard, "habit", habitKeTodo);      
pasangDropZone(archiveCard, "habit", archiveHabit);  

compareSlots.forEach((slot) => {
    pasangDropZone(slot.el, ["habit", "arsip", "todo"], (id, jenis) => {
        slot.pilih = (jenis === "todo" ? "t:" : "h:") + id;
        renderCompare();
    });
});




let modeModal = { type: "habit", id: null };  

function pilihRadio(nama, nilai) {
    document.querySelector(`input[name="${nama}"][value="${nilai}"]`).checked = true;
}

function nilaiRadio(nama) {
    return document.querySelector(`input[name="${nama}"]:checked`).value;
}



function aturTampilanJadwal() {
    const custom = nilaiRadio("schedule") === "custom";
    const sekali = nilaiRadio("schedule") === "once";
    const mode = nilaiRadio("customMode");
    const pakaiRentang = custom && mode === "range";

    onceBox.classList.toggle("show", sekali);

    customBox.classList.toggle("show", custom);
    perWeekField.classList.toggle("show", custom && mode === "per_week");
    rangeField.classList.toggle("show", pakaiRentang);

    startBox.style.display = pakaiRentang || sekali ? "none" : "";
    startFrom.classList.toggle("show", nilaiRadio("startMode") === "pick");
}

document.querySelectorAll('input[name="schedule"], input[name="customMode"], input[name="startMode"]').forEach((radio) => {
    radio.addEventListener("change", aturTampilanJadwal);
});



function openItemModal(type, item = null, jadwalAwal = "everyday") {
    modeModal = { type, id: item ? item.id : null };

    const jenis = type === "habit" ? "Habit" : "To-do";
    itemModalTitle.textContent = item ? `Edit ${jenis}` : `New ${jenis}`;



    itemName.value = item ? item.name : "";
    const jadwal = item ? item.schedule_type : jadwalAwal;
    pilihRadio("schedule", jadwal === "per_week" || jadwal === "range" ? "custom" : jadwal);
    pilihRadio("customMode", jadwal === "range" ? "range" : "per_week");
    timesPerWeek.value = item && item.times_per_week ? item.times_per_week : 3;
    startDate.value = item && item.start_date ? item.start_date : toKey(hariIni);
    endDate.value = item && item.end_date ? item.end_date : toKey(tambahHari(hariIni, 7));



    pilihRadio("startMode", item ? "pick" : "now");
    startFrom.value = item && item.start_date && jadwal !== "range" && jadwal !== "once" ? item.start_date : "";
    onceDate.value = item && jadwal === "once" ? item.start_date : toKey(hariIni);
    pilihRadio("priority", item ? item.priority : "normal");



    itemDangerBtn.style.display = item ? "" : "none";
    itemDangerBtn.textContent = type === "habit" ? "Archive" : "Delete";

    itemError.textContent = "";
    aturTampilanJadwal();
    itemModal.classList.add("show");
    itemName.focus();
}

function closeItemModal() {
    itemModal.classList.remove("show");
}

function bacaForm() {
    let schedule = nilaiRadio("schedule");
    if (schedule === "custom") schedule = nilaiRadio("customMode");

    let mulai;
    if (schedule === "once") mulai = onceDate.value;
    else if (schedule === "range") mulai = startDate.value;
    else if (nilaiRadio("startMode") === "now") mulai = toKey(hariIni);
    else mulai = startFrom.value || null;   

    return {
        name: itemName.value.trim(),
        schedule_type: schedule,
        times_per_week: schedule === "per_week" ? Number(timesPerWeek.value) : null,
        start_date: mulai,
        end_date: schedule === "range" ? endDate.value : schedule === "once" ? onceDate.value : null,
        priority: nilaiRadio("priority")
    };
}

itemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = bacaForm();

    if (data.name === "") return (itemError.textContent = "Name is required");
    if (data.schedule_type === "once" && !data.start_date) return (itemError.textContent = "Please choose a date");
    if (data.schedule_type === "range" && (!data.start_date || !data.end_date || data.start_date > data.end_date)) {
        return (itemError.textContent = "Start date must be before the end date");
    }

    const { type, id } = modeModal;
    const url = `/api/${type === "habit" ? "habits" : "todos"}${id ? "/" + id : ""}`;

    try {
        const res = await fetch(url, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const hasil = await res.json();
        if (!res.ok) return (itemError.textContent = hasil.error || "Failed to save");

        const daftar = type === "habit" ? habits : todos;
        const posisi = daftar.findIndex((x) => x.id === hasil.id);
        if (posisi >= 0) daftar[posisi] = hasil;  
        else daftar.push(hasil);               

        type === "habit" ? renderHabits() : renderTodos();
        closeItemModal();
    } catch (err) {
        itemError.textContent = "Could not connect to the server";
    }
});

itemDangerBtn.addEventListener("click", async () => {
    const { type, id } = modeModal;
    closeItemModal();
    if (type === "habit") archiveHabit(id);
    else deleteTodo(id);
});

addHabitBtn.addEventListener("click", () => openItemModal("habit"));
addScheduleBtn.addEventListener("click", () => openItemModal("habit", null, "once"));
addTodoBtn.addEventListener("click", () => openItemModal("todo"));
closeItemBtn.addEventListener("click", closeItemModal);
cancelItemBtn.addEventListener("click", closeItemModal);
itemModal.addEventListener("click", (e) => {
    if (e.target === itemModal) closeItemModal();
});

for (let m = 0; m < 12; m++) {
    const option = document.createElement("option");
    option.value = m;
    option.textContent = new Date(2000, m, 1).toLocaleDateString("en-US", { month: "long" });
    monthSelect.appendChild(option);
}

for (let y = hariIni.getFullYear(); y >= hariIni.getFullYear() - 5; y--) {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
}

function openMonthModal() {
    monthSelect.value = viewMonth;
    yearSelect.value = viewYear;
    monthModal.classList.add("show");
}

function closeMonthModal() {
    monthModal.classList.remove("show");
}

monthBtn.addEventListener("click", openMonthModal);
closeMonthBtn.addEventListener("click", closeMonthModal);
monthModal.addEventListener("click", (e) => {
    if (e.target === monthModal) closeMonthModal();
});

monthForm.addEventListener("submit", (e) => {
    e.preventDefault();
    gantiBulan(Number(yearSelect.value), Number(monthSelect.value));
    closeMonthModal();
});

thisMonthBtn.addEventListener("click", () => {
    gantiBulan(hariIni.getFullYear(), hariIni.getMonth());
    closeMonthModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeItemModal();
        closeMonthModal();
        closeProjectModal();
        notifPanel.classList.remove("show");
    }
});

function gantiBulan(tahun, bulan) {
    viewYear = tahun;
    viewMonth = bulan;
    dates = buatDaftarTanggal();

    monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });

    aturTombolBulan();
    tanggalDipilih = hariAcuan();   
    buildHeader();
    renderHabits();
    geserKeHariIni();
    loadNotes();
}

function aturTombolBulan() {
    const sebelum = new Date(viewYear, viewMonth - 1, 1);
    const sesudah = new Date(viewYear, viewMonth + 1, 1);
    const format = (d) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    $("prevMonthLabel").textContent = format(sebelum);
    $("nextMonthLabel").textContent = format(sesudah);
}

function geserBulan(langkah) {
    const d = new Date(viewYear, viewMonth + langkah, 1);
    gantiBulan(d.getFullYear(), d.getMonth());
}

$("prevMonthBtn").addEventListener("click", () => geserBulan(-1));
$("nextMonthBtn").addEventListener("click", () => geserBulan(1));

async function kirim(url, method = "POST", body = null) {
    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    return res.json();
}

function gantiHabit(baru) {
    const posisi = habits.findIndex((h) => h.id === baru.id);
    if (posisi >= 0) habits[posisi] = baru;
    else habits.push(baru);
}

async function loadData() {
    try {
        [habits, todos, projects] = await Promise.all([
            fetch("/api/habits").then((r) => r.json()),
            fetch("/api/todos").then((r) => r.json()),
            fetch("/api/projects").then((r) => r.json())
        ]);
        renderHabits();
        renderTodos();
        renderProjects();
        geserKeHariIni();
    } catch (err) {
        alert("Failed to load data. Is Flask running?");
    }
}

async function toggleCheck(habit, key, checkbox) {
    try {
        gantiHabit(await kirim(`/api/habits/${habit.id}/toggle`, "POST", { date: key }));
        renderHabits();  
    } catch (err) {
        checkbox.checked = !checkbox.checked;
        alert("Failed to save the check");
    }
}

async function archiveHabit(id) {
    const habit = habits.find((h) => h.id === id);
    if (!confirm(`Archive "${habit.name}"? Its history will be kept.`)) return;

    try {
        gantiHabit(await kirim(`/api/habits/${id}/archive`));
        renderHabits();
    } catch (err) {
        alert("Failed to archive the habit");
    }
}

async function stopHabit(habit) {
    const pesan = habit.stopped_at
        ? `Resume "${habit.name}"?`
        : `Stop "${habit.name}" from tomorrow? Days after today won't be counted.`;
    if (!confirm(pesan)) return;

    try {
        gantiHabit(await kirim(`/api/habits/${habit.id}/stop`));
        renderHabits();
    } catch (err) {
        alert("Failed to update the habit");
    }
}

async function restoreHabit(id) {
    try {
        gantiHabit(await kirim(`/api/habits/${id}/restore`));
        renderHabits();
    } catch (err) {
        alert("Failed to restore the habit");
    }
}

async function convertTodo(id) {
    try {
        gantiHabit(await kirim(`/api/todos/${id}/convert`));
        todos = todos.filter((t) => t.id !== id);
        renderHabits();
        renderTodos();
    } catch (err) {
        alert("Failed to turn it into a habit");
    }
}

async function habitKeTodo(id) {
    try {
        const hasil = await kirim(`/api/habits/${id}/to-todo`);
        gantiHabit(hasil.habit);
        todos.push(hasil.todo);
        renderHabits();
        renderTodos();
    } catch (err) {
        alert("Failed to move it to To-do");
    }
}

async function pindahUrutan(dragId, targetId, diAtas) {
    const urutan = habitTracker().map((h) => h.id).filter((id) => id !== dragId);
    let posisi = urutan.indexOf(targetId);
    if (!diAtas) posisi++;
    urutan.splice(posisi, 0, dragId);  

    urutan.forEach((id, i) => {
        habits.find((h) => h.id === id).sort_order = i + 1;
    });
    habits.sort((a, b) => a.sort_order - b.sort_order);
    renderHabits();

    try {
        await kirim("/api/habits/order", "PUT", { ids: urutan });
    } catch (err) {
        alert("Failed to save the order");
    }
}

async function deleteHabit(id) {
    const habit = habits.find((h) => h.id === id);
    if (!confirm(`Delete "${habit.name}" permanently? All of its history will be removed.`)) return;

    try {
        await kirim(`/api/habits/${id}`, "DELETE");
        habits = habits.filter((h) => h.id !== id);
        compareSlots.forEach((slot) => {
            if (slot.pilih === "h:" + id) slot.pilih = null;
        });
        renderHabits();
    } catch (err) {
        alert("Failed to delete the habit");
    }
}

async function deleteTodo(id) {
    if (!confirm("Delete this to-do?")) return;

    try {
        await kirim(`/api/todos/${id}`, "DELETE");
        todos = todos.filter((t) => t.id !== id);
        renderTodos();
    } catch (err) {
        alert("Failed to delete the to-do");
    }
}

const urutanPrioritas = { crucial: 0, important: 1, normal: 2 };

function habitBelumHariIni() {
    const key = toKey(hariIni);

    return habits
        .filter((h) => !h.archived_at && isTerjadwal(h, hariIni) && !h.checks.includes(key))
        .filter((h) => !(h.schedule_type === "per_week" && centangSeminggu(h, hariIni) >= h.times_per_week))
        .sort((a, b) => urutanPrioritas[a.priority] - urutanPrioritas[b.priority]);
}

function renderNotif() {
    const daftar = habitBelumHariIni();

    notifBadge.textContent = daftar.length > 9 ? "9+" : daftar.length;
    notifBadge.classList.toggle("show", daftar.length > 0);
    notifDate.textContent = hariIni.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });

    notifList.innerHTML = "";
    if (daftar.length === 0) {
        const li = document.createElement("li");
        li.className = "notif-done";
        li.textContent = "All done for today";
        notifList.appendChild(li);
        return;
    }

    daftar.forEach((habit) => {
        const li = document.createElement("li");
        const nama = document.createElement("span");
        nama.textContent = habit.name;
        const status = document.createElement("span");
        status.textContent = teksPrioritas[habit.priority];
        li.append(buatTitikPrioritas(habit.priority), nama, status);
        notifList.appendChild(li);
    });
}

notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();                 
    notifPanel.classList.toggle("show");
});

notifPanel.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => notifPanel.classList.remove("show"));

let tanggalDipilih = hariIni;
let filterKalender = "all";   

function adaDiKalender(habit, d) {
    if (!isTerjadwal(habit, d)) return false;
    if (habit.schedule_type !== "per_week") return true;
    return habit.checks.includes(toKey(d)) || centangSeminggu(habit, d) < habit.times_per_week;
}

function infoHari(d) {
    const key = toKey(d);
    const f = filterKalender;
    const alasan = [];
    let merah = false;
    let oren = false;
    let target = 0;
    let selesai = 0;

    habits.forEach((habit) => {
        if (!adaDiKalender(habit, d)) return;
        const sudah = habit.checks.includes(key);

        const tandai = !habit.archived_at && (habit.schedule_type !== "per_week" || sudah);

        if (tandai && habit.priority === "crucial" && (f === "all" || f === "crucial")) {
            merah = true;
            alasan.push(`Critical: ${habit.name}${sudah ? " ✓" : ""}`);
        }
        if (tandai && habit.priority === "important" && !sudah && (f === "all" || f === "important")) {
            oren = true;
            alasan.push(`Important: ${habit.name}`);
        }

        if (f === "all" || (f === "routine" && habit.priority === "normal")) {
            target++;
            if (sudah) selesai++;
        }
    });

    projects.filter((p) => !p.done).forEach((p) => {
        const sisa = selisihHari(d, dariKey(p.deadline));  
        if (sisa === 0 && (f === "all" || f === "crucial")) {
            merah = true;
            alasan.push(`Deadline: ${p.name}`);
        } else if (sisa > 0 && sisa <= 3 && (f === "all" || f === "important")) {
            oren = true;
            alasan.push(`Due in ${sisa} day${sisa > 1 ? "s" : ""}: ${p.name}`);
        }
    });

    let kelas = "";
    if (merah) kelas = "c-red";
    else if (oren) kelas = "c-orange";
    else if (target > 0 && d <= hariIni) {
        const persen = Math.round((selesai / target) * 100);
        if (persen > 0) kelas = "g-" + (persen >= 100 ? 4 : Math.ceil(persen / 33.4));
        alasan.push(`${selesai}/${target} done (${persen}%)`);
    }

    return { kelas, alasan };
}

function renderCalendar() {
    calendarLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });

    const adaCatatan = new Set(notes.map((n) => n.note_date));
    calendarGrid.innerHTML = "";

    ["M", "T", "W", "T", "F", "S", "S"].forEach((h) => {
        const el = document.createElement("span");
        el.className = "cal-head";
        el.textContent = h;
        calendarGrid.appendChild(el);
    });

    const geser = (dates[0].getDay() + 6) % 7;
    for (let i = 0; i < geser; i++) {
        const kosong = document.createElement("span");
        kosong.className = "cal-day empty";
        calendarGrid.appendChild(kosong);
    }

    dates.forEach((d) => {
        const btn = document.createElement("button");
        btn.className = "cal-day";
        btn.textContent = d.getDate();

        const key = toKey(d);
        const info = infoHari(d);
        if (info.kelas) btn.classList.add(info.kelas);
        btn.title = [formatTanggal(key), ...info.alasan].join("\n");

        if (isHariIni(d)) btn.classList.add("today");
        if (key === toKey(tanggalDipilih)) btn.classList.add("selected");
        if (adaCatatan.has(key)) btn.classList.add("has-note");

        btn.addEventListener("click", () => {
            tanggalDipilih = d;
            renderCalendar();
            renderNotes();
        });

        calendarGrid.appendChild(btn);
    });
}

calFilter.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
        filterKalender = btn.dataset.filter;
        calFilter.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        renderCalendar();
    });
});

let modeProject = null; 

function statusProject(p) {
    if (p.done) return { teks: "Done", kelas: "done" };

    const sisa = selisihHari(hariIni, dariKey(p.deadline));
    if (sisa < 0) return { teks: `${-sisa}d overdue`, kelas: "red" };
    if (sisa === 0) return { teks: "Due today", kelas: "red" };
    if (sisa <= 3) return { teks: `${sisa}d left`, kelas: "orange" };
    return { teks: `${sisa}d left`, kelas: "" };
}

function renderProjects() {
    projectList.innerHTML = "";
    if (projects.length === 0) return tampilkanKosong(projectList, "No projects yet");

    projects.forEach((p) => {
        const li = document.createElement("li");
        li.classList.toggle("is-done", p.done);

        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "project-check";
        check.checked = p.done;
        check.addEventListener("change", () => toggleProject(p, check));

        const info = document.createElement("div");
        info.className = "item-info";

        const nama = document.createElement("span");
        nama.className = "item-name project-name";
        nama.textContent = p.name;
        nama.title = "Click to edit";
        nama.addEventListener("click", () => openProjectModal(p));

        const meta = document.createElement("span");
        meta.className = "item-meta";
        meta.textContent = "Due " + formatTanggal(p.deadline);

        const status = statusProject(p);
        const badge = document.createElement("span");
        badge.className = "due-badge " + status.kelas;
        badge.textContent = status.teks;

        const hapus = document.createElement("button");
        hapus.className = "item-btn delete-item";
        hapus.textContent = "✕";
        hapus.title = "Delete project";
        hapus.addEventListener("click", () => deleteProject(p.id));

        info.append(nama, meta);
        li.append(check, info, badge, hapus);

        li.draggable = true;
        pasangDrag(li, { type: "project", id: p.id });
        pasangUrut(
            li,
            () => sedangDrag && sedangDrag.type === "project" && sedangDrag.id !== p.id,
            (diAtas) => pindahUrutanProject(sedangDrag.id, p.id, diAtas)
        );

        projectList.appendChild(li);
    });
}

function openProjectModal(p = null) {
    modeProject = p ? p.id : null;
    projectModalTitle.textContent = p ? "Edit Project" : "New Project";
    projectName.value = p ? p.name : "";
    projectDeadline.value = p ? p.deadline : toKey(tambahHari(hariIni, 7));
    deleteProjectBtn.style.display = p ? "" : "none";
    projectError.textContent = "";
    projectModal.classList.add("show");
    projectName.focus();
}

function closeProjectModal() {
    projectModal.classList.remove("show");
}

projectForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = { name: projectName.value.trim(), deadline: projectDeadline.value };
    if (data.name === "") return (projectError.textContent = "Name is required");
    if (!data.deadline) return (projectError.textContent = "Please choose a deadline");

    try {
        const url = "/api/projects" + (modeProject ? "/" + modeProject : "");
        const hasil = await kirim(url, modeProject ? "PUT" : "POST", data);

        const posisi = projects.findIndex((p) => p.id === hasil.id);
        if (posisi >= 0) projects[posisi] = hasil;
        else projects.push(hasil);

        renderProjects();
        renderCalendar();
        closeProjectModal();
    } catch (err) {
        projectError.textContent = err.message;
    }
});

async function toggleProject(p, check) {
    try {
        const hasil = await kirim(`/api/projects/${p.id}/toggle`);
        projects[projects.findIndex((x) => x.id === p.id)] = hasil;
        renderProjects();
        renderCalendar();
    } catch (err) {
        check.checked = !check.checked;
        alert("Failed to update the project");
    }
}

deleteProjectBtn.addEventListener("click", () => deleteProject(modeProject));

async function deleteProject(id) {
    const project = projects.find((p) => p.id === id);
    if (!confirm(`Delete "${project.name}"?`)) return;

    try {
        await kirim(`/api/projects/${id}`, "DELETE");
        projects = projects.filter((p) => p.id !== id);
        closeProjectModal();
        renderProjects();
        renderCalendar();
    } catch (err) {
        alert("Failed to delete the project");
    }
}

async function pindahUrutanProject(dragId, targetId, diAtas) {
    const urutan = projects.map((p) => p.id).filter((id) => id !== dragId);
    let posisi = urutan.indexOf(targetId);
    if (!diAtas) posisi++;
    urutan.splice(posisi, 0, dragId);

    projects.sort((a, b) => urutan.indexOf(a.id) - urutan.indexOf(b.id));
    renderProjects();

    try {
        await kirim("/api/projects/order", "PUT", { ids: urutan });
    } catch (err) {
        alert("Failed to save the order");
    }
}

addProjectBtn.addEventListener("click", () => openProjectModal());
closeProjectBtn.addEventListener("click", closeProjectModal);
cancelProjectBtn.addEventListener("click", closeProjectModal);
projectModal.addEventListener("click", (e) => {
    if (e.target === projectModal) closeProjectModal();
});

let notes = [];   

async function loadNotes() {
    const awal = toKey(dates[0]);
    const akhir = toKey(dates[dates.length - 1]);

    try {
        const res = await fetch(`/api/notes?start=${awal}&end=${akhir}`);
        notes = await res.json();
    } catch (err) {
        notes = [];
    }

    renderCalendar();
    renderNotes();
}

function renderNotes() {
    notesDate.textContent = tanggalDipilih.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short"
    });

    const key = toKey(tanggalDipilih);
    const hariItu = notes.filter((n) => n.note_date === key);
    notesList.innerHTML = "";

    if (hariItu.length === 0) {
        const kosong = document.createElement("p");
        kosong.className = "note-empty";
        kosong.textContent = "No notes for this day yet";
        notesList.appendChild(kosong);
        return;
    }

    hariItu.forEach((note) => {
        const bubble = document.createElement("div");
        bubble.className = "note-bubble";
        bubble.textContent = note.content;  

        const jam = document.createElement("span");
        jam.className = "note-time";
        jam.textContent = new Date(note.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

        const hapus = document.createElement("button");
        hapus.className = "note-delete";
        hapus.textContent = "✕";
        hapus.title = "Delete note";
        hapus.addEventListener("click", () => deleteNote(note.id));

        bubble.append(jam, hapus);
        notesList.appendChild(bubble);
    });

    notesList.scrollTop = notesList.scrollHeight;  
}

async function kirimNote() {
    const isi = noteInput.value.trim();
    if (isi === "") return;

    try {
        notes.push(await kirim("/api/notes", "POST", { date: toKey(tanggalDipilih), content: isi }));
        noteInput.value = "";
        aturTinggiInput();
        renderNotes();
        renderCalendar();
    } catch (err) {
        alert("Failed to save the note");
    }
}

async function deleteNote(id) {
    if (!confirm("Delete this note?")) return;

    try {
        await kirim(`/api/notes/${id}`, "DELETE");
        notes = notes.filter((n) => n.id !== id);
        renderNotes();
        renderCalendar();
    } catch (err) {
        alert("Failed to delete the note");
    }
}

function aturTinggiInput() {
    noteInput.style.height = "auto";
    noteInput.style.height = noteInput.scrollHeight + "px";
}

noteInput.addEventListener("input", aturTinggiInput);

noteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        kirimNote();
    }
});

noteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    kirimNote();
});

document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".card.selected").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
    });
});

const navLinks = document.querySelectorAll(".nav .pill");
let menuDikunci = false;   

navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
        e.preventDefault();   
        $(link.dataset.target).scrollIntoView({ behavior: "smooth", block: "start" });
        navLinks.forEach((l) => l.classList.toggle("active", l === link));
        menuDikunci = true;
    });
});

["wheel", "touchmove", "keydown"].forEach((jenis) => {
    window.addEventListener(jenis, () => (menuDikunci = false), { passive: true });
});

function aturMenuAktif() {
    if (menuDikunci) return;
    let aktif = navLinks[0];
    navLinks.forEach((link) => {
        if ($(link.dataset.target).getBoundingClientRect().top <= 120) aktif = link;
    });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        aktif = navLinks[navLinks.length - 1];
    }
    navLinks.forEach((link) => link.classList.toggle("active", link === aktif));
}

function aturTopbar() {
    topbar.classList.toggle("scrolled", window.scrollY > 8);
    aturMenuAktif();
}

window.addEventListener("scroll", aturTopbar, { passive: true });
aturTopbar();

gantiBulan(viewYear, viewMonth);
loadData();