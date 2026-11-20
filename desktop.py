"""
MY HABIT — VERSI PC (lokal, untuk dibagikan)
  - membuka halaman di folder docs/ dalam jendela aplikasi
  - data tersimpan di PC masing-masing pengguna (tidak butuh internet / server / login)

Coba tanpa build:  python desktop.py
Build jadi .exe:   build_exe.bat
"""
import os
import sys
import socket

# folder docs/ (di .exe: folder sementara hasil ekstrak PyInstaller)
FOLDER_ASET = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
HALAMAN = os.path.join(FOLDER_ASET, "docs", "index.html")

# data jendela (termasuk data habit di localStorage) disimpan di:
#   C:\Users\<nama>\AppData\Local\My Habit
FOLDER_DATA = os.path.join(os.getenv("LOCALAPPDATA") or os.path.expanduser("~"), "My Habit")
os.makedirs(FOLDER_DATA, exist_ok=True)

# PORT HARUS TETAP: data browser terikat ke alamat (http://127.0.0.1:PORT).
# kalau port berubah, aplikasi akan terlihat kosong karena dianggap "web lain".
PORT = 48231


def pesan(teks):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, teks, "My Habit", 0x30)
    except Exception:
        print(teks)


def port_terpakai():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def jalankan():
    import webview

    if port_terpakai():
        pesan("My Habit is already open.")
        return

    webview.settings["ALLOW_DOWNLOADS"] = True     # supaya tombol "Export backup" bisa menyimpan file

    webview.create_window("My Habit", HALAMAN, width=1400, height=900, min_size=(380, 600))
    webview.start(
        http_server=True,            # sajikan folder docs/ lewat http://127.0.0.1:PORT
        http_port=PORT,
        private_mode=False,          # data TIDAK dihapus saat aplikasi ditutup
        storage_path=os.path.join(FOLDER_DATA, "webview"),
    )


if __name__ == "__main__":
    try:
        jalankan()
    except Exception: 
        # .exe tidak punya jendela terminal, jadi error ditulis ke file + ditampilkan di kotak pesan
        import traceback
        detail = traceback.format_exc()
        file_log = os.path.join(FOLDER_DATA, "error.log")
        with open(file_log, "w", encoding="utf-8") as f:
            f.write(detail)
        pesan("My Habit could not start.\n\n" + detail[-900:] + "\n\nSaved to: " + file_log)