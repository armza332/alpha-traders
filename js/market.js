/* ═══════════════════════════════════════════════════════
   MARKET ENGINE - Price simulation + Technical Analysis
   ═══════════════════════════════════════════════════════ */

/* ─── Persistent Rate Limiter + Daily Quota Guard ──
   - Per-minute: 5/min (safety margin from 8/min limit)
   - Per-day: track usage, auto-pause at 90% */
const RateLimiter = {
  KEY: 'twr_rate_calls',
  DAILY_KEY: 'twr_daily_calls',
  DAILY_LIMIT: 800,  // Twelve Data free plan
  PAUSE_AT_PCT: 90,  // หยุดอัตโนมัติเมื่อใช้ 90%
  maxPerMin: 5,

  /** เพิ่ม daily counter — reset ที่ midnight UTC */
  _trackDaily() {
    const today = new Date().toISOString().slice(0, 10);
    let data = { date: today, count: 0 };
    try {
      const raw = localStorage.getItem(this.DAILY_KEY);
      if (raw) data = JSON.parse(raw);
      if (data.date !== today) data = { date: today, count: 0 };
    } catch {}
    data.count++;
    localStorage.setItem(this.DAILY_KEY, JSON.stringify(data));
    return data.count;
  },

  dailyUsed() {
    try {
      const raw = localStorage.getItem(this.DAILY_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) return 0;
      return data.count || 0;
    } catch { return 0; }
  },

  /** ห้ามยิงถ้าใกล้หมด — auto-pause */
  quotaOK() {
    const used = this.dailyUsed();
    const pct = used / this.DAILY_LIMIT * 100;
    if (pct >= this.PAUSE_AT_PCT) {
      console.warn(`⛔ Daily quota ${pct.toFixed(0)}% used (${used}/${this.DAILY_LIMIT}) — pausing API calls`);
      return false;
    }
    return true;
  },

  _load() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch { return []; }
  },
  _save(calls) {
    try { localStorage.setItem(this.KEY, JSON.stringify(calls)); } catch {}
  },

  async wait() {
    // Daily quota check first
    if (!this.quotaOK()) {
      throw new Error('QUOTA_EXCEEDED');
    }
    const now = Date.now();
    let calls = this._load().filter(t => now - t < 60000);
    if (calls.length >= this.maxPerMin) {
      const oldest = calls[0];
      const waitMs = 60000 - (now - oldest) + 1000;
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
      calls = this._load().filter(t => Date.now() - t < 60000);
    }
    calls.push(Date.now());
    this._save(calls);
    this._trackDaily();
  },

  status() {
    const now = Date.now();
    const recent = this._load().filter(t => now - t < 60000);
    return { recent: recent.length, max: this.maxPerMin };
  },
};
if (typeof window !== 'undefined') window.RateLimiter = RateLimiter;

