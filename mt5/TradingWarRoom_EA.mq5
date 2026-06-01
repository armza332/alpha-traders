//+------------------------------------------------------------------+
//|              TradingWarRoom_EA.mq5                                |
//|              AI-derived Strategy for Cent Accounts ($30+)         |
//|                                                                   |
//|   Strategy:    RSI + Bollinger + Fibonacci confluence            |
//|   Symbols:     AUDUSDc + EURUSDc (proven 70%+ WR in KB)         |
//|   Timeframe:   H1 (Swing)                                         |
//|   Risk:        1.5% per trade, R:R 1:1.6                         |
//|   Lot:         Auto-calculated from balance + risk + SL          |
//+------------------------------------------------------------------+
#property copyright "Trading War Room v1.0"
#property version   "1.00"
#property strict
#property description "AI-validated swing trading on Cent account"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//═══════════════════ INPUTS ═════════════════════════════════════════
input group "=== SYMBOLS ==="
input string  Symbol1            = "AUDUSDc";    // Primary symbol
input string  Symbol2            = "EURUSDc";    // Secondary symbol
input bool    EnableSymbol2      = true;          // Trade Symbol2 too
input string  Symbol3            = "XAUUSDm";    // Third symbol (gold)
input bool    EnableSymbol3      = false;         // Trade Symbol3 too (XAU — ระวัง spread!)
input string  Symbol4            = "BTCUSDm";    // Fourth symbol (crypto — เทรด 24/7)
input bool    EnableSymbol4      = false;         // Trade Symbol4 too (BTC — ต้องพอร์ตใหญ่พอ! lot ขั้นต่ำ exposure สูง)

input group "=== STRATEGY ==="
input ENUM_TIMEFRAMES Timeframe  = PERIOD_H1;    // Analysis TF (Swing default; Scalp uses ScalpTF below)
input int     RSIPeriod          = 14;
input double  RSIOversold        = 35.0;
input double  RSIOverbought      = 65.0;
input int     BBPeriod           = 20;
input double  BBDeviation        = 2.0;
input int     FibLookback        = 50;            // bars for Fib swing high/low
input int     ATRPeriod          = 14;

input group "=== SCALP MODE (Phase 12.7 — M1 scraping) ==="
input bool    ScalpMode          = false;         // ⚡ Enable M1 fast-scrap mode (overrides Timeframe)
input ENUM_TIMEFRAMES ScalpTF    = PERIOD_M1;     // Scalp timeframe (M1 default; try M5 if too noisy)
input double  ScalpRSIOversold   = 30.0;          // Tighter RSI for scalp (fewer fakes)
input double  ScalpRSIOverbought = 70.0;
input double  ScalpSLMult        = 0.8;           // Tighter SL (M1 = small moves)
input double  ScalpRR            = 1.3;           // Lower R:R (scalp aims for many small wins)
input int     ScalpCooldownMin   = 3;             // 3-min cooldown (was 30 for swing)
input int     ScalpMaxPosPerSym  = 1;             // Stricter — 1 trade at a time per symbol

input group "=== RISK MANAGEMENT ==="
input double  RiskPercent        = 1.5;           // % of balance per trade
input double  SLAtrMult          = 1.5;           // SL = ATR × this
input double  RewardRiskRatio    = 1.6;           // TP = SL × this
input double  MinLot             = 0.01;
input double  MaxLot             = 1.0;

input group "=== FILTERS ==="
input bool    OnlyLondonNY       = true;          // Skip Asia session
input int     SignalCooldownMin  = 30;            // Wait between signals
input int     MaxOpenPositions   = 2;             // per symbol

input group "=== RISK MANAGER (Phase 15) ==="
input bool    UseBreakeven       = true;          // 🛡 Move SL to breakeven once in profit
input double  BreakevenAtR       = 1.0;           // Move to BE when price hits +N×R profit
input double  BreakevenLockR     = 0.1;           // Lock +0.1R profit (cover spread) at BE
input bool    UseTrailing        = true;          // 🪤 Trail SL after breakeven
input double  TrailStartR        = 1.5;           // Start trailing at +N×R
input double  TrailStepR         = 0.5;           // Trail by N×R steps
input bool    UsePartialTP       = true;          // 💰 Phase 26: close part of position at +N×R (auto-skips if lot can't split)
input double  PartialAtR         = 1.0;           // Take partial profit at +N×R
input double  PartialPct         = 50;            // % of position to close (the rest runs to TP)
input double  MaxPortfolioRiskPct= 6.0;           // ⚠️ Max total open risk % of equity (stop-out guard)
input double  MaxPerTradeRiskPct = 4.0;           // 🛡 Phase C.1: max risk % of equity on ONE trade (4% = gold ~$100+ trades some setups; blocks BTC until bigger)
input double  CryptoMinSLPct     = 0.6;           // 🪙 Phase C.5: min SL for BTC/ETH = % of price (ATR is too tight for crypto; 0 = off)

input group "=== SYSTEM ==="
input int     MagicNumber        = 992511;
input bool    EnableAlerts       = true;
input bool    EnableNotify       = false;         // Push notifications
input bool    ShowDashboard      = true;          // On-chart status panel

input group "=== WEB BRIDGE (Optional) ==="
input string  WebhookURL         = "";            // Apps Script URL (paste after deploy)
input string  WebhookSecret      = "twr-secret";  // Match Apps Script secret
input int     WebPushSec         = 30;            // Push status every N seconds (scalp = 15-30s)
input string  WatchXAU           = "XAUUSDm";     // XAU symbol for price feed (Phase 12.3)
input string  WatchBTC           = "BTCUSDm";     // 🪙 BTC symbol for price feed → web (Phase C.4; "" = off)
input int     CommandPollSec     = 15;            // Poll web commands every N seconds (Phase 12.4)
input bool    AllowRemoteControl = true;          // Allow Close All / Pause from web (Phase 12.4)
input bool    AcceptWebSignals   = false;         // 🧠 Phase 13: Accept AI trade signals from web (KB-guided)
input bool    OnlyWebSignals     = false;         // 🎯 Phase 21.7: trade ONLY web signals (disable EA's own RSI+BB+Fib entries)
input int     MaxSignalAgeSec    = 90;            // 🕐 Phase 26: drop web AI signals older than this (anti-stale; 0 = off)

input group "=== SIGNAL MODE (Phase A) ==="
enum ENUM_SIG_MODE { SIG_WEB=0, SIG_EA=1, SIG_BOTH=2 };
input ENUM_SIG_MODE SignalMode   = SIG_EA;        // 🔀 WEB=สัญญาณเว็บ(candle จำลอง-เสี่ยงสวนจริง) · EA=คิดจากราคาจริง MT5 (แนะนำ) · BOTH=ทั้งคู่
input double  LocalMinConf       = 70;            // EA-local: min combined conf (UT-Bot + Divergence) to fire
input bool    EAUseFirmSniper    = false;         // 🎯 Phase C.2: EA-local ใช้ FirmSniper (hard-filter 4 ชั้น) แทน combo เดิมทุกคู่
input double  DxyDeadband        = 0.05;          // 🎯 FirmSniper: |USD trend| ต่ำกว่านี้ = flat (ผ่านทั้ง buy/sell)
input bool    FirmSniperUseNews  = true;          // 🎯 Phase C.3: ใช้ News filter จาก bridge (ครบ 5 ชั้น) — งดเทรดช่วงข่าวแรง

//═══════════════════ GLOBALS ════════════════════════════════════════
CTrade        trade;
CPositionInfo posInfo;

#define MAX_SYMS 4

// Phase 12.8: Per-symbol scan state for dashboard
struct ScanState {
   bool   rsiBuy, bbBuy, fibBuy;       // BUY-side conditions
   bool   rsiSell, bbSell, fibSell;    // SELL-side
   double rsi;
   double distToBBLower;               // % distance (positive = above lower band)
   double distToBBUpper;               // % distance (negative = below upper)
   datetime lastScan;
   string tag;                         // human-readable hint
};
ScanState     scanState[MAX_SYMS];

datetime      lastSignalTime[MAX_SYMS];
datetime      lastWebPush = 0;
datetime      lastCmdPoll = 0;
int           lastCmdId   = 0;       // last processed command ID
bool          eaPaused    = false;   // Phase 12.4: remote pause flag
int           gSignalMode = 0;       // Phase A: 0=WEB 1=EA 2=BOTH (runtime; web can change)
string        gCombo[3];             // Phase C: per-pair combo override [0]=XAU [1]=AUD [2]=EUR (dot-keys; ""=default)
bool          gNewsBlocked = false;  // Phase C.3: high-impact news window now (from bridge)
string        gNewsRisk    = "LOW";  // Phase C.3: LOW/MED/HIGH (from bridge, for dashboard)
datetime      gNewsTime    = 0;      // Phase C.3: when news state last refreshed (freshness guard)
int           rsiHandle[MAX_SYMS], bbHandle[MAX_SYMS], atrHandle[MAX_SYMS];
string        symbols[MAX_SYMS];
int           nActiveSyms = 0;       // dynamically counted in OnInit
bool          runEnabled[MAX_SYMS];  // Phase 12.9: runtime per-symbol toggle (web can flip)
int           tradesToday_W = 0, tradesToday_L = 0;
double        pnlToday      = 0;

// Phase 12.7: Effective strategy params (swap when ScalpMode toggles)
ENUM_TIMEFRAMES effTF;
double          effRSIOver, effRSIUnder, effSLMult, effRR;
int             effCooldownMin, effMaxPos;

void ApplyMode() {
   if (ScalpMode) {
      effTF          = ScalpTF;
      effRSIUnder    = ScalpRSIOversold;
      effRSIOver     = ScalpRSIOverbought;
      effSLMult      = ScalpSLMult;
      effRR          = ScalpRR;
      effCooldownMin = ScalpCooldownMin;
      effMaxPos      = ScalpMaxPosPerSym;
   } else {
      effTF          = Timeframe;
      effRSIUnder    = RSIOversold;
      effRSIOver     = RSIOverbought;
      effSLMult      = SLAtrMult;
      effRR          = RewardRiskRatio;
      effCooldownMin = SignalCooldownMin;
      effMaxPos      = MaxOpenPositions;
   }
}

// Phase 12.6: Live training — entry context per open ticket
struct TradeCtx {
   ulong  ticket;
   string sym;
   string side;
   double entry;
   double sl;
   double rsiAtEntry;
   double bbPosAtEntry;   // 0..1 (where 0=lower band, 1=upper band)
   string sessionAtEntry;
   datetime openTime;
   double riskUSD;
   string agentTag;        // Phase 26: which web agent fired this (for exact attribution)
};
TradeCtx openCtx[];        // dynamic array
int      openCtxCount = 0;

// Phase A: EA-local agent output. dir: +1 buy, -1 sell, 0 none
struct AgentOut { int dir; double conf; };

//═══════════════════ ON INIT ════════════════════════════════════════
int OnInit() {
   ApplyMode();              // Phase 12.7: set effective TF + thresholds
   gSignalMode = (int)SignalMode;   // Phase A: init runtime signal mode from input

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFillingBySymbol(Symbol1);

   // Phase 12.8: build active symbol list dynamically (1-3 symbols)
   nActiveSyms = 0;
   symbols[nActiveSyms++] = Symbol1;
   if (EnableSymbol2 && StringLen(Symbol2) > 0) symbols[nActiveSyms++] = Symbol2;
   if (EnableSymbol3 && StringLen(Symbol3) > 0) symbols[nActiveSyms++] = Symbol3;
   if (EnableSymbol4 && StringLen(Symbol4) > 0) symbols[nActiveSyms++] = Symbol4;

   // Phase C.4: make sure the BTC price-feed symbol is in Market Watch (even if not traded)
   if (StringLen(WatchBTC) > 0) SymbolSelect(WatchBTC, true);

   // Phase 12.9: init runtime toggle = enabled for all active symbols
   for (int k = 0; k < MAX_SYMS; k++) runEnabled[k] = (k < nActiveSyms);

   for (int i = 0; i < nActiveSyms; i++) {
      // Verify symbol exists
      if (!SymbolSelect(symbols[i], true)) {
         Print("❌ Symbol not available: ", symbols[i]);
         return INIT_FAILED;
      }

      rsiHandle[i] = iRSI(symbols[i], effTF, RSIPeriod, PRICE_CLOSE);
      bbHandle[i]  = iBands(symbols[i], effTF, BBPeriod, 0, BBDeviation, PRICE_CLOSE);
      atrHandle[i] = iATR(symbols[i], effTF, ATRPeriod);

      if (rsiHandle[i] == INVALID_HANDLE ||
          bbHandle[i]  == INVALID_HANDLE ||
          atrHandle[i] == INVALID_HANDLE) {
         Print("❌ Failed to init indicators for ", symbols[i]);
         return INIT_FAILED;
      }

      lastSignalTime[i] = 0;
   }

   PrintFormat("✅ Trading War Room EA initialized [%s MODE]", ScalpMode ? "⚡ SCALP M1" : "🌊 SWING");
   string symStr = symbols[0];
   for (int i = 1; i < nActiveSyms; i++) symStr += " + " + symbols[i];
   PrintFormat("   Trading %d symbols: %s", nActiveSyms, symStr);
   PrintFormat("   Timeframe: %s | Risk: %.1f%% | R:R 1:%.1f | Cooldown %dmin",
               EnumToString(effTF), RiskPercent, effRR, effCooldownMin);
   PrintFormat("   Account: $%.2f balance, %.2f equity",
               AccountInfoDouble(ACCOUNT_BALANCE),
               AccountInfoDouble(ACCOUNT_EQUITY));

   // Phase 26: skip the command backlog on (re)start. Set lastCmdId to the
   // current latest id so a recompile/reload does NOT re-execute an old command
   // (this caused a stale order to appear right after recompiling).
   if (StringLen(WebhookURL) > 10) {
      string u = WebhookURL + "?action=command&secret=" + WebhookSecret + "&since=0";
      char ip[]; char rr[]; string hh;
      ResetLastError();
      if (WebRequest("GET", u, "", 5000, ip, rr, hh) == 200) {
         string body = CharArrayToString(rr, 0, -1, CP_UTF8);
         int p = StringFind(body, "\"id\":");
         if (p >= 0) {
            lastCmdId = (int)StringToInteger(StringSubstr(body, p + 5, 10));
            PrintFormat("⏭ Skipping command backlog — starting from cmd id %d (ignore old queued commands)", lastCmdId);
         }
      }
   }

   return INIT_SUCCEEDED;
}

