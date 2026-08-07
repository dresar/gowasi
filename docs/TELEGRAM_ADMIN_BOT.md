# 🤖 Telegram Master Admin Bot & VPS Deployment Guide (gowasi)

Panduan lengkap konfigurasi Telegram Admin Bot, Fitur Manajemen Sub-Menu, dan Skrip Deployment Otomatis di Linux VPS (Ubuntu/Debian) untuk **gowasi**.

---

## 🌟 Fitur Utama Telegram Master Admin Bot

1. **Master Admin Security**: Dibatasi secara ketat berdasarkan ID Telegram Admin (`7896674035`). User tidak dikenal yang mengirim perintah akan mendapatkan respon `⚠️ Akses Ditolak`.
2. **Zero-Spam In-Place Editing (`editMessageText`)**: Setiap kali menekan tombol inline keyboard, tampilan pesan menu utama/sub-menu akan **langsung ter-edit di tempat** secara *real-time* tanpa menumpuk chat baru.
3. **Contextual Sub-Menus**: Tampilan tombol inline keyboard akan berganti secara kontekstual sesuai kategori yang dipilih (Groq API Keys, Auto-Reply Rules, Pesan Terjadwal, Muted Kontak, Custom Prompts VIP).
4. **Perintah 1-Tap Copyable**: Seluruh perintah petunjuk bantuan (misal `<code>/addkey </code>`, `<code>/delrule </code>`) dapat disalin langsung ke clipboard ponsel/PC hanya dengan **1 kali klik/tap pada teks biru**.
5. **Uji Keaktifan API Key Dinamis (`/testkey [id]`)**: Pengujian status keaktifan Groq API Key berdasarkan ID berurutan 1, 2, 3, dst. lengkap dengan notifikasi status ringkas.
6. **Auto-Reply Rules CRUD**: Pengelolaan aturan balasan otomatis dengan ID berurutan 1, 2, 3... dan tombol aksi cepat per-rule (`[ 🟢 Rule #1 ] [ 🗑️ Hapus 1 ]`).
7. **Pesan Terjadwal WhatsApp Engine**: Pengiriman pesan terjadwal ke nomor WhatsApp tujuan secara otomatis pada waktu yang tepat beserta konfirmasi notifikasi ke Telegram.

---

## 🔑 Konfigurasi Environment Variable (`src/.env`)

Pastikan file `src/.env` di server lokal atau VPS Anda mengemas kunci-kunci berikut (File `.env` diabaikan oleh `.gitignore` sehingga 100% rahasia):

```env
# Telegram Master Admin Bot & AI Config
TELEGRAM_BOT_TOKEN="7969028715:AAENtmQ3tpwlY0QrJpdRlRLIEaB2_UMmFzo"
TELEGRAM_ADMIN_CHAT_ID="7896674035"
BOT_ADMIN_NUMBERS="6282392115909"
GROQ_API_KEY="gsk_BjFoKjMhveo3O6XjsNWGdyb3FYhVDj1HghYnNpgV4MGUjEOGRP"
```

---

## 📱 Ringkasan Perintah Telegram Admin Bot

| Perintah | Deskripsi | Salin Cepat (1-Tap Copy) |
| :--- | :--- | :--- |
| `/start` / `/menu` | Menampilkan Menu Utama gowasi | `<code>/start</code>` |
| `/status` | Cek Status AI Engine, Model, Kuota Key, & Kontak Muted | `<code>/status</code>` |
| `/listkeys` | Menampilkan daftar Groq API Key & tombol uji dinamis | `<code>/listkeys</code>` |
| `/testkey [id]` | Menguji keaktifan Groq API Key #1, #2, dst. | `<code>/testkey 1</code>` |
| `/addkey [key]` | Menambah Groq API Key baru | `<code>/addkey </code>` |
| `/delkey [id]` | Menghapus Groq API Key berdasarkan ID/Indeks | `<code>/delkey </code>` |
| `/listrules` | Menampilkan daftar Auto-Reply Rules | `<code>/listrules</code>` |
| `/addrule [data]`| Menambah Auto-Reply Rule (`Nama\|contains\|harga\|Respon`) | `<code>/addrule </code>` |
| `/delrule [id]` | Menghapus Auto-Reply Rule berdasarkan ID berurutan | `<code>/delrule </code>` |
| `/listschedules` | Menampilkan daftar Pesan Terjadwal WA | `<code>/listschedules</code>` |
| `/addschedule` | Menambah Pesan Terjadwal (`nomor\|durasi\|pesan`) | `<code>/addschedule </code>` |
| `/delschedule` | Menghapus Pesan Terjadwal | `<code>/delschedule </code>` |
| `/listmuted` | Menampilkan daftar kontak WA di-mute | `<code>/listmuted</code>` |
| `/mute [hp] [dur]`| Mute kontak WA (`/mute 6281234567890 24h`) | `<code>/mute </code>` |
| `/unmute [hp]` | Unmute kontak WA | `<code>/unmute </code>` |
| `/listprompts` | Menampilkan daftar Custom Prompt VIP | `<code>/listprompts</code>` |
| `/setprompt` | Mengatur Custom Prompt VIP per-nomor WA | `<code>/setprompt </code>` |
| `/delprompt` | Menghapus Custom Prompt VIP | `<code>/delprompt </code>` |

---

## 🐧 Panduan VPS Deployment 1-Click (`run.sh`)

Sistem menyediakan skrip **`run.sh`** untuk otomatisasi deploy & update di Linux VPS (Ubuntu 20.04/22.04/24.04 & Debian 11/12):

### Cara Menjalankan di VPS Linux Ubuntu / Debian:

```bash
git clone https://github.com/dresar/gowasi.git
cd gowasi
chmod +x run.sh
./run.sh
```

### Cara Kerja Otomatisasi Skrip `run.sh`:
1. **GitHub Auto-Pull**: Menarik komit & update terbaru dari repositori GitHub secara otomatis (`git pull origin main`).
2. **Auto Installer**: Memasang Go & dependensi build esensial apabila belum terpasang di VPS Linux.
3. **Kompilasi Frontend & Cleanup Cache**: Mengompilasi `gowa-ui` lalu **menghapus folder `node_modules` & cache sementara** untuk meminimalisir penggunaan ruang simpan (disk storage) VPS.
4. **Compile PureGo Backend**: Mengompilasi binary `whatsapp` dengan tag `purego`.
5. **Run REST Service**: Memulai REST server di `http://0.0.0.0:3000`.
