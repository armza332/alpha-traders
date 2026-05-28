# 🚀 Deployment Guide — Trading War Room

วิธีเอาแอปขึ้นออนไลน์ให้รันเองได้ทั้งวัน + ส่ง Telegram alert

---

## 🔧 ตั้ง Telegram Bot ก่อน (ใช้ได้ทุกวิธี deploy)

1. เปิด Telegram → search `@BotFather` → ส่ง `/newbot`
2. ตั้งชื่อ + username → ได้ **Bot Token** เช่น `8123456789:AAEx...`
3. Search bot ที่เพิ่งสร้าง → กด `/start`
4. Search `@userinfobot` → กด `/start` → ได้ **Chat ID** เช่น `123456789`
5. เปิดแอป → ⚙ SETTINGS → กรอก Token + Chat ID → ติ๊ก "เปิด Telegram" → กด ทดสอบส่ง

---

## ตัวเลือก Deploy

| วิธี | ฟรี | ยาก | URL ของคุณ | แนะนำ |
|------|------|------|------------|--------|
| **GitHub Pages**       | ✅ | ⭐ ง่ายมาก | `username.github.io/trade` | ⭐⭐⭐⭐⭐ |
| **Cloudflare Pages**   | ✅ | ⭐⭐ | `trade.pages.dev`         | ⭐⭐⭐⭐ |
| **Vercel**             | ✅ | ⭐⭐ | `trade.vercel.app`        | ⭐⭐⭐⭐ |
| **Google Apps Script** | ✅ | ⭐⭐⭐ | `script.google.com/.../exec` | ⭐⭐ |
| **Netlify**            | ✅ | ⭐⭐ | `trade.netlify.app`       | ⭐⭐⭐ |

---

## 🥇 วิธีที่ 1: GitHub Pages (แนะนำสุด)

### ขั้นตอน

```bash
# 1. สร้าง repo ใน GitHub (เช่นชื่อ "trade")
# 2. ใน folder โปรเจค:
cd "D:/claude Project/trade"
git init
git add .
git commit -m "Initial Trading War Room"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/trade.git
git push -u origin main

# 3. ใน GitHub repo → Settings → Pages
#    Source: Deploy from a branch → main → / (root) → Save
# 4. รอ 1-2 นาที → ได้ URL: https://YOUR_USERNAME.github.io/trade/
```

✅ **ข้อดี**: ฟรี, ง่ายมาก, custom domain ได้, HTTPS ฟรี
✅ Telegram bot ทำงานเลย เพราะเรียก API จาก browser

---

## 🟠 วิธีที่ 2: Cloudflare Pages

1. ไป https://pages.cloudflare.com
2. Connect to Git → เลือก repo
3. Build settings: ปล่อยว่างทั้งหมด (static site)
4. Deploy → ได้ URL `xxx.pages.dev`

✅ เร็วกว่า GitHub Pages, CDN global

---

## 🟣 วิธีที่ 3: Vercel (one-click)

1. ไป https://vercel.com
2. Import Git Repository → เลือก repo
3. Deploy (ไม่ต้องตั้งอะไร เพราะเป็น static)

---

## 🟢 วิธีที่ 4: Google Apps Script

ใช้ไฟล์ใน folder [appscript/](appscript/) — ดูคำแนะนำใน [appscript/README.md](appscript/README.md)

**ข้อดี**:
- รวมกับ Google Sheets ได้ (เก็บ log สัญญาณ)
- มี time-based triggers รัน server-side
- ฟรี

**ข้อเสีย**:
- HTML/CSS/JS ต้องรวมในไฟล์เดียวหรือใช้ HtmlService include
- เครื่องมือ debug ไม่สะดวกเท่า browser
- URL ยาว ไม่ custom domain

---

## 🔥 วิธี Auto-run แบบ 24/7

**Option A**: ปล่อยหน้าเว็บเปิดในเครื่องตัวเอง (RAM ต่ำ, ใช้ได้)
- เปิดใน Chrome tab + เปิด Telegram alert → จะส่งข้อความเข้า Telegram ของคุณตลอด

**Option B**: VPS / Raspberry Pi
- เปิด headless browser (Puppeteer) ชี้ไปที่ URL ของคุณ
- รันต่อเนื่อง

**Option C**: Cloudflare Workers + Cron (ขั้น advance)
- ย้าย analysis logic ไป Worker → ตั้ง schedule ทุก 5 นาที
- ต้องเขียน fetch market data จริงเอง (เช่น TradingView webhook, Twelve Data API)

---

## 🔌 ต่อเข้ากับ Market Data จริง (Production)

ตอนนี้แอปใช้ simulated data — ถ้าจะใช้ของจริง แก้ `js/market.js`:

### TradingView Webhook → Telegram → ระบบเรา
1. ใน TradingView indicator ตั้ง alert → webhook URL
2. URL ชี้ไปที่ Google Apps Script `doPost()`
3. Apps Script เก็บ data ใน Sheet
4. แอปอ่าน data จาก Sheet ผ่าน fetch JSON

### Free Forex/Gold APIs
- **Twelve Data** (https://twelvedata.com) — 800 req/day ฟรี
- **Alpha Vantage** (https://alphavantage.co) — 25 req/day ฟรี
- **OANDA Demo API** — ต้องสมัครบัญชี demo

แก้ใน `MarketEngine.tick()`:
```js
async tick() {
  const r = await fetch('https://api.twelvedata.com/price?symbol=XAU/USD&apikey=YOUR_KEY');
  const d = await r.json();
  this.prices.XAUUSD = parseFloat(d.price);
  // ...
}
```
 
---

## ⚠️ Disclaimer

ระบบนี้สร้างเพื่อการศึกษา ใช้ AI analysis ช่วยตัดสินใจ ไม่ใช่ financial advice
ต้องจัดการ risk ของตัวเองเสมอ ทดสอบใน demo account ก่อนใช้เงินจริง