//═══════════════════ ON DEINIT ══════════════════════════════════════
void OnDeinit(const int reason) {
   for (int i = 0; i < MAX_SYMS; i++) {
      if (rsiHandle[i] != INVALID_HANDLE) IndicatorRelease(rsiHandle[i]);
      if (bbHandle[i]  != INVALID_HANDLE) IndicatorRelease(bbHandle[i]);
      if (atrHandle[i] != INVALID_HANDLE) IndicatorRelease(atrHandle[i]);
   }
   RemoveDashboard();      // Phase 12.5: cleanup OBJ_LABEL items
   Comment("");            // clear any leftover Comment text
   Print("🛑 EA stopped — reason ", reason);
}

//═══════════════════ ON TICK ════════════════════════════════════════
void OnTick() {
   // Phase 18.1: throttle dashboard to 1/sec (was every tick → caused MT5 lag)
   static datetime lastDash = 0;
   if (ShowDashboard && TimeCurrent() != lastDash) {
      UpdateDashboard();
      lastDash = TimeCurrent();
   }
   PushToWeb();
   PollWebCommands();    // Phase 12.4: check for remote commands

   // Only run signal check on new bar to save CPU
   static datetime lastBar = 0;
   datetime curBar = iTime(Symbol1, effTF, 0);
   if (curBar == lastBar) {
      ManagePositions();
      return;
   }
   lastBar = curBar;

   // Update today's stats (after each new bar)
   UpdateTodayStats();

   // Phase 12.4: skip trading if paused remotely
   if (eaPaused) return;

   // Session filter
   if (OnlyLondonNY && !IsLondonNYSession()) return;

   // Trade check per symbol
   for (int i = 0; i < nActiveSyms; i++) {
      if (!runEnabled[i]) continue;   // Phase 12.9: skip if disabled from web
      CheckSignal(symbols[i], i);                          // updates dashboard scan
      if (gSignalMode == 1 || gSignalMode == 2) EvaluateLocalCombo(symbols[i], i);  // EA/BOTH: fire local combo
   }
}

//═══════════════════ SIGNAL DETECTION ═══════════════════════════════
void CheckSignal(string sym, int idx) {
   // Always scan (so dashboard always reflects fresh state).
   // Cooldown + position checks only block actual trade execution.

   // Get indicator values — use dynamic arrays so ArraySetAsSeries works
   double rsiArr[], bbU[], bbM[], bbL[], atrArr[];
   ArraySetAsSeries(rsiArr, true);
   ArraySetAsSeries(bbU, true);
   ArraySetAsSeries(bbM, true);
   ArraySetAsSeries(bbL, true);
   ArraySetAsSeries(atrArr, true);

   if (CopyBuffer(rsiHandle[idx], 0, 0, 3, rsiArr) != 3) return;
   if (CopyBuffer(bbHandle[idx], 1, 0, 3, bbU)    != 3) return;
   if (CopyBuffer(bbHandle[idx], 0, 0, 3, bbM)    != 3) return;
   if (CopyBuffer(bbHandle[idx], 2, 0, 3, bbL)    != 3) return;
   if (CopyBuffer(atrHandle[idx], 0, 0, 3, atrArr) != 3) return;

   double rsi    = rsiArr[1];   // last closed bar
   double rsiPrev= rsiArr[2];
   double bbUp   = bbU[1];
   double bbDn   = bbL[1];
   double bbMid  = bbM[1];
   double atr    = atrArr[1];

   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double mid = (bid + ask) / 2;

   // Fibonacci: find swing high/low in last N bars
   double fibHigh = 0, fibLow = 999999;
   for (int j = 1; j <= FibLookback; j++) {
      double h = iHigh(sym, effTF, j);
      double l = iLow(sym, effTF, j);
      if (h > fibHigh) fibHigh = h;
      if (l < fibLow)  fibLow  = l;
   }
   double fibRange = fibHigh - fibLow;
   double fib618_buy  = fibLow + fibRange * 0.382;
   double fib618_sell = fibHigh - fibRange * 0.382;

   // ─── Evaluate all 6 conditions (used for both trade decision + dashboard) ───
   bool rsiBuy  = (rsi <= effRSIUnder && rsiPrev <= effRSIUnder);
   bool bbBuy   = (mid <= bbDn * 1.0015);
   bool fibBuy  = ScalpMode ? true : (mid <= fib618_buy * 1.005);

   bool rsiSell = (rsi >= effRSIOver && rsiPrev >= effRSIOver);
   bool bbSell  = (mid >= bbUp * 0.9985);
   bool fibSell = ScalpMode ? true : (mid >= fib618_sell * 0.995);

   // ─── Update scan state for dashboard ───
   scanState[idx].rsiBuy  = rsiBuy;
   scanState[idx].bbBuy   = bbBuy;
   scanState[idx].fibBuy  = fibBuy;
   scanState[idx].rsiSell = rsiSell;
   scanState[idx].bbSell  = bbSell;
   scanState[idx].fibSell = fibSell;
   scanState[idx].rsi     = rsi;
   scanState[idx].distToBBLower = (bbDn > 0) ? ((mid - bbDn) / bbDn * 100.0) : 0;
   scanState[idx].distToBBUpper = (bbUp > 0) ? ((bbUp - mid) / bbUp * 100.0) : 0;
   scanState[idx].lastScan = TimeCurrent();

   int buyHits  = (rsiBuy?1:0)  + (bbBuy?1:0)  + (fibBuy?1:0);
   int sellHits = (rsiSell?1:0) + (bbSell?1:0) + (fibSell?1:0);

   // Build tag for dashboard
   if (CountPositions(sym) >= effMaxPos)        scanState[idx].tag = "MAX-POS";
   else if (TimeCurrent() - lastSignalTime[idx] < effCooldownMin * 60) {
      int waitSec = (int)(effCooldownMin * 60 - (TimeCurrent() - lastSignalTime[idx]));
      scanState[idx].tag = StringFormat("CD %ds", waitSec);
   }
   else if (buyHits >= 3)                       scanState[idx].tag = "BUY!";
   else if (sellHits >= 3)                      scanState[idx].tag = "SELL!";
   else if (buyHits == 2)                       scanState[idx].tag = "BUY?";
   else if (sellHits == 2)                      scanState[idx].tag = "SELL?";
   else                                         scanState[idx].tag = "SCAN";

   // ─── Trade execution (only if cooldown + position allow) ───
   // Phase 21.7: if OnlyWebSignals, the EA never opens its own trades —
   // it waits for high-confidence signals from the web head-traders.
   if (OnlyWebSignals) {
      // dashboard label reflects the active signal mode (EA-local runs separately)
      scanState[idx].tag = (gSignalMode == 1) ? "EA-LOCAL" : (gSignalMode == 2) ? "EA+WEB" : "WEB-ONLY";
      return;
   }
   if (TimeCurrent() - lastSignalTime[idx] < effCooldownMin * 60) return;
   if (CountPositions(sym) >= effMaxPos) return;

   // Phase 15: Portfolio risk guard — block new trade if total risk too high
   double portRisk = PortfolioRiskPct();
   if (portRisk >= MaxPortfolioRiskPct) {
      scanState[idx].tag = "RISK-MAX";
      static datetime lastWarn = 0;
      if (TimeCurrent() - lastWarn > 300) {
         PrintFormat("⚠️ Portfolio risk %.1f%% ≥ max %.1f%% — blocking new %s trade",
                     portRisk, MaxPortfolioRiskPct, sym);
         lastWarn = TimeCurrent();
      }
      return;
   }

   if (rsiBuy && bbBuy && fibBuy)   { ExecuteTrade(sym, idx, true,  atr, rsi); return; }
   if (rsiSell && bbSell && fibSell){ ExecuteTrade(sym, idx, false, atr, rsi); return; }
}

//═══════════════════ EXECUTE TRADE ══════════════════════════════════
void ExecuteTrade(string sym, int idx, bool isBuy, double atr, double rsi, string agentTag = "ea") {
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double entry = isBuy ? ask : bid;
   double slDist = atr * effSLMult;

   // Phase 26: floor the SL distance so the spread + broker min-stop can't
   // eat it (critical on gold/M1 where ATR is tiny but spread is wide).
   // R:R is preserved (tpDist scales with slDist) and lot is recomputed
   // from the widened slDist below, so the risk % stays the same.
   double pt         = SymbolInfoDouble(sym, SYMBOL_POINT);
   double spreadDist = ask - bid;
   double minByStop  = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * pt;
   double minDist    = MathMax(minByStop, spreadDist * 3.0);   // SL ≥ 3× spread
   if (slDist < minDist) {
      PrintFormat("⚠️ %s SL too tight (%.5f, spread %.5f) → widened to %.5f",
                  sym, slDist, spreadDist, minDist);
      slDist = minDist;
   }

   // Phase C.5: crypto SL floor — ATR-based SL is far too tight vs BTC's price
   // scale (gets stopped by noise). Widen to a % of price. The larger risk also
   // makes the per-trade cap gate BTC on small accounts (won't trade until equity
   // is big enough — exactly the behavior we want).
   if (CryptoMinSLPct > 0) {
      string _cb = sym; StringToUpper(_cb);
      if (StringFind(_cb, "BTC") >= 0 || StringFind(_cb, "ETH") >= 0) {
         double cryptoMin = entry * CryptoMinSLPct / 100.0;
         if (slDist < cryptoMin) {
            PrintFormat("🪙 %s crypto SL floor → %.2f%% of price (%.2f)", sym, CryptoMinSLPct, cryptoMin);
            slDist = cryptoMin;
         }
      }
   }

   double tpDist = slDist * effRR;
   double sl = isBuy ? entry - slDist : entry + slDist;
   double tp = isBuy ? entry + tpDist : entry - tpDist;

   // Normalize prices to symbol digits
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);
   entry = NormalizeDouble(entry, digits);

   // Phase 18.1: Cross-instance lock — prevent 2+ EA instances (same magic)
   // from opening the SAME symbol within 10s (fixes double-trade)
   string lockName = "TWR_LOCK_" + sym + "_" + IntegerToString(MagicNumber);
   if (GlobalVariableCheck(lockName)) {
      double lastLock = GlobalVariableGet(lockName);
      if (TimeCurrent() - (datetime)lastLock < 10) {
         PrintFormat("🔒 %s locked by another EA instance (<10s) — skip duplicate", sym);
         return;
      }
   }
   GlobalVariableSet(lockName, (double)TimeCurrent());

   // Calculate lot size from risk
   double lot = CalculateLot(sym, slDist);
   if (lot < MinLot) lot = MinLot;
   if (lot > MaxLot) lot = MaxLot;

   // Phase C.1: PER-TRADE risk cap. If the smallest allowed lot still risks more
   // than MaxPerTradeRiskPct of equity (e.g. gold 0.01 lot on a $30 account),
   // SKIP — never blow a big chunk on one trade. This is the firm's discipline.
   {
      double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double ts = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      if (tv > 0 && ts > 0 && eq > 0) {
         double riskMoney = (slDist / ts) * tv * lot;
         double riskPct   = riskMoney / eq * 100.0;
         if (riskPct > MaxPerTradeRiskPct) {
            PrintFormat("🚫 %s SKIP — trade risk %.1f%% > max %.1f%% (lot %.2f, risk $%.2f on eq $%.2f) — เล็กไปสำหรับคู่นี้",
                        sym, riskPct, MaxPerTradeRiskPct, lot, riskMoney, eq);
            return;
         }
      }
   }

   // Phase 26: dash-delimited so the EA can read the agent tag back on close
   //   format: TWR-<B|S>-<agentTag>-R<rsi>  (e.g., TWR-B-cl-R43)
   string comment = StringFormat("TWR-%s-%s-R%.0f", isBuy ? "B" : "S", agentTag, rsi);
   bool ok;
   if (isBuy) ok = trade.Buy(lot, sym, entry, sl, tp, comment);
   else       ok = trade.Sell(lot, sym, entry, sl, tp, comment);

   if (ok) {
      lastSignalTime[idx] = TimeCurrent();
      PrintFormat("🎯 %s %s @ %.5f | SL %.5f | TP %.5f | Lot %.2f | RSI %.1f",
                  sym, isBuy ? "BUY" : "SELL", entry, sl, tp, lot, rsi);
      if (EnableAlerts) Alert(comment, " ", sym, " @ ", DoubleToString(entry, digits));
      if (EnableNotify) SendNotification("TWR: " + comment + " " + sym);
   } else {
      PrintFormat("❌ Trade failed: %s %s — error %d (%s)",
                  sym, isBuy ? "BUY" : "SELL",
                  trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
}

//═══════════════════ LOT CALCULATION ════════════════════════════════
double CalculateLot(string sym, double slDistance) {
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskUSD = balance * RiskPercent / 100.0;

   double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if (tickValue <= 0 || tickSize <= 0) return MinLot;

   double slTicks = slDistance / tickSize;
   double lot = riskUSD / (slTicks * tickValue);

   double minLotBroker = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLotBroker = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double lotStep      = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);

   lot = MathMax(lot, minLotBroker);
   lot = MathMin(lot, maxLotBroker);
   lot = MathFloor(lot / lotStep) * lotStep;
   return NormalizeDouble(lot, 2);
}

