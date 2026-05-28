# 🧠 KB Backups

ที่เก็บ Knowledge Base backups เผื่อต้อง restore กลับ

## 📂 ไฟล์ที่มี

| ไฟล์ | จำนวน trades | วันที่ | หมายเหตุ |
|------|-------------|--------|---------|
| [kb-backup-1321trades.json](kb-backup-1321trades.json) | 1,321 | 2026-05-26 | ก่อน Fresh Start — มี Gold-Elliott +279R, AUD-Bollinger +64R |

## 🔄 วิธี Restore กลับ

### Option 1: ผ่าน UI
1. เปิดเว็บ → 📓 JOURNAL
2. กดปุ่ม **📥 Import & Merge**
3. เปิดไฟล์ JSON → copy ทั้งหมด → paste ใน prompt
4. KB จะ **merge** กับข้อมูลปัจจุบัน

### Option 2: ผ่าน Console (F12)
```js
// อ่านไฟล์ → paste content แทน {...}
const data = {...};
AgentScores.save(data);
Modal.open('journal'); // refresh display
```

## 🏆 Top Performers ใน Backup นี้

| Agent | Trades | Accuracy | Total R |
|-------|--------|----------|---------|
| Gold-Elliott | 1073 | 60% | **+279R** ⭐⭐⭐⭐⭐ |
| AUD-Bollinger | 195 | 73% | **+64.4R** ⭐⭐⭐⭐ |
| AUD-RSI | 195 | 72% | **+60.4R** ⭐⭐⭐⭐ |
| AUD-Fib | 195 | 70% | **+55.6R** ⭐⭐⭐⭐ |
| AUD-Pattern | 195 | 67% | **+51.2R** ⭐⭐⭐ |
| Gold-SMC | 1073 | 49% | +74.2R ⭐⭐⭐ |
| Gold-News | 1073 | 62% | +12.2R ⭐⭐ |
| EUR-Bollinger | 53 | 70% | +13.2R ⭐⭐ |
| EUR-Fib | 53 | 70% | +13.2R ⭐⭐ |
| EUR-Elliott | 53 | 62% | +11.2R ⭐⭐ |

## 💀 Worst Performers

| Agent | Trades | Accuracy | Total R |
|-------|--------|----------|---------|
| AUD-SMC | 195 | 31% | -61.6R |
| Gold-RSI | 1073 | 57% | -54.6R |
| Gold-Bollinger | 1073 | 59% | -27.0R |
| Gold-MACD | 126 | 45% | -20.4R |
| Gold-Pattern | 1073 | 56% | -13.8R |
| EUR-MACD | 53 | 47% | -6.0R |
| Gold-Fib | 1073 | 58% | -5.0R |

## 🎯 Key Insights

- **Gold-Elliott คือ GOAT** — 60% acc, +279R ดูแล้วน่าจะถึง 0.6+ winrate ในตลาด volatile
- **AUD เน้น mean reversion** — Bollinger, Fib, RSI ดีหมด
- **MACD ห่วยทั้ง 3 symbols** — ปิดเลยก็ได้ แต่ในตลาด transitional ของ Gold ทำได้ดี (10W/3L)
- **Gold-Bollinger ใน volatile_trending = -98R** — อย่าใช้ในตลาดผันผวน

## ⚠️ Note

ข้อมูลนี้ตั้งบน **weight formula เดิม** (แค่ accuracy). ตั้งแต่ commit `5f00e44`+ ระบบใช้ formula ใหม่ (acc + avgR) ที่กระจาย weight ได้ดีกว่า. ถ้า restore data นี้ → weight ตอนใช้งานจะถูกคำนวณใหม่ตามสูตรล่าสุด (สูงสุด 2.5x แทน 2.0x)
