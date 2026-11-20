// =====================================================
// BUILD-WWW.JS — salin isi folder docs ke folder www
// folder www inilah yang dimasukkan Capacitor ke dalam APK
// (docs tetap dipakai untuk GitHub Pages & exe)
// =====================================================
const fs = require("fs");
const path = require("path");

const asal = path.join(__dirname, "docs");
const tujuan = path.join(__dirname, "www");

fs.rmSync(tujuan, { recursive: true, force: true });
fs.cpSync(asal, tujuan, { recursive: true });
console.log("docs -> www selesai");