//═══════════════════ POSITION MANAGEMENT ════════════════════════════
int CountPositions(string sym) {
   int count = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (posInfo.SelectByIndex(i)) {
         if (posInfo.Symbol() == sym && posInfo.Magic() == MagicNumber) count++;
      }
   }
   return count;
}

// Phase 15: Total open risk across all positions (% of equity) — stop-out guard
double PortfolioRiskPct() {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if (equity <= 0) return 0;
   double totalRisk = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (!posInfo.SelectByIndex(i)) continue;
      if (posInfo.Magic() != MagicNumber) continue;
      double open = posInfo.PriceOpen();
      double sl   = posInfo.StopLoss();
      if (sl <= 0) continue;   // no SL = unbounded risk, skip calc
      string sym = posInfo.Symbol();
      double vol = posInfo.Volume();
      double tickVal = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double tickSz  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      if (tickSz <= 0) continue;
      double slDistTicks = MathAbs(open - sl) / tickSz;
      double riskMoney = slDistTicks * tickVal * vol;
      totalRisk += riskMoney;
   }
   return totalRisk / equity * 100.0;
}

void ManagePositions() {
   if (!UseBreakeven && !UseTrailing) return;

   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (!posInfo.SelectByIndex(i)) continue;
      if (posInfo.Magic() != MagicNumber) continue;

      string sym  = posInfo.Symbol();
      long   type = posInfo.PositionType();
      double open = posInfo.PriceOpen();
      double curSL= posInfo.StopLoss();
      double curTP= posInfo.TakeProfit();
      double bid  = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask  = SymbolInfoDouble(sym, SYMBOL_ASK);
      int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      // Original R distance. IMPORTANT: infer from the TP (which never moves),
      // NOT the current SL — once SL trails to breakeven, open-curSL shrinks and
      // would make profitR explode, breaking breakeven/trailing. TP = entry ± R×effRR.
      double price = (type == POSITION_TYPE_BUY) ? bid : ask;
      double rDist = (curTP != 0 && effRR > 0) ? MathAbs(open - curTP) / effRR
                                               : MathAbs(open - curSL);
      if (rDist <= 0) continue;

      // Profit in R-multiples
      double profitR = (type == POSITION_TYPE_BUY)
                       ? (price - open) / rDist
                       : (open - price) / rDist;

      double newSL = curSL;

      // ── Partial take-profit (PORTFOLIO-SIZE AWARE) ──
      // Closes PartialPct% of the position at +PartialAtR. Auto-skips when the
      // lot can't be split (e.g., $30 account at min lot 0.01) so it never errors;
      // activates automatically once the account grows enough to split lots.
      if (UsePartialTP && profitR >= PartialAtR) {
         string gvKey = "TWR_PART_" + IntegerToString((long)posInfo.Ticket());
         if (!GlobalVariableCheck(gvKey)) {
            double vol     = posInfo.Volume();
            double minLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
            double lotStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
            if (lotStep <= 0) lotStep = minLot;
            double closeVol = MathFloor((vol * PartialPct / 100.0) / lotStep) * lotStep;
            closeVol = NormalizeDouble(closeVol, 2);
            // require BOTH the closed part and the remainder to be valid lots
            if (closeVol >= minLot && (vol - closeVol) >= minLot) {
               if (trade.PositionClosePartial(posInfo.Ticket(), closeVol)) {
                  GlobalVariableSet(gvKey, 1);
                  PrintFormat("💰 %s partial TP: closed %.2f of %.2f lot at +%.2fR — runner to breakeven",
                              sym, closeVol, vol, profitR);
               }
            } else {
               // account too small to split — mark done so we don't re-check every tick
               GlobalVariableSet(gvKey, 1);
            }
         }
      }

      // ── Breakeven move ──
      if (UseBreakeven && profitR >= BreakevenAtR) {
         double bePrice = (type == POSITION_TYPE_BUY)
                          ? open + rDist * BreakevenLockR
                          : open - rDist * BreakevenLockR;
         bePrice = NormalizeDouble(bePrice, digits);
         // only move SL forward (never backward)
         if ((type == POSITION_TYPE_BUY  && bePrice > curSL) ||
             (type == POSITION_TYPE_SELL && bePrice < curSL)) {
            newSL = bePrice;
         }
      }

      // ── Trailing stop (after breakeven) ──
      if (UseTrailing && profitR >= TrailStartR) {
         // Trail SL to lock (profitR - TrailStepR) of distance
         double lockR = profitR - TrailStepR;
         double trailPrice = (type == POSITION_TYPE_BUY)
                             ? open + rDist * lockR
                             : open - rDist * lockR;
         trailPrice = NormalizeDouble(trailPrice, digits);
         if ((type == POSITION_TYPE_BUY  && trailPrice > newSL) ||
             (type == POSITION_TYPE_SELL && trailPrice < newSL)) {
            newSL = trailPrice;
         }
      }

      // Apply if changed
      if (MathAbs(newSL - curSL) > SymbolInfoDouble(sym, SYMBOL_POINT)) {
         if (trade.PositionModify(posInfo.Ticket(), newSL, curTP)) {
            PrintFormat("🛡 %s SL moved → %.5f (profit %.2fR)", sym, newSL, profitR);
         }
      }
   }
}

//═══════════════════ SESSION FILTER ═════════════════════════════════
bool IsLondonNYSession() {
   MqlDateTime t;
   TimeCurrent(t);
   int h = t.hour;
   // London 8-12 UTC, NY 13-17 UTC → broker H = UTC + offset
   return (h >= 8 && h < 17);
}

//═══════════════════ TODAY STATS ════════════════════════════════════
datetime StartOfDay() {
   MqlDateTime t;
   TimeCurrent(t);
   t.hour = 0; t.min = 0; t.sec = 0;
   return StructToTime(t);
}

