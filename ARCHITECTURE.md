# 🏢 TRADING WAR ROOM CORP — System Architecture

> Personal AI Trading Company — $30 → $100 on Exness MT5 Demo
> Single source of truth for how the whole system fits together.

---

## 🗺 The 3 Layers

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — BRAIN (Web · GitHub Pages)                         │
│  https://armza332.github.io/trade-ai-agent/                   │
│                                                                │
│  • 14 Analyst Agents (per symbol) → Team → Commander          │
│  • KnowledgeBase (KB) — adaptive weights, regime-aware         │
│  • Company View · Office HQ · Secretary chat · Auto Pilot      │
│  • Backtest Lab + Auto-Optimize (trains KB)                   │
└───────────────────────────┬──────────────────────────────────┘
                            │ Apps Script bridge (HTTPS)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2 — NERVOUS SYSTEM (Google Apps Script)                │
│  mt5/BridgeCode.gs  → /exec                                   │
│                                                                │
│  • Stores: LATEST_STATUS · LATEST_PRICES · HISTORY ·          │
│    LIVE_TRADES (dedup by posId) · command queue               │
│  • EA POSTs status/prices/trades · Web GETs them              │
│  • Web POSTs commands · EA polls them                         │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebRequest (HTTPS)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — MUSCLE (MT5 Expert Advisor)                        │
│  mt5/TradingWarRoom_EA.mq5  · magic 992511                    │
│                                                                │
│  • Strategy: RSI + Bollinger + Fibonacci confluence           │
│  • Modes: 🌊 Swing (H1) · ⚡ Scalp (M1/M5/M15)               │
│  • Risk Manager: Breakeven · Trailing SL · Portfolio guard    │
│  • BOSS dashboard on-chart + clickable STOP/RESUME/CLOSE      │
│  • Executes own signals + accepts Web AI signals (Phase 13)   │
│  • Records every closed trade → Web KB (Phase 12.6)           │
└──────────────────────────────────────────────────────────────┘
```

---

## 👥 The Company (org metaphor)

| Role | Who/What | Where |
|------|----------|-------|
| 👔 **CEO** | You — human-in-the-loop | Office / Company |
| 📋 **Secretary (Janie)** | Chat Q&A + command routing | Company chat |
| 📈 **Trade Desk** | 3 Traders (XAU 🥷 / AUD 🏹 / EUR ⚔️) each = 14 techniques | Office / Teams |
| 🧠 **Strategy Officer** | KB learning + win/loss report + auto-adjust | Journal |
| 📊 **Accountant** | P&L, goal progress, trade reasons | Company / BOT |
| 💻 **Dev Monitor** | Health checks (EA/bridge/feed) | Company |
| 🛡 **Risk Officer** | Breakeven/Trailing/Portfolio guard | EA (Phase 15) |
| 🤖 **Claude Advisor** | Rule-based advice (free) + me in chat (code) | Company |

---

## 🧪 The 14 Analysts

| # | Agent | Type | Style |
|---|-------|------|-------|
| 1 | SMC | structure | OB/FVG/BOS |
| 2 | Elliott | structure | wave count |
| 3 | Fibonacci | structure | retracement |
| 4 | RSI/Value | momentum | oversold/bought |
| 5 | MACD | trend | momentum cross |
| 6 | Bollinger | volatility | mean-reversion |
| 7 | Pivot | structure | S/R levels |
| 8 | Pattern | pattern | candlesticks |
| 9 | Divergence | reversal | RSI/MACD vs price |
| 10 | Multi-TF | confluence | 1h+4h+D align |
| 11 | Ichimoku | trend | cloud system |
| 12 | DXY | macro | USD strength |
| 13 | UT-Bot | trend | ATR trailing stop |
| 14 | News | sentiment | event calendar |

**Decision flow:** each agent votes → `HeadAgent.aggregate()` (KB-weighted + consensus/conflict) → `Commander.decide()` (consensus ≥55%, ADX gate, top-down MTF, confluence) → Grade S+/A/B/C/D.

---

## 🔄 The Learning Loop

```
Backtest (historical) ──┐
                        ├──► KnowledgeBase ──► agent weights per regime+symbol
Live trades (EA) ───────┘         │
                                  ▼
                        Smart Apply / Recommended → enable best agents
                                  │
                                  ▼
                        Better signals → better trades → more data ↺
```

- **Backtest** = fast learning (no real money) — run Auto-Optimize overnight
- **Live** = ground truth (real spread/slippage) — every closed trade feeds KB
- KB never deleted by "Apply" — only by Reset KB / Fresh Start (with backup)

---

## ⚙️ Key Settings (EA Inputs)

| Setting | Conservative ($30) | Notes |
|---------|-------------------|-------|
| ScalpMode | true | M1/M5/M15 |
| ScalpTF | M5 | gold-friendly |
| RiskPercent | 1.0 | per trade |
| MaxPortfolioRiskPct | 4.0 | stop-out guard |
| EnableSymbol3 (XAU) | false | enable at $100+ |
| AcceptWebSignals | true | for Auto Pilot |
| UseBreakeven / UseTrailing | true | protect capital |

---

## 🚦 Daily Operating Procedure

1. **Morning:** Office HQ → check 😊 morale (WR) + 🟢 OPEN + Today P/L
2. **Ask Janie:** "สถานะ", "กำไร", "ทำไมไม่เทรด"
3. **Weekly:** Journal → Performance Analytics → see best hour/session/symbol
4. **When losing:** Strategy Officer auto-reduces risk (4 losses) / pauses (5)
5. **Improve:** export KB → ask Claude (this chat) → push code updates

---

## 📈 Version History (high level)

- **v12** — MT5 EA core (RSI+BB+Fib)
- **v12.2–12.9** — Web bridge, prices, remote control, scan, 3 symbols
- **v13** — Web AI → EA signal pipeline
- **v14** — Ichimoku + DXY agents, consensus filter, pixel badges
- **v15** — Risk Manager, Company View, Secretary chat, Auto Pilot, UT-Bot
- **v16** — Performance Analytics + Strategy auto-adjust
- **v17** — Pixel Office HQ
- **v18** — Office-as-home, trade dedup, consolidation

---

## ⚠️ Honest Disclaimers

- Demo account only during validation
- News = typical schedule (UTC), not live — verify on ForexFactory
- Web "Claude Advisor" = rule-based (free), not a live LLM API call
- Mean-reversion agents (RSI/BB) may flash BUY in downtrends — that's why
  trend agents (UT-Bot/Ichimoku/MTF) + consensus filter exist to veto
- Past performance ≠ future results
