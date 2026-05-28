# 🔵 Google Apps Script — Multi-file Deployment

> **v1.2** — แยกไฟล์เป็น 7 ไฟล์ในเอดิเตอร์ Apps Script เพื่อให้ JS ไม่พังจาก document.write ของ Apps Script

---

## 🚨 ถ้าเคยติดตั้งแบบไฟล์เดียวมาก่อน — อ่านตรงนี้

ปัญหาที่เคยเจอ:
- `Uncaught SyntaxError: Unexpected identifier 'Wave'`
- `MarketEngine is not defined`

**สาเหตุ**: Apps Script ใช้ `document.write()` ใส่ HTML ลง iframe ซึ่ง parser จัดการ string `'Wave 3'` ในไฟล์ใหญ่ผิดพลาด

**วิธีแก้**: แยกแต่ละ `<script>` block เป็น HTML file ของตัวเอง แล้วใช้ `<?!= include('Name'); ?>` รวมเข้ามาตอน serve

---

## 📁 ไฟล์ที่ต้อง paste (8 ไฟล์)

| # | ไฟล์ Apps Script | ใส่เนื้อหาจาก |
|---|----------------|-------------|
| 1 | `Code.gs` | [Code.gs](Code.gs) |
| 2 | `Index.html` | [Index.html](Index.html) |
| 3 | `Styles.html` | [Styles.html](Styles.html) |
| 4 | `Market.html` | [Market.html](Market.html) |
| 5 | `Agents.html` | [Agents.html](Agents.html) |
| 6 | `Ui.html` | [Ui.html](Ui.html) |
| 7 | `Extras.html` | [Extras.html](Extras.html) |
| 8 | `App.html` | [App.html](App.html) |

---

## 🚀 ขั้นตอน (10 นาที)

### STEP 1: สร้าง Telegram Bot

1. Telegram → `@BotFather` → `/newbot` → ตั้งชื่อ → ได้ **Bot Token**
2. ในห้อง bot ใหม่ → กด **START**
3. Telegram → `@userinfobot` → กด **START** → ได้ **Chat ID**

### STEP 2: สร้าง Apps Script project

1. https://script.google.com → **+ New project**
2. เปลี่ยนชื่อเป็น `Trading War Room`

### STEP 3: ใส่ Code.gs

- ใน editor → แท็บ `Code.gs` → **Ctrl+A** → ลบทิ้ง
- เปิดไฟล์ [Code.gs](Code.gs) ในเครื่อง → copy ทั้งหมด → paste
- **Ctrl+S**

### STEP 4: สร้างไฟล์ HTML 7 ไฟล์

สำหรับแต่ละไฟล์ในตารางด้านบน (ตั้งแต่ Index.html):

1. มุมซ้ายบน → กดปุ่ม **+** → เลือก **HTML**
2. ตั้งชื่อตามตาราง — **ห้ามมี `.html` ต่อท้าย** (Apps Script จะเติมเอง)
   - ⚠️ **ตัวพิมพ์สำคัญ**: `Index`, `Styles`, `Market`, `Agents`, `Ui`, `Extras`, `App` (ตัว I, S, M, A, U, E, A ใหญ่)
3. ลบเนื้อหา default ทิ้ง
4. เปิดไฟล์จากเครื่อง → copy → paste → **Ctrl+S**

### STEP 5: ตั้ง Telegram credentials

ในแท็บ `Code.gs` → ฟังก์ชัน `setupConfig` → แก้:

```js
'TELEGRAM_BOT_TOKEN': '8123456789:AAEx...',   // จาก STEP 1
'TELEGRAM_CHAT_ID':   '123456789',             // จาก STEP 1
'PRICE_API_KEY':      '',                       // ใส่เมื่ออยากใช้ราคาจริง
```

- เลือก dropdown ฟังก์ชัน → `setupConfig` → กด ▶ **Run**
- อนุญาต permissions (ครั้งแรกเท่านั้น)
- เห็น `Config saved` ใน log → เสร็จ

### STEP 6: Deploy

1. มุมขวาบน → **Deploy** → **New deployment**
2. ไอคอน ⚙️ → **Web app**
3. Execute as: **Me** | Who has access: **Only myself**
4. **Deploy** → copy URL ที่ลงท้าย `/exec`

### STEP 7: ทดสอบ

- เปิด URL ใน browser (Incognito tab จะดีกว่า)
- รอ 3-5 วินาที โหลด
- หน้าเว็บควรขึ้นพร้อม Gold Team + Currency Team + Commander Panel
- กด **⚙ SETTINGS** → ติ๊ก "เปิด Telegram" → กด **🧪 ทดสอบส่ง**
- ถ้าเห็นข้อความใน Telegram → ✅ สำเร็จ!

---

## 🔄 อัพเดต code ภายหลัง

ทุกครั้งที่ผมอัปเดต:
1. รัน `D:\claude Project\trade\build-appscript-multi.ps1` (build ใหม่)
2. ในเอดิเตอร์ Apps Script — paste ทับเฉพาะไฟล์ที่เปลี่ยน
3. **Deploy → Manage deployments → ✏️ → New version → Deploy**

หรือใช้ **/dev URL** (Test deployments) แล้วไม่ต้อง redeploy ทุกครั้ง

---

## 🐛 Troubleshooting

| ปัญหา | แก้ |
|------|----|
| `include is not defined` | Code.gs ต้องมีฟังก์ชัน `include()` (เพิ่งเพิ่มใน v1.2) |
| `Cannot read property...of undefined` ใน console | เช็คชื่อไฟล์ — ต้องเป็น Index, Styles, Market, Agents, Ui, Extras, App (ตัวแรกใหญ่) |
| หน้าเว็บโหลดช้า > 10 วินาที | ปกติของ Apps Script ครั้งแรก — โหลดครั้งต่อๆ ไปจะเร็วขึ้น |
| Telegram ไม่ส่ง | `setupConfig` รันสำเร็จไหม + bot ถูกกด `/start` แล้วยัง |
| ราคาไม่ตรง market จริง | SETTINGS → ติ๊ก "เปิดดึงราคาจริง" (ต้องใส่ Twelve Data API Key ใน setupConfig ก่อน) |

---

## 📊 Bonus: เปิด logging ลง Google Sheet

1. สร้าง Google Sheet ใหม่
2. copy Sheet ID จาก URL (ส่วนระหว่าง `/d/` กับ `/edit`)
3. ใน `setupConfig()` → ใส่ `'LOG_SHEET_ID': 'YOUR_ID'`
4. รัน `setupConfig` อีกครั้ง
5. ทุก signal Grade A+ จะ append ลง Sheet อัตโนมัติ (เก็บประวัติ)

---

## ✅ Checklist

- [ ] STEP 1: ได้ Bot Token + Chat ID
- [ ] STEP 2: สร้าง Apps Script project
- [ ] STEP 3: paste Code.gs
- [ ] STEP 4: สร้างและ paste 7 HTML files (Index, Styles, Market, Agents, Ui, Extras, App)
- [ ] STEP 5: รัน setupConfig สำเร็จ
- [ ] STEP 6: Deploy + ได้ /exec URL
- [ ] STEP 7: ทดสอบส่ง Telegram → ได้รับข้อความ
