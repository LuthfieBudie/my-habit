const Offline = (() => {
    const KUNCI_DATA = "mh_habits";     
    const KUNCI_ANTRE = "mh_queue";      

    function baca(kunci, bawaan) {
        try {
            const isi = localStorage.getItem(kunci);
            return isi ? JSON.parse(isi) : bawaan;
        } catch (err) {
            return bawaan;
        }
    }

    function tulis(kunci, nilai) {
        try {
            localStorage.setItem(kunci, JSON.stringify(nilai));
        } catch (err) {
            console.warn("Storage full / blocked:", err);
        }
    }

    class OfflineError extends Error {}

    async function kirim(url, opsi = {}) {
        const batas = new AbortController();
        const timer = setTimeout(() => batas.abort(), 8000);   

        let res;
        try {
            res = await fetch(url, {
                ...opsi,
                signal: batas.signal,
                headers: { "Content-Type": "application/json", ...(opsi.headers || {}) }
            });
        } catch (err) {
            throw new OfflineError("Your laptop can't be reached");
        } finally {
            clearTimeout(timer);
        }

        const jenis = res.headers.get("content-type") || "";
        if (!jenis.includes("application/json")) throw new OfflineError("Your laptop can't be reached");

        const data = await res.json();
        if (!res.ok) {
            const err = new Error(data.error || "Request failed");
            err.status = res.status;
            throw err;
        }
        return data;
    }

    function antrean() {
        return baca(KUNCI_ANTRE, []);
    }

    function simpanAntrean(daftar) {
        tulis(KUNCI_ANTRE, daftar);
    }

    function idUnik() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function antreCentang(habitId, tanggal, selesai, waktu) {
        const daftar = antrean().filter((op) => !(op.type === "check" && op.habitId === habitId && op.date === tanggal));
        daftar.push({ uid: idUnik(), type: "check", habitId, date: tanggal, done: selesai, at: waktu });
        simpanAntrean(daftar);
    }

    function antreHabitBaru(idSementara, data) {
        const daftar = antrean();
        daftar.push({ uid: idUnik(), type: "create", tempId: idSementara, data });
        simpanAntrean(daftar);
    }

    function menunggu(habitId) {
        return antrean().some((op) => op.habitId === habitId || op.tempId === habitId);
    }

    let sedangSync = false;

    async function sinkron(saatBerhasil, saatDitolak) {
        if (sedangSync) return { ok: false, sibuk: true };
        sedangSync = true;

        try {
            while (antrean().length > 0) {
                const op = antrean()[0];
                try {
                    if (op.type === "create") {
                        const habit = await kirim("/api/habits", {
                            method: "POST",
                            body: JSON.stringify({ ...op.data, client_id: op.tempId })
                        });

                        simpanAntrean(
                            antrean()
                                .filter((o) => o.uid !== op.uid)
                                .map((o) => (o.habitId === op.tempId ? { ...o, habitId: habit.id } : o))
                        );
                        saatBerhasil(habit, op.tempId);
                        continue;
                    }

                    const habit = await kirim(`/api/habits/${op.habitId}/checks/${op.date}`, {
                        method: "PUT",
                        body: JSON.stringify({ done: op.done, at: op.at })
                    });
                    simpanAntrean(antrean().filter((o) => o.uid !== op.uid));
                    saatBerhasil(habit, op.habitId);
                } catch (err) {
                    
                    if (err instanceof OfflineError || err.status === 401) return { ok: false };

                    let daftar = antrean().filter((o) => o.uid !== op.uid);
                    if (op.type === "create") daftar = daftar.filter((o) => o.habitId !== op.tempId);
                    simpanAntrean(daftar);
                    saatDitolak(op, err.message);
                }
            }
            return { ok: true };
        } finally {
            sedangSync = false;
        }
    }

    return {
        OfflineError,
        kirim,
        antrean,
        antreCentang,
        antreHabitBaru,
        menunggu,
        sinkron,
        bacaData: () => baca(KUNCI_DATA, null),
        simpanData: (habits) => tulis(KUNCI_DATA, habits)
    };
})();