void UpdateTodayStats() {
   tradesToday_W = 0; tradesToday_L = 0; pnlToday = 0;
   if (!HistorySelect(StartOfDay(), TimeCurrent())) return;
   int n = HistoryDealsTotal();
   for (int i = 0; i < n; i++) {
      ulong t = HistoryDealGetTicket(i);
      if (HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber) continue;
      if (HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      double profit = HistoryDealGetDouble(t, DEAL_PROFIT)
                    + HistoryDealGetDouble(t, DEAL_SWAP)
                    + HistoryDealGetDouble(t, DEAL_COMMISSION);
      if (profit > 0)      tradesToday_W++;
      else if (profit < 0) tradesToday_L++;
      pnlToday += profit;
   }
}

//═══════════════════ ON-CHART DASHBOARD — BOSS MODE ════════════════
// Uses OBJ_RECTANGLE_LABEL + OBJ_LABEL for real graphics
// (replaces plain Comment() — far more impressive)
#define DASH_PFX  "TWR_DASH_"
#define DASH_W    340
#define DASH_X    10
#define DASH_Y    20

// helper: create / update label
void DashLabel(string id, int x, int y, string text, color clr, int fontSize=8, string font="Consolas") {
   string name = DASH_PFX + id;
   if (ObjectFind(0, name) < 0) {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
      ObjectSetString (0, name, OBJPROP_FONT, font);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString (0, name, OBJPROP_TEXT, text);
}

void DashRect(string id, int x, int y, int w, int h, color bg, color border, int borderW=1) {
   string name = DASH_PFX + id;
   if (ObjectFind(0, name) < 0) {
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE,     w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE,     h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR,   bg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE,  BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, borderW);
}

string ProgressBar(double pct, int width) {
   if (pct < 0) pct = 0; if (pct > 1) pct = 1;
   int filled = (int)MathRound(pct * width);
   string s = "";
   for (int i = 0; i < width; i++) s += (i < filled) ? "█" : "░";
   return s;
}

// Phase 15.4: clickable on-chart button (AURA-style)
void DashButton(string id, int x, int y, int w, int h, string text, color bg, color txtClr) {
   string name = DASH_PFX + id;
   if (ObjectFind(0, name) < 0) {
      ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetString (0, name, OBJPROP_FONT, "Consolas Bold");
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetString (0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, txtClr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
}

// Phase 15.4: handle button clicks
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if (id != CHARTEVENT_OBJECT_CLICK) return;
   if (sparam == DASH_PFX + "BTN_STOP") {
      eaPaused = true;
      Print("⏸ DASHBOARD: EA paused via button");
      ObjectSetInteger(0, DASH_PFX + "BTN_STOP", OBJPROP_STATE, false);
   }
   else if (sparam == DASH_PFX + "BTN_RESUME") {
      eaPaused = false;
      Print("▶️ DASHBOARD: EA resumed via button");
      ObjectSetInteger(0, DASH_PFX + "BTN_RESUME", OBJPROP_STATE, false);
   }
   else if (sparam == DASH_PFX + "BTN_CLOSE") {
      int n = CloseAllMyPositions();
      Print("🔴 DASHBOARD: Close All → ", n, " positions");
      ObjectSetInteger(0, DASH_PFX + "BTN_CLOSE", OBJPROP_STATE, false);
   }
   // Phase 19.1: manual BUY/SELL on the chart symbol
   else if (sparam == DASH_PFX + "BTN_BUY") {
      ManualTrade(true);
      ObjectSetInteger(0, DASH_PFX + "BTN_BUY", OBJPROP_STATE, false);
   }
   else if (sparam == DASH_PFX + "BTN_SELL") {
      ManualTrade(false);
      ObjectSetInteger(0, DASH_PFX + "BTN_SELL", OBJPROP_STATE, false);
   }
}

// Phase 19.1: manual entry from dashboard (trades the chart's symbol)
void ManualTrade(bool isBuy) {
   string sym = _Symbol;   // chart symbol the EA is attached to
   // find ATR for SL/TP — use a temp handle on effTF
   int hAtr = iATR(sym, effTF, ATRPeriod);
   double atr = 0;
   if (hAtr != INVALID_HANDLE) {
      double a[]; ArraySetAsSeries(a, true);
      if (CopyBuffer(hAtr, 0, 0, 1, a) > 0) atr = a[0];
      IndicatorRelease(hAtr);
   }
   if (atr <= 0) { Print("🚫 Manual trade: ATR unavailable for ", sym); return; }

   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double entry = isBuy ? ask : bid;
   double slDist = atr * effSLMult;
   double tpDist = slDist * effRR;
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double sl = NormalizeDouble(isBuy ? entry - slDist : entry + slDist, digits);
   double tp = NormalizeDouble(isBuy ? entry + tpDist : entry - tpDist, digits);
   double lot = CalculateLot(sym, slDist);
   if (lot < MinLot) lot = MinLot;

   bool ok = isBuy ? trade.Buy(lot, sym, 0, sl, tp, "TWR MANUAL BUY")
                   : trade.Sell(lot, sym, 0, sl, tp, "TWR MANUAL SELL");
   PrintFormat("🖱 MANUAL %s %s @ ~%.5f | SL %.5f | TP %.5f | Lot %.2f → %s",
               isBuy?"BUY":"SELL", sym, entry, sl, tp, lot,
               ok?"OK":("FAIL "+IntegerToString(trade.ResultRetcode())));
}

void UpdateDashboard() {
   int y = DASH_Y;

   // ── Outer panel ──
   DashRect("PANEL", DASH_X, y, DASH_W, 360,
            C'10,15,25',           // bg: dark blue-black
            C'0,255,200',          // border: cyan
            2);

   // ── Header ──
   DashLabel("TITLE", DASH_X+12, y+8,
             eaPaused ? "▼ TRADING WAR ROOM — PAUSED ▼" : "▲ TRADING WAR ROOM — BOSS MODE ▲",
             eaPaused ? C'255,140,0' : C'0,255,200',
             10, "Consolas Bold");
   DashLabel("CLOCK", DASH_X+12, y+28,
             TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES) + "  " + (IsLondonNYSession() ? "[LDN/NY]" : "[ASIA]"),
             IsLondonNYSession() ? C'255,230,0' : C'128,128,128',
             7);
   // Phase C.3: news state (from bridge) — relevant when FirmSniper is active
   bool newsFresh = (gNewsTime > 0 && TimeCurrent() - gNewsTime < 600);
   bool newsHalt  = (FirmSniperUseNews && gNewsBlocked && newsFresh);
   DashLabel("NEWS_LBL", DASH_X+200, y+28,
             newsHalt ? "🚫 NEWS HALT" : ("📰 " + (newsFresh ? gNewsRisk : "—")),
             newsHalt ? C'255,80,80' : (gNewsRisk == "MED" ? C'255,200,0' : C'120,180,255'),
             7);

   // ── Account block ──
   y += 50;
   DashRect("ACC_BG", DASH_X+8, y, DASH_W-16, 70,
            C'18,28,40', C'0,180,140', 1);

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   double fm  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double pnlPct = (bal > 0) ? (pnlToday / bal * 100.0) : 0;
   color pnlClr = pnlToday > 0 ? C'0,255,100' : (pnlToday < 0 ? C'255,80,80' : C'180,180,180');

   DashLabel("ACC_LBL", DASH_X+16, y+5, "ACCOUNT", C'0,255,200', 7);
   DashLabel("BAL",     DASH_X+16, y+22, StringFormat("BAL  $%.2f", bal),  C'255,255,255', 9);
   DashLabel("EQ",      DASH_X+150, y+22, StringFormat("EQ  $%.2f", eq),  C'200,200,200', 9);
   DashLabel("PNL",     DASH_X+16, y+42, StringFormat("P/L  $%+.2f  (%+.2f%%)  W%d L%d",
                                                       pnlToday, pnlPct, tradesToday_W, tradesToday_L),
             pnlClr, 9);

   // ── Live Watch block ──
   y += 80;
   DashRect("WATCH_BG", DASH_X+8, y, DASH_W-16, 92,
            C'18,28,40', C'255,200,0', 1);
   DashLabel("WATCH_LBL", DASH_X+16, y+5, "LIVE WATCH", C'255,230,0', 7);

   // Phase 12.8: show trade symbols first (with scan state), then WatchXAU if not traded
   string displayList[6];   // up to MAX_SYMS traded + WatchXAU + WatchBTC
   int displayCount = 0;
   bool watchXauIsTraded = false;
   for (int i = 0; i < nActiveSyms; i++) {
      displayList[displayCount++] = symbols[i];
      if (symbols[i] == WatchXAU) watchXauIsTraded = true;
   }
   if (!watchXauIsTraded && StringLen(WatchXAU) > 0) displayList[displayCount++] = WatchXAU;

   for (int i = 0; i < displayCount; i++) {
      string sym = displayList[i];
      if (StringLen(sym) == 0 || !SymbolSelect(sym, true)) continue;

      double bid = SymbolInfoDouble(sym, SYMBOL_BID);
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      // For traded symbols: use scanState (refreshed every tick)
      // For watch-only: compute quick RSI
      bool isTraded = (i < nActiveSyms);
      double rsi = 50;
      string sigTag = "WATCH";
      color  sigClr = C'120,180,255';   // blue for watch
      string RBF = "   ";

      if (isTraded) {
         // Phase 15.4 fix: if scanState not populated yet (before 1st new bar),
         // run a fresh scan now so dashboard never shows (null)/RSI 0
         if (scanState[i].lastScan == 0) CheckSignal(sym, i);
         rsi = scanState[i].rsi;
         sigTag = scanState[i].tag;
         if (StringLen(sigTag) == 0) sigTag = "INIT";

         // R/B/F indicator: bright if condition met (use BUY side if BUY tag, SELL side if SELL)
         bool buyDir = (StringFind(sigTag, "BUY") >= 0);
         bool sellDir = (StringFind(sigTag, "SELL") >= 0);
         string r = " ", b = " ", f = " ";
         if (buyDir) {
            r = scanState[i].rsiBuy ? "R" : "·";
            b = scanState[i].bbBuy  ? "B" : "·";
            f = scanState[i].fibBuy ? "F" : "·";
         } else if (sellDir) {
            r = scanState[i].rsiSell ? "R" : "·";
            b = scanState[i].bbSell  ? "B" : "·";
            f = scanState[i].fibSell ? "F" : "·";
         } else {
            // Pure SCAN — show which side has more hits
            int buyHits  = (scanState[i].rsiBuy?1:0)  + (scanState[i].bbBuy?1:0)  + (scanState[i].fibBuy?1:0);
            int sellHits = (scanState[i].rsiSell?1:0) + (scanState[i].bbSell?1:0) + (scanState[i].fibSell?1:0);
            r = (buyHits > sellHits) ? (scanState[i].rsiBuy ? "r" : "·") : (scanState[i].rsiSell ? "r" : "·");
            b = (buyHits > sellHits) ? (scanState[i].bbBuy  ? "b" : "·") : (scanState[i].bbSell  ? "b" : "·");
            f = (buyHits > sellHits) ? (scanState[i].fibBuy ? "f" : "·") : (scanState[i].fibSell ? "f" : "·");
         }
         RBF = r + b + f;

         // Color by tag
         if      (sigTag == "BUY!")    sigClr = C'0,255,100';
         else if (sigTag == "SELL!")   sigClr = C'255,80,80';
         else if (sigTag == "BUY?")    sigClr = C'150,220,150';
         else if (sigTag == "SELL?")   sigClr = C'220,150,150';
         else if (StringFind(sigTag, "CD") == 0) sigClr = C'255,200,0';
         else if (sigTag == "MAX-POS") sigClr = C'255,140,0';
         else                          sigClr = C'160,160,160';   // SCAN
      } else {
         // watch-only: just show RSI from indicator (no scan info)
         int hRsi = iRSI(sym, effTF, RSIPeriod, PRICE_CLOSE);
         double rsiArr[]; ArraySetAsSeries(rsiArr, true);
         if (hRsi != INVALID_HANDLE) {
            if (CopyBuffer(hRsi, 0, 0, 1, rsiArr) > 0) rsi = rsiArr[0];
            IndicatorRelease(hRsi);
         }
      }

      int posCnt = CountPositions(sym);
      string symShort = StringSubstr(sym, 0, 6);
      string line = StringFormat("%-7s %-6s [%s] $%-10s RSI %5.1f P:%d",
                                  symShort, sigTag, RBF,
                                  DoubleToString(bid, digits),
                                  rsi, posCnt);
      DashLabel("WATCH_" + IntegerToString(i), DASH_X+16, y+22 + i*18, line, sigClr, 8);
   }

   // ── System block ──
   y += 100;
   DashRect("SYS_BG", DASH_X+8, y, DASH_W-16, 56,
            C'18,28,40', C'120,80,255', 1);
   DashLabel("SYS_LBL", DASH_X+16, y+5, "SYSTEM", C'170,140,255', 7);

   string webStatus = (StringLen(WebhookURL) > 10) ? StringFormat("WEB %ds OK", WebPushSec) : "WEB OFF";
   color  webClr    = (StringLen(WebhookURL) > 10) ? C'0,255,200' : C'128,128,128';
   string trade_status = eaPaused ? "▮▮ PAUSED" : "▶ TRADING";
   color  tradeClr  = eaPaused ? C'255,140,0' : C'0,255,100';

   string modeStr = (gSignalMode == 1) ? "⚡EA" : (gSignalMode == 2) ? "🔀BOTH" : "🌐WEB";
   DashLabel("SYS_LINE1", DASH_X+16, y+22,
             StringFormat("%s   %s   MODE:%s", trade_status, webStatus, modeStr),
             tradeClr, 8);
   double portRiskNow = PortfolioRiskPct();
   color portClr = portRiskNow >= MaxPortfolioRiskPct ? C'255,80,80'
                 : portRiskNow >= MaxPortfolioRiskPct*0.7 ? C'255,200,0'
                 : C'160,160,160';
   DashLabel("SYS_LINE2", DASH_X+16, y+38,
             StringFormat("%s  Risk %.1f%%  Port %.1f%%/%.0f%%  R:R 1:%.1f",
                          ScalpMode ? "⚡SCALP" : "🌊SWING",
                          RiskPercent, portRiskNow, MaxPortfolioRiskPct, effRR),
             portClr, 7);

   // ── Footer signal hunt bar ──
   y += 62;
   double cooldownLeft = 0;
   for (int i = 0; i < nActiveSyms; i++) {
      double remain = (double)(effCooldownMin * 60) - (double)(TimeCurrent() - lastSignalTime[i]);
      if (remain > cooldownLeft) cooldownLeft = remain;
   }
   double cdPct = 1.0 - (cooldownLeft / (effCooldownMin * 60.0));
   string bar = ProgressBar(cdPct, 22);
   DashLabel("CD_BAR", DASH_X+16, y+4, "READY " + bar + " " + IntegerToString((int)(cdPct*100)) + "%",
             cdPct >= 1 ? C'0,255,100' : C'255,230,0', 8, "Consolas");

   // ── Phase 19.1: manual BUY/SELL row (trades chart symbol) ──
   y += 22;
   int btnW2 = (DASH_W - 28) / 2;
   DashButton("BTN_BUY",  DASH_X+12,          y, btnW2-4, 22, "▲ BUY " + _Symbol,  C'30,150,70',  C'255,255,255');
   DashButton("BTN_SELL", DASH_X+12+btnW2,    y, btnW2-4, 22, "▼ SELL " + _Symbol, C'180,50,50',  C'255,255,255');

   // ── Phase 15.4: control buttons row ──
   y += 26;
   int btnW = (DASH_W - 32) / 3;
   DashButton("BTN_STOP",   DASH_X+12,             y, btnW-4, 20, "⏸ STOP",   C'120,90,40',  C'255,255,255');
   DashButton("BTN_RESUME", DASH_X+12+btnW,        y, btnW-4, 20, "▶ RESUME", C'40,140,60',  C'255,255,255');
   DashButton("BTN_CLOSE",  DASH_X+12+btnW*2,      y, btnW-4, 20, "✖ CLOSE",  C'200,50,50',  C'255,255,255');
}

// Cleanup dashboard objects on deinit
void RemoveDashboard() {
   ObjectsDeleteAll(0, DASH_PFX);
}

//═══════════════════ WEB BRIDGE ═════════════════════════════════════
void PushToWeb() {
   if (StringLen(WebhookURL) < 10) return;
   if (TimeCurrent() - lastWebPush < WebPushSec) return;
   lastWebPush = TimeCurrent();

   // Build JSON status payload
   string posJson = "";
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (!posInfo.SelectByIndex(i)) continue;
      if (posInfo.Magic() != MagicNumber) continue;
      if (StringLen(posJson) > 0) posJson += ",";
      posJson += StringFormat(
         "{\"sym\":\"%s\",\"side\":\"%s\",\"vol\":%.2f,\"open\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"comment\":\"%s\"}",
         posInfo.Symbol(),
         posInfo.PositionType() == POSITION_TYPE_BUY ? "buy" : "sell",
         posInfo.Volume(),
         posInfo.PriceOpen(),
         posInfo.StopLoss(),
         posInfo.TakeProfit(),
         posInfo.Profit() + posInfo.Swap() + posInfo.Commission(),
         posInfo.Comment()
      );
   }

   // ── Phase 12.3: Real-time prices for Web analysis ──
   string pxJson = BuildPricesJson();

   // Build symbols list: WatchXAU (if set) + Symbol1 + Symbol2 (if enabled)
   string symList = "";
   if (StringLen(WatchXAU) > 0) symList += "\"" + WatchXAU + "\"";
   if (StringLen(Symbol1) > 0) {
      if (StringLen(symList) > 0) symList += ",";
      symList += "\"" + Symbol1 + "\"";
   }
   if (EnableSymbol2 && StringLen(Symbol2) > 0) {
      if (StringLen(symList) > 0) symList += ",";
      symList += "\"" + Symbol2 + "\"";
   }

   // Phase 12.9: per-symbol enabled state (only first nActiveSyms valid)
   string enabledJson = "[";
   for (int e = 0; e < nActiveSyms; e++) {
      if (e > 0) enabledJson += ",";
      enabledJson += StringFormat("{\"sym\":\"%s\",\"on\":%s}",
                                  symbols[e], runEnabled[e] ? "true" : "false");
   }
   enabledJson += "]";

   string json = StringFormat(
      "{\"type\":\"status\",\"secret\":\"%s\",\"ts\":%d,"
      "\"balance\":%.2f,\"equity\":%.2f,\"freeMargin\":%.2f,"
      "\"todayWins\":%d,\"todayLosses\":%d,\"todayPnL\":%.2f,"
      "\"symbols\":[%s],"
      "\"tradeSymbols\":[\"%s\",\"%s\"],"
      "\"watchSymbols\":[\"%s\"],"
      "\"symEnabled\":%s,"
      "\"portfolioRisk\":%.2f,\"maxPortfolioRisk\":%.1f,"
      "\"mode\":\"%s\","
      "\"signalMode\":\"%s\","
      "\"paused\":%s,"
      "\"prices\":%s,"
      "\"positions\":[%s]}",
      WebhookSecret, (int)TimeCurrent(),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_MARGIN_FREE),
      tradesToday_W, tradesToday_L, pnlToday,
      symList,
      Symbol1, Symbol2,
      WatchXAU,
      enabledJson,
      PortfolioRiskPct(), MaxPortfolioRiskPct,
      (ScalpMode ? "scalp" : "swing"),
      (gSignalMode == 1 ? "ea" : gSignalMode == 2 ? "both" : "web"),
      (eaPaused ? "true" : "false"),
      pxJson,
      posJson
   );

   char post[]; StringToCharArray(json, post, 0, StringLen(json));
   char result[]; string headers;
   ResetLastError();
   int code = WebRequest("POST", WebhookURL,
                          "Content-Type: application/json\r\n",
                          5000, post, result, headers);
   if (code != 200) {
      int err = GetLastError();
      if (err == 4014) {
         // URL not in allowed list — silently disable to avoid log spam
         static bool warned = false;
         if (!warned) {
            Print("⚠️ WebRequest blocked — add ", WebhookURL, " to Tools → Options → Expert Advisors → WebRequest allowed URLs");
            warned = true;
         }
      }
   }
}

