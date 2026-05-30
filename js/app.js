/* ═══════════════════════════════════════════════════════
   TRADING WAR ROOM — Main Application Controller
   ═══════════════════════════════════════════════════════ */

const TradingWarRoom = {
  market:    null,
  goldTeam:  null,
  fxTeam:    null,
  commander: null,

  prevPrices: {},
  tickCount:  0,
  updateMs:   4000,   // full analysis refresh
  tickMs:     800,    // price tick

  init() {
    // Create market engine + teams
    this.market    = new MarketEngine();
    this.goldTeam  = new GoldTeam();
    this.fxTeam    = new CurrencyTeam();
    this.btcTeam   = new BtcTeam();      // ₿ 24/7 crypto desk
    this.commander = new Commander();

    // First render
    this.fullUpdate();
    UI.updateClock();

    // Schedule updates
    setInterval(() => this.priceTick(),   this.tickMs);
    setInterval(() => this.fullUpdate(),  this.updateMs);
    setInterval(() => UI.updateClock(),   1000);

    // Real-price feed loop (separate cadence to respect API rate limits)
    this._realPriceLoop();

    // Real candle HISTORY — once on boot + every 4 hours (was 1 hour; reduced API usage)
    // Cache 5min ใน sessionStorage จึงไม่ refetch ซ้ำเร็วๆ
    this._loadRealHistory();
    setInterval(() => this._loadRealHistory(), 4 * 60 * 60 * 1000);

    // Mark live
    document.getElementById('live-status').textContent = 'LIVE';

    // Keep-Alive: ป้องกัน tab sleep + browser notification
    if (Settings.get('keepAlive', true) && typeof KeepAlive !== 'undefined') {
      KeepAlive.enable().then(() => {
        const s = KeepAlive.status();
        this._log('CMD', 'KeepAlive', `🔋 ${s.wakeLockActive ? 'Wake Lock ✅' : 'Wake Lock ❌'} | Notif: ${s.notifPermission}`);
      });
    }

    // Daily news summary — ส่งวันละครั้ง (เก็บใน localStorage วันที่ล่าสุดที่ส่ง)
    this._dailyNewsCheck();
    setInterval(() => this._dailyNewsCheck(), 60 * 60 * 1000); // เช็คทุก 1 ชม.

    // Upcoming news warning — ตรวจทุก 30 นาที ส่งเตือนถ้ามีข่าว high ใน 1 ชม.
    this._upcomingNewsCheck();
    setInterval(() => this._upcomingNewsCheck(), 30 * 60 * 1000);
    // MT5 Bot Bridge — start polling if URL configured
    if (typeof BotBridge !== 'undefined' && Settings.get('botBridgeURL', '').length > 20) {
      BotBridge.start();
      this._log('CMD', 'BotBridge', '🤖 MT5 Bot Bridge polling enabled.');
    }

    this._log('CMD', 'Commander', '🟢 Trading War Room initialized. All agents ONLINE.');
    this._log('GOLD', 'Maj.Gold', '⚡ GOLD TEAM ready — monitoring XAUUSD.');
    this._log('FX', 'Maj.FX', '💱 CURRENCY TEAM ready — monitoring AUDUSD & EURUSD.');
  },

  priceTick() {
    this.market.tick();
    this.tickCount++;

    const prices = {
      XAUUSD: this.market.prices.XAUUSD,
      AUDUSD: this.market.prices.AUDUSD,
      EURUSD: this.market.prices.EURUSD,
      BTCUSD: this.market.prices.BTCUSD,
    };

    UI.updateTicker(prices);
    UI.updatePriceTags(prices, this.prevPrices);

    // Update header prices
    const xauEl = document.getElementById('price-xau');
    const audEl = document.getElementById('price-aud');
    const eurEl = document.getElementById('price-eur');
    if (xauEl) xauEl.querySelector('.val').textContent = prices.XAUUSD.toFixed(2);
    if (audEl) audEl.querySelector('.val').textContent = prices.AUDUSD.toFixed(4);
    if (eurEl) eurEl.querySelector('.val').textContent = prices.EURUSD.toFixed(4);

    // Update API rate indicator (show both minute + daily)
    const rateEl = document.getElementById('api-rate');
    if (rateEl && typeof RateLimiter !== 'undefined') {
      const s = RateLimiter.status();
      const daily = RateLimiter.dailyUsed();
      const dailyPct = (daily / RateLimiter.DAILY_LIMIT * 100).toFixed(0);
      rateEl.innerHTML = `API: ${s.recent}/${s.max} · ${daily}/${RateLimiter.DAILY_LIMIT} (${dailyPct}%)`;
      const dailyOver = dailyPct >= 90;
      const minuteHigh = s.recent >= s.max;
      rateEl.style.color = dailyOver ? 'var(--red)' : minuteHigh ? 'var(--yellow)' : daily > 500 ? 'var(--orange)' : 'var(--gray)';
    }
  },

  fullUpdate() {
    const goldData = this.market.getData('XAUUSD');
    const audData  = this.market.getData('AUDUSD');
    const eurData  = this.market.getData('EURUSD');

    // Run teams (pass market so MTF agent can access cached MTF data)
    const goldR = this.goldTeam.analyze(goldData, this.market);
    const fxR   = this.fxTeam.analyze(audData, eurData, this.market);
    const cmdR  = this.commander.decide(goldR, fxR);

    // Grade the signal
    const gradeInfo = SignalGrade.grade(cmdR, goldR, fxR);

    // Confluence — check multi-category agreement (trend+momentum+structure+pattern)
    const leadAgents = cmdR.sym === 'XAUUSD'
      ? goldR.agents
      : (cmdR.sym === 'AUDUSD' ? fxR.aud?.agents : fxR.eur?.agents);
    const confluence = Confluence.analyze(leadAgents, cmdR.signal);
    gradeInfo.confluence = confluence;

    // Top-Down MTF Analysis — เทรดเดอร์ตัวจริงดูยังไง
    if (typeof TopDownAnalyzer !== 'undefined' && (cmdR.signal === 'buy' || cmdR.signal === 'sell')) {
      const mode = Settings.get('tradeMode', 'swing');
      cmdR.topDown = TopDownAnalyzer.analyze(cmdR.sym, mode, leadAgents, this.market, cmdR.signal);
      // ปรับ grade ตาม top-down verdict
      if (cmdR.topDown.verdict.includes('SKIP')) {
        gradeInfo.grade = 'D';
        gradeInfo.alert = false;
      } else if (cmdR.topDown.verdict.includes('WAIT')) {
        // demote 1 step
        const order = ['D','C','B','A','S+'];
        const idx = order.indexOf(gradeInfo.grade);
        if (idx > 0) gradeInfo.grade = order[idx - 1];
      } else if (cmdR.topDown.verdict.includes('STRONG GO')) {
        // boost 1 step
        const order = ['D','C','B','A','S+'];
        const idx = order.indexOf(gradeInfo.grade);
        if (idx < order.length - 1) gradeInfo.grade = order[idx + 1];
        gradeInfo.alert = (gradeInfo.grade === 'A' || gradeInfo.grade === 'S+');
      }
    }

    // Adaptive Playbook — session + volatility + symbol-specific check
    if (typeof AdaptiveStrategy !== 'undefined' && (cmdR.signal === 'buy' || cmdR.signal === 'sell')) {
      const leadCandles = this.market.candles[cmdR.sym];
      const playbook = AdaptiveStrategy.qualityCheck({
        symbol: cmdR.sym,
        signal: cmdR.signal,
        confluenceScore: confluence.score,
        candles: leadCandles,
      });
      cmdR.playbook = playbook;
      // Demote grade if playbook fails
      if (!playbook.pass && gradeInfo.grade !== 'D') {
        const order = ['D','C','B','A','S+'];
        const idx = order.indexOf(gradeInfo.grade);
        if (idx > 0) gradeInfo.grade = order[idx - 1];
        gradeInfo.playbookDemoted = true;
      }
    }
    // Adjust grade based on confluence
    if (cmdR.signal === 'buy' || cmdR.signal === 'sell') {
      gradeInfo.grade = Confluence.adjustGrade(gradeInfo.grade, confluence.score);
      // Recompute alert flag (A/S+ trigger banner)
      gradeInfo.alert = (gradeInfo.grade === 'A' || gradeInfo.grade === 'S+');
      gradeInfo.sound = gradeInfo.alert;
    }

    cmdR.gradeInfo = gradeInfo;

    // Snapshot ALL agent votes for journal tracking (Phase 2 — adaptive learning data)
    const snapshot = (label, ag) => ag ? { agent: label, signal: ag.signal, conf: ag.conf } : null;
    cmdR._agentVotes = [
      snapshot('Gold-SMC',       goldR.agents.smc),
      snapshot('Gold-Elliott',   goldR.agents.elliott),
      snapshot('Gold-Fib',       goldR.agents.fib),
      snapshot('Gold-RSI',       goldR.agents.rsi),
      snapshot('Gold-MACD',      goldR.agents.macd),
      snapshot('Gold-Bollinger', goldR.agents.bollinger),
      snapshot('Gold-Pivot',     goldR.agents.pivot),
      snapshot('Gold-Pattern',   goldR.agents.pattern),
      snapshot('Gold-News',      goldR.agents.news),
      snapshot('AUD-SMC',        fxR.aud?.agents?.smc),
      snapshot('AUD-MACD',       fxR.aud?.agents?.macd),
      snapshot('EUR-SMC',        fxR.eur?.agents?.smc),
      snapshot('EUR-MACD',       fxR.eur?.agents?.macd),
    ].filter(Boolean);

    // Phase 15.1: stash latest reports for Company View
    this.lastGold = goldR;
    this.lastFX   = fxR;
    try { this.lastBTC = this.btcTeam.analyze(this.market.getData('BTCUSD'), this.market); } catch (e) { this.lastBTC = null; }
    this.lastCmd  = cmdR;
    if (typeof Company !== 'undefined' && document.getElementById('modal-company')?.style.display === 'flex') {
      Company.refresh();
    }
    if (typeof Office !== 'undefined' && document.getElementById('modal-office')?.style.display === 'flex') {
      Office.refresh();
    }

    // Render UI
    UI.renderGoldTeam(goldR);
    UI.renderCurrencyTeam(fxR);
    UI.renderCommander(cmdR);

    // Phase 21: Trader roster on main dashboard (3 head traders w/ skills)
    if (typeof Company !== 'undefined' && Company.renderTraders) {
      const rb = document.getElementById('trader-roster-body');
      if (rb) rb.innerHTML = Company.renderTraders();
      // Phase 21.6: per-pair head-trader signals (opt-in)
      if (Company.traderSignalsTick) Company.traderSignalsTick(goldR, fxR);
    }

    // Render big banner + grade badge
    SignalGrade.renderBanner(cmdR, gradeInfo);

    // Save prices
    this.prevPrices = { ...this.market.prices };

    // Log significant changes
    this._logAgentUpdates(goldR, fxR, cmdR);

    // Telegram: ส่งทุก buy/sell signal — Telegram.notify เช็ค minGrade เอง
    if ((cmdR.signal === 'buy' || cmdR.signal === 'sell') && this._lastGrade !== gradeInfo.grade) {
      Telegram.notify(cmdR, gradeInfo);
      UI.addLog('CMD', 'Commander', `📤 GRADE ${gradeInfo.grade} — ${cmdR.signal.toUpperCase()} ${cmdR.sym} @ ${cmdR.entry}`);

      // Phase 13: Send AI signal to EA when Grade ≥ A (user must opt-in via Settings)
      // Phase 21.6: skip Commander single-send when trader-driven mode is on
      //            (each head trader fires its own pair instead — see traderSignalsTick)
      const traderDriven = (typeof Settings !== 'undefined') && Settings.get('traderDrivenSignals', false);
      if (gradeInfo.alert && !traderDriven && typeof BotBridge !== 'undefined') {
        BotBridge.sendAISignal(cmdR.sym, cmdR.signal);
      }
    }

    // Banner + เสียง: เฉพาะ A/S+ (high-confidence visual alert)
    if (gradeInfo.alert && this._lastGrade !== gradeInfo.grade) {
      SignalGrade.playSound(gradeInfo);
      // Native browser notification (เสริม Telegram)
      if (typeof KeepAlive !== 'undefined') {
        KeepAlive.notify(
          `${gradeInfo.grade} ${cmdR.signal.toUpperCase()} ${cmdR.sym}`,
          `Entry ${cmdR.entry} | SL ${cmdR.sl} | TP1 ${cmdR.tp1} | Conf ${cmdR.conf}%`,
          { tag: 'twr-grade-' + gradeInfo.grade, requireInteraction: gradeInfo.grade === 'S+' }
        );
      }
    }

    this._lastGrade = gradeInfo.grade;

    if (cmdR.signal === 'buy' || cmdR.signal === 'sell') {
      const cmdEl = document.getElementById('commander-panel');
      if (cmdEl) {
        cmdEl.classList.add('alert-flash');
        setTimeout(() => cmdEl.classList.remove('alert-flash'), 1500);
      }
    }
  },

  _logAgentUpdates(goldR, fxR, cmdR) {
    const logQueue = [
      { team:'GOLD', agent:'SMC-Gold',     msg: goldR.agents.smc?.log },
      { team:'GOLD', agent:'Elliott-Gold', msg: goldR.agents.elliott?.log },
      { team:'GOLD', agent:'Fib-Gold',     msg: goldR.agents.fib?.log },
      { team:'GOLD', agent:'RSI-Gold',     msg: goldR.agents.rsi?.log },
      { team:'FX',   agent:'SMC-AUD',      msg: fxR.aud?.agents?.smc?.log },
      { team:'FX',   agent:'SMC-EUR',      msg: fxR.eur?.agents?.smc?.log },
      { team:'FX',   agent:'News-FX',      msg: fxR.news?.log },
      { team:'CMD',  agent:'Commander',    msg: cmdR.summary },
    ];

    // Rotate through logs (show 2-3 per update to avoid flooding)
    const start = (this.tickCount * 3) % logQueue.length;
    const show  = logQueue.slice(start, start + 3);
    show.forEach(l => { if (l.msg) this._log(l.team, l.agent, l.msg); });
  },

  _log(team, agent, msg) {
    UI.addLog(team, agent, msg);
  },

  async _loadRealHistory() {
    if (!Settings.get('priceFeedOn')) return;
    const onApps = this.market._onAppsScript();
    const key    = Settings.get('priceApiKey');
    if (!onApps && !key) return;

    for (const sym of ['XAUUSD', 'AUDUSD', 'EURUSD']) {
      try {
        const h = await this.market.fetchHistory(sym, '5min', 300, key);  // Phase 22.5: more context (was 200)
        if (h && h.length > 50) {
          this.market.applyHistory(sym, h);
          this._log('CMD', 'DataLoader', `📊 Loaded ${h.length} real 5m candles for ${sym}`);
        }
      } catch (e) { /* silent */ }
    }

    // Load MTF candles too (1h, 4h, Daily) — populates market._mtfData
    await this._loadMTF();
  },

  async _dailyNewsCheck() {
    if (!Settings.get('telegramOn')) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastSent = localStorage.getItem('twr_news_last');
    if (lastSent === today) return;

    // ส่งช่วง 7-9 UTC (Asia session) — หรือถ้า boot ครั้งแรกหลัง 7 UTC
    const h = new Date().getUTCHours();
    if (h < 7) return;

    const r = await Telegram.sendDailyNews();
    if (r && r.ok) {
      localStorage.setItem('twr_news_last', today);
      this._log('CMD', 'NewsBot', '📰 ส่งสรุปข่าววันนี้แล้ว');
    }
  },

  async _upcomingNewsCheck() {
    if (!Settings.get('telegramOn')) return;
    // เก็บ event ที่ส่ง warning ไปแล้วใน session
    if (!this._sentNewsWarnings) this._sentNewsWarnings = new Set();
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) return;

    const newsAgent = new NewsAgent('ALL', ['XAU','USD','AUD','EUR','GBP']);
    const events = newsAgent._calendar();
    const now = new Date();
    const nowDec = now.getUTCHours() + now.getUTCMinutes() / 60;

    const enabledCurr = ['USD'];
    if (Settings.get('enableXAU', true)) enabledCurr.push('XAU');
    if (Settings.get('enableAUD', true)) enabledCurr.push('AUD');
    if (Settings.get('enableEUR', true)) enabledCurr.push('EUR');

    const upcoming = events.filter(e => {
      if (e.impact !== 'high') return false;
      if (!enabledCurr.some(p => e.curr.includes(p))) return false;
      const [eh, em] = e.time.split(':').map(Number);
      const eDec = eh + em / 60;
      const diff = eDec - nowDec;
      return diff > 0 && diff <= 1;
    });

    for (const e of upcoming) {
      const key = day + '_' + e.time + '_' + e.event;
      if (this._sentNewsWarnings.has(key)) continue;
      this._sentNewsWarnings.add(key);
      await Telegram.sendUpcomingNews(1);
      this._log('CMD', 'NewsBot', `🚨 เตือนข่าวก่อน 1 ชม: ${e.event}`);
      break; // ส่งครั้งเดียวต่อรอบ
    }
  },

  async _loadMTF() {
    if (!Settings.get('enableMTF', true)) return;
    if (!Settings.get('priceFeedOn'))     return;
    const onApps = this.market._onAppsScript();
    const key    = Settings.get('priceApiKey');
    if (!onApps && !key) return;

    const TFs = ['1h', '4h', '1day'];
    for (const sym of ['XAUUSD', 'AUDUSD', 'EURUSD']) {
      for (const tf of TFs) {
        try {
          const h = await this.market.fetchHistory(sym, tf, 60, key);
          if (h && h.length >= 20) {
            this.market.applyMTF(sym, tf, h);
          }
        } catch (e) { /* silent */ }
        // RateLimiter inside fetchHistory handles throttling
      }
    }
    this._log('CMD', 'DataLoader', `⏰ Loaded MTF candles (1h+4h+D) for all symbols`);
  },

  async _realPriceLoop() {
    const refresh = async () => {
      if (!Settings.get('priceFeedOn')) return;
      const onApps   = this.market._onAppsScript();
      const provider = Settings.get('apiProvider', 'twelvedata');
      const key      = Settings.get('priceApiKey');
      const bridge   = Settings.get('botBridgeURL', '');
      // Gate per provider: ea_bridge needs URL; others need key (unless server-side)
      if (provider === 'ea_bridge' && (!bridge || bridge.length < 20)) return;
      if (provider !== 'ea_bridge' && !onApps && !key) return;

      try {
        const px = await this.market.fetchRealPrices(key);
        if (px && isFinite(px.XAUUSD) && isFinite(px.AUDUSD) && isFinite(px.EURUSD)) {
          this.market.applyRealPrices(px);
          const tag = provider === 'ea_bridge' ? '🤖 EA' : '📡 Real';
          this._log('CMD', 'PriceFeed', `${tag} prices: XAU ${px.XAUUSD.toFixed(2)} | AUD ${px.AUDUSD.toFixed(4)} | EUR ${px.EURUSD.toFixed(4)}`);
        }
      } catch (e) { /* silent */ }
    };

    // ea_bridge can poll faster (no rate limit). Others ≥60s.
    const provider = Settings.get('apiProvider', 'twelvedata');
    const minPoll  = provider === 'ea_bridge' ? 15 : 60;
    const interval = Math.max(minPoll, Settings.get('priceRefreshSec', 120));

    setTimeout(refresh, 2000);
    setInterval(() => refresh(), interval * 1000);
  },
};

// Boot when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if (typeof I18n !== 'undefined') I18n.init();
  TradingWarRoom.init();
  // Phase 18: open Office as landing if user set it as home
  if (typeof Settings !== 'undefined' && Settings.get('homeView', 'dashboard') === 'office') {
    setTimeout(() => { if (typeof Modal !== 'undefined') Modal.open('office'); }, 800);
  }
});
