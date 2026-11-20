# =====================================================
# ANDROID_ICONS.PY — ganti ikon & splash bawaan Capacitor dengan ikon My Habit
# dijalankan di GitHub Actions setelah "npx cap add android"
# =====================================================
import glob
import os
from PIL import Image

RES = "android/app/src/main/res"
SUMBER = Image.open("docs/static/icons/maskable-512.png").convert("RGBA")   # latar ungu penuh
LOGO = Image.open("docs/static/icons/icon-512.png").convert("RGBA")         # kotak ungu sudut bulat
UNGU = SUMBER.getpixel((0, 0))
LATAR_SPLASH = (240, 241, 243, 255)  # #f0f1f3, sama dengan warna aplikasi

KEPADATAN = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for nama, skala in KEPADATAN.items():
    folder = os.path.join(RES, f"mipmap-{nama}")
    os.makedirs(folder, exist_ok=True)

    # ikon lama (Android < 8): 48dp
    ukuran = round(48 * skala)
    ikon = SUMBER.resize((ukuran, ukuran), Image.LANCZOS)
    ikon.save(os.path.join(folder, "ic_launcher.png"))
    ikon.save(os.path.join(folder, "ic_launcher_round.png"))

    # adaptive icon (Android 8+): 108dp, isi dikecilkan ke tengah supaya tidak terpotong
    kanvas = round(108 * skala)
    isi = round(kanvas * 0.72)
    depan = Image.new("RGBA", (kanvas, kanvas), UNGU)
    depan.paste(SUMBER.resize((isi, isi), Image.LANCZOS), ((kanvas - isi) // 2,) * 2)
    depan.save(os.path.join(folder, "ic_launcher_foreground.png"))

# warna latar adaptive icon
warna = "#{:02x}{:02x}{:02x}".format(*UNGU[:3])
values = os.path.join(RES, "values")
os.makedirs(values, exist_ok=True)
with open(os.path.join(values, "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    '
            f'<color name="ic_launcher_background">{warna}</color>\n</resources>\n')

# splash: latar abu terang + logo di tengah, ukuran sama dengan file bawaan
for file in glob.glob(os.path.join(RES, "drawable*", "splash.png")):
    w, h = Image.open(file).size
    sisi = round(min(w, h) * 0.28)
    splash = Image.new("RGBA", (w, h), LATAR_SPLASH)
    splash.paste(LOGO.resize((sisi, sisi), Image.LANCZOS), ((w - sisi) // 2, (h - sisi) // 2), LOGO.resize((sisi, sisi), Image.LANCZOS))
    splash.convert("RGB").save(file)

print("Ikon & splash My Habit terpasang")