//═══════════════════ PHASE 12.3: Build prices JSON ═════════════════════
// Outputs live bid/ask + H1 indicators for XAU + Symbol1 + Symbol2.
// Web side uses these as ground truth (replaces external API).
string BuildPriceEntry(string sym) {
   if (!SymbolSelect(sym, true)) return "";
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   if (bid <= 0 || ask <= 0) return "";
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double spread = (ask - bid) / point;

   // Try to grab H1 RSI/ATR (cached for Symbol1/Symbol2; else create temp handle)
   double rsi = 0, atr = 0;
   double bbUp = 0, bbDn = 0, bbMid = 0;

   int hRsi = iRSI(sym, PERIOD_H1, 14, PRICE_CLOSE);
   int hAtr = iATR(sym, PERIOD_H1, 14);
   int hBb  = iBands(sym, PERIOD_H1, 20, 0, 2.0, PRICE_CLOSE);

   if (hRsi != INVALID_HANDLE) {
      double a[]; ArraySetAsSeries(a, true);
      if (CopyBuffer(hRsi, 0, 0, 1, a) > 0) rsi = a[0];
      IndicatorRelease(hRsi);
   }
   if (hAtr != INVALID_HANDLE) {
      double a[]; ArraySetAsSeries(a, true);
      if (CopyBuffer(hAtr, 0, 0, 1, a) > 0) atr = a[0];
      IndicatorRelease(hAtr);
   }
   if (hBb != INVALID_HANDLE) {
      double bU[], bM[], bL[];
      ArraySetAsSeries(bU, true); ArraySetAsSeries(bM, true); ArraySetAsSeries(bL, true);
      if (CopyBuffer(hBb, 1, 0, 1, bU) > 0 &&
          CopyBuffer(hBb, 0, 0, 1, bM) > 0 &&
          CopyBuffer(hBb, 2, 0, 1, bL) > 0) {
         bbUp = bU[0]; bbMid = bM[0]; bbDn = bL[0];
      }
      IndicatorRelease(hBb);
   }

   // Daily change percent
   MqlRates dayRates[]; ArraySetAsSeries(dayRates, true);
   double dayChg = 0;
   if (CopyRates(sym, PERIOD_D1, 0, 2, dayRates) >= 2 && dayRates[1].close > 0) {
      dayChg = (bid - dayRates[1].close) / dayRates[1].close * 100.0;
   }

   string fmt = StringFormat("%%.%df", digits);
   return StringFormat(
      "\"%s\":{\"bid\":" + fmt + ",\"ask\":" + fmt + ",\"spread\":%.1f,"
      "\"rsi\":%.2f,\"atr\":" + fmt + ",\"bbUp\":" + fmt + ",\"bbMid\":" + fmt + ",\"bbDn\":" + fmt + ","
      "\"dayChg\":%.3f,\"digits\":%d}",
      sym, bid, ask, spread, rsi, atr, bbUp, bbMid, bbDn, dayChg, digits
   );
}

string BuildPricesJson() {
   string list[4] = {WatchXAU, Symbol1, Symbol2, WatchBTC};
   string out = "{";
   bool first = true;
   for (int i = 0; i < 4; i++) {
      if (StringLen(list[i]) == 0) continue;
      // Skip duplicates (e.g., if user puts Symbol1 in WatchXAU by mistake)
      bool dup = false;
      for (int j = 0; j < i; j++) if (list[j] == list[i]) { dup = true; break; }
      if (dup) continue;
      string entry = BuildPriceEntry(list[i]);
      if (StringLen(entry) == 0) continue;
      if (!first) out += ",";
      out += entry;
      first = false;
   }
   out += "}";
   return out;
}

//═══════════════════ PHASE 12.4: Remote Command Polling ═══════════════
// EA polls /?action=command every CommandPollSec seconds.
// Commands: close_all, pause, resume, reset_pnl
void PollWebCommands() {
   if (!AllowRemoteControl) return;
   if (StringLen(WebhookURL) < 10) return;
   if (TimeCurrent() - lastCmdPoll < CommandPollSec) return;
   lastCmdPoll = TimeCurrent();

   string url = WebhookURL + "?action=command&secret=" + WebhookSecret + "&since=" + IntegerToString(lastCmdId);
   char post[]; char result[]; string headers;
   ResetLastError();
   int code = WebRequest("GET", url, "", 5000, post, result, headers);
   if (code != 200) return;

   string body = CharArrayToString(result, 0, -1, CP_UTF8);
   if (StringLen(body) < 10) return;

   // Phase C.3: parse news risk on EVERY poll (even when no new command) — bridge
   // attaches "news":{"risk":"HIGH","block":true,...} computed server-side.
   int bp = StringFind(body, "\"block\":");
   if (bp >= 0) {
      string bv = StringSubstr(body, bp + 8, 6);
      gNewsBlocked = (StringFind(bv, "true") >= 0);
      gNewsTime    = TimeCurrent();
      int rp = StringFind(body, "\"risk\":\"");
      if (rp >= 0) { int rs = rp + 8, re = StringFind(body, "\"", rs); if (re > rs) gNewsRisk = StringSubstr(body, rs, re - rs); }
   }

   // Parse simple JSON: {"ok":true,"cmd":"close_all","id":5}
   // Cheap string-based parser (no JSON lib in MQL5 core)
   int idPos = StringFind(body, "\"id\":");
   if (idPos < 0) return;
   int idVal = (int)StringToInteger(StringSubstr(body, idPos + 5, 10));
   if (idVal <= lastCmdId) return;     // already processed

   int cmdPos = StringFind(body, "\"cmd\":\"");
   if (cmdPos < 0) return;
   int cmdStart = cmdPos + 7;
   int cmdEnd = StringFind(body, "\"", cmdStart);
   if (cmdEnd < 0) return;
   string cmd = StringSubstr(body, cmdStart, cmdEnd - cmdStart);

   // Phase 26: command age (anti-stale for AI signals). ts = web epoch ms (UTC).
   int ageSec = 0;
   int tsPos = StringFind(body, "\"ts\":");
   if (tsPos >= 0) {
      long tsMs = (long)StringToInteger(StringSubstr(body, tsPos + 5, 15));
      if (tsMs > 0) {
         long ageMs = (long)TimeGMT() * 1000 - tsMs;
         if (ageMs > 0) ageSec = (int)(ageMs / 1000);
      }
   }

   ExecuteCommand(cmd, ageSec);
   lastCmdId = idVal;
}

void ExecuteCommand(string cmd, int ageSec) {
   if (cmd == "close_all") {
      int closed = CloseAllMyPositions();
      Print("🔴 REMOTE: Close All → closed ", closed, " positions");
   }
   else if (cmd == "pause") {
      eaPaused = true;
      Print("⏸ REMOTE: EA paused (no new trades, existing positions managed)");
   }
   else if (cmd == "resume") {
      eaPaused = false;
      Print("▶️ REMOTE: EA resumed");
   }
   else if (cmd == "reset_pnl") {
      tradesToday_W = 0;
      tradesToday_L = 0;
      pnlToday = 0;
      Print("🔄 REMOTE: Today stats reset");
   }
   // Phase A: switch signal mode from the web (Commander)
   else if (cmd == "mode_web")  { gSignalMode = 0; Print("🌐 REMOTE: signal mode → WEB"); }
   else if (cmd == "mode_ea")   { gSignalMode = 1; Print("⚡ REMOTE: signal mode → EA (local)"); }
   else if (cmd == "mode_both") { gSignalMode = 2; Print("🔀 REMOTE: signal mode → BOTH"); }
   // Phase C: web pushes the chosen combo per pair → combo_<BASE6>_<k1.k2.k3>
   else if (StringFind(cmd, "combo_") == 0) {
      string rest = StringSubstr(cmd, 6);
      int u = StringFind(rest, "_");
      if (u > 0) {
         string base = StringSubstr(rest, 0, u); StringToUpper(base);
         string keysStr = StringSubstr(rest, u + 1);
         int bi = (base == "XAUUSD") ? 0 : (base == "AUDUSD") ? 1 : (base == "EURUSD") ? 2 : -1;
         if (bi >= 0) { gCombo[bi] = keysStr; PrintFormat("🧬 REMOTE: %s combo → %s", base, keysStr); }
      }
   }
   // Phase 12.9: per-symbol enable/disable
   else if (StringFind(cmd, "sym_") == 0) {
      // Format: sym_1_on / sym_1_off / sym_2_on / ...
      int idx = (int)StringToInteger(StringSubstr(cmd, 4, 1)) - 1;  // 1→0, 2→1, 3→2
      bool on = (StringFind(cmd, "_on") > 0);
      if (idx >= 0 && idx < MAX_SYMS && idx < nActiveSyms) {
         runEnabled[idx] = on;
         PrintFormat("🎚 REMOTE: Symbol %d (%s) → %s", idx+1, symbols[idx], (on ? "ON" : "OFF"));
      }
   }
   // Phase 13: AI signal from web — format ai_buy_<SYM> or ai_sell_<SYM>
   else if (StringFind(cmd, "ai_buy_") == 0 || StringFind(cmd, "ai_sell_") == 0) {
      if (gSignalMode == 1) { Print("⚡ EA mode — ignoring web AI signal (EA trades locally)"); return; }
      if (!AcceptWebSignals) { Print("🚫 AI signal received but AcceptWebSignals=false"); return; }
      if (eaPaused)          { Print("⏸ EA paused — ignoring AI signal"); return; }
      // Fail-OPEN on clock skew: only drop when age is inside a believable
      // window. A huge age (> 1 hour) almost always means the PC clock /
      // timezone differs from Google's — in that case DON'T block the signal.
      if (MaxSignalAgeSec > 0 && ageSec > MaxSignalAgeSec && ageSec < 3600) {
         PrintFormat("🕐 AI signal STALE (%ds > %ds) — dropped to avoid bad entry: %s", ageSec, MaxSignalAgeSec, cmd);
         return;
      }
      if (ageSec >= 3600)
         PrintFormat("⏰ signal age %ds looks like clock skew — guard bypassed, executing: %s", ageSec, cmd);
      bool isBuy = (StringFind(cmd, "ai_buy_") == 0);
      string rest = StringSubstr(cmd, isBuy ? 7 : 8);  // "XAUUSDm" or "XAUUSDm_cl"
      string sym = rest, agentTag = "web";
      int us = StringFind(rest, "_");
      if (us > 0) { sym = StringSubstr(rest, 0, us); agentTag = StringSubstr(rest, us + 1); }
      ExecuteAISignal(sym, isBuy, agentTag);
   }
}

// Phase 21.5: base-symbol match so web "XAUUSD" matches broker "XAUUSDm"/"XAUUSD.r" etc.
// Compares the leading 6 chars (XAUUSD/AUDUSD/EURUSD) case-insensitively.
bool SymBaseMatch(string a, string b) {
   string aa = StringSubstr(a, 0, 6); StringToUpper(aa);
   string bb = StringSubstr(b, 0, 6); StringToUpper(bb);
   return (aa == bb);
}

// Phase 13: Execute trade requested by web AI (bypasses cooldown, uses current ATR for SL)
void ExecuteAISignal(string sym, bool isBuy, string agentTag = "web") {
   // Find symbol index in active list (Phase 21.5: tolerant base-symbol match)
   int idx = -1;
   for (int i = 0; i < nActiveSyms; i++) {
      if (symbols[i] == sym || SymBaseMatch(symbols[i], sym)) { idx = i; break; }
   }
   if (idx < 0) {
      PrintFormat("🚫 AI signal for %s — not in EA active symbols, skipped", sym);
      return;
   }
   sym = symbols[idx];   // use the broker's exact symbol name from here on
   if (!runEnabled[idx]) {
      PrintFormat("🚫 AI signal for %s — symbol disabled by user, skipped", sym);
      return;
   }
   if (CountPositions(sym) >= effMaxPos) {
      PrintFormat("🚫 AI signal for %s — max positions reached, skipped", sym);
      return;
   }
   if (PortfolioRiskPct() >= MaxPortfolioRiskPct) {
      PrintFormat("🚫 AI signal for %s — portfolio risk too high, skipped", sym);
      return;
   }

   // Get current ATR for SL distance
   double atrArr[]; ArraySetAsSeries(atrArr, true);
   double rsiArr[]; ArraySetAsSeries(rsiArr, true);
   if (CopyBuffer(atrHandle[idx], 0, 0, 1, atrArr) != 1) return;
   if (CopyBuffer(rsiHandle[idx], 0, 0, 1, rsiArr) != 1) return;

   PrintFormat("🧠 AI SIGNAL: %s %s (bypass cooldown)", sym, isBuy ? "BUY" : "SELL");
   ExecuteTrade(sym, idx, isBuy, atrArr[0], rsiArr[0], agentTag);
   // Don't update lastSignalTime — AI signal is exempt
}