/* ─── History cache (5 min, sessionStorage — ไม่ refetch ซ้ำซ้อน) ─── */
const HistoryCache = {
  CACHE_MS: 5 * 60 * 1000,
  _key(symbol, interval, size) { return `twr_hist_${symbol}_${interval}_${size}`; },

  get(symbol, interval, size) {
    try {
      const raw = sessionStorage.getItem(this._key(symbol, interval, size));
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < this.CACHE_MS) return data;
    } catch {}
    return null;
  },
  set(symbol, interval, size, data) {
    try {
      sessionStorage.setItem(this._key(symbol, interval, size),
        JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  },
};
if (typeof window !== 'undefined') window.HistoryCache = HistoryCache;

class MarketEngine {
  constructor() {
    this.symbols = {
      XAUUSD: { base: 4571.00, pip: 0.01,  digits: 3, atr: 8.5,   trend: 0.0002 },
      AUDUSD: { base: 0.6452,  pip: 0.0001, digits: 5, atr: 0.0035, trend: 0.00001 },
      EURUSD: { base: 1.0853,  pip: 0.0001, digits: 5, atr: 0.0055, trend: -0.00001 },
      BTCUSD: { base: 108000,  pip: 1,      digits: 2, atr: 1800,   trend: 0.0003 },   // 24/7 crypto desk
    };

    this.candles  = {};
    this.prices   = {};
    this.dxyPrice = null;    // Phase 14: DXY (US Dollar Index) — fetched or inferred
    this.dxyTrend = null;    // +N = strong USD, -N = weak USD

    for (const sym in this.symbols) {
      this.candles[sym] = this._genHistory(sym, 600);   // Phase 25.7: more bars so backtest finds enough trades w/o API
      this.prices[sym]  = this.candles[sym].at(-1).close;
    }
  }

  _genHistory(sym, n) {
    const cfg = this.symbols[sym];
    const candles = [];
    let price = cfg.base * (1 + (Math.random() - 0.5) * 0.005);
    let trend = cfg.trend;
    let vol   = cfg.atr;

    for (let i = 0; i < n; i++) {
      // Volatility clustering
      vol = vol * 0.95 + cfg.atr * 0.05 + (Math.random() - 0.5) * cfg.atr * 0.3;
      vol = Math.max(cfg.atr * 0.4, Math.min(vol, cfg.atr * 2.5));

      // Random walk with momentum
      trend = trend * 0.98 + (Math.random() - 0.5) * cfg.atr * 0.0005;

      const o = price;
      const move = trend + (Math.random() - 0.5) * vol;
      const c = o + move;
      const h = Math.max(o, c) + Math.random() * vol * 0.5;
      const l = Math.min(o, c) - Math.random() * vol * 0.5;
      const v = Math.floor(1000 + Math.random() * 9000);

      candles.push({ open: o, high: h, low: l, close: c, volume: v, ts: Date.now() - (n - i) * 5 * 60000 });
      price = c;
    }
    return candles;
  }

  tick() {
    for (const sym in this.symbols) {
      const cfg = this.symbols[sym];
      const prev = this.candles[sym].at(-1);
      const move = (Math.random() - 0.499) * cfg.atr * 0.15;
      const newClose = prev.close + move;
      const newHigh  = Math.max(prev.high, newClose + Math.random() * cfg.atr * 0.1);
      const newLow   = Math.min(prev.low,  newClose - Math.random() * cfg.atr * 0.1);

      this.candles[sym][this.candles[sym].length - 1] = {
        ...prev,
        high: newHigh, low: newLow, close: newClose,
        volume: prev.volume + Math.floor(Math.random() * 200),
        ts: Date.now(),
      };
      this.prices[sym] = newClose;

      // New candle every ~60 ticks (1 min bar)
      if (Math.random() < 0.016) {
        this.candles[sym].push({
          open: newClose, high: newClose, low: newClose, close: newClose,
          volume: 0, ts: Date.now(),
        });
        if (this.candles[sym].length > 700) this.candles[sym].shift();   // Phase 25.7: keep enough bars for backtest
      }
    }
  }

  getData(sym) {
    return { candles: [...this.candles[sym]], price: this.prices[sym], sym, cfg: this.symbols[sym] };
  }

  /** Detect Apps Script env */
  _onAppsScript() { return typeof google !== 'undefined' && google.script && google.script.run; }

  /** Fetch real prices — route to correct provider */
  async fetchRealPrices(apiKey) {
    if (this._onAppsScript()) {
      return new Promise((resolve) => {
        google.script.run
          .withSuccessHandler(r => resolve(r || null))
          .withFailureHandler(() => resolve(null))
          .fetchRealPrices();
      });
    }
    const provider = typeof Settings !== 'undefined' ? Settings.get('apiProvider', 'twelvedata') : 'twelvedata';
    if (provider === 'ea_bridge')   return this._fetchEABridge_Prices();
    if (provider === 'oanda')       return this._fetchOANDA_Prices();
    if (provider === 'yahoo')       return this._fetchYahoo_Prices();
    if (provider === 'frankfurter') return this._fetchFrankfurter_Prices();
    return this._fetchTwelveData_Prices(apiKey);
  }

  /** Phase 12.3 — EA Bridge: real-time prices straight from MT5 EA via Apps Script.
   *  Pros: zero CORS, broker-quality, no rate limit, free.
   *  Cons: needs MT5 running + Apps Script deployed. */
  async _fetchEABridge_Prices() {
    const url = typeof Settings !== 'undefined' ? Settings.get('botBridgeURL', '') : '';
    if (!url || url.length < 20) {
      console.warn('EA Bridge: botBridgeURL not configured');
      return null;
    }
    try {
      const r = await fetch(url + '?action=prices&t=' + Date.now());
      const data = await r.json();
      if (!data.ok || !data.prices) return null;
      // Cache full payload (RSI/ATR/BB) for analysis use
      this.lastEABridge = data;
      // Map symbol keys: AUDUSDm/AUDUSDc → AUDUSD
      const stripSuffix = (k) => k.replace(/[mczr]$/i, '');
      const px = {};
      for (const sym in data.prices) {
        const norm = stripSuffix(sym);   // XAUUSDm → XAUUSD
        const p = data.prices[sym];
        const mid = (p.bid + p.ask) / 2;
        if (norm.startsWith('XAU')) px.XAUUSD = mid;
        else if (norm.startsWith('AUD')) px.AUDUSD = mid;
        else if (norm.startsWith('EUR')) px.EURUSD = mid;
        else if (norm.startsWith('BTC')) px.BTCUSD = mid;   // 🪙 from WatchBTC feed
      }
      // Fallback: keep existing if a symbol missing
      px.XAUUSD = px.XAUUSD || this.prices.XAUUSD;
      px.AUDUSD = px.AUDUSD || this.prices.AUDUSD;
      px.EURUSD = px.EURUSD || this.prices.EURUSD;
      if (px.BTCUSD == null) delete px.BTCUSD;   // BTC optional — only anchor if EA sent it
      if (!isFinite(px.XAUUSD) || !isFinite(px.AUDUSD) || !isFinite(px.EURUSD)) return null;
      return px;
    } catch (e) {
      console.error('EA Bridge fetch failed', e);
      return null;
    }
  }

  /** Frankfurter — ECB data, forex only, no key, CORS works.
   *  ไม่มี XAU (gold) → ใช้ราคา simulator ของ gold */
  async _fetchFrankfurter_Prices() {
    try {
      // Get AUD/USD: 1 AUD = X USD (from=AUD,to=USD)
      const audRes = await fetch('https://api.frankfurter.app/latest?from=AUD&to=USD');
      const audData = await audRes.json();
      const eurRes = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
      const eurData = await eurRes.json();
      const px = {
        AUDUSD: audData.rates?.USD,
        EURUSD: eurData.rates?.USD,
        XAUUSD: this.prices.XAUUSD,  // fallback to current (Frankfurter ไม่มี gold)
      };
      if (!isFinite(px.AUDUSD) || !isFinite(px.EURUSD)) return null;
      return px;
    } catch (e) { return null; }
  }

  /** Try direct fetch first, fall back to CORS proxy if blocked */
  async _yahooFetch(url) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) { /* CORS or network */ }
    // Try CORS proxies (free public services)
    const proxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
    ];
    for (const p of proxies) {
      try {
        const r = await fetch(p + encodeURIComponent(url));
        if (r.ok) return await r.json();
      } catch (e) { /* try next */ }
    }
    return null;
  }

  async _fetchYahoo_Prices() {
    const symbols = { XAUUSD: 'XAUUSD=X', AUDUSD: 'AUDUSD=X', EURUSD: 'EURUSD=X' };
    const px = {};
    for (const [ourSym, ySym] of Object.entries(symbols)) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?interval=1m&range=1d`;
      const data = await this._yahooFetch(url);
      if (!data) continue;
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice ?? meta?.previousClose;
      if (isFinite(price)) px[ourSym] = price;
    }
    if (Object.keys(px).length < 3) return null;
    return px;
  }

  async _fetchTwelveData_Prices(apiKey) {
    if (!apiKey) return null;
    try {
      await RateLimiter.wait();
      const url = `https://api.twelvedata.com/price?symbol=XAU/USD,AUD/USD,EUR/USD&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url);
      const data = await r.json();
      const px = {
        XAUUSD: parseFloat(data['XAU/USD']?.price),
        AUDUSD: parseFloat(data['AUD/USD']?.price),
        EURUSD: parseFloat(data['EUR/USD']?.price),
      };
      if (!isFinite(px.XAUUSD) || !isFinite(px.AUDUSD) || !isFinite(px.EURUSD)) return null;
      return px;
    } catch (e) { return null; }
  }

  async _fetchOANDA_Prices() {
    const token  = Settings.get('oandaToken');
    const acctId = Settings.get('oandaAccountId');
    if (!token || !acctId) return null;
    try {
      const url = `https://api-fxpractice.oanda.com/v3/accounts/${acctId}/pricing?instruments=XAU_USD,AUD_USD,EUR_USD`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      if (!data.prices) return null;
      const px = {};
      data.prices.forEach(p => {
        const bid = parseFloat(p.bids?.[0]?.price);
        const ask = parseFloat(p.asks?.[0]?.price);
        const mid = (bid + ask) / 2;
        const sym = p.instrument.replace('_', '');
        if (isFinite(mid)) px[sym] = mid;
      });
      if (!isFinite(px.XAUUSD) || !isFinite(px.AUDUSD) || !isFinite(px.EURUSD)) return null;
      return px;
    } catch (e) { return null; }
  }

  /** Fetch candle HISTORY (replaces simulator candles entirely) — with cache */
  async fetchHistory(symbol, interval = '5min', size = 200, apiKey = null) {
    // Browser cache first (saves API call)
    const cached = HistoryCache.get(symbol, interval, size);
    if (cached) return cached;

    if (this._onAppsScript()) {
      return new Promise((resolve) => {
        google.script.run
          .withSuccessHandler(r => {
            if (r) HistoryCache.set(symbol, interval, size, r);
            resolve(r || null);
          })
          .withFailureHandler(() => resolve(null))
          .fetchHistory(symbol, interval, size);
      });
    }
    const provider = typeof Settings !== 'undefined' ? Settings.get('apiProvider', 'twelvedata') : 'twelvedata';
    let result;
    if (provider === 'oanda') {
      result = await this._fetchOANDA_History(symbol, interval, size);
    } else if (provider === 'yahoo') {
      result = await this._fetchYahoo_History(symbol, interval, size);
    } else {
      result = await this._fetchTwelveData_History(symbol, interval, size, apiKey);
    }
    if (result) HistoryCache.set(symbol, interval, size, result);
    return result;
  }

  async _fetchYahoo_History(symbol, interval, size) {
    // Map our interval to Yahoo Finance
    const ivMap = { '1min':'1m', '5min':'5m', '15min':'15m', '30min':'30m', '1h':'1h', '4h':'1h', '1day':'1d' };
    const ySym  = { XAUUSD:'XAUUSD=X', AUDUSD:'AUDUSD=X', EURUSD:'EURUSD=X' }[symbol] || symbol;
    const yInterval = ivMap[interval] || '1h';
    // Range mapping — choose enough history
    const rangeMap = { '1m':'1d', '5m':'5d', '15m':'5d', '30m':'1mo', '1h':'1mo', '1d':'1y' };
    const range = rangeMap[yInterval] || '1mo';

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?interval=${yInterval}&range=${range}`;
      const data = await this._yahooFetch(url);
      if (!data) return null;
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const ts = result.timestamp || [];
      const q  = result.indicators?.quote?.[0];
      if (!q) return null;
      const candles = ts.map((t, i) => ({
        open:   q.open?.[i],
        high:   q.high?.[i],
        low:    q.low?.[i],
        close:  q.close?.[i],
        volume: q.volume?.[i] || 1000,
        ts:     t * 1000,
      })).filter(c => isFinite(c.open) && isFinite(c.close));
      // For 4h, aggregate 1h candles
      if (interval === '4h') {
        const agg = [];
        for (let i = 0; i < candles.length; i += 4) {
          const slice = candles.slice(i, i + 4);
          if (slice.length === 0) continue;
          agg.push({
            open:   slice[0].open,
            high:   Math.max(...slice.map(c => c.high)),
            low:    Math.min(...slice.map(c => c.low)),
            close:  slice.at(-1).close,
            volume: slice.reduce((s, c) => s + c.volume, 0),
            ts:     slice[0].ts,
          });
        }
        return agg.slice(-size);
      }
      return candles.slice(-size);
    } catch (e) { return null; }
  }

  async _fetchTwelveData_History(symbol, interval, size, apiKey) {
    if (!apiKey) return null;
    try {
      await RateLimiter.wait();
      const tdSym = symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2');
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval}&outputsize=${size}&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url);
      const data = await r.json();
      if (!data.values || data.status === 'error') return null;
      return data.values.reverse().map(v => ({
        open:   parseFloat(v.open),
        high:   parseFloat(v.high),
        low:    parseFloat(v.low),
        close:  parseFloat(v.close),
        volume: parseFloat(v.volume) || 1000,
        ts:     new Date(v.datetime).getTime(),
      })).filter(c => isFinite(c.close));
    } catch (e) { return null; }
  }

  async _fetchOANDA_History(symbol, interval, count) {
    const token = Settings.get('oandaToken');
    if (!token) return null;
    // Map interval → OANDA granularity
    const granMap = { '1min':'M1','5min':'M5','15min':'M15','30min':'M30','1h':'H1','4h':'H4','1day':'D' };
    const granularity = granMap[interval] || 'H1';
    const oandaInst = symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1_$2');
    try {
      const url = `https://api-fxpractice.oanda.com/v3/instruments/${oandaInst}/candles?granularity=${granularity}&count=${Math.min(500, count)}&price=M`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      if (!data.candles) return null;
      return data.candles.filter(c => c.complete).map(c => ({
        open:   parseFloat(c.mid.o),
        high:   parseFloat(c.mid.h),
        low:    parseFloat(c.mid.l),
        close:  parseFloat(c.mid.c),
        volume: c.volume || 1000,
        ts:     new Date(c.time).getTime(),
      })).filter(c => isFinite(c.close));
    } catch (e) { return null; }
  }

  /** Replace simulator candles with real history */
  applyHistory(symbol, candles) {
    if (!candles || candles.length === 0) return false;
    this.candles[symbol] = candles;
    this.prices[symbol]  = candles[candles.length - 1].close;
    if (this.symbols[symbol]) this.symbols[symbol].base = this.prices[symbol];
    return true;
  }

  /** Multi-timeframe cache — populated by app.js, read by MTFAgent */
  _mtfData = { XAUUSD: {}, AUDUSD: {}, EURUSD: {}, BTCUSD: {} };

  applyMTF(symbol, tf, candles) {
    if (!candles || candles.length < 20) return;
    const closes = candles.map(c => c.close);
    const ema20  = TA.ema(closes, 20);
    const ema50  = TA.ema(closes, Math.min(50, closes.length));
    this._mtfData[symbol] = this._mtfData[symbol] || {};
    this._mtfData[symbol][tf] = {
      close: closes.at(-1),
      ema20: ema20.at(-1),
      ema50: ema50.at(-1),
      trend: closes.at(-1) > ema20.at(-1) ? 'bull' : 'bear',
      strong: Math.abs(closes.at(-1) - ema20.at(-1)) > Math.abs(ema20.at(-1) - ema50.at(-1)),
    };
  }

  getMTF(symbol) { return this._mtfData[symbol] || {}; }

  /** Apply real prices — adjust simulator base + latest candle */
  applyRealPrices(prices) {
    Object.keys(prices).forEach(sym => {
      const newPx = prices[sym];
      if (!newPx || !this.symbols[sym]) return;
      const candles = this.candles[sym];
      const last    = candles.at(-1);
      // Slide last candle to real price (preserve OHL relationship)
      const delta = newPx - last.close;
      last.close = newPx;
      last.high  = Math.max(last.high,  newPx);
      last.low   = Math.min(last.low,   newPx);
      this.prices[sym] = newPx;
      // Re-base simulator config so future ticks drift around real price
      this.symbols[sym].base = newPx;
    });
  }
}

