"""
MY HABIT — VERSI PC (lokal, untuk dibagikan)
  - membuka halaman di folder docs/ dalam jendela aplikasi
  - data tersimpan di PC masing-masing pengguna (tidak butuh internet / server / login)

Coba tanpa build:  python desktop.py
Build jadi .exe:   build_exe.bat
"""
import os
import sys
import json
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


# =====================================================
# LOGIN GOOGLE (untuk sync.js)
# Google melarang login di dalam jendela aplikasi (WebView), jadi:
#   1) buka browser PC ke halaman login Google
#   2) Google mengembalikan "code" ke server kecil sementara di http://127.0.0.1:<port acak>
#   3) code ditukar dengan id_token, lalu id_token diberikan ke sync.js
# Client ID & secret "Desktop app" dibaca dari oauth_desktop.json
# (dibuat GitHub Actions dari Secrets, tidak disimpan di repo)
# =====================================================
def baca_oauth():
    try:
        with open(os.path.join(FOLDER_ASET, "oauth_desktop.json"), encoding="utf-8") as f:
            data = json.load(f)
        if data.get("client_id") and data.get("client_secret"):
            return data
    except (OSError, ValueError):
        pass
    return None


def login_google():
    import base64
    import hashlib
    import secrets
    import threading
    import webbrowser
    import urllib.parse
    import urllib.error
    import urllib.request
    from http.server import BaseHTTPRequestHandler, HTTPServer

    oauth = baca_oauth()
    if not oauth:
        return {"error": "Google sign-in is not set up in this build."}

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    hasil = {}
    selesai = threading.Event()

    class Penerima(BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if query.get("state", [""])[0] != state:
                self.send_response(404)
                self.end_headers()
                return
            if "code" in query:
                hasil["code"] = query["code"][0]
                judul, isi = "You're signed in", "You can close this tab and go back to My Habit."
            else:
                hasil["error"] = query.get("error", ["Sign-in cancelled."])[0]
                judul, isi = "Sign-in cancelled", "You can close this tab and go back to My Habit."
            halaman = (f"<!doctype html><meta charset='utf-8'><title>My Habit</title>"
                       f"<body style='font-family:system-ui;display:grid;place-items:center;height:90vh;text-align:center'>"
                       f"<div><h2>{judul}</h2><p>{isi}</p></div>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(halaman)
            selesai.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Penerima)
    redirect = f"http://127.0.0.1:{server.server_port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": oauth["client_id"],
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": "openid email profile",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "prompt": "select_account",
    })
    webbrowser.open(url)

    try:
        if not selesai.wait(timeout=300):
            return {"error": "Sign-in timed out. Please try again."}
    finally:
        server.shutdown()
        server.server_close()

    if "code" not in hasil:
        return {"error": hasil.get("error", "Sign-in cancelled.")}

    data = urllib.parse.urlencode({
        "code": hasil["code"],
        "client_id": oauth["client_id"],
        "client_secret": oauth["client_secret"],
        "redirect_uri": redirect,
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }).encode()
    try:
        with urllib.request.urlopen("https://oauth2.googleapis.com/token", data=data, timeout=30) as res:
            token = json.load(res)
    except urllib.error.HTTPError as err:
        try:
            detail = json.load(err).get("error_description") or err.reason
        except ValueError:
            detail = err.reason
        return {"error": f"Could not finish sign-in: {detail}"}
    except Exception as err:
        return {"error": f"Could not finish sign-in: {err}"}

    if "id_token" not in token:
        return {"error": token.get("error_description") or "Google did not return an ID token."}
    return {"id_token": token["id_token"]}


class ApiJendela:
    """Fungsi Python yang bisa dipanggil dari JavaScript: window.pywebview.api.<nama>()"""

    def google_login(self):
        try:
            return login_google()
        except Exception as err:
            return {"error": str(err)}


def jalankan():
    import webview

    if port_terpakai():
        pesan("My Habit is already open.")
        return

    webview.settings["ALLOW_DOWNLOADS"] = True     # supaya tombol "Export backup" bisa menyimpan file

    webview.create_window("My Habit", HALAMAN, width=1400, height=900, min_size=(380, 600), js_api=ApiJendela())
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