int CloseAllMyPositions() {
   int closed = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) {
      if (!posInfo.SelectByIndex(i)) continue;
      if (posInfo.Magic() != MagicNumber) continue;
      if (trade.PositionClose(posInfo.Ticket())) closed++;
   }
   return closed;
}

//═══════════════════ PHASE A: EA-LOCAL AGENTS (ported from web JS) ═══════════
// Evaluate on CLOSED bars (start index 1) so it mirrors the web's closed-candle
// feed. Parity is approximate (different data source) — validate live vs web.

// UT-Bot — ATR trailing-stop trend (mirror of web UTBotAgent: keyValue 2, ATR 10)
AgentOut AgentUTBot(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 40, r) < 32) return o;       // closed bars only
   int n = ArraySize(r);
   double closes[]; ArrayResize(closes, n);
   for (int i = 0; i < n; i++) closes[i] = r[n-1-i].close;  // oldest → newest

   // ATR(10) simple over true range of the most recent 10 bars
   double sumTR = 0; int cnt = 0;
   for (int i = n-10; i < n; i++) {
      if (i < 1) continue;
      double h = r[n-1-i].high, l = r[n-1-i].low, pc = r[n-1-(i-1)].close;
      sumTR += MathMax(h-l, MathMax(MathAbs(h-pc), MathAbs(l-pc))); cnt++;
   }
   if (cnt == 0) return o;
   double atr = sumTR / cnt;
   double nLoss = 2.0 * atr;

   int start = n - 30; if (start < 1) start = 1;
   double stop = closes[start-1];
   for (int i = start; i < n; i++) {
      double c = closes[i], pc = closes[i-1];
      if (c > stop && pc > stop)      stop = MathMax(stop, c - nLoss);
      else if (c < stop && pc < stop) stop = MathMin(stop, c + nLoss);
      else if (c > stop)              stop = c - nLoss;
      else                            stop = c + nLoss;
   }
   double last = closes[n-1], prev = closes[n-2];
   bool crossUp = (prev <= stop && last > stop);
   bool crossDown = (prev >= stop && last < stop);
   bool above = (last > stop);
   int score = crossUp ? 30 : crossDown ? -30 : above ? 12 : -12;
   // Phase A.1: always directional from the trend bias (above=buy / below=sell);
   // conf is high on a FRESH cross (~89) and lower while just holding (~65),
   // so EvaluateLocalCombo can fire on a strong cross alone OR trend+divergence.
   o.dir  = above ? 1 : -1;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 1.3);
   return o;
}

// Divergence — RSI/MACD vs price over last 20 closed bars (mirror of web DivergenceAgent)
AgentOut AgentDivergence(string sym, ENUM_TIMEFRAMES tf, int idx) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int lb = 20, half = 10;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, lb, r) < lb) return o;
   double H[], L[]; ArrayResize(H, lb); ArrayResize(L, lb);
   for (int i = 0; i < lb; i++) { H[i] = r[lb-1-i].high; L[i] = r[lb-1-i].low; }   // oldest → newest

   // RSI series: reuse the per-symbol RSI handle (period 14, effTF) — each buffer
   // value IS the RSI at that bar. MACD hist: temp handle (12/26/9).
   double rsiB[], mMain[], mSig[];
   ArraySetAsSeries(rsiB, true); ArraySetAsSeries(mMain, true); ArraySetAsSeries(mSig, true);
   int hM = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE);
   if (hM == INVALID_HANDLE) return o;
   bool ok = (CopyBuffer(rsiHandle[idx], 0, 1, lb, rsiB) == lb) &&
             (CopyBuffer(hM, 0, 1, lb, mMain) == lb) &&
             (CopyBuffer(hM, 1, 1, lb, mSig)  == lb);
   IndicatorRelease(hM);
   if (!ok) return o;
   double RS[], HI[]; ArrayResize(RS, lb); ArrayResize(HI, lb);
   for (int i = 0; i < lb; i++) { RS[i] = rsiB[lb-1-i]; HI[i] = mMain[lb-1-i] - mSig[lb-1-i]; }

   double fhMaxP=-1e18, shMaxP=-1e18, fhMinP=1e18, shMinP=1e18;
   double fhMaxR=-1e18, shMaxR=-1e18, fhMinR=1e18, shMinR=1e18;
   double fhMaxH=-1e18, shMaxH=-1e18, fhMinH=1e18, shMinH=1e18;
   for (int i = 0; i < half; i++) {
      fhMaxP=MathMax(fhMaxP,H[i]); fhMinP=MathMin(fhMinP,L[i]);
      fhMaxR=MathMax(fhMaxR,RS[i]); fhMinR=MathMin(fhMinR,RS[i]);
      fhMaxH=MathMax(fhMaxH,HI[i]); fhMinH=MathMin(fhMinH,HI[i]);
   }
   for (int i = half; i < lb; i++) {
      shMaxP=MathMax(shMaxP,H[i]); shMinP=MathMin(shMinP,L[i]);
      shMaxR=MathMax(shMaxR,RS[i]); shMinR=MathMin(shMinR,RS[i]);
      shMaxH=MathMax(shMaxH,HI[i]); shMinH=MathMin(shMinH,HI[i]);
   }
   int score = 0;
   if (shMinP < fhMinP*0.998 && shMinR > fhMinR+2)    score += 25;   // bull RSI div
   if (shMinP < fhMinP*0.998 && shMinH > fhMinH+0.01) score += 20;   // bull MACD div
   if (shMaxP > fhMaxP*1.002 && shMaxR < fhMaxR-2)    score -= 25;   // bear RSI div
   if (shMaxP > fhMaxP*1.002 && shMaxH < fhMaxH-0.01) score -= 20;   // bear MACD div
   if (shMinP > fhMinP*1.002 && shMinR < fhMinR-2)    score += 10;   // hidden bull
   if (shMaxP < fhMaxP*0.998 && shMaxR > fhMaxR+2)    score -= 10;   // hidden bear
   // Phase A.1: directional at score ≥10 (was 20) so divergence confirms more often
   o.dir  = score >= 10 ? 1 : score <= -10 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 1.0);
   return o;
}

// ── Phase B: RSI value agent (mean-reversion w/ trend context, mirror of web) ──
AgentOut AgentRSI(string sym, ENUM_TIMEFRAMES tf, int idx) {
   AgentOut o; o.dir = 0; o.conf = 30;
   double rb[]; ArraySetAsSeries(rb, true);
   if (CopyBuffer(rsiHandle[idx], 0, 1, 1, rb) != 1) return o;
   double rsi = rb[0];
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 60, r) < 55) return o;
   double sma = 0; for (int i = 0; i < 50; i++) sma += r[i].close; sma /= 50;
   bool bull = r[0].close > sma, bear = r[0].close < sma;
   int hA = iADX(sym, tf, 14); double adxv = 20;
   if (hA != INVALID_HANDLE) { double a[]; ArraySetAsSeries(a, true); if (CopyBuffer(hA, 0, 1, 1, a) == 1) adxv = a[0]; IndicatorRelease(hA); }
   bool trending = (adxv >= 22);
   int score = 0;
   if (rsi <= 30 && bull) score += 35;     // oversold in uptrend → buy the dip
   if (rsi >= 70 && bear) score -= 35;     // overbought in downtrend → sell
   if (rsi >= 40 && rsi <= 60 && trending) score += (bull ? 10 : bear ? -10 : 0);
   o.dir  = score >= 25 ? 1 : score <= -25 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 0.45);
   return o;
}

// ── Phase B: MTF trend alignment (H1 + H4 + D1, mirror of web MTFAgent) ──
AgentOut AgentMTF(string sym) {
   AgentOut o; o.dir = 0; o.conf = 30;
   ENUM_TIMEFRAMES tfs[3]; tfs[0] = PERIOD_H1; tfs[1] = PERIOD_H4; tfs[2] = PERIOD_D1;
   int bulls = 0, bears = 0, total = 0; bool dayBull = false, dayBear = false;
   for (int t = 0; t < 3; t++) {
      MqlRates r[]; ArraySetAsSeries(r, true);
      if (CopyRates(sym, tfs[t], 1, 55, r) < 50) continue;
      double sma = 0; for (int i = 0; i < 50; i++) sma += r[i].close; sma /= 50;
      bool bull = r[0].close > sma;
      if (bull) bulls++; else bears++;
      total++;
      if (t == 2) { dayBull = bull; dayBear = !bull; }
   }
   if (total == 0) return o;
   int score = 0;
   if (bulls == total)      score = 40;
   else if (bears == total) score = -40;
   else if (bulls > bears)  score = 15;
   else if (bears > bulls)  score = -15;
   if (total >= 2) { if (dayBull && bulls >= bears) score += 5; if (dayBear && bears >= bulls) score -= 5; }
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score));
   return o;
}

// ── Phase B batch 2: structural agents (ported from web JS) ──

// Ichimoku — price vs cloud + Tenkan/Kijun (uses MT5 native iIchimoku)
AgentOut AgentIchimoku(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int h = iIchimoku(sym, tf, 9, 26, 52);
   if (h == INVALID_HANDLE) return o;
   double tk[], kj[], sa[], sb[];
   ArraySetAsSeries(tk, true); ArraySetAsSeries(kj, true); ArraySetAsSeries(sa, true); ArraySetAsSeries(sb, true);
   bool ok = (CopyBuffer(h,0,1,1,tk)==1 && CopyBuffer(h,1,1,1,kj)==1 && CopyBuffer(h,2,1,1,sa)==1 && CopyBuffer(h,3,1,1,sb)==1);
   IndicatorRelease(h);
   if (!ok) return o;
   double close = iClose(sym, tf, 1);
   double cloudTop = MathMax(sa[0], sb[0]), cloudBot = MathMin(sa[0], sb[0]);
   int score = 0;
   if (close > cloudTop) score += 20; else if (close < cloudBot) score -= 20;
   if (tk[0] > kj[0])    score += 15; else if (tk[0] < kj[0])    score -= 15;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 1.0);
   return o;
}

// Liquidity Sweep — wick beyond 19-bar swing then close back (exact port)
AgentOut AgentSweep(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 21, r) < 21) return o;     // r[0]=last closed, r[1..19]=swing window
   double swingHi = -1e18, swingLo = 1e18;
   for (int i = 1; i <= 19; i++) { swingHi = MathMax(swingHi, r[i].high); swingLo = MathMin(swingLo, r[i].low); }
   bool bullSweep = (r[0].low  < swingLo && r[0].close > swingLo);
   bool bearSweep = (r[0].high > swingHi && r[0].close < swingHi);
   int score = bullSweep ? 28 : bearSweep ? -28 : 0;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score));
   return o;
}

// Order Block — nearest demand/supply zone (bearish candle before swing low =
// bull OB; bullish candle before swing high = bear OB). Simplified port.
AgentOut AgentOrderBlock(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   int got = CopyRates(sym, tf, 1, 50, r);
   if (got < 30) return o;
   int n = ArraySize(r);
   double close = r[0].close;
   int loIdx = 0, hiIdx = 0;
   for (int i = 1; i < n; i++) { if (r[i].low < r[loIdx].low) loIdx = i; if (r[i].high > r[hiIdx].high) hiIdx = i; }
   int score = 0;
   // bull OB: last bearish candle just OLDER than the swing low (higher series index)
   for (int j = loIdx + 1; j <= MathMin(n - 1, loIdx + 5); j++) {
      if (r[j].close < r[j].open) { if (close >= r[j].low && close <= r[j].high * 1.02) score += 25; break; }
   }
   // bear OB: last bullish candle just older than the swing high
   for (int j = hiIdx + 1; j <= MathMin(n - 1, hiIdx + 5); j++) {
      if (r[j].close > r[j].open) { if (close <= r[j].high && close >= r[j].low * 0.98) score -= 25; break; }
   }
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 0.9);
   return o;
}

// SMC — structure (EMA20 vs EMA50) + Break of Structure + Order-Block bias
AgentOut AgentSMC(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int h20 = iMA(sym, tf, 20, 0, MODE_EMA, PRICE_CLOSE), h50 = iMA(sym, tf, 50, 0, MODE_EMA, PRICE_CLOSE);
   if (h20 == INVALID_HANDLE || h50 == INVALID_HANDLE) return o;
   double e20[], e50[]; ArraySetAsSeries(e20, true); ArraySetAsSeries(e50, true);
   bool ok = (CopyBuffer(h20,0,1,1,e20)==1 && CopyBuffer(h50,0,1,1,e50)==1);
   IndicatorRelease(h20); IndicatorRelease(h50);
   if (!ok) return o;
   int score = 0;
   if (e20[0] > e50[0]) score += 20; else if (e20[0] < e50[0]) score -= 20;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 21, r) >= 21) {
      double swHigh = -1e18, swLow = 1e18;
      for (int i = 5; i <= 19; i++) { swHigh = MathMax(swHigh, r[i].high); swLow = MathMin(swLow, r[i].low); }
      if (r[0].close > swHigh && r[1].close <= swHigh) score += 25;   // BOS up
      if (r[0].close < swLow  && r[1].close >= swLow)  score -= 25;   // BOS down
   }
   AgentOut ob = AgentOrderBlock(sym, tf);
   score += ob.dir * 15;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 0.4);
   return o;
}

