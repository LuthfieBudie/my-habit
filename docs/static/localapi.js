// =====================================================
// LOCALAPI.JS — "server" My Habit yang berjalan DI DALAM perangkat
// semua fetch("/api/...") dari script.js & checkin.js dijawab dari sini,
// datanya disimpan di penyimpanan browser (localStorage) perangkat itu sendiri.
// tidak butuh internet, laptop, ngrok, atau login.
// aturannya sama persis dengan app.py di versi pribadi.
// =====================================================
(function () {
    const KUNCI = "myhabit_local_v1";
    const JADWAL_VALID = ["everyday", "weekday", "once", "per_week", "range"];
    const PRIORITAS_VALID = ["crucial", "important", "normal"];

    // ---------- penyimpanan ----------
    function dbKosong() {
        return { seq: { habit: 0, todo: 0, note: 0, project: 0 }, habits: [], todos: [], notes: [], projects: [] };
    }

    function bacaDB() {
        try {
            const db = JSON.parse(localStorage.getItem(KUNCI));
            if (db && Array.isArray(db.habits)) return db;
        } catch (err) { /* data rusak → mulai kosong */ }
        return dbKosong();
    }

    function simpanDB(db) {
        localStorage.setItem(KUNCI, JSON.stringify(db));
        // kabari sync.js bahwa data berubah (supaya dikirim ke akun Google kalau sudah login)
        window.dispatchEvent(new Event("myhabit:changed"));
    }

    const idBaru = (db, jenis) => ++db.seq[jenis];

    // ---------- tanggal & jam (jam perangkat) ----------
    const dua = (n) => String(n).padStart(2, "0");
    const keKey = (d) => `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
    const hariIni = () => keKey(new Date());

    function sekarang() {
        const d = new Date();
        return `${keKey(d)}T${dua(d.getHours())}:${dua(d.getMinutes())}:${dua(d.getSeconds())}`;
    }

    function tanggalValid(teks) {
        if (typeof teks !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(teks)) return false;
        const [y, m, d] = teks.split("-").map(Number);
        const t = new Date(y, m - 1, d);
        return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
    }

    // error dengan kode HTTP, supaya script.js menerima jawaban yang sama seperti dari Flask
    class Gagal extends Error {
        constructor(status, pesan) {
            super(pesan);
            this.status = status;
        }
    }

    // ---------- periksa data habit / to-do (sama dengan baca_item di app.py) ----------
    function bacaItem(body) {
        const name = String(body.name ?? "").trim();
        if (!name) throw new Gagal(400, "Name is required");
        if (name.length > 100) throw new Gagal(400, "Name can be at most 100 characters");

        const schedule = body.schedule_type || "everyday";
        if (!JADWAL_VALID.includes(schedule)) throw new Gagal(400, "Invalid schedule");

        const priority = body.priority || "normal";
        if (!PRIORITAS_VALID.includes(priority)) throw new Gagal(400, "Invalid priority");

        let times = null;
        let start = null;
        let end = null;

        if (schedule === "per_week") {
            times = parseInt(body.times_per_week, 10);
            if (Number.isNaN(times)) throw new Gagal(400, "Times per week must be a number");
            if (times < 1 || times > 7) throw new Gagal(400, "Times per week must be between 1 and 7");
        }

        if (schedule === "once") {
            if (!tanggalValid(body.start_date)) throw new Gagal(400, "Please choose a date");
            start = end = body.start_date;
        } else if (schedule === "range") {
            if (!tanggalValid(body.start_date) || !tanggalValid(body.end_date)) {
                throw new Gagal(400, "Start and end dates are required");
            }
            if (body.start_date > body.end_date) throw new Gagal(400, "Start date must be before the end date");
            start = body.start_date;
            end = body.end_date;
        } else if (body.start_date) {
            if (!tanggalValid(body.start_date)) throw new Gagal(400, "Invalid start date");
            start = body.start_date;
        }

        return { name, schedule_type: schedule, times_per_week: times, start_date: start, end_date: end, priority };
    }

    // ---------- bentuk data yang dikirim ke halaman (sama dengan Flask) ----------
    function tampilHabit(h) {
        const checks = Object.keys(h.checks).sort();
        const check_times = {};
        checks.forEach((k) => { if (h.checks[k]) check_times[k] = h.checks[k].slice(11, 16); });
        return {
            id: h.id, name: h.name, schedule_type: h.schedule_type, times_per_week: h.times_per_week,
            start_date: h.start_date, end_date: h.end_date, priority: h.priority,
            archived_at: h.archived_at, sort_order: h.sort_order, stopped_at: h.stopped_at,
            checks, check_times
        };
    }

    function tampilTodo(t) {
        return {
            id: t.id, name: t.name, schedule_type: t.schedule_type, times_per_week: t.times_per_week,
            start_date: t.start_date, end_date: t.end_date, priority: t.priority, habit_id: t.habit_id
        };
    }

    const tampilProject = (p) => ({ id: p.id, name: p.name, deadline: p.deadline, done: !!p.done, sort_order: p.sort_order });
    const tampilNote = (n) => ({ id: n.id, note_date: n.note_date, content: n.content, created_at: n.created_at });

    function cari(daftar, id, pesan) {
        const item = daftar.find((x) => x.id === Number(id));
        if (!item) throw new Gagal(404, pesan);
        return item;
    }

    const urutanBerikutnya = (daftar) => daftar.reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1;
    const urutkan = (daftar) => [...daftar].sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));

    function habitBaru(db, data, clientId = null) {
        const habit = {
            id: idBaru(db, "habit"), ...data,
            archived_at: null, stopped_at: null, sort_order: urutanBerikutnya(db.habits),
            client_id: clientId, checks: {}, unchecks: {}
        };
        db.habits.push(habit);
        return habit;
    }

    // centang tegas + "perubahan terbaru menang" (sama dengan set_centang di app.py)
    function setCentang(habit, tanggal, selesai, waktu) {
        const ada = tanggal in habit.checks;
        const batal = habit.unchecks[tanggal];
        if (selesai) {
            if (ada || (batal && batal > waktu)) return;
            habit.checks[tanggal] = waktu;
            delete habit.unchecks[tanggal];
        } else {
            if (!ada || (habit.checks[tanggal] && habit.checks[tanggal] > waktu)) return;
            delete habit.checks[tanggal];
            habit.unchecks[tanggal] = waktu;
        }
    }

    function bacaWaktu(teks) {
        const kini = sekarang();
        if (typeof teks !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(teks)) return kini;
        const waktu = teks.slice(0, 19).padEnd(19, ":00").slice(0, 19);
        return waktu > kini ? kini : waktu;      // tidak boleh dari masa depan
    }

    // =====================================================
    // SCHEDULE OTOMATIS KE ARSIP
    //  - Once       : sudah dicentang → masuk arsip mulai HARI BERIKUTNYA setelah tanggalnya
    //  - Date range : masuk arsip mulai hari berikutnya setelah tanggal terakhir
    // (archived_at = hari berikutnya, jadi di hari jadwalnya habit itu tetap tampil)
    // =====================================================
    function besoknya(tanggal) {
        const [y, m, d] = tanggal.split("-").map(Number);
        return keKey(new Date(y, m - 1, d + 1));
    }

    function arsipkanScheduleSelesai(db) {
        const kini = hariIni();
        let berubah = false;
        db.habits.forEach((h) => {
            if (h.archived_at || h.tetap_aktif) return;      // tetap_aktif = sudah di-Restore manual
            let selesaiPada = null;
            if (h.schedule_type === "once" && Object.keys(h.checks).length > 0) {
                selesaiPada = [h.start_date, ...Object.keys(h.checks)].filter(Boolean).sort().pop();
            } else if (h.schedule_type === "range" && h.end_date) {
                selesaiPada = h.end_date;
            }
            if (selesaiPada && kini > selesaiPada) {
                h.archived_at = besoknya(selesaiPada);
                berubah = true;
            }
        });
        return berubah;
    }

    // =====================================================
    // ROUTER: method + alamat → jawaban [status, data]
    // =====================================================
    function tangani(method, jalur, query, body) {
        const db = bacaDB();
        if (arsipkanScheduleSelesai(db)) simpanDB(db);
        let m;
        const selesai = (status, data) => {
            simpanDB(db);
            return [status, data];
        };

        // ---------- HABIT ----------
        if (jalur === "/habits" && method === "GET") {
            return [200, urutkan(db.habits).map(tampilHabit)];
        }
        if (jalur === "/habits" && method === "POST") {
            const data = bacaItem(body);
            const clientId = String(body.client_id || "").slice(0, 50) || null;
            if (clientId) {
                const sudah = db.habits.find((h) => h.client_id === clientId);
                if (sudah) return [200, tampilHabit(sudah)];
            }
            return selesai(201, tampilHabit(habitBaru(db, data, clientId)));
        }
        if (jalur === "/habits/order" && method === "PUT") {
            if (!Array.isArray(body.ids) || !body.ids.every(Number.isInteger)) throw new Gagal(400, "Invalid order format");
            body.ids.forEach((id, i) => {
                const h = db.habits.find((x) => x.id === id);
                if (h) h.sort_order = i + 1;
            });
            return selesai(200, { ok: true });
        }
        if ((m = jalur.match(/^\/habits\/(\d+)$/))) {
            if (method === "PUT") {
                const data = bacaItem(body);
                const h = cari(db.habits, m[1], "Habit not found");
                Object.assign(h, data, { tetap_aktif: false });   // jadwal diubah → aturan arsip otomatis berlaku lagi
                return selesai(200, tampilHabit(h));
            }
            if (method === "DELETE") {
                const h = cari(db.habits, m[1], "Habit not found");
                if (!h.archived_at) throw new Gagal(400, "Archive the habit first before deleting it");
                db.todos.forEach((t) => { if (t.habit_id === h.id) t.habit_id = null; });
                db.habits = db.habits.filter((x) => x.id !== h.id);
                return selesai(200, { ok: true });
            }
        }
        if ((m = jalur.match(/^\/habits\/(\d+)\/(archive|restore|stop|to-todo|toggle)$/)) && method === "POST") {
            const h = cari(db.habits, m[1], "Habit not found");
            const aksi = m[2];

            if (aksi === "archive") h.archived_at = hariIni();
            if (aksi === "restore") {
                h.archived_at = null;
                h.tetap_aktif = true;            // jangan diarsipkan otomatis lagi
            }
            if (aksi === "stop") h.stopped_at = h.stopped_at ? null : hariIni();
            if (aksi === "to-todo") {
                const todo = {
                    id: idBaru(db, "todo"), name: h.name, schedule_type: h.schedule_type,
                    times_per_week: h.times_per_week, start_date: h.start_date, end_date: h.end_date,
                    priority: h.priority, habit_id: h.id
                };
                db.todos.push(todo);
                h.archived_at = hariIni();
                return selesai(201, { todo: tampilTodo(todo), habit: tampilHabit(h) });
            }
            if (aksi === "toggle") {
                const tanggal = body.date;
                if (!tanggalValid(tanggal)) throw new Gagal(400, "Date must be in YYYY-MM-DD format");
                if (tanggal > hariIni()) throw new Gagal(400, "You can't check a future date");
                if (h.stopped_at && tanggal > h.stopped_at) throw new Gagal(400, "This habit has been stopped");
                setCentang(h, tanggal, !(tanggal in h.checks), sekarang());
            }
            return selesai(200, tampilHabit(h));
        }
        if ((m = jalur.match(/^\/habits\/(\d+)\/checks\/([\d-]+)$/)) && method === "PUT") {
            const tanggal = m[2];
            if (!tanggalValid(tanggal)) throw new Gagal(400, "Date must be in YYYY-MM-DD format");
            if (tanggal > hariIni()) throw new Gagal(400, "You can't check a future date");
            const h = cari(db.habits, m[1], "Habit not found");
            const done = !!body.done;
            if (done && h.stopped_at && tanggal > h.stopped_at) throw new Gagal(400, "This habit has been stopped");
            setCentang(h, tanggal, done, bacaWaktu(body.at));
            return selesai(200, tampilHabit(h));
        }

        // ---------- TO-DO ----------
        if (jalur === "/todos" && method === "GET") {
            return [200, [...db.todos].sort((a, b) => a.id - b.id).map(tampilTodo)];
        }
        if (jalur === "/todos" && method === "POST") {
            const todo = { id: idBaru(db, "todo"), ...bacaItem(body), habit_id: null };
            db.todos.push(todo);
            return selesai(201, tampilTodo(todo));
        }
        if ((m = jalur.match(/^\/todos\/(\d+)$/))) {
            if (method === "PUT") {
                const data = bacaItem(body);
                const t = cari(db.todos, m[1], "To-do not found");
                Object.assign(t, data);
                return selesai(200, tampilTodo(t));
            }
            if (method === "DELETE") {
                db.todos = db.todos.filter((t) => t.id !== Number(m[1]));
                return selesai(200, { ok: true });
            }
        }
        if ((m = jalur.match(/^\/todos\/(\d+)\/convert$/)) && method === "POST") {
            const t = cari(db.todos, m[1], "To-do not found");
            const fields = {
                name: t.name, schedule_type: t.schedule_type, times_per_week: t.times_per_week,
                start_date: t.start_date, end_date: t.end_date, priority: t.priority
            };
            let habit = t.habit_id ? db.habits.find((h) => h.id === t.habit_id) : null;
            if (habit) Object.assign(habit, fields, { archived_at: null });   // aktifkan lagi habit lamanya
            else habit = habitBaru(db, fields);
            db.todos = db.todos.filter((x) => x.id !== t.id);
            return selesai(201, tampilHabit(habit));
        }

        // ---------- NOTES ----------
        if (jalur === "/notes" && method === "GET") {
            const start = query.get("start");
            const end = query.get("end");
            if (!tanggalValid(start) || !tanggalValid(end)) throw new Gagal(400, "start and end must be YYYY-MM-DD");
            const hasil = db.notes
                .filter((n) => n.note_date >= start && n.note_date <= end)
                .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
            return [200, hasil.map(tampilNote)];
        }
        if (jalur === "/notes" && method === "POST") {
            const content = String(body.content ?? "").trim();
            if (!content) throw new Gagal(400, "Note can't be empty");
            if (content.length > 2000) throw new Gagal(400, "Note can be at most 2000 characters");
            if (!tanggalValid(body.date)) throw new Gagal(400, "Invalid date");
            const note = { id: idBaru(db, "note"), note_date: body.date, content, created_at: sekarang() };
            db.notes.push(note);
            return selesai(201, tampilNote(note));
        }
        if ((m = jalur.match(/^\/notes\/(\d+)$/)) && method === "DELETE") {
            db.notes = db.notes.filter((n) => n.id !== Number(m[1]));
            return selesai(200, { ok: true });
        }

        // ---------- PROJECTS ----------
        const bacaProject = () => {
            const name = String(body.name ?? "").trim();
            if (!name) throw new Gagal(400, "Name is required");
            if (name.length > 100) throw new Gagal(400, "Name can be at most 100 characters");
            if (!tanggalValid(body.deadline)) throw new Gagal(400, "Please choose a deadline");
            return { name, deadline: body.deadline };
        };

        if (jalur === "/projects" && method === "GET") {
            return [200, urutkan(db.projects).map(tampilProject)];
        }
        if (jalur === "/projects" && method === "POST") {
            const p = { id: idBaru(db, "project"), ...bacaProject(), done: false, sort_order: urutanBerikutnya(db.projects) };
            db.projects.push(p);
            return selesai(201, tampilProject(p));
        }
        if (jalur === "/projects/order" && method === "PUT") {
            if (!Array.isArray(body.ids) || !body.ids.every(Number.isInteger)) throw new Gagal(400, "Invalid order format");
            body.ids.forEach((id, i) => {
                const p = db.projects.find((x) => x.id === id);
                if (p) p.sort_order = i + 1;
            });
            return selesai(200, { ok: true });
        }
        if ((m = jalur.match(/^\/projects\/(\d+)$/))) {
            if (method === "PUT") {
                const data = bacaProject();
                const p = cari(db.projects, m[1], "Project not found");
                Object.assign(p, data);
                return selesai(200, tampilProject(p));
            }
            if (method === "DELETE") {
                db.projects = db.projects.filter((p) => p.id !== Number(m[1]));
                return selesai(200, { ok: true });
            }
        }
        if ((m = jalur.match(/^\/projects\/(\d+)\/toggle$/)) && method === "POST") {
            const p = cari(db.projects, m[1], "Project not found");
            p.done = !p.done;
            return selesai(200, tampilProject(p));
        }

        throw new Gagal(404, "Not found");
    }

    // =====================================================
    // SAMBUNGKAN KE fetch: alamat yang mengandung /api/ dijawab di sini, sisanya normal
    // =====================================================
    const fetchAsli = window.fetch.bind(window);

    function jawabJSON(status, data) {
        return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    }

    window.fetch = async (input, opsi = {}) => {
        const alamat = new URL(typeof input === "string" ? input : input.url, location.href);
        const cocok = alamat.pathname.match(/\/api(\/.*)$/);
        if (alamat.origin !== location.origin || !cocok) return fetchAsli(input, opsi);

        const method = String(opsi.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
        let body = {};
        if (opsi.body) {
            try { body = JSON.parse(opsi.body) || {}; } catch (err) { body = {}; }
        }

        try {
            const [status, data] = tangani(method, cocok[1].replace(/\/+$/, ""), alamat.searchParams, body);
            return jawabJSON(status, data);
        } catch (err) {
            if (err instanceof Gagal) return jawabJSON(err.status, { error: err.message });
            console.error(err);
            return jawabJSON(500, { error: "Something went wrong" });
        }
    };

    // =====================================================
    // BACKUP: dipakai tombol Export / Import di dashboard (backup.js)
    // =====================================================
    window.MyHabitData = {
        ekspor() {
            return { app: "my-habit", version: 1, exported_at: sekarang(), data: bacaDB() };
        },
        impor(isi) {
            const data = isi && isi.app === "my-habit" ? isi.data : null;
            if (!data || !Array.isArray(data.habits) || !Array.isArray(data.todos) ||
                !Array.isArray(data.notes) || !Array.isArray(data.projects) || !data.seq) {
                throw new Error("This file isn't a My Habit backup.");
            }
            simpanDB(data);
            // salinan & antrean halaman Check-in dibuang supaya tidak tercampur data lama
            localStorage.removeItem("mh_habits");
            localStorage.removeItem("mh_queue");
        }
    };
})();
