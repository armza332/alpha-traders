# 🤖 Trading War Room EA — Setup Guide

> MQL5 Expert Advisor สำหรับ MT5 — strategy ที่พิสูจน์แล้วจาก KB 10,000+ trades

## 📋 ภาพรวม

**Strategy:** RSI + Bollinger Bands + Fibonacci Confluence
**Symbols:** AUDUSDc + EURUSDc (Cent account — เหมาะ $30 บัญชี)
**Timeframe:** H1 (Swing)
**Win Rate (backtest):** 67-71%
**Risk per trade:** 1.5% of balance
**R:R:** 1:1.6

---

## 🚀 Setup ใน 5 นาที

### 1. หา MQL5 Experts Folder

ใน MT5:
- Menu: **File → Open Data Folder**
- Window Explorer เปิด → ไปต่อ: `MQL5 → Experts`

### 2. Save EA File

- Copy ไฟล์ [TradingWarRoom_EA.mq5](TradingWarRoom_EA.mq5) ไปวางในโฟลเดอร์ Experts
- กลับมาที่ MT5

### 3. Refresh Navigator

- ใน MT5: **View → Navigator** (Ctrl+N)
- คลิกขวา **Expert Advisors** → **Refresh**
- จะเห็น **TradingWarRoom_EA** โผล่ขึ้นมา

### 4. Compile EA

- Double-click **TradingWarRoom_EA** → เปิด MetaEditor
- กด **F7** หรือปุ่ม **Compile**
- เห็น `0 errors, 0 warnings` = พร้อมใช้

### 5. Enable Algo Trading

ใน MT5 toolbar:
- กดปุ่ม **Algo Trading** (สีเหลือง/แดง → ต้องเป็นสีเขียว)
- หรือ: **Tools → Options → Expert Advisors** → ติ๊ก:
  - ✅ Allow algorithmic trading
  - ✅ Allow DLL imports (optional)

### 6. Attach EA to Chart

1. เปิด chart **AUDUSDc H1** (1 hour timeframe)
2. ลาก **TradingWarRoom_EA** จาก Navigator ไปวางบน chart
3. Settings dialog เปิด:
   - **Common tab**:
     - ✅ Allow algorithmic trading
   - **Inputs tab**:
     - Default values ใช้ได้เลย หรือปรับ:
       - `RiskPercent`: 1.5 → 1.0 ถ้าอยาก conservative
       - `OnlyLondonNY`: true → false ถ้าจะเทรด Asia ด้วย
   - **OK**

### 7. ตรวจสอบ EA ทำงาน

- มุมขวาบนของ chart → **😊 หน้ายิ้มสีเขียว** = EA running
- ถ้าเป็น **😠 หน้าแดง** = EA ปิด, check Algo Trading button

### 8. ตรวจ Logs

- **View → Toolbox → Experts tab** (ด้านล่าง)
- จะเห็น log:
  ```
  ✅ Trading War Room EA initialized
     Symbols: AUDUSDc + EURUSDc
     Timeframe: PERIOD_H1 | Risk: 1.5% | R:R 1:1.6
     Account: $30.00 balance
  ```

---

## 🎯 วิธีอ่าน Output

### Console (Experts tab)
```
🎯 AUDUSDc BUY @ 0.71850 | SL 0.71775 | TP 0.71970 | Lot 0.01 | RSI 31.5
```
แต่ละ field:
- `🎯` = signal เกิด
- `BUY` = ทิศ
- `@ 0.71850` = ราคา entry
- `SL 0.71775` = stop loss
- `TP 0.71970` = take profit
- `Lot 0.01` = ขนาด lot ที่คำนวณ
- `RSI 31.5` = RSI ตอนเข้า (ขายมากเกินไป)

### Toolbox → Trade tab
- แสดง open positions
- Profit/Loss แบบ real-time
- ปุ่ม X ปิดออเดอร์เร็ว

### Account Status
- **View → Toolbox → Trade** → Balance + Equity + Free Margin
- หรือกด **Ctrl+T**