//═══════════════════ PHASE C.2: FVG + DXY + FIRM SNIPER ═══════════════════

// 🟦 Fair Value Gap — 3-candle imbalance (price tends to fill). want>0=bull, <0=bear.
//    Bull FVG: low of newer candle > high of older candle (gap up, demand imbalance).
bool HasFVG(MqlRates &r[], int want) {
   int n = ArraySize(r);
   int lim = MathMin(n - 2, 18);
   for (int k = 1; k < lim; k++) {
      if (want > 0 && r[k].low > r[k+2].high) {             // bullish gap [r[k+2].high .. r[k].low]
         if (r[0].close >= r[k+2].high) return true;        // still unfilled (price above gap base)
      }
      if (want < 0 && r[k].high < r[k+2].low) {             // bearish gap [r[k].high .. r[k+2].low]
         if (r[0].close <= r[k+2].low) return true;
      }
   }
   return false;
}

// 🟦 FVG soft-vote agent
AgentOut AgentFVG(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 30, r) < 20) return o;
   bool bull = HasFVG(r, +1), bear = HasFVG(r, -1);
   int score = (bull ? 25 : 0) + (bear ? -25 : 0);
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(90.0, 50 + MathAbs(score) * 0.9);
   return o;
}

// Synthetic USD index trend (no broker DXY needed). >0 USD strong, <0 USD weak.
// Quote pairs (EURUSD..) up = USD weak; base pairs (USDJPY..) up = USD strong.
double gUsdTrend = 0; datetime gUsdTrendTime = 0;
string SymSuffix() { return (StringLen(Symbol1) > 6) ? StringSubstr(Symbol1, 6) : ""; }
double PairMom(string pair) {
   double c[]; ArraySetAsSeries(c, true);
   if (CopyClose(pair, PERIOD_H1, 0, 21, c) < 21) return 0.0;
   if (c[20] == 0) return 0.0;
   return (c[0] - c[20]) / c[20] * 100.0;
}
double UsdTrend() {
   if (TimeCurrent() - gUsdTrendTime < 60) return gUsdTrend;   // cache 60s
   string suf = SymSuffix();
   string quote[] = {"EURUSD","GBPUSD","AUDUSD","NZDUSD"};
   string base[]  = {"USDJPY","USDCHF","USDCAD"};
   double sum = 0; int cnt = 0;
   for (int i = 0; i < ArraySize(quote); i++) {
      string p = quote[i] + suf; if (!SymbolSelect(p, true)) continue;
      double m = PairMom(p); if (m == 0) continue; sum += -m; cnt++;
   }
   for (int i = 0; i < ArraySize(base); i++) {
      string p = base[i] + suf; if (!SymbolSelect(p, true)) continue;
      double m = PairMom(p); if (m == 0) continue; sum += m; cnt++;
   }
   gUsdTrend = (cnt == 0) ? 0.0 : sum / cnt;
   gUsdTrendTime = TimeCurrent();
   return gUsdTrend;
}

// 🏛 DXY macro soft-vote agent (for XXXUSD pairs): USD weak → buy, USD strong → sell
AgentOut AgentDXY(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   double usd = UsdTrend();
   if (usd < -DxyDeadband)      o.dir = 1;
   else if (usd > DxyDeadband)  o.dir = -1;
   o.conf = MathMin(90.0, 50 + MathAbs(usd) * 25);
   return o;
}

// 🎯 FIRM SNIPER — hard-filter confluence (ALL must pass). EA-local = 4 layers
//    (news filter is web-only). Fires conf 95 ONLY on full confluence.
//    1) Liquidity Sweep  2) Discount/Premium  3) OB + FVG  4) Macro DXY ไม่สวน
AgentOut AgentSniper(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;

   // Layer 0 (5th filter): NEWS — งดเทรดช่วงข่าวแรง (จาก bridge, web calendar).
   // honor only if fresh (<10 min); stale = fail-open so a dropped poll won't freeze it.
   if (FirmSniperUseNews && gNewsBlocked && (TimeCurrent() - gNewsTime < 600)) return o;

   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 55, r) < 55) return o;
   double close = r[0].close;

   // Layer 1: Liquidity sweep (20-bar swing)
   double swingHi = -1e18, swingLo = 1e18;
   for (int i = 1; i <= 19; i++) { swingHi = MathMax(swingHi, r[i].high); swingLo = MathMin(swingLo, r[i].low); }
   bool bullSweep = (r[0].low  < swingLo && r[0].close > swingLo);
   bool bearSweep = (r[0].high > swingHi && r[0].close < swingHi);

   // Layer 2: Premium / Discount (50-bar range)
   double hi = -1e18, lo = 1e18;
   for (int i = 0; i < 50; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
   double rangePos  = (hi > lo) ? (close - lo) / (hi - lo) : 0.5;
   bool isDiscount  = (rangePos <= 0.40);
   bool isPremium   = (rangePos >= 0.60);

   // Layer 3: Entry trigger = Order Block + Fair Value Gap (same direction)
   AgentOut ob = AgentOrderBlock(sym, tf);
   bool nearBullOB = (ob.dir > 0), nearBearOB = (ob.dir < 0);
   bool hasBullFVG = HasFVG(r, +1), hasBearFVG = HasFVG(r, -1);

   // Layer 4: Macro DXY alignment
   double usd = UsdTrend();
   bool dxyOkBuy  = (usd <= DxyDeadband);    // USD not strengthening
   bool dxyOkSell = (usd >= -DxyDeadband);   // USD not weakening

   bool buyConfluence  = bullSweep && isDiscount && nearBullOB && hasBullFVG && dxyOkBuy;
   bool sellConfluence = bearSweep && isPremium  && nearBearOB && hasBearFVG && dxyOkSell;

   if (buyConfluence)       { o.dir = 1;  o.conf = 95; }
   else if (sellConfluence) { o.dir = -1; o.conf = 95; }
   return o;
}