/* ═══════════════════ TECHNICAL ANALYSIS ═══════════════════ */
const TA = {

  // ── EMA ──
  ema(src, len) {
    const k = 2 / (len + 1);
    let val = src[0];
    const out = [val];
    for (let i = 1; i < src.length; i++) {
      val = src[i] * k + val * (1 - k);
      out.push(val);
    }
    return out;
  },

  // ── RSI ──
  rsi(closes, len = 14) {
    if (closes.length < len + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - len; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const ag = gains / len, al = losses / len;
    if (al === 0) return 100;
    const rs = ag / al;
    return +(100 - 100 / (1 + rs)).toFixed(2);
  },

  // ── ATR ──
  atr(candles, len = 14) {
    const trs = candles.slice(1).map((c, i) => Math.max(
      c.high - c.low,
      Math.abs(c.high - candles[i].close),
      Math.abs(c.low  - candles[i].close)
    ));
    return trs.slice(-len).reduce((s, v) => s + v, 0) / len;
  },

  // ── ADX ──
  adx(candles, len = 14) {
    if (candles.length < len * 2) return 25;
    const slice = candles.slice(-len * 2);
    let pDM = 0, nDM = 0, tr = 0;
    for (let i = 1; i < slice.length; i++) {
      const up = slice[i].high - slice[i-1].high;
      const dn = slice[i-1].low - slice[i].low;
      pDM += up > dn && up > 0 ? up : 0;
      nDM += dn > up && dn > 0 ? dn : 0;
      tr  += Math.max(slice[i].high - slice[i].low,
                      Math.abs(slice[i].high - slice[i-1].close),
                      Math.abs(slice[i].low  - slice[i-1].close));
    }
    if (tr === 0) return 0;
    const pDI = 100 * pDM / tr;
    const nDI = 100 * nDM / tr;
    const dx  = pDI + nDI === 0 ? 0 : 100 * Math.abs(pDI - nDI) / (pDI + nDI);
    return +dx.toFixed(1);
  },

  // ── Swing Highs / Lows ──
  swings(candles, left = 5, right = 5) {
    const highs = [], lows = [];
    for (let i = left; i < candles.length - right; i++) {
      const slice_h = candles.slice(i - left, i + right + 1).map(c => c.high);
      const slice_l = candles.slice(i - left, i + right + 1).map(c => c.low);
      if (candles[i].high === Math.max(...slice_h)) highs.push({ i, price: candles[i].high });
      if (candles[i].low  === Math.min(...slice_l)) lows.push({ i, price: candles[i].low });
    }
    return { highs, lows };
  },

  // ── Fair Value Gap (FVG) ──
  fvg(candles, lookback = 30) {
    const gaps = [];
    const slice = candles.slice(-lookback);
    for (let i = 2; i < slice.length; i++) {
      const c0 = slice[i - 2], c2 = slice[i];
      // Bullish FVG: gap between c0.high and c2.low (c1 is impulse up)
      if (c2.low > c0.high) {
        gaps.push({ type: 'bull', top: c2.low, bot: c0.high, idx: i, mitigated: false });
      }
      // Bearish FVG: gap between c0.low and c2.high (c1 is impulse down)
      if (c2.high < c0.low) {
        gaps.push({ type: 'bear', top: c0.low, bot: c2.high, idx: i, mitigated: false });
      }
    }
    // Mark mitigated (price entered gap)
    const lastClose = candles.at(-1).close;
    gaps.forEach(g => {
      if (g.type === 'bull' && lastClose <= g.bot) g.mitigated = true;
      if (g.type === 'bear' && lastClose >= g.top) g.mitigated = true;
    });
    return gaps.filter(g => !g.mitigated).slice(-4);
  },

  // ── Order Blocks ──
  orderBlocks(candles, lookback = 50) {
    const blocks = [];
    const { highs, lows } = this.swings(candles.slice(-lookback));
    const slice = candles.slice(-lookback);

    highs.forEach(sh => {
      // Bearish OB: last bullish candle before swing high that preceded BOS down
      for (let j = sh.i - 1; j >= Math.max(0, sh.i - 5); j--) {
        const c = slice[j];
        if (c.close > c.open) {
          blocks.push({ type: 'bear', top: c.high, bot: c.low, origin: c.close, idx: j });
          break;
        }
      }
    });
    lows.forEach(sl => {
      // Bullish OB: last bearish candle before swing low that preceded BOS up
      for (let j = sl.i - 1; j >= Math.max(0, sl.i - 5); j--) {
        const c = slice[j];
        if (c.close < c.open) {
          blocks.push({ type: 'bull', top: c.high, bot: c.low, origin: c.close, idx: j });
          break;
        }
      }
    });
    return blocks.slice(-3);
  },

  // ── Break of Structure ──
  bos(candles) {
    const n = candles.length;
    if (n < 20) return { bull: false, bear: false, fake: false };
    const recent = candles.slice(-20);
    const swHigh = Math.max(...recent.slice(0, -5).map(c => c.high));
    const swLow  = Math.min(...recent.slice(0, -5).map(c => c.low));
    const last   = candles.at(-1);
    const prev   = candles.at(-2);

    const closePct = (last.high !== last.low) ? (last.close - last.low) / (last.high - last.low) : 0.5;
    const volAvg   = recent.slice(0, -1).reduce((s, c) => s + c.volume, 0) / (recent.length - 1);
    const strongVol = last.volume > volAvg * 1.2;
    const strongClose = closePct > 0.65;

    const bull = last.close > swHigh && prev.close <= swHigh;
    const bear = last.close < swLow  && prev.close >= swLow;
    const fake = (bull || bear) && (!strongVol || !strongClose);

    return { bull, bear, fake, swHigh, swLow };
  },

  // ── Fibonacci Levels ──
  fibLevels(high, low) {
    const diff = high - low;
    return {
      '0':     high,
      '0.236': high - diff * 0.236,
      '0.382': high - diff * 0.382,
      '0.5':   high - diff * 0.5,
      '0.618': high - diff * 0.618,
      '0.786': high - diff * 0.786,
      '1':     low,
      '1.272': low  - diff * 0.272,
      '1.618': low  - diff * 0.618,
    };
  },

  // ── RSI Divergence ──
  divergence(candles, rsiLen = 14) {
    const closes = candles.map(c => c.close);
    const rsis   = closes.map((_, i) => i < rsiLen ? 50 : this.rsi(closes.slice(0, i + 1), rsiLen));
    const n = rsis.length;
    if (n < 20) return 'none';

    const priceHH = candles.at(-1).high   > candles.slice(-20, -10).reduce((m, c) => Math.max(m, c.high), -Infinity);
    const rsiLH   = rsis.at(-1) < rsis.slice(-20, -10).reduce((m, v) => Math.max(m, v), -Infinity) - 3;
    if (priceHH && rsiLH) return 'bearish';

    const priceLL = candles.at(-1).low    < candles.slice(-20, -10).reduce((m, c) => Math.min(m, c.low), Infinity);
    const rsiHL   = rsis.at(-1) > rsis.slice(-20, -10).reduce((m, v) => Math.min(m, v), Infinity) + 3;
    if (priceLL && rsiHL) return 'bullish';

    return 'none';
  },

  // ── Elliott Wave (simplified ZigZag) ──
  elliottWave(candles) {
    const { highs, lows } = this.swings(candles.slice(-100), 3, 3);
    const points = [...highs.map(h => ({ ...h, type: 'H' })), ...lows.map(l => ({ ...l, type: 'L' }))]
      .sort((a, b) => a.i - b.i)
      .slice(-8);

    if (points.length < 5) return { wave: '?', stage: 'Unknown', bias: 'neutral', confidence: 40 };

    // Count alternating H-L pattern
    let impulse = 0, correction = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].type !== points[i-1].type) impulse++;
      else correction++;
    }

    const lastMove = points.length > 1 ? points.at(-1).price - points.at(-2).price : 0;
    const bias     = lastMove > 0 ? 'bullish' : 'bearish';
    const waveNum  = (impulse % 5) + 1;
    const stage    = waveNum <= 3 ? 'Impulse' : waveNum === 4 ? 'Correction' : 'Extension';
    const conf     = 45 + Math.floor(Math.random() * 30);

    return { wave: `Wave ${waveNum}`, stage, bias, confidence: conf, impulse, correction };
  },

  // ── Market Structure ──
  structure(candles) {
    const ema20 = this.ema(candles.map(c => c.close), 20);
    const ema50 = this.ema(candles.map(c => c.close), 50);
    const last  = candles.at(-1);
    const trend = ema20.at(-1) > ema50.at(-1) ? 'bullish' :
                  ema20.at(-1) < ema50.at(-1) ? 'bearish' : 'neutral';
    const aboveEma = last.close > ema50.at(-1);
    return { trend, aboveEma, ema20: ema20.at(-1), ema50: ema50.at(-1) };
  },

  // ── Session ──
  session() {
    const h = new Date().getUTCHours();
    if (h >= 8  && h < 12) return { name: 'London',  active: true,  flag: '🇬🇧' };
    if (h >= 13 && h < 17) return { name: 'New York', active: true,  flag: '🇺🇸' };
    if (h >= 0  && h < 7)  return { name: 'Asia',     active: false, flag: '🇯🇵' };
    return { name: 'Overlap/Off', active: true, flag: '🌐' };
  },

  // ── Volume Profile ──
  volumeProfile(candles, bins = 10) {
    const highs = candles.map(c => c.high);
    const lows  = candles.map(c => c.low);
    const maxH  = Math.max(...highs), minL = Math.min(...lows);
    const range = maxH - minL;
    if (range === 0) return { poc: candles.at(-1).close, vah: maxH, val: minL };

    const profile = Array.from({ length: bins }, () => 0);
    candles.forEach(c => {
      const mid = (c.high + c.low) / 2;
      const bin = Math.min(bins - 1, Math.floor((mid - minL) / range * bins));
      profile[bin] += c.volume;
    });

    const maxVol = Math.max(...profile);
    const pocBin = profile.indexOf(maxVol);
    const poc    = minL + (pocBin + 0.5) / bins * range;

    const totalVol   = profile.reduce((s, v) => s + v, 0);
    let cumVol = 0, vahBin = bins - 1, valBin = 0;
    for (let i = pocBin; i < bins && cumVol < totalVol * 0.35; i++) { cumVol += profile[i]; vahBin = i; }
    cumVol = 0;
    for (let i = pocBin; i >= 0 && cumVol < totalVol * 0.35; i--) { cumVol += profile[i]; valBin = i; }

    return {
      poc,
      vah: minL + (vahBin + 1) / bins * range,
      val: minL + valBin / bins * range,
    };
  },
};

// Export for use
if (typeof module !== 'undefined') module.exports = { MarketEngine, TA };