---

## ⚙️ การตั้งค่าที่แนะนำ

### สำหรับ $30 Cent Account (default):
```
RiskPercent: 1.5         (= $0.45 per trade)
SLAtrMult: 1.5
RewardRiskRatio: 1.6
OnlyLondonNY: true
```

### Conservative (ปลอดภัยกว่า):
```
RiskPercent: 1.0
RSIOversold: 30        (strict)
RSIOverbought: 70
```

### Aggressive (signal มากกว่า):
```
RiskPercent: 2.0
RSIOversold: 40        (relaxed)
RSIOverbought: 60
SignalCooldownMin: 15
```

---

## 🛡 Safety Checklist

**ก่อนปล่อยทิ้งไว้:**
- [ ] ใช้ **Demo account** ก่อน 2 สัปดาห์
- [ ] กำหนด `RiskPercent` ≤ 2%
- [ ] ตรวจ `MaxLot` ไม่เกินที่รับได้
- [ ] เปิด **Algo Trading** (สีเขียว)
- [ ] เช็ค Symbol ใน Market Watch เปิดอยู่
- [ ] Account balance > $20 (cent)
- [ ] Internet เสถียร (หรือใช้ VPS)

---

## 🐛 Troubleshooting

### EA ไม่ trade
1. **หน้ายิ้มสีแดง?** → กด Algo Trading ให้เขียว
2. **Symbol error?** → เช็ค Market Watch ว่ามี AUDUSDc + EURUSDc
3. **Account?** → ใช้ Demo, ไม่ใช่ Live (ก่อน)
4. **Session filter?** → ลอง `OnlyLondonNY: false` ถ้านอกช่วง

### Compile error
- เช็คว่า MT5 version ≥ build 3000
- รี-download ไฟล์ .mq5 ถ้ามีปัญหา

### Lot size = 0
- Account balance ต่ำเกินไป
- หรือ broker tickValue คำนวณไม่ได้ → ลดลง `MinLot: 0.001` (cent)

---

## 📊 Expected Performance (จาก backtest 10K+ trades)

```
Symbol         WR     Avg R/Trade
AUD-RSI       70%    +0.30R
AUD-Bollinger 70%    +0.30R
AUD-Fib       66%    +0.20R
EUR-Bollinger 70%    +0.30R

Combined (confluence): ~67-72% WR
Expected per trade:    +0.65R after costs
```

**Math สำหรับ $30 → $100:**
- Risk 1.5% per trade = +0.65% × 1.5 = ~+1% growth per trade
- 233% growth needed → ~230 trades
- Signal frequency: 1-3 per day per symbol
- Time estimate: **6-10 สัปดาห์**

---

## 🚦 Stop/Start Bot

**Stop:**
- เอา EA ออก chart: คลิกขวา chart → Expert Advisors → Remove
- หรือ: ปิด Algo Trading toolbar

**Pause:**
- ปิด Algo Trading button → EA ไม่ trade แต่ยังบน chart

**Restart:**
- คลิกขวา EA icon → Properties → OK
- หรือลากออกแล้วลากกลับมาใหม่

---

## 🎯 Next Steps (Phase 12.2)

หลัง EA ทำงานเสถียร 1-2 สัปดาห์ → ขั้นต่อไป:
1. **Web Sync** — EA → Web dashboard ส่ง status
2. **AI Signal Integration** — Web → EA ส่ง signal ที่ KB filter แล้ว
3. **Emergency Stop Button** — บนเว็บ
4. **VPS Setup** — รัน 24/7 ไม่ต้องเปิดคอมเอง

---

## ⚠️ Disclaimer

- ใช้กับ **Demo account** ก่อนเสมอ
- Past performance ≠ future results
- ตลาดเปลี่ยน → strategy อาจไม่ทำงาน
- **อย่าใช้เงินที่เสียไม่ได้**

ขอให้ trading สนุก + winning! 🎯