//═══════════════ PHASE C.7: web-parity agents (real MT5 data) ═══════════════
// 🎈 Bollinger — mean-reversion + squeeze/expansion (iBands 20,2)
AgentOut AgentBollinger(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int h = iBands(sym, tf, 20, 0, 2.0, PRICE_CLOSE);
   if (h == INVALID_HANDLE) return o;
   double up[], mid[], lo[]; ArraySetAsSeries(up, true); ArraySetAsSeries(mid, true); ArraySetAsSeries(lo, true);
   bool ok = (CopyBuffer(h, 1, 1, 6, up) == 6 && CopyBuffer(h, 0, 1, 6, mid) == 6 && CopyBuffer(h, 2, 1, 6, lo) == 6);
   IndicatorRelease(h);
   if (!ok || mid[0] == 0) return o;
   MqlRates r[]; ArraySetAsSeries(r, true); if (CopyRates(sym, tf, 1, 1, r) < 1) return o;
   double last = r[0].close;
   double bw = (up[0] - lo[0]) / mid[0] * 100.0, avg = 0;
   for (int i = 0; i < 6; i++) avg += (up[i] - lo[i]) / mid[i] * 100.0;
   avg /= 6.0;
   bool squeeze = bw < avg * 0.7, expanding = bw > avg * 1.3;
   double score = 0;
   if (last > up[0]) score -= 15; if (last < lo[0]) score += 15;
   if (squeeze) score *= 0.5;
   if (expanding && last > mid[0]) score += 10; if (expanding && last < mid[0]) score -= 10;
   o.dir  = score >= 15 ? 1 : score <= -15 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 1.1);
   return o;
}
// 📈 MACD — momentum crossover (iMACD 12,26,9)
AgentOut AgentMACD(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int h = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE);
   if (h == INVALID_HANDLE) return o;
   double m[], s[]; ArraySetAsSeries(m, true); ArraySetAsSeries(s, true);
   bool ok = (CopyBuffer(h, 0, 1, 2, m) == 2 && CopyBuffer(h, 1, 1, 2, s) == 2);
   IndicatorRelease(h);
   if (!ok) return o;
   double hN = m[0] - s[0], hP = m[1] - s[1];
   bool bull = hP < 0 && hN > 0, bear = hP > 0 && hN < 0, rising = hN > hP, above = m[0] > 0;
   double score = 0;
   if (bull) score += 30; if (bear) score -= 30;
   if (rising && above) score += 15; if (!rising && !above) score -= 15;
   if (above && rising) score += 5; if (!above && !rising) score -= 5;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 0.7);
   return o;
}
// 🕯 Pattern — engulfing / hammer / star at range extremes (3-candle + 20-bar context)
AgentOut AgentPattern(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 22, r) < 22) return o;
   MqlRates c2 = r[0], c1 = r[1], c0 = r[2];
   double b2 = MathAbs(c2.close - c2.open), b1 = MathAbs(c1.close - c1.open), b0 = MathAbs(c0.close - c0.open);
   double up2 = c2.high - MathMax(c2.open, c2.close), lo2 = MathMin(c2.open, c2.close) - c2.low;
   bool bull2 = c2.close > c2.open, bear2 = c2.close < c2.open;
   bool bull1 = c1.close > c1.open, bear1 = c1.close < c1.open;
   bool bull0 = c0.close > c0.open, bear0 = c0.close < c0.open;
   double hi = -1e18, lo = 1e18; for (int i = 1; i <= 19; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
   double posR = (hi > lo) ? (c2.close - lo) / (hi - lo) : 0.5;
   bool atTop = posR >= 0.75, atBot = posR <= 0.25;
   double score = 0;
   if (bear1 && bull2 && c2.open <= c1.close && c2.close >= c1.open && b2 > b1 * 1.5) score = atBot ? 28 : 8;
   else if (bull1 && bear2 && c2.open >= c1.close && c2.close <= c1.open && b2 > b1 * 1.5) score = atTop ? -28 : -8;
   else if (lo2 > b2 * 3 && up2 < b2 * 0.3 && atBot) score = 25;
   else if (up2 > b2 * 3 && lo2 < b2 * 0.3 && atTop) score = -25;
   else if (bear0 && b1 < b0 * 0.4 && bull2 && c2.close > (c0.open + c0.close) / 2) score = atBot ? 32 : 15;
   else if (bull0 && b1 < b0 * 0.4 && bear2 && c2.close < (c0.open + c0.close) / 2) score = atTop ? -32 : -15;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score));
   return o;
}
// 📐 Fibonacci — nearest retracement of 50-bar swing, aligned with EMA trend
AgentOut AgentFib(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if (CopyRates(sym, tf, 1, 50, r) < 20) return o;
   double hi = -1e18, lo = 1e18; int n = ArraySize(r);
   for (int i = 0; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
   double range = hi - lo; if (range <= 0) return o;
   double last = r[0].close, ratios[5] = {0.236, 0.382, 0.5, 0.618, 0.786};
   int near = 0; double nd = 1e18;
   for (int i = 0; i < 5; i++) { double lvl = hi - ratios[i] * range, dist = MathAbs(last - lvl); if (dist < nd) { nd = dist; near = i; } }
   double nearPct = nd / range * 100.0;
   int trend = 0;
   int h20 = iMA(sym, tf, 20, 0, MODE_EMA, PRICE_CLOSE), h50 = iMA(sym, tf, 50, 0, MODE_EMA, PRICE_CLOSE);
   if (h20 != INVALID_HANDLE && h50 != INVALID_HANDLE) {
      double e20[], e50[]; ArraySetAsSeries(e20, true); ArraySetAsSeries(e50, true);
      if (CopyBuffer(h20, 0, 1, 1, e20) == 1 && CopyBuffer(h50, 0, 1, 1, e50) == 1) trend = e20[0] > e50[0] ? 1 : e20[0] < e50[0] ? -1 : 0;
      IndicatorRelease(h20); IndicatorRelease(h50);
   }
   double ratio = ratios[near]; bool golden = (near == 3), half = (near == 2), shallow = (near <= 1);
   double score = 0;
   if (trend > 0 && ratio >= 0.5) score += golden ? 40 : half ? 25 : 15;
   if (trend < 0 && ratio <= 0.5) score -= golden ? 40 : half ? 25 : (shallow ? 15 : 0);
   if (nearPct > 2) score *= 0.5;
   o.dir  = score >= 20 ? 1 : score <= -20 ? -1 : 0;
   o.conf = MathMin(95.0, 50 + MathAbs(score) * 0.5);
   return o;
}
// 🌊 Elliott (proxy) — impulse = EMA trend aligned with EMA20 slope over 3 bars
AgentOut AgentElliott(string sym, ENUM_TIMEFRAMES tf) {
   AgentOut o; o.dir = 0; o.conf = 30;
   int h20 = iMA(sym, tf, 20, 0, MODE_EMA, PRICE_CLOSE), h50 = iMA(sym, tf, 50, 0, MODE_EMA, PRICE_CLOSE);
   if (h20 == INVALID_HANDLE || h50 == INVALID_HANDLE) return o;
   double e20[], e50[]; ArraySetAsSeries(e20, true); ArraySetAsSeries(e50, true);
   bool ok = (CopyBuffer(h20, 0, 1, 3, e20) == 3 && CopyBuffer(h50, 0, 1, 3, e50) == 3);
   IndicatorRelease(h20); IndicatorRelease(h50);
   if (!ok) return o;
   int trend = e20[0] > e50[0] ? 1 : e20[0] < e50[0] ? -1 : 0;
   bool slopeUp = (e20[0] > e20[1] && e20[1] > e20[2]);
   bool slopeDn = (e20[0] < e20[1] && e20[1] < e20[2]);
   double score = 0;
   if (trend > 0 && slopeUp) score += 35;
   if (trend < 0 && slopeDn) score -= 35;
   o.dir  = score >= 25 ? 1 : score <= -25 ? -1 : 0;
   o.conf = MathMin(90.0, 55 + MathAbs(score) * 0.6);
   return o;
}

// Dispatch an agent by key (all 18 web agents now ported — EA = same brain, real data)
AgentOut AgentByKey(string key, string sym, ENUM_TIMEFRAMES tf, int idx) {
   if (key == "fvg")        return AgentFVG(sym, tf);
   if (key == "dxy")        return AgentDXY(sym, tf);
   if (key == "sniper")     return AgentSniper(sym, tf);
   if (key == "utbot")      return AgentUTBot(sym, tf);
   if (key == "divergence") return AgentDivergence(sym, tf, idx);
   if (key == "rsi")        return AgentRSI(sym, tf, idx);
   if (key == "mtf")        return AgentMTF(sym);
   if (key == "ichimoku")   return AgentIchimoku(sym, tf);
   if (key == "sweep")      return AgentSweep(sym, tf);
   if (key == "orderblock") return AgentOrderBlock(sym, tf);
   if (key == "smc")        return AgentSMC(sym, tf);
   if (key == "bollinger")  return AgentBollinger(sym, tf);
   if (key == "macd")       return AgentMACD(sym, tf);
   if (key == "pattern")    return AgentPattern(sym, tf);
   if (key == "fib")        return AgentFib(sym, tf);
   if (key == "elliott")    return AgentElliott(sym, tf);
   AgentOut o; o.dir = 0; o.conf = 0; return o;   // unknown key
}

// Per-symbol combo = the pair's KB-best agents (mirror of web pair combos).
void GetComboKeys(string sym, string &keys[]) {
   string b = StringSubstr(sym, 0, 6); StringToUpper(b);
   int bi = (b == "XAUUSD") ? 0 : (b == "AUDUSD") ? 1 : (b == "EURUSD") ? 2 : -1;
   // Phase C: if the web (Commander/GEMINI) pushed a combo for this pair, use it
   if (bi >= 0 && StringLen(gCombo[bi]) > 0) { StringSplit(gCombo[bi], '.', keys); return; }
   // Phase C.2: FirmSniper hard-filter mode — one mega-agent on every pair
   if (EAUseFirmSniper) { ArrayResize(keys, 1); keys[0] = "sniper"; return; }
   // defaults (until the web pushes one)
   // Defaults retuned to KB 459k winners (EA-supported agents only):
   if (b == "AUDUSD")      { ArrayResize(keys, 3); keys[0]="utbot"; keys[1]="smc";       keys[2]="ichimoku"; } // UT-Bot+98 SMC+37 Ichi+15
   else if (b == "EURUSD") { ArrayResize(keys, 3); keys[0]="utbot"; keys[1]="rsi";       keys[2]="sweep";    } // UT-Bot+62 RSI+25
   else if (b == "XAUUSD") { ArrayResize(keys, 3); keys[0]="elliott"; keys[1]="fvg";     keys[2]="bollinger"; } // Elliott+43 FVG+41 Bollinger+18 (web winners, now in EA)
   else                    { ArrayResize(keys, 3); keys[0]="utbot"; keys[1]="smc";       keys[2]="rsi";      }
}

// EA-local combo (Phase B): aggregate the symbol's combo agents. Fire only on
// CONFLUENCE — ≥2 agents agree on direction AND none oppose — avg conf ≥ LocalMinConf.
// Commander (web) still controls via runEnabled[] / eaPaused / risk / cooldown.
void EvaluateLocalCombo(string sym, int idx) {
   if (eaPaused) return;
   if (CountPositions(sym) >= effMaxPos) return;
   if (PortfolioRiskPct() >= MaxPortfolioRiskPct) return;
   if (TimeCurrent() - lastSignalTime[idx] < effCooldownMin * 60) return;

   string keys[]; GetComboKeys(sym, keys);
   int votesBuy = 0, votesSell = 0; double confSum = 0; string detail = "";
   for (int k = 0; k < ArraySize(keys); k++) {
      AgentOut a = AgentByKey(keys[k], sym, effTF, idx);
      if (a.dir == 0) continue;
      if (a.dir > 0) votesBuy++; else votesSell++;
      confSum += a.conf;
      detail += keys[k] + (a.dir > 0 ? "+ " : "- ");
   }
   int net = 0, agree = 0;
   // Single-agent combo (e.g. FirmSniper hard-filter) fires on its own confluence;
   // multi-agent combos still require ≥2 agree + no opposition.
   int needAgree = (ArraySize(keys) == 1) ? 1 : 2;
   if (votesBuy >= needAgree && votesSell == 0)      { net = 1;  agree = votesBuy; }
   else if (votesSell >= needAgree && votesBuy == 0) { net = -1; agree = votesSell; }
   else return;                               // need confluence (≥needAgree agree + no opposition)
   double conf = confSum / agree;
   if (conf < LocalMinConf) return;

   bool isBuy = (net > 0);
   double atrArr[], rsiArr[];
   ArraySetAsSeries(atrArr, true); ArraySetAsSeries(rsiArr, true);
   if (CopyBuffer(atrHandle[idx], 0, 0, 1, atrArr) != 1) return;
   if (CopyBuffer(rsiHandle[idx], 0, 0, 1, rsiArr) != 1) return;

   PrintFormat("⚡ LOCAL COMBO %s %s | %d agents agree [%s] conf %.0f",
               sym, isBuy ? "BUY" : "SELL", agree, detail, conf);
   ExecuteTrade(sym, idx, isBuy, atrArr[0], rsiArr[0], "local");
   lastSignalTime[idx] = TimeCurrent();
}

//═══════════════════ PHASE 12.6: Live Training Loop ═══════════════════
// Capture trade context on entry + send result on close → Web KB learns
void OnTradeTransaction(const MqlTradeTransaction& trans,
                       const MqlTradeRequest& request,
                       const MqlTradeResult& result) {
   if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if (!HistoryDealSelect(trans.deal)) return;
   if (HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != MagicNumber) return;

   long entryType = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);

   if (entryType == DEAL_ENTRY_IN) {
      // Position OPENING — snapshot context
      CaptureOpenContext(trans.deal);
   }
   else if (entryType == DEAL_ENTRY_OUT) {
      // Phase 26 FIX: a PARTIAL close also fires DEAL_ENTRY_OUT. If the position
      // still exists, it was a partial (runner open) — do NOT send a trade record
      // or clear the partial flag (that would let it re-partial repeatedly).
      ulong pid = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
      if (PositionSelectByTicket(pid)) {
         Print("💰 Partial close — runner still open; record/flag kept until full close");
         return;
      }
      // FULL close — record the trade + clear the partial-TP flag
      SendTradeRecord(trans.deal);
      GlobalVariableDel("TWR_PART_" + IntegerToString((long)pid));
   }
}

void CaptureOpenContext(ulong dealTicket) {
   string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   long type  = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   double entry = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   ulong posId  = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

   // Compute indicator context
   double rsi = 50, bbPos = 0.5;
   double bbU[], bbL[];
   ArraySetAsSeries(bbU, true); ArraySetAsSeries(bbL, true);

   int hRsi = iRSI(sym, effTF, RSIPeriod, PRICE_CLOSE);
   int hBb  = iBands(sym, effTF, BBPeriod, 0, BBDeviation, PRICE_CLOSE);
   if (hRsi != INVALID_HANDLE) {
      double a[]; ArraySetAsSeries(a, true);
      if (CopyBuffer(hRsi, 0, 0, 1, a) > 0) rsi = a[0];
      IndicatorRelease(hRsi);
   }
   if (hBb != INVALID_HANDLE) {
      if (CopyBuffer(hBb, 1, 0, 1, bbU) > 0 && CopyBuffer(hBb, 2, 0, 1, bbL) > 0) {
         double range = bbU[0] - bbL[0];
         if (range > 0) bbPos = (entry - bbL[0]) / range;
      }
      IndicatorRelease(hBb);
   }

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskUSD = bal * RiskPercent / 100.0;

   // Get SL + agent tag from position (just opened). Comment = TWR-<B|S>-<tag>-R<rsi>
   double sl = 0; string cmt = "";
   if (PositionSelectByTicket(posId)) { sl = PositionGetDouble(POSITION_SL); cmt = PositionGetString(POSITION_COMMENT); }
   string _pp[]; string agentTag = "ea";
   if (StringSplit(cmt, '-', _pp) >= 3 && StringLen(_pp[2]) > 0) agentTag = _pp[2];

   // Append to openCtx
   ArrayResize(openCtx, openCtxCount + 1);
   openCtx[openCtxCount].ticket   = posId;
   openCtx[openCtxCount].sym      = sym;
   openCtx[openCtxCount].side     = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
   openCtx[openCtxCount].entry    = entry;
   openCtx[openCtxCount].sl       = sl;
   openCtx[openCtxCount].rsiAtEntry = rsi;
   openCtx[openCtxCount].bbPosAtEntry = bbPos;
   MqlDateTime _tm; TimeToStruct(TimeCurrent(), _tm);
   openCtx[openCtxCount].sessionAtEntry = IsLondonNYSession() ? (_tm.hour < 13 ? "london" : "ny") : "asia";
   openCtx[openCtxCount].openTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   openCtx[openCtxCount].riskUSD  = riskUSD;
   openCtx[openCtxCount].agentTag = agentTag;
   openCtxCount++;
}

void SendTradeRecord(ulong dealTicket) {
   string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   double exit = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
                  + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
                  + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   ulong posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

   // Find context — match by position ID
   int ctxIdx = -1;
   for (int i = 0; i < openCtxCount; i++) {
      if (openCtx[i].ticket == posId) { ctxIdx = i; break; }
   }

   string side = "?";
   double entry = 0, rsiAtEntry = 50, bbPosAtEntry = 0.5;
   string sessionAtEntry = "?";
   datetime openTime = 0;
   double riskUSD = 0;
   string agentTag = "ea";
   if (ctxIdx >= 0) {
      side           = openCtx[ctxIdx].side;
      entry          = openCtx[ctxIdx].entry;
      rsiAtEntry     = openCtx[ctxIdx].rsiAtEntry;
      bbPosAtEntry   = openCtx[ctxIdx].bbPosAtEntry;
      sessionAtEntry = openCtx[ctxIdx].sessionAtEntry;
      openTime       = openCtx[ctxIdx].openTime;
      riskUSD        = openCtx[ctxIdx].riskUSD;
      agentTag       = openCtx[ctxIdx].agentTag;
   }

   // R-multiple = profit / risk_USD
   double rMult = (riskUSD > 0) ? (profit / riskUSD) : (profit > 0 ? 1.0 : -1.0);
   string outcome = profit > 0 ? "win" : (profit < 0 ? "loss" : "breakeven");

   string json = StringFormat(
      "{\"type\":\"trade\",\"secret\":\"%s\","
      "\"sym\":\"%s\",\"side\":\"%s\","
      "\"entry\":%.5f,\"exit\":%.5f,\"profit\":%.2f,\"rMult\":%.3f,"
      "\"outcome\":\"%s\","
      "\"rsiAtEntry\":%.2f,\"bbPosAtEntry\":%.3f,\"sessionAtEntry\":\"%s\","
      "\"agent\":\"%s\","
      "\"openTime\":%d,\"closeTime\":%d,\"posId\":%I64u}",
      WebhookSecret, sym, side, entry, exit, profit, rMult, outcome,
      rsiAtEntry, bbPosAtEntry, sessionAtEntry,
      agentTag,
      (int)openTime, (int)closeTime, posId
   );

   PostToBridge(json);

   // Remove from openCtx
   if (ctxIdx >= 0) {
      for (int i = ctxIdx; i < openCtxCount - 1; i++) openCtx[i] = openCtx[i+1];
      openCtxCount--;
      ArrayResize(openCtx, openCtxCount);
   }

   Print(StringFormat("📚 LIVE TRADE recorded: %s %s entry %.5f → exit %.5f | %s %.2fR ($%.2f)",
         sym, side, entry, exit, outcome, rMult, profit));
}

void PostToBridge(string json) {
   if (StringLen(WebhookURL) < 10) return;
   char post[]; StringToCharArray(json, post, 0, StringLen(json));
   char result[]; string headers;
   ResetLastError();
   WebRequest("POST", WebhookURL, "Content-Type: application/json\r\n", 5000, post, result, headers);
}
