/* ═══════════════════════════════════════════════════════
   AI AGENT SYSTEM - All Agents, Teams, Commander
   ═══════════════════════════════════════════════════════ */

/* ─── Base Agent ─── */
class BaseAgent {
  constructor(name, role, icon, team) {
    this.name   = name;
    this.role   = role;
    this.icon   = icon;
    this.team   = team;
    this.signal = 'wait';
    this.conf   = 50;
    this.report = {};
    this.lastLog = '';
  }

  _randFluke(prob = 0.05) { return Math.random() < prob; }
  _conf(base)             { return Math.min(95, Math.max(20, base + Math.floor((Math.random() - 0.5) * 12))); }
}

/* ═══════════════════════════════════════════════════════
   SMC ANALYST — Structure, OB, FVG, BOS/ChoCH
   ═══════════════════════════════════════════════════════ */
class SMCAgent extends BaseAgent {
  constructor(team) {
    super('SMC-Analyst', 'Structure & Order Flow', '⚡', team);
  }

  analyze(data) {
    const { candles } = data;
    const closes  = candles.map(c => c.close);
    const atr     = TA.atr(candles);
    const bos     = TA.bos(candles);
    const fvgs    = TA.fvg(candles);
    const obs     = TA.orderBlocks(candles);
    const struct  = TA.structure(candles);
    const last    = candles.at(-1);

    // Find nearest OB
    const bullOBs = obs.filter(o => o.type === 'bull' && last.close >= o.bot && last.close >= o.top * 0.98);
    const bearOBs = obs.filter(o => o.type === 'bear' && last.close <= o.top && last.close <= o.bot * 1.02);
    const nearOB  = bullOBs.length > 0 ? bullOBs.at(-1) : bearOBs.length > 0 ? bearOBs.at(-1) : null;

    // Nearest FVG
    const bullFVGs = fvgs.filter(f => f.type === 'bull');
    const bearFVGs = fvgs.filter(f => f.type === 'bear');
    const nearFVG  = fvgs.length > 0 ? fvgs.at(-1) : null;

    let score = 0;
    if (struct.trend === 'bullish') score += 20;
    if (struct.trend === 'bearish') score -= 20;
    if (bos.bull && !bos.fake)  score += 25;
    if (bos.bear && !bos.fake)  score -= 25;
    if (bos.bull && bos.fake)   score += 5;
    if (bos.bear && bos.fake)   score -= 5;
    if (nearOB?.type === 'bull') score += 15;
    if (nearOB?.type === 'bear') score -= 15;
    if (bullFVGs.length > 0)    score += 10;
    if (bearFVGs.length > 0)    score -= 10;

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : Math.abs(score) < 8 ? 'wait' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.4);

    // BOS label
    const bosLabel = bos.bull ? (bos.fake ? 'FAKE BOS ↑' : 'REAL BOS ↑') :
                     bos.bear ? (bos.fake ? 'FAKE BOS ↓' : 'REAL BOS ↓') : 'No BOS';

    this.report = {
      structure: struct.trend.toUpperCase(),
      bos:       bosLabel,
      ob:        nearOB ? `${nearOB.type.toUpperCase()} OB @ ${nearOB.origin.toFixed(data.cfg.digits - 1)}` : 'None nearby',
      fvg:       nearFVG ? `${nearFVG.type.toUpperCase()} FVG [${nearFVG.bot.toFixed(data.cfg.digits-1)}–${nearFVG.top.toFixed(data.cfg.digits-1)}]` : 'No open FVG',
      fvgCount:  `Bull:${bullFVGs.length} Bear:${bearFVGs.length}`,
      atr:       atr.toFixed(data.cfg.digits - 1),
    };

    this.lastLog = `${bosLabel} | ${struct.trend} | ${nearOB ? 'OB hit' : 'No OB'} | FVG: ${fvgs.length}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   PHASE 19 — SMC split into independent micro-agents
   (so you can disable the weak part, keep the strong part,
    and tune each per symbol via KB)
   ═══════════════════════════════════════════════════════ */

// 🧱 Order Block — institutional supply/demand zones
class OrderBlockAgent extends BaseAgent {
  constructor(team) { super('OrderBlock', 'Institutional OB zones', '🧱', team); }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 30) return { signal:'wait', conf:30, report:{}, log:'no data' };
    const obs  = TA.orderBlocks(candles);
    const last = candles.at(-1);
    const bull = obs.filter(o => o.type === 'bull' && last.close >= o.bot && last.close <= o.top * 1.02);
    const bear = obs.filter(o => o.type === 'bear' && last.close <= o.top && last.close >= o.bot * 0.98);
    const near = bull.length ? bull.at(-1) : bear.length ? bear.at(-1) : null;
    let score = 0;
    if (near?.type === 'bull') score += 25;
    if (near?.type === 'bear') score -= 25;
    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'wait';
    this.conf = this._conf(50 + Math.abs(score) * 0.9);
    const d = cfg.digits - 1;
    this.report = {
      zone:  near ? `${near.type.toUpperCase()} OB @ ${near.origin.toFixed(d)}` : 'No OB nearby',
      bullOB: bull.length, bearOB: bear.length,
      action: near ? (near.type==='bull'?'🟢 ที่ demand — รอ buy':'🔴 ที่ supply — รอ sell') : '— รอราคาเข้าโซน',
    };
    this.lastLog = `OB ${this.signal} | ${this.report.zone}`;
    return { signal:this.signal, conf:this.conf, report:this.report, log:this.lastLog };
  }
}

// 💧 Liquidity Sweep — price grabs stops then reverses
class SweepAgent extends BaseAgent {
  constructor(team) { super('Sweep', 'Liquidity grab + reversal', '💧', team); }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 25) return { signal:'wait', conf:30, report:{}, log:'no data' };
    const look = candles.slice(-20, -1);
    const swingHi = Math.max(...look.map(c => c.high));
    const swingLo = Math.min(...look.map(c => c.low));
    const last = candles.at(-1);
    // bullish sweep: wick below swing low but close back above
    const bullSweep = last.low < swingLo && last.close > swingLo;
    // bearish sweep: wick above swing high but close back below
    const bearSweep = last.high > swingHi && last.close < swingHi;
    let score = 0;
    if (bullSweep) score += 28;
    if (bearSweep) score -= 28;
    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'wait';
    this.conf = this._conf(50 + Math.abs(score));
    const d = cfg.digits - 1;
    this.report = {
      swingHi: swingHi.toFixed(d), swingLo: swingLo.toFixed(d),
      sweep: bullSweep ? '🟢 Bullish sweep (กวาด low เด้งขึ้น)' : bearSweep ? '🔴 Bearish sweep (กวาด high ลง)' : '— ไม่มี sweep',
    };
    this.lastLog = `Sweep ${this.signal} | ${this.report.sweep}`;
    return { signal:this.signal, conf:this.conf, report:this.report, log:this.lastLog };
  }
}

// 🚀 Breakout + Premium/Discount Zone — BOS continuation + range position
class BreakoutAgent extends BaseAgent {
  constructor(team) { super('Breakout', 'BOS breakout + premium/discount', '🚀', team); }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 30) return { signal:'wait', conf:30, report:{}, log:'no data' };
    const bos = TA.bos(candles);
    const look = candles.slice(-50);
    const hi = Math.max(...look.map(c => c.high));
    const lo = Math.min(...look.map(c => c.low));
    const last = candles.at(-1).close;
    const rangePos = (hi > lo) ? (last - lo) / (hi - lo) : 0.5;   // 0=discount,1=premium
    const zone = rangePos >= 0.7 ? 'PREMIUM' : rangePos <= 0.3 ? 'DISCOUNT' : 'EQUILIBRIUM';

    let score = 0;
    if (bos.bull && !bos.fake) score += 25;
    if (bos.bear && !bos.fake) score -= 25;
    // Premium → favor sells; Discount → favor buys (smart-money logic)
    if (zone === 'DISCOUNT') score += 10;
    if (zone === 'PREMIUM')  score -= 10;

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'wait';
    this.conf = this._conf(50 + Math.abs(score) * 0.8);
    const d = cfg.digits - 1;
    this.report = {
      bos: bos.bull ? (bos.fake?'FAKE↑':'REAL↑') : bos.bear ? (bos.fake?'FAKE↓':'REAL↓') : 'None',
      zone: `${zone} (${(rangePos*100).toFixed(0)}%)`,
      hi: hi.toFixed(d), lo: lo.toFixed(d),
    };
    this.lastLog = `Breakout ${this.signal} | BOS ${this.report.bos} | ${zone}`;
    return { signal:this.signal, conf:this.conf, report:this.report, log:this.lastLog };
  }
}

// 🟦 Fair Value Gap — imbalance zones (price tends to fill)
class FVGAgent extends BaseAgent {
  constructor(team) { super('FVG', 'Fair Value Gap imbalance', '🟦', team); }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 20) return { signal:'wait', conf:30, report:{}, log:'no data' };
    const fvgs = TA.fvg(candles);
    const last = candles.at(-1).close;
    // open (unfilled) FVGs nearest price
    const bull = fvgs.filter(f => f.type === 'bull');
    const bear = fvgs.filter(f => f.type === 'bear');
    const nearBull = bull.length ? bull.at(-1) : null;
    const nearBear = bear.length ? bear.at(-1) : null;

    let score = 0;
    // Price inside a bull FVG → demand imbalance → buy bias
    if (nearBull && last >= nearBull.bot && last <= nearBull.top * 1.01) score += 25;
    // Price inside a bear FVG → supply imbalance → sell bias
    if (nearBear && last <= nearBear.top && last >= nearBear.bot * 0.99) score -= 25;
    // Open FVG above = magnet up; below = magnet down
    if (bull.length > bear.length) score += 8;
    if (bear.length > bull.length) score -= 8;

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'wait';
    this.conf = this._conf(50 + Math.abs(score) * 0.9);
    const d = cfg.digits - 1;
    this.report = {
      nearFVG: nearBull ? `BULL [${nearBull.bot.toFixed(d)}–${nearBull.top.toFixed(d)}]`
             : nearBear ? `BEAR [${nearBear.bot.toFixed(d)}–${nearBear.top.toFixed(d)}]` : 'No open FVG',
      count:   `Bull:${bull.length} Bear:${bear.length}`,
      action:  score>20?'🟢 ในโซน demand':score<-20?'🔴 ในโซน supply':'— รอราคาเข้า gap',
    };
    this.lastLog = `FVG ${this.signal} | ${this.report.nearFVG}`;
    return { signal:this.signal, conf:this.conf, report:this.report, log:this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   🎯 FIRM SNIPER — Prop-Firm SMC Confluence (HARD FILTER)
   ทุกเงื่อนไขต้องผ่านพร้อมกัน 5 ชั้น ถึงจะยิง (conf 95)
   1) News clear  2) Liquidity Sweep  3) Discount/Premium
   4) OB + FVG trigger  5) Macro DXY ไม่สวน
   ออกแบบมาเพื่อ "สอบกองทุน": ออกน้อย แม่นสูง drawdown ต่ำ
   ═══════════════════════════════════════════════════════ */
class PropFirmSniperAgent extends BaseAgent {
  constructor(team, newsPairs) {
    super('FirmSniper', 'Prop-Firm SMC Confluence (hard filter)', '🎯', team);
    this._news = new NewsAgent(team, newsPairs || ['USD']);
  }

  analyze(data) {
    const { candles, cfg } = data;
    const d = (cfg?.digits || 2) - 1;
    const blank = (reason) => ({ signal:'wait', conf:30, report:{ verdict:'⛔ '+reason }, log:'FirmSniper wait: '+reason });
    if (!candles || candles.length < 55) return blank('ข้อมูลไม่พอ (<55 แท่ง)');

    const last  = candles.at(-1);
    const price = last.close;

    // ── ชั้น 1: NEWS — งดเทรดถ้ามีข่าวแรงในกรอบเวลา (NewsAgent คืน 'watch' เมื่อ HIGH risk) ──
    const news        = this._news.analyze();
    const newsBlocked = news.signal === 'watch';

    // ── ชั้น 2: LIQUIDITY SWEEP — กวาด swing 20 แท่งแล้วเด้งกลับ ──
    const look    = candles.slice(-20, -1);
    const swingHi = Math.max(...look.map(c => c.high));
    const swingLo = Math.min(...look.map(c => c.low));
    const bullSweep = last.low  < swingLo && last.close > swingLo;   // กวาด low → เด้งขึ้น
    const bearSweep = last.high > swingHi && last.close < swingHi;   // กวาด high → ลง

    // ── ชั้น 3: PREMIUM / DISCOUNT — ตำแหน่งใน range 50 แท่ง ──
    const range = candles.slice(-50);
    const hi = Math.max(...range.map(c => c.high));
    const lo = Math.min(...range.map(c => c.low));
    const rangePos   = (hi > lo) ? (price - lo) / (hi - lo) : 0.5;   // 0=ถูก 1=แพง
    const isDiscount = rangePos <= 0.40;
    const isPremium  = rangePos >= 0.60;

    // ── ชั้น 4: ENTRY TRIGGER — Order Block + Fair Value Gap ──
    const obs  = TA.orderBlocks(candles);
    const fvgs = TA.fvg(candles);
    const nearBullOB = obs.filter(o => o.type==='bull' && price >= o.bot*0.999 && price <= o.top*1.02).at(-1) || null;
    const nearBearOB = obs.filter(o => o.type==='bear' && price <= o.top*1.001 && price >= o.bot*0.98).at(-1) || null;
    const hasBullFVG = fvgs.some(f => f.type==='bull' && (!nearBullOB || f.bot <= nearBullOB.top));
    const hasBearFVG = fvgs.some(f => f.type==='bear' && (!nearBearOB || f.top >= nearBearOB.bot));

    // ── ชั้น 5: MACRO DXY — USD อ่อน(≤0)→buy, USD แข็ง(≥0)→sell (อ่านจาก global) ──
    const dxyTrend = (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.market)
                       ? (TradingWarRoom.market.dxyTrend ?? 0) : 0;
    const dxyOkBuy  = dxyTrend <= 0;
    const dxyOkSell = dxyTrend >= 0;

    // ── HARD FILTER: ทุกชั้นต้องผ่านพร้อมกัน ──
    const buyConfluence  = !newsBlocked && bullSweep && isDiscount && !!nearBullOB && hasBullFVG && dxyOkBuy;
    const sellConfluence = !newsBlocked && bearSweep && isPremium  && !!nearBearOB && hasBearFVG && dxyOkSell;

    // นับชั้นที่ผ่าน (สำหรับสถานะ 'watch' = กำลังจ่อ)
    const buyHits  = [bullSweep, isDiscount, !!nearBullOB, hasBullFVG, dxyOkBuy ].filter(Boolean).length;
    const sellHits = [bearSweep, isPremium,  !!nearBearOB, hasBearFVG, dxyOkSell].filter(Boolean).length;

    let signal='wait', conf=30, verdict='— รอ setup ครบ 5 ชั้น';
    if (buyConfluence)        { signal='buy';  conf=95; verdict='🟢 SNIPE BUY — confluence เต็ม 5/5'; }
    else if (sellConfluence)  { signal='sell'; conf=95; verdict='🔴 SNIPE SELL — confluence เต็ม 5/5'; }
    else if (newsBlocked)     { signal='wait'; conf=25; verdict='⛔ งดเทรด — มีข่าวแรง (risk HIGH)'; }
    else if (buyHits>=4 && buyHits>=sellHits)  { signal='watch'; conf=45; verdict=`🔭 จ่อยิง BUY (${buyHits}/5)`; }
    else if (sellHits>=4)     { signal='watch'; conf=45; verdict=`🔭 จ่อยิง SELL (${sellHits}/5)`; }

    this.signal = signal; this.conf = conf;
    this.report = {
      verdict,
      news:  newsBlocked ? '⛔ HIGH risk — งด' : '✓ clear',
      sweep: bullSweep ? '🟢 bull sweep' : bearSweep ? '🔴 bear sweep' : '— ไม่มี',
      zone:  `${(rangePos*100).toFixed(0)}% ${isDiscount?'DISCOUNT 🟢':isPremium?'PREMIUM 🔴':'EQ ⚪'}`,
      entry: nearBullOB ? `bull OB @${nearBullOB.origin.toFixed(d)}${hasBullFVG?' +FVG✓':' (รอ FVG)'}`
           : nearBearOB ? `bear OB @${nearBearOB.origin.toFixed(d)}${hasBearFVG?' +FVG✓':' (รอ FVG)'}`
           : '— ราคายังไม่เข้า OB',
      dxy:   dxyTrend>0?`▲ USD แข็ง (${dxyTrend.toFixed(2)})`:dxyTrend<0?`▼ USD อ่อน (${dxyTrend.toFixed(2)})`:'↔ flat',
      confluence: `BUY ${buyHits}/5 · SELL ${sellHits}/5`,
    };
    this.lastLog = `FirmSniper ${signal} | ${verdict}`;
    return { signal:this.signal, conf:this.conf, report:this.report, log:this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   ELLIOTT WAVE ANALYST
   ═══════════════════════════════════════════════════════ */
class ElliottWaveAgent extends BaseAgent {
  constructor(team) {
    super('Elliott-Wave', 'Wave Structure & Count', '🌊', team);
  }

  analyze(data) {
    const { candles } = data;
    const ew     = TA.elliottWave(candles);
    const struct = TA.structure(candles);
    const rsi    = TA.rsi(candles.map(c => c.close));
    const last   = candles.at(-1);

    // Wave 3 and wave 5 are best entries
    const goodWave    = ew.wave === 'Wave 3' || ew.wave === 'Wave 1' || ew.wave === 'Wave 5';
    const corrWave    = ew.wave === 'Wave 4' || ew.wave === 'Wave 2';
    const biasBull    = ew.bias === 'bullish';
    const biasStruct  = struct.trend === 'bullish';

    let score = 0;
    if (goodWave && biasBull && biasStruct)  score += 35;
    if (goodWave && !biasBull && !biasStruct) score -= 35;
    if (corrWave) score += biasBull ? -10 : 10;
    if (ew.stage === 'Extension') score += biasBull ? 15 : -15;

    this.signal = score >= 25 ? 'buy' : score <= -25 ? 'sell' : 'wait';
    this.conf   = this._conf(ew.confidence);

    this.report = {
      wave:     ew.wave,
      stage:    ew.stage,
      bias:     ew.bias.charAt(0).toUpperCase() + ew.bias.slice(1),
      impulse:  `Impulse moves: ${ew.impulse}`,
      rsi:      `RSI ${rsi.toFixed(1)}`,
      action:   corrWave ? 'Wait for Wave completion' : goodWave ? 'Momentum active' : 'Unclear structure',
    };

    this.lastLog = `${ew.wave} | ${ew.stage} | Bias: ${ew.bias} | Conf: ${this.conf}%`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   FIBONACCI ANALYST
   ═══════════════════════════════════════════════════════ */
class FibonacciAgent extends BaseAgent {
  constructor(team) {
    super('Fibonacci', 'Fib Retracement & Extension', '📐', team);
  }

  analyze(data) {
    const { candles, cfg } = data;
    const n = candles.length;
    if (n < 20) return { signal: 'wait', conf: 30, report: {}, log: 'Insufficient data' };

    // Find recent swing high/low from last 50 bars
    const recent = candles.slice(-50);
    const swHigh = Math.max(...recent.map(c => c.high));
    const swLow  = Math.min(...recent.map(c => c.low));
    const last   = candles.at(-1);
    const struct = TA.structure(candles);
    const fibs   = TA.fibLevels(swHigh, swLow);
    const range  = swHigh - swLow;

    // Find nearest fib level
    const fibKeys = ['0.236', '0.382', '0.5', '0.618', '0.786'];
    let nearestFib = null, nearestDist = Infinity;
    fibKeys.forEach(k => {
      const dist = Math.abs(last.close - fibs[k]);
      if (dist < nearestDist) { nearestDist = dist; nearestFib = k; }
    });

    const nearPct   = (nearestDist / range * 100).toFixed(1);
    const atSupport = struct.trend === 'bullish' && parseFloat(nearestFib) >= 0.5;
    const atResist  = struct.trend === 'bearish' && parseFloat(nearestFib) <= 0.5;
    const golden    = nearestFib === '0.618';
    const halfBack  = nearestFib === '0.5';
    const shallow   = nearestFib === '0.236' || nearestFib === '0.382';

    let score = 0;
    if (atSupport && golden)  score += 40;
    if (atSupport && halfBack) score += 25;
    if (atSupport && shallow)  score += 15;
    if (atResist  && golden)  score -= 40;
    if (atResist  && halfBack) score -= 25;
    if (atResist  && shallow)  score -= 15;
    if (nearPct > 2) score = score * 0.5; // Far from level = weak signal

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.5);

    // Extension targets
    const tp1 = struct.trend === 'bullish' ? fibs['1.272'] : fibs['1'];
    const tp2 = struct.trend === 'bullish' ? fibs['1.618'] : fibs['0'];
    const sl  = struct.trend === 'bullish' ? swLow - range * 0.05 : swHigh + range * 0.05;
    const rr  = range > 0 ? ((Math.abs(tp1 - last.close)) / Math.max(0.001, Math.abs(last.close - sl))).toFixed(2) : '?';

    this.report = {
      swHigh:  swHigh.toFixed(cfg.digits - 1),
      swLow:   swLow.toFixed(cfg.digits - 1),
      nearest: `@ ${nearestFib} (${nearPct}% away)`,
      level:   fibs[nearestFib]?.toFixed(cfg.digits - 1) ?? '--',
      tp1:     tp1.toFixed(cfg.digits - 1),
      tp2:     tp2.toFixed(cfg.digits - 1),
      sl:      sl.toFixed(cfg.digits - 1),
      rr:      `1:${rr}`,
      golden:  golden ? '✅ Golden Zone' : '○ Not golden',
    };

    this.lastLog = `Price at Fib ${nearestFib} (${nearPct}% away) | ${atSupport ? 'Support' : atResist ? 'Resistance' : 'Mid-range'} | R:R ${rr}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   RSI / VALUE ANALYST
   ═══════════════════════════════════════════════════════ */
class RSIValueAgent extends BaseAgent {
  constructor(team) {
    super('RSI-Value', 'Momentum & Value Analysis', '📊', team);
  }

  analyze(data) {
    const { candles, cfg } = data;
    const closes = candles.map(c => c.close);
    const rsi14  = TA.rsi(closes, 14);
    const rsi7   = TA.rsi(closes, 7);
    const adx    = TA.adx(candles);
    const div    = TA.divergence(candles);
    const vp     = TA.volumeProfile(candles.slice(-50));
    const last   = candles.at(-1);
    const struct = TA.structure(candles);

    const overbought = rsi14 >= 70;
    const oversold   = rsi14 <= 30;
    const bullZone   = rsi14 >= 40 && rsi14 <= 60;
    const trending   = adx >= 22;
    const strongTrend= adx >= 30;

    const atPOC = Math.abs(last.close - vp.poc) < TA.atr(candles) * 0.5;
    const aboveVAH = last.close > vp.vah;
    const belowVAL = last.close < vp.val;

    let score = 0;
    if (oversold   && struct.trend === 'bullish') score += 35;
    if (overbought && struct.trend === 'bearish') score -= 35;
    if (div === 'bullish') score += 25;
    if (div === 'bearish') score -= 25;
    if (bullZone   && trending)                  score += 10;
    if (aboveVAH   && struct.trend === 'bullish') score += 10;
    if (belowVAL   && struct.trend === 'bearish') score -= 10;
    if (atPOC)                                    score += 5;

    this.signal = score >= 25 ? 'buy' : score <= -25 ? 'sell' : Math.abs(score) < 10 ? 'wait' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.45);

    const rsiState = overbought ? '⚠️ OB' : oversold ? '⚠️ OS' : bullZone ? '✓ Normal' : '○ Mid';

    this.report = {
      rsi14:  `${rsi14.toFixed(1)} — ${rsiState}`,
      rsi7:   rsi7.toFixed(1),
      adx:    `${adx} — ${adx >= 30 ? 'Strong' : adx >= 22 ? 'Trend' : 'Weak'}`,
      div:    div === 'none' ? 'No divergence' : `⚠️ ${div.charAt(0).toUpperCase() + div.slice(1)} Divergence`,
      poc:    vp.poc.toFixed(cfg.digits - 1),
      vah:    vp.vah.toFixed(cfg.digits - 1),
      val:    vp.val.toFixed(cfg.digits - 1),
      pos:    atPOC ? 'At POC' : aboveVAH ? 'Above VAH' : belowVAL ? 'Below VAL' : 'In Value',
    };

    this.lastLog = `RSI ${rsi14.toFixed(1)} | ADX ${adx} | ${div !== 'none' ? div + ' divergence' : 'No divergence'} | ${this.report.pos}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   MACD ANALYST — Momentum & Trend Crossover
   ═══════════════════════════════════════════════════════ */
class MACDAgent extends BaseAgent {
  constructor(team) {
    super('MACD', 'Momentum Crossover', '📈', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    const closes = candles.map(c => c.close);
    if (closes.length < 30) return { signal:'wait', conf:30, report:{}, log:'Insufficient data' };

    const ema12  = TA.ema(closes, 12);
    const ema26  = TA.ema(closes, 26);
    const macd   = ema12.map((v, i) => v - ema26[i]);
    const signal = TA.ema(macd, 9);
    const hist   = macd.map((v, i) => v - signal[i]);

    const latestH = hist.at(-1);
    const prevH   = hist.at(-2);
    const latestM = macd.at(-1);

    const bullCross = prevH < 0 && latestH > 0;
    const bearCross = prevH > 0 && latestH < 0;
    const rising    = latestH > prevH;
    const aboveZero = latestM > 0;

    let score = 0;
    if (bullCross)              score += 30;
    if (bearCross)              score -= 30;
    if (rising  && aboveZero)   score += 15;
    if (!rising && !aboveZero)  score -= 15;
    if (latestM > 0 && rising)  score += 5;
    if (latestM < 0 && !rising) score -= 5;

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : Math.abs(score) < 8 ? 'wait' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.7);

    const d = cfg.digits - 1;
    this.report = {
      macd:      latestM.toFixed(d + 2),
      signal:    signal.at(-1).toFixed(d + 2),
      histogram: latestH.toFixed(d + 2),
      cross:     bullCross ? '🟢 Bull Cross' : bearCross ? '🔴 Bear Cross' : '○ No cross',
      momentum:  rising ? '▲ Rising' : '▼ Falling',
    };
    this.lastLog = `MACD ${rising?'rising':'falling'} hist=${latestH.toFixed(d+2)} ${bullCross?'| BULL CROSS':bearCross?'| BEAR CROSS':''}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   BOLLINGER BANDS ANALYST — Volatility & Mean Reversion
   ═══════════════════════════════════════════════════════ */
class BollingerAgent extends BaseAgent {
  constructor(team) {
    super('Bollinger', 'BB Volatility & Squeeze', '🎈', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    const closes = candles.map(c => c.close);
    if (closes.length < 40) return { signal:'wait', conf:30, report:{}, log:'Insufficient data' };

    const period = 20;
    const slice  = closes.slice(-period);
    const sma    = slice.reduce((a,b) => a+b, 0) / period;
    const stdev  = Math.sqrt(slice.reduce((s, v) => s + (v-sma)**2, 0) / period);
    const upper  = sma + stdev * 2;
    const lower  = sma - stdev * 2;
    const last   = closes.at(-1);
    const bandwidth = (upper - lower) / sma * 100;

    // Compare current bandwidth to recent — squeeze detection
    const bw5  = [];
    for (let i = 5; i > 0; i--) {
      const s = closes.slice(-period - i + 1, -i + 1 || undefined);
      if (s.length < period) continue;
      const m = s.reduce((a,b) => a+b, 0) / s.length;
      const sd = Math.sqrt(s.reduce((acc, v) => acc + (v-m)**2, 0) / s.length);
      bw5.push((m + sd*2 - (m - sd*2)) / m * 100);
    }
    const avgBW = bw5.length ? bw5.reduce((a,b) => a+b, 0) / bw5.length : bandwidth;
    const squeeze   = bandwidth < avgBW * 0.7;
    const expanding = bandwidth > avgBW * 1.3;

    let score = 0;
    if (last > upper)  score -= 15; // overbought → mean revert
    if (last < lower)  score += 15; // oversold → mean revert
    if (squeeze)       score *= 0.5; // squeeze = wait for breakout
    if (expanding && last > sma) score += 10;
    if (expanding && last < sma) score -= 10;

    this.signal = score >= 15 ? 'buy' : score <= -15 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 1.1);

    const d = cfg.digits - 1;
    const pos = last > upper ? '⚠️ Above Upper' :
                last < lower ? '⚠️ Below Lower' :
                last > sma   ? '↑ Upper half'   : '↓ Lower half';

    this.report = {
      upper:     upper.toFixed(d),
      sma:       sma.toFixed(d),
      lower:     lower.toFixed(d),
      bandwidth: bandwidth.toFixed(2) + '%',
      state:     squeeze ? '⚡ Squeeze' : expanding ? '🌊 Expanding' : '○ Normal',
      position:  pos,
    };
    this.lastLog = `BB ${pos} | BW ${bandwidth.toFixed(2)}%${squeeze?' (SQUEEZE)':expanding?' (EXPANDING)':''}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   PIVOT POINTS ANALYST — Classical S/R levels
   ═══════════════════════════════════════════════════════ */
class PivotAgent extends BaseAgent {
  constructor(team) {
    super('Pivot', 'Pivot S/R Levels', '🏛', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    if (candles.length < 24) return { signal:'wait', conf:30, report:{}, log:'Need session data' };

    // Use last 24 candles (≈2h on 5m) as "previous session"
    const sess = candles.slice(-25, -1);
    const high = Math.max(...sess.map(c => c.high));
    const low  = Math.min(...sess.map(c => c.low));
    const close = sess.at(-1).close;

    const pp = (high + low + close) / 3;
    const r1 = 2*pp - low;
    const s1 = 2*pp - high;
    const r2 = pp + (high - low);
    const s2 = pp - (high - low);
    const r3 = high + 2 * (pp - low);
    const s3 = low - 2 * (high - pp);

    const last = candles.at(-1).close;
    const tol  = cfg.atr * 0.4;

    const levels = [
      { lvl: r3, name: 'R3', isResist: true,  weight: 1.5 },
      { lvl: r2, name: 'R2', isResist: true,  weight: 1.2 },
      { lvl: r1, name: 'R1', isResist: true,  weight: 1.0 },
      { lvl: pp, name: 'PP', isResist: null,  weight: 0.5 },
      { lvl: s1, name: 'S1', isResist: false, weight: 1.0 },
      { lvl: s2, name: 'S2', isResist: false, weight: 1.2 },
      { lvl: s3, name: 'S3', isResist: false, weight: 1.5 },
    ];

    let score = 0, nearest = 'mid';
    for (const L of levels) {
      if (Math.abs(last - L.lvl) < tol) {
        nearest = L.name;
        if (L.isResist === true)  score -= 20 * L.weight;
        if (L.isResist === false) score += 20 * L.weight;
        break;
      }
    }
    if (nearest === 'mid') {
      if (last > pp) { score += 5; nearest = 'above PP'; }
      else           { score -= 5; nearest = 'below PP'; }
    }

    this.signal = score >= 15 ? 'buy' : score <= -15 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.6);

    const d = cfg.digits - 1;
    this.report = {
      pp:   pp.toFixed(d),
      r1:   r1.toFixed(d),
      s1:   s1.toFixed(d),
      r2:   r2.toFixed(d),
      s2:   s2.toFixed(d),
      near: nearest,
    };
    this.lastLog = `Pivot: ${nearest} | PP ${pp.toFixed(d)}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   PATTERN ANALYST — Candlestick Pattern Recognition
   ═══════════════════════════════════════════════════════ */
class PatternAgent extends BaseAgent {
  constructor(team) {
    super('Pattern', 'Candlestick Patterns', '🕯', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    if (candles.length < 25) return { signal:'wait', conf:30, report:{}, log:'Insufficient' };

    const last3 = candles.slice(-3);
    const c0 = last3[0], c1 = last3[1], c2 = last3[2];

    const body   = c => Math.abs(c.close - c.open);
    const range  = c => c.high - c.low;
    const upper  = c => c.high - Math.max(c.open, c.close);
    const lower  = c => Math.min(c.open, c.close) - c.low;
    const isBull = c => c.close > c.open;
    const isBear = c => c.close < c.open;

    // CONTEXT: are we at recent extreme? (REQUIRED for reversal patterns)
    const recent = candles.slice(-20, -1);
    const recentHigh = Math.max(...recent.map(c => c.high));
    const recentLow  = Math.min(...recent.map(c => c.low));
    const recentRange = recentHigh - recentLow;
    const positionInRange = recentRange > 0 ? (c2.close - recentLow) / recentRange : 0.5;

    const atTop    = positionInRange >= 0.75;  // upper 25% of range
    const atBottom = positionInRange <= 0.25;  // lower 25% of range

    let pattern = 'No pattern', score = 0;
    let contextMsg = '';

    // Bullish Engulfing — only at BOTTOM (otherwise it's just continuation)
    if (isBear(c1) && isBull(c2) && c2.open <= c1.close && c2.close >= c1.open && body(c2) > body(c1) * 1.5) {
      if (atBottom) {
        pattern = '🟢 Bull Engulfing @ Low'; score = 28;
        contextMsg = ' (ที่ recent low)';
      } else {
        pattern = '○ Bull Engulfing (no context)'; score = 8;  // weak signal
      }
    }
    // Bearish Engulfing — only at TOP
    else if (isBull(c1) && isBear(c2) && c2.open >= c1.close && c2.close <= c1.open && body(c2) > body(c1) * 1.5) {
      if (atTop) {
        pattern = '🔴 Bear Engulfing @ High'; score = -28;
        contextMsg = ' (ที่ recent high)';
      } else {
        pattern = '○ Bear Engulfing (no context)'; score = -8;
      }
    }
    // Hammer — STRICT: lower wick > 3x body, must be at bottom
    else if (lower(c2) > body(c2) * 3 && upper(c2) < body(c2) * 0.3 && atBottom) {
      pattern = '🔨 Hammer @ Low'; score = 25;
      contextMsg = ' (ที่ recent low — reversal candidate)';
    }
    // Shooting Star — STRICT: upper wick > 3x body, must be at top
    else if (upper(c2) > body(c2) * 3 && lower(c2) < body(c2) * 0.3 && atTop) {
      pattern = '⭐ Shooting Star @ High'; score = -25;
      contextMsg = ' (ที่ recent high — reversal candidate)';
    }
    // Morning Star — already strong, but require atBottom for high score
    else if (isBear(c0) && body(c1) < body(c0) * 0.4 && isBull(c2) && c2.close > (c0.open + c0.close) / 2) {
      score = atBottom ? 32 : 15;
      pattern = atBottom ? '🌅 Morning Star @ Low' : '○ Morning Star (no context)';
    }
    // Evening Star
    else if (isBull(c0) && body(c1) < body(c0) * 0.4 && isBear(c2) && c2.close < (c0.open + c0.close) / 2) {
      score = atTop ? -32 : -15;
      pattern = atTop ? '🌇 Evening Star @ High' : '○ Evening Star (no context)';
    }
    // Doji at extreme = indecision = wait/watch
    else if (body(c2) < range(c2) * 0.1) {
      if (atTop || atBottom) {
        pattern = '✤ Doji @ extreme'; score = 0;  // wait
      } else {
        pattern = '✤ Doji'; score = 0;
      }
    }

    // ปรับ threshold: ตอนนี้ต้อง score ≥ 20 ถึงจะเป็น actionable signal
    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : Math.abs(score) < 10 ? 'wait' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 1.2);

    this.report = {
      pattern: pattern + contextMsg,
      position: atTop ? '⬆️ Top of range' : atBottom ? '⬇️ Bottom of range' : '↔️ Mid-range',
      bodyPct:  (body(c2) / Math.max(0.0001, range(c2)) * 100).toFixed(0) + '%',
      upperWick: upper(c2).toFixed(cfg.digits - 1),
      lowerWick: lower(c2).toFixed(cfg.digits - 1),
    };
    this.lastLog = `Pattern: ${pattern}${contextMsg}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   DIVERGENCE ANALYST — RSI + MACD divergence (จุดกลับตัว)
   จับ regular + hidden divergence
     - Bull div: ราคาทำ lower low แต่ indicator higher low → กลับขึ้น
     - Bear div: ราคาทำ higher high แต่ indicator lower high → กลับลง
   ═══════════════════════════════════════════════════════ */
class DivergenceAgent extends BaseAgent {
  constructor(team) {
    super('Divergence', 'Reversal Point Detection', '🔄', team);
  }

  _findExtremes(arr, lookback = 20) {
    const slice = arr.slice(-lookback);
    let maxIdx = 0, minIdx = 0;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i] > slice[maxIdx]) maxIdx = i;
      if (slice[i] < slice[minIdx]) minIdx = i;
    }
    return { maxIdx, minIdx, max: slice[maxIdx], min: slice[minIdx] };
  }

  analyze(data) {
    const { candles, cfg } = data;
    if (candles.length < 50) return { signal: 'wait', conf: 30, report: { note: 'Need ≥50 bars' }, log: 'Insufficient' };

    const closes = candles.map(c => c.close);
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);

    // Compute RSI series
    const rsiSeries = [];
    for (let i = 14; i < closes.length; i++) {
      rsiSeries.push(TA.rsi(closes.slice(0, i + 1), 14));
    }

    // Compute MACD histogram series
    const ema12 = TA.ema(closes, 12);
    const ema26 = TA.ema(closes, 26);
    const macd  = ema12.map((v, i) => v - ema26[i]);
    const sig   = TA.ema(macd, 9);
    const hist  = macd.map((v, i) => v - sig[i]);

    // Look at last 20 bars for divergence
    const lb = 20;
    const recentHighs = highs.slice(-lb);
    const recentLows  = lows.slice(-lb);
    const recentRsi   = rsiSeries.slice(-lb);
    const recentHist  = hist.slice(-lb);

    if (recentRsi.length < lb || recentHist.length < lb) {
      return { signal: 'wait', conf: 30, report: { note: 'Insufficient indicator data' }, log: 'No data' };
    }

    // Split into two halves to compare highs/lows
    const half = Math.floor(lb / 2);
    const firstHalf  = { highs: recentHighs.slice(0, half), lows: recentLows.slice(0, half),
                          rsi: recentRsi.slice(0, half), hist: recentHist.slice(0, half) };
    const secondHalf = { highs: recentHighs.slice(half),  lows: recentLows.slice(half),
                          rsi: recentRsi.slice(half),  hist: recentHist.slice(half) };

    const fhMaxPrice = Math.max(...firstHalf.highs);
    const shMaxPrice = Math.max(...secondHalf.highs);
    const fhMinPrice = Math.min(...firstHalf.lows);
    const shMinPrice = Math.min(...secondHalf.lows);
    const fhMaxRsi   = Math.max(...firstHalf.rsi);
    const shMaxRsi   = Math.max(...secondHalf.rsi);
    const fhMinRsi   = Math.min(...firstHalf.rsi);
    const shMinRsi   = Math.min(...secondHalf.rsi);
    const fhMaxHist  = Math.max(...firstHalf.hist);
    const shMaxHist  = Math.max(...secondHalf.hist);
    const fhMinHist  = Math.min(...firstHalf.hist);
    const shMinHist  = Math.min(...secondHalf.hist);

    let score = 0;
    let signals = [];

    // Bullish divergence (regular): price lower low + RSI/MACD higher low → reversal up
    if (shMinPrice < fhMinPrice * 0.998 && shMinRsi > fhMinRsi + 2) {
      score += 25;
      signals.push('🟢 Bull RSI Div');
    }
    if (shMinPrice < fhMinPrice * 0.998 && shMinHist > fhMinHist + 0.01) {
      score += 20;
      signals.push('🟢 Bull MACD Div');
    }

    // Bearish divergence (regular): price higher high + RSI/MACD lower high → reversal down
    if (shMaxPrice > fhMaxPrice * 1.002 && shMaxRsi < fhMaxRsi - 2) {
      score -= 25;
      signals.push('🔴 Bear RSI Div');
    }
    if (shMaxPrice > fhMaxPrice * 1.002 && shMaxHist < fhMaxHist - 0.01) {
      score -= 20;
      signals.push('🔴 Bear MACD Div');
    }

    // Hidden divergence (trend continuation)
    // Bullish hidden: price higher low + RSI lower low → uptrend continues
    if (shMinPrice > fhMinPrice * 1.002 && shMinRsi < fhMinRsi - 2) {
      score += 10;
      signals.push('⚡ Hidden Bull');
    }
    if (shMaxPrice < fhMaxPrice * 0.998 && shMaxRsi > fhMaxRsi + 2) {
      score -= 10;
      signals.push('⚡ Hidden Bear');
    }

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : Math.abs(score) >= 10 ? 'watch' : 'wait';
    this.conf   = this._conf(50 + Math.abs(score) * 1.0);

    this.report = {
      rsiNow:    rsiSeries.at(-1)?.toFixed(1) || '--',
      histNow:   hist.at(-1)?.toFixed(3) || '--',
      divergences: signals.length > 0 ? signals.join(', ') : 'No divergence',
      strength:  score === 0 ? 'None' : `${score > 0 ? '+' : ''}${score}`,
    };
    this.lastLog = `Divergence: ${signals.length > 0 ? signals.join('+') : 'none'} | score ${score}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   MTF ANALYST — Multi-Timeframe Alignment (1h + 4h + Daily)
   อ่าน trend จากแต่ละ TF ที่ market.js cache ไว้
   ═══════════════════════════════════════════════════════ */
class MTFAgent extends BaseAgent {
  constructor(team, symbol) {
    super('MTF', 'Multi-Timeframe Trend', '⏰', team);
    this.symbol = symbol;
  }

  analyze(data, market) {
    if (!market || !market.getMTF) return { signal:'wait', conf:30, report:{note:'No MTF data'}, log:'No MTF' };
    const mtf = market.getMTF(this.symbol);
    const tfs = ['1h', '4h', '1day'];
    const states = {};
    let bulls = 0, bears = 0, total = 0;

    tfs.forEach(tf => {
      if (mtf[tf]) {
        states[tf] = mtf[tf].trend;
        if (mtf[tf].trend === 'bull') bulls++; else bears++;
        total++;
      } else {
        states[tf] = '?';
      }
    });

    let score = 0;
    if (total === 0) {
      this.signal = 'wait';
      this.conf   = 30;
      this.report = { ...states, alignment: 'No data' };
      this.lastLog = 'MTF: No data yet';
      return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
    }

    // Pure bull or pure bear = strongest
    if (bulls === total)      score = 40;
    else if (bears === total) score = -40;
    else if (bulls > bears)   score = 15;
    else if (bears > bulls)   score = -15;

    // Daily TF gets extra weight if aligned with majority
    if (mtf['1day'] && total >= 2) {
      if (mtf['1day'].trend === 'bull' && bulls >= bears) score += 5;
      if (mtf['1day'].trend === 'bear' && bears >= bulls) score -= 5;
    }

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score));

    const align = bulls === total ? '🟢 All BULL' :
                  bears === total ? '🔴 All BEAR' :
                  '⚠️ Mixed';

    this.report = {
      tf1h:   states['1h']   === 'bull' ? '🟢 BULL' : states['1h']   === 'bear' ? '🔴 BEAR' : '— Loading',
      tf4h:   states['4h']   === 'bull' ? '🟢 BULL' : states['4h']   === 'bear' ? '🔴 BEAR' : '— Loading',
      tfDay:  states['1day'] === 'bull' ? '🟢 BULL' : states['1day'] === 'bear' ? '🔴 BEAR' : '— Loading',
      alignment: align,
    };
    this.lastLog = `MTF 1h:${states['1h']} 4h:${states['4h']} D:${states['1day']} | ${align}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   NEWS ANALYST — Economic Calendar Simulation
   ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   UT BOT — ATR Trailing-Stop trend follower (Phase 15.3)
   Inspired by popular "UT Bot Alerts" — flips long/short when
   price crosses an ATR-based trailing stop line.
   ═══════════════════════════════════════════════════════ */
class UTBotAgent extends BaseAgent {
  constructor(team) {
    super('UT-Bot', 'ATR Trailing-Stop trend signal', '🎯', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 30) {
      return { signal:'wait', conf:30, report:{}, log:'Insufficient data' };
    }
    const keyValue = 2.0;      // sensitivity (1=tight, 3=loose)
    const atrPeriod = 10;
    const closes = candles.map(c => c.close);

    // ATR (simple)
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high, l = candles[i].low, pc = candles[i-1].close;
      trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    const atrSlice = trs.slice(-atrPeriod);
    const atr = atrSlice.reduce((a,b)=>a+b,0) / atrSlice.length;
    const nLoss = keyValue * atr;

    // Walk the trailing stop forward across recent bars
    let stop = closes[closes.length - 30];
    let pos = 0; // 1 long, -1 short
    for (let i = closes.length - 29; i < closes.length; i++) {
      const c = closes[i], pc = closes[i-1];
      if (c > stop && pc > stop)      stop = Math.max(stop, c - nLoss);
      else if (c < stop && pc < stop) stop = Math.min(stop, c + nLoss);
      else if (c > stop)              stop = c - nLoss;
      else                            stop = c + nLoss;
    }
    const last = closes.at(-1);
    const prev = closes.at(-2);

    // Cross detection
    const crossUp   = prev <= stop && last > stop;
    const crossDown = prev >= stop && last < stop;
    const above = last > stop;

    let score = 0;
    if (crossUp)        score = 30;       // fresh long trigger
    else if (crossDown) score = -30;      // fresh short trigger
    else if (above)     score = 12;       // holding long trend
    else                score = -12;      // holding short trend

    this.signal = score >= 20 ? 'buy' : score <= -20 ? 'sell' :
                  score > 0 ? 'watch' : score < 0 ? 'watch' : 'wait';
    this.conf = this._conf(50 + Math.abs(score) * 1.3);

    const d = cfg.digits - 1;
    this.report = {
      trailStop: stop.toFixed(d),
      price:     last.toFixed(d),
      position:  above ? '🟢 Above (long bias)' : '🔴 Below (short bias)',
      trigger:   crossUp ? '▲ Fresh BUY cross' : crossDown ? '▼ Fresh SELL cross' : '— holding —',
      atr:       atr.toFixed(d),
    };
    this.lastLog = `UT-Bot ${this.signal.toUpperCase()} | ${this.report.trigger} | stop ${stop.toFixed(d)}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   ICHIMOKU KINKO HYO — All-in-one trend system (Phase 14)
   Note: skips Scalp/M1 mode — designed for H1+
   ═══════════════════════════════════════════════════════ */
class IchimokuAgent extends BaseAgent {
  constructor(team) {
    super('Ichimoku', 'Cloud + Tenkan/Kijun trend system', '🌥', team);
  }
  analyze(data) {
    const { candles, cfg } = data;
    if (!candles || candles.length < 78) {
      return { signal:'wait', conf:30, report:{ note:'ต้องการ 78+ แท่ง' }, log:'Insufficient data' };
    }

    // ── Skip if Scalp M1 mode (Ichimoku slow indicator, M1 = noise) ──
    if (typeof Settings !== 'undefined' && Settings.get('tradeMode', 'swing') === 'scalp') {
      return { signal:'wait', conf:40, report:{ note:'⏸ ไม่ใช้ใน Scalp Mode (slow indicator)' }, log:'Skipped — Scalp mode' };
    }

    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    // Tenkan-sen = (9-period H+L)/2
    const periodHL = (arr, hi, lo, n) => {
      const slice = arr.slice(-n);
      return slice.length === n ? (Math.max(...slice.map((_, i) => hi[hi.length - n + i])) +
                                   Math.min(...slice.map((_, i) => lo[lo.length - n + i]))) / 2 : null;
    };
    const tenkan = periodHL(closes, highs, lows, 9);
    const kijun  = periodHL(closes, highs, lows, 26);
    const senkouA = (tenkan && kijun) ? (tenkan + kijun) / 2 : null;
    const senkouB = periodHL(closes, highs, lows, 52);

    // Chikou span = current close shifted -26 (i.e. compare current close vs price 26 ago)
    const chikouRef = closes.at(-1);
    const priceAgo  = closes.length > 26 ? closes[closes.length - 27] : closes[0];
    const chikouBull = chikouRef > priceAgo;

    const last = closes.at(-1);
    if (!tenkan || !kijun || !senkouA || !senkouB) {
      return { signal:'wait', conf:35, report:{}, log:'Ichimoku calc failed' };
    }

    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBot = Math.min(senkouA, senkouB);

    // Score components
    let score = 0;
    let strength = [];

    // 1) Price vs cloud
    if (last > cloudTop)        { score += 25; strength.push('Above cloud'); }
    else if (last < cloudBot)   { score -= 25; strength.push('Below cloud'); }
    else                        { strength.push('In cloud (range)'); }

    // 2) Tenkan vs Kijun
    if (tenkan > kijun)         { score += 15; strength.push('T>K bull'); }
    else if (tenkan < kijun)    { score -= 15; strength.push('T<K bear'); }

    // 3) Cloud bias (Senkou A vs B)
    if (senkouA > senkouB)      { score += 10; strength.push('Future cloud green'); }
    else if (senkouA < senkouB) { score -= 10; strength.push('Future cloud red'); }

    // 4) Chikou confirmation
    if (chikouBull && score > 0)  score += 10;
    if (!chikouBull && score < 0) score -= 10;

    this.signal = score >= 25 ? 'buy' : score <= -25 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 0.8);

    const d = cfg.digits - 1;
    this.report = {
      tenkan:    tenkan.toFixed(d),
      kijun:     kijun.toFixed(d),
      cloudTop:  cloudTop.toFixed(d),
      cloudBot:  cloudBot.toFixed(d),
      position:  last > cloudTop ? '☁ Above' : last < cloudBot ? '☁ Below' : '☁ Inside',
      chikou:    chikouBull ? '▲ Bull' : '▼ Bear',
      strength:  strength.join(' | '),
    };
    this.lastLog = `Ichimoku ${this.signal.toUpperCase()} | ${strength.join(', ')} | score ${score}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   DXY (US Dollar Index) — confirm/veto USD pair signals
   Uses proxy: cached DXY price; updates from market.dxy if available
   Pure logic agent — no fetch (market.js handles fetch)
   ═══════════════════════════════════════════════════════ */
class DXYAgent extends BaseAgent {
  constructor(team) {
    super('DXY', 'USD Strength filter', '💵', team);
  }
  analyze(data) {
    const { cfg } = data;
    // DXY trend kept in market or computed from EURUSD inverse as fallback
    const dxyTrend = typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.market?.dxyTrend : null;
    const dxyPrice = typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.market?.dxyPrice : null;

    // Fallback: invert EURUSD trend (EURUSD = 57.6% of DXY, strongest correlate)
    if (dxyTrend == null) {
      const eurCandles = typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.market?.candles?.EURUSD : null;
      if (eurCandles && eurCandles.length >= 20) {
        const closes = eurCandles.map(c => c.close);
        const sma20 = closes.slice(-20).reduce((a,b)=>a+b,0)/20;
        const eurTrend = closes.at(-1) > sma20 ? +1 : -1;
        // EUR up → USD down → DXY down → invert
        const inferredDxyTrend = -eurTrend;
        return this._buildSignal(inferredDxyTrend, true, cfg);
      }
      return { signal:'wait', conf:40, report:{ note:'No DXY data yet' }, log:'No data' };
    }

    return this._buildSignal(dxyTrend, false, cfg);
  }

  _buildSignal(dxyTrend, inferred, cfg) {
    // dxyTrend > 0 = USD strong = USD pair (EURUSD/AUDUSD/XAUUSD) bearish
    // dxyTrend < 0 = USD weak = USD pair bullish
    let score = -dxyTrend * 20;   // invert
    if (Math.abs(dxyTrend) >= 2) score *= 1.3;   // strong trend amplify

    this.signal = score >= 15 ? 'buy' : score <= -15 ? 'sell' : 'watch';
    this.conf   = this._conf(50 + Math.abs(score) * 1.2 - (inferred ? 10 : 0));

    this.report = {
      dxyTrend:  dxyTrend > 0 ? `▲ +${dxyTrend.toFixed(2)} (USD strong)` :
                 dxyTrend < 0 ? `▼ ${dxyTrend.toFixed(2)} (USD weak)`    : '↔ flat',
      source:    inferred ? '(inferred from EURUSD)' : 'live DXY feed',
      pairBias:  dxyTrend > 0 ? '🔴 Bearish for USD pairs' : '🟢 Bullish for USD pairs',
    };
    this.lastLog = `DXY ${dxyTrend > 0 ? 'UP' : 'DOWN'} → ${this.signal.toUpperCase()} ${inferred ? '(inferred)' : ''}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

class NewsAgent extends BaseAgent {
  constructor(team, pairs) {
    super('News-Intel', 'Economic Events & Sentiment', '📰', team);
    this.pairs = pairs; // e.g. ['XAU','USD'] or ['AUD','EUR','USD']
  }

  // ── Day-of-week aware calendar — varies by weekday so it doesn't show the
  //    same events every day. Real solution would be ForexFactory webhook.
  _calendar() {
    const day = new Date().getUTCDay(); // 0=Sun..6=Sat
    const calendar = {
      1: [ // Monday
        { time: '01:30', event: 'AUD Retail Sales',           impact: 'medium', bias: 'neutral', curr: 'AUD' },
        { time: '14:00', event: 'USD ISM Manufacturing',       impact: 'high',   bias: 'bullish', curr: 'USD' },
      ],
      2: [ // Tuesday
        { time: '01:30', event: 'AUD RBA Rate Statement',      impact: 'high',   bias: 'hawkish', curr: 'AUD' },
        { time: '14:00', event: 'USD JOLTS Job Openings',       impact: 'high',   bias: 'neutral', curr: 'USD' },
      ],
      3: [ // Wednesday
        { time: '09:00', event: 'EUR CPI y/y Flash',            impact: 'high',   bias: 'bullish', curr: 'EUR' },
        { time: '12:15', event: 'USD ADP Employment',           impact: 'medium', bias: 'neutral', curr: 'USD' },
        { time: '18:00', event: 'USD FOMC Minutes',             impact: 'high',   bias: 'bearish', curr: 'USD' },
      ],
      4: [ // Thursday
        { time: '11:00', event: 'GBP BoE Rate Decision',        impact: 'high',   bias: 'neutral', curr: 'GBP' },
        { time: '12:30', event: 'USD Initial Jobless Claims',    impact: 'high',   bias: 'neutral', curr: 'USD' },
        { time: '12:45', event: 'EUR ECB Rate Decision',         impact: 'high',   bias: 'bearish', curr: 'EUR' },
      ],
      5: [ // Friday
        { time: '12:30', event: 'USD Non-Farm Payrolls',         impact: 'high',   bias: 'bullish', curr: 'USD' },
        { time: '12:30', event: 'USD Unemployment Rate',         impact: 'high',   bias: 'neutral', curr: 'USD' },
        { time: '14:00', event: 'USD Consumer Sentiment',        impact: 'medium', bias: 'neutral', curr: 'USD' },
      ],
      0: [ /* Sunday — markets mostly closed */ ],
      6: [ /* Saturday — markets closed */ ],
    };
    return calendar[day] || [];
  }

  _generateEvents() {
    const now    = new Date();
    const hUtc   = now.getUTCHours();
    const mUtc   = now.getUTCMinutes();
    const nowMin = hUtc * 60 + mUtc;
    const day    = now.getUTCDay();

    // No events on weekends (markets closed)
    if (day === 0 || day === 6) return [];

    const todays = this._calendar();

    // Compute minutes-away for each event (negative = past, positive = upcoming)
    const enriched = todays
      .filter(e => this.pairs.some(p => e.curr.includes(p)))
      .map(e => {
        const [eh, em] = e.time.split(':').map(Number);
        const eMin = eh * 60 + (em || 0);
        const minutesAway = eMin - nowMin;
        // Human-readable countdown
        let when;
        if (minutesAway >= 0) {
          const h = Math.floor(minutesAway / 60);
          const m = minutesAway % 60;
          when = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
        } else {
          const past = -minutesAway;
          const h = Math.floor(past / 60);
          const m = past % 60;
          when = h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
        }
        return { ...e, minutesAway, when };
      })
      // Within ±6h window (past 6h to next 6h)
      .filter(e => Math.abs(e.minutesAway) <= 360)
      // Sort: upcoming events first, then most-recent past
      .sort((a, b) => {
        if (a.minutesAway >= 0 && b.minutesAway < 0) return -1;
        if (a.minutesAway < 0 && b.minutesAway >= 0) return 1;
        return Math.abs(a.minutesAway) - Math.abs(b.minutesAway);
      });

    return enriched.slice(0, 4);
  }

  analyze() {
    const events = this._generateEvents();
    const session = TA.session();
    const h = new Date().getUTCHours();

    let bias = 0;
    events.forEach(e => {
      const w = e.impact === 'high' ? 3 : e.impact === 'medium' ? 2 : 1;
      if (e.bias === 'bullish' || e.bias === 'hawkish') bias += w;
      if (e.bias === 'bearish' || e.bias === 'dovish')  bias -= w;
    });

    const highImpact = events.filter(e => e.impact === 'high').length;
    const nearEvent  = events.some(e => {
      const [eh] = e.time.split(':').map(Number);
      return Math.abs(eh - h) <= 1;
    });

    let riskLevel = 'LOW';
    if (highImpact >= 2 || nearEvent) riskLevel = 'HIGH';
    else if (highImpact >= 1) riskLevel = 'MED';

    this.signal = riskLevel === 'HIGH' ? 'watch' :
                  bias >= 4 ? 'buy' : bias <= -4 ? 'sell' : 'wait';
    this.conf   = this._conf(50 + Math.min(25, Math.abs(bias) * 5));

    const biasTxt = bias >= 4 ? '🟢 Bullish' : bias <= -4 ? '🔴 Bearish' : '⚪ Neutral';

    this.report = {
      events,
      session:   `${session.flag} ${session.name} (${session.active ? 'ACTIVE' : 'OFF'})`,
      bias:      biasTxt,
      risk:      `${riskLevel} — ${highImpact} high-impact events`,
      nearEvent: nearEvent ? '⚠️ Event within 1h!' : '✓ No immediate events',
    };

    this.lastLog = `Session: ${session.name} | Bias: ${biasTxt} | Risk: ${riskLevel} | ${nearEvent ? '⚠️ Near event' : 'Clear'}`;
    return { signal: this.signal, conf: this.conf, report: this.report, log: this.lastLog };
  }
}

/* ═══════════════════════════════════════════════════════
   HEAD AGENT — Team Leader, Aggregates Analysts
   ═══════════════════════════════════════════════════════ */
class HeadAgent extends BaseAgent {
  constructor(name, team, symbol) {
    super(name, `${team} Team Leader`, '👑', team);
    this.symbol  = symbol;
    this.analysts = [];
  }

  addAnalyst(agent) { this.analysts.push(agent); }

  aggregate(results) {
    const weights = { 'buy': 1, 'sell': -1, 'watch': 0, 'wait': 0 };
    let weightedScore = 0, totalWeight = 0;

    const minWeight = typeof Settings !== 'undefined' ? Settings.get('minAgentWeight', 0.5) : 0.5;

    const activeResults = results.filter(r => r && (r.weightMul === undefined || r.weightMul >= minWeight));

    // Phase 14.2: Top-performer boost — agents with weightMul > 1.2 get 1.5x say
    activeResults.forEach(r => {
      const kbBoost = (r.weightMul !== undefined && r.weightMul > 1.2) ? 1.5 : 1.0;
      const w = (r.conf / 100) * (r.signal === 'buy' || r.signal === 'sell' ? 1.5 : 0.5) * kbBoost;
      weightedScore += (weights[r.signal] ?? 0) * r.conf * w;
      totalWeight   += r.conf * w;
    });

    const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Count votes
    const votes = { buy: 0, sell: 0, wait: 0, watch: 0 };
    activeResults.forEach(r => { votes[r.signal] = (votes[r.signal] || 0) + 1; });

    // ── Phase 14.2: Consensus + Conflict analysis ──
    const total      = activeResults.length;
    const directional = (votes.buy + votes.sell);
    const dominant   = Math.max(votes.buy, votes.sell);
    const consensusPct = total > 0 ? (dominant / total) * 100 : 0;
    // Conflict = directional vote going opposite to weighted normalized
    const proposedSig = normalized > 0 ? 'buy' : normalized < 0 ? 'sell' : 'wait';
    const conflictCount = proposedSig === 'buy' ? votes.sell : proposedSig === 'sell' ? votes.buy : 0;
    const conflictPct = total > 0 ? (conflictCount / total) * 100 : 0;

    // Base signal from normalized score
    let signal = normalized >= 0.3 ? 'buy' :
                 normalized <= -0.3 ? 'sell' :
                 Math.abs(normalized) < 0.1 ? 'wait' : 'watch';

    // Base conf
    let conf = Math.min(90, Math.abs(normalized) * 100 + 30);

    // Consensus bonus: if ≥70% agents agree on direction → +10 confidence
    if (consensusPct >= 70 && (signal === 'buy' || signal === 'sell')) {
      conf = Math.min(95, conf + 10);
    }
    // Conflict penalty: if ≥30% agents disagree → -15 confidence; signal may downgrade
    if (conflictPct >= 30 && (signal === 'buy' || signal === 'sell')) {
      conf = Math.max(30, conf - 15);
      if (conflictPct >= 40) signal = 'watch';   // strong conflict → don't trade
    }

    this.signal = signal;
    this.conf   = Math.round(conf);

    return {
      signal, conf: Math.round(conf), votes, normalized,
      consensusPct: Math.round(consensusPct),
      conflictPct:  Math.round(conflictPct),
      activeCount:  total,
      analysts: results
    };
  }
}

/* ═══════════════════════════════════════════════════════
   GOLD TEAM — XAUUSD (with toggleable analysts)
   ═══════════════════════════════════════════════════════ */
class GoldTeam {
  constructor() {
    this.name    = 'GOLD TEAM';
    this.symbol  = 'XAUUSD';
    this.icon    = '🥇';
    this.color   = 'gold';
    this.head      = new HeadAgent('Maj.Gold', 'GOLD', 'XAUUSD');
    this.smc       = new SMCAgent('GOLD');
    this.elliott   = new ElliottWaveAgent('GOLD');
    this.fib       = new FibonacciAgent('GOLD');
    this.rsi       = new RSIValueAgent('GOLD');
    this.macd       = new MACDAgent('GOLD');
    this.bollinger  = new BollingerAgent('GOLD');
    this.pivot      = new PivotAgent('GOLD');
    this.pattern    = new PatternAgent('GOLD');
    this.divergence = new DivergenceAgent('GOLD');
    this.mtf        = new MTFAgent('GOLD', 'XAUUSD');
    this.ichimoku   = new IchimokuAgent('GOLD');   // Phase 14
    this.dxy        = new DXYAgent('GOLD');         // Phase 14
    this.utbot      = new UTBotAgent('GOLD');       // Phase 15.3
    this.orderblock = new OrderBlockAgent('GOLD');  // Phase 19
    this.sweep      = new SweepAgent('GOLD');        // Phase 19
    this.breakout   = new BreakoutAgent('GOLD');     // Phase 19
    this.fvg        = new FVGAgent('GOLD');          // Phase 19.1
    this.news       = new NewsAgent('GOLD', ['XAU', 'USD']);
    this.sniper     = new PropFirmSniperAgent('GOLD', ['XAU', 'USD']);  // 🎯 Prop-firm hard filter
  }

  _on(key, def = true) {
    // Employee/combo era: always compute every analyst so any combo has its
    // agents (the old per-analyst toggles silently broke employee combos).
    return def;
  }

  /** Apply adaptive weight from AgentScores to an agent's report (regime-aware) */
  _applyWeight(report, agentName, regime, symbol) {
    if (typeof AgentScores === 'undefined' || !report) return report;
    const w = AgentScores.weight(agentName, { regime, symbol });
    if (w !== 1.0) {
      report.conf      = Math.max(20, Math.min(95, Math.round(report.conf * w)));
      report.weightMul = w;
    }
    return report;
  }

  analyze(data, market) {
    const agents = {};
    const reports = [];
    const regime = (typeof AgentScores !== 'undefined') ? AgentScores.classifyRegime(data.candles) : null;
    const wt = (r, name) => this._applyWeight(r, name, regime, 'XAUUSD');

    if (this._on('enableSMC',       true)) { agents.smc       = wt(this.smc.analyze(data),       'Gold-SMC');       reports.push(agents.smc); }
    if (this._on('enableElliott',   true)) { agents.elliott   = wt(this.elliott.analyze(data),   'Gold-Elliott');   reports.push(agents.elliott); }
    if (this._on('enableFib',       true)) { agents.fib       = wt(this.fib.analyze(data),       'Gold-Fib');       reports.push(agents.fib); }
    if (this._on('enableRSI',       true)) { agents.rsi       = wt(this.rsi.analyze(data),       'Gold-RSI');       reports.push(agents.rsi); }
    if (this._on('enableMACD',      true)) { agents.macd      = wt(this.macd.analyze(data),      'Gold-MACD');      reports.push(agents.macd); }
    if (this._on('enableBollinger', true)) { agents.bollinger = wt(this.bollinger.analyze(data), 'Gold-Bollinger'); reports.push(agents.bollinger); }
    if (this._on('enablePivot',     false)){ agents.pivot     = wt(this.pivot.analyze(data),     'Gold-Pivot');     reports.push(agents.pivot); }
    if (this._on('enablePattern',   true)) { agents.pattern    = wt(this.pattern.analyze(data),    'Gold-Pattern');    reports.push(agents.pattern); }
    if (this._on('enableDivergence',true)) { agents.divergence = wt(this.divergence.analyze(data), 'Gold-Divergence'); reports.push(agents.divergence); }
    if (this._on('enableMTF',       true) && market) { agents.mtf = wt(this.mtf.analyze(data, market), 'Gold-MTF'); reports.push(agents.mtf); }
    if (this._on('enableIchimoku',  true)) { agents.ichimoku  = wt(this.ichimoku.analyze(data),  'Gold-Ichimoku');  reports.push(agents.ichimoku); }
    if (this._on('enableDXY',       true)) { agents.dxy       = wt(this.dxy.analyze(data),       'Gold-DXY');       reports.push(agents.dxy); }
    if (this._on('enableUTBot',     true)) { agents.utbot     = wt(this.utbot.analyze(data),     'Gold-UT-Bot');    reports.push(agents.utbot); }
    if (this._on('enableOrderBlock',true)) { agents.orderblock= wt(this.orderblock.analyze(data),'Gold-OrderBlock');reports.push(agents.orderblock); }
    if (this._on('enableSweep',     true)) { agents.sweep     = wt(this.sweep.analyze(data),     'Gold-Sweep');     reports.push(agents.sweep); }
    if (this._on('enableBreakout',  true)) { agents.breakout  = wt(this.breakout.analyze(data),  'Gold-Breakout');  reports.push(agents.breakout); }
    if (this._on('enableFVG',       true)) { agents.fvg       = wt(this.fvg.analyze(data),       'Gold-FVG');       reports.push(agents.fvg); }
    if (this._on('enableNews',      true)) { agents.news      = wt(this.news.analyze(),          'Gold-News');      reports.push(agents.news); }
    if (this._on('enableSniper',    true)) { agents.sniper    = wt(this.sniper.analyze(data),    'Gold-FirmSniper'); reports.push(agents.sniper); }

    const agg = this.head.aggregate(reports);

    return {
      team: this.name, symbol: this.symbol, icon: this.icon, color: this.color,
      head: { signal: agg.signal, conf: agg.conf, votes: agg.votes },
      agents,
      price: data.price,
      cfg:   data.cfg,
    };
  }
}

/* ═══════════════════════════════════════════════════════
   CURRENCY TEAM — AUDUSD + EURUSD
   ═══════════════════════════════════════════════════════ */
class CurrencyTeam {
  constructor() {
    this.name    = 'CURRENCY TEAM';
    this.symbols = ['AUDUSD', 'EURUSD'];
    this.icon    = '💱';
    this.color   = 'teal';

    // AUDUSD sub-analysts
    this.aud = {
      head:      new HeadAgent('Lt.AUD', 'AUDUSD', 'AUDUSD'),
      smc:       new SMCAgent('AUDUSD'),
      elliott:   new ElliottWaveAgent('AUDUSD'),
      fib:       new FibonacciAgent('AUDUSD'),
      rsi:       new RSIValueAgent('AUDUSD'),
      macd:      new MACDAgent('AUDUSD'),
      bollinger:  new BollingerAgent('AUDUSD'),
      pivot:      new PivotAgent('AUDUSD'),
      pattern:    new PatternAgent('AUDUSD'),
      divergence: new DivergenceAgent('AUDUSD'),
      mtf:        new MTFAgent('AUDUSD', 'AUDUSD'),
      ichimoku:   new IchimokuAgent('AUDUSD'),   // Phase 14
      dxy:        new DXYAgent('AUDUSD'),         // Phase 14
      utbot:      new UTBotAgent('AUDUSD'),       // Phase 15.3
      orderblock: new OrderBlockAgent('AUDUSD'),  // Phase 19
      sweep:      new SweepAgent('AUDUSD'),
      breakout:   new BreakoutAgent('AUDUSD'),
      fvg:        new FVGAgent('AUDUSD'),          // Phase 19.1
      sniper:     new PropFirmSniperAgent('AUDUSD', ['AUD', 'USD']),  // 🎯 Prop-firm hard filter
    };

    // EURUSD sub-analysts
    this.eur = {
      head:       new HeadAgent('Lt.EUR', 'EURUSD', 'EURUSD'),
      smc:        new SMCAgent('EURUSD'),
      elliott:    new ElliottWaveAgent('EURUSD'),
      fib:        new FibonacciAgent('EURUSD'),
      rsi:        new RSIValueAgent('EURUSD'),
      macd:       new MACDAgent('EURUSD'),
      bollinger:  new BollingerAgent('EURUSD'),
      pivot:      new PivotAgent('EURUSD'),
      pattern:    new PatternAgent('EURUSD'),
      divergence: new DivergenceAgent('EURUSD'),
      mtf:        new MTFAgent('EURUSD', 'EURUSD'),
      ichimoku:   new IchimokuAgent('EURUSD'),   // Phase 14
      dxy:        new DXYAgent('EURUSD'),         // Phase 14
      utbot:      new UTBotAgent('EURUSD'),       // Phase 15.3
      orderblock: new OrderBlockAgent('EURUSD'),  // Phase 19
      sweep:      new SweepAgent('EURUSD'),
      breakout:   new BreakoutAgent('EURUSD'),
      fvg:        new FVGAgent('EURUSD'),          // Phase 19.1
      sniper:     new PropFirmSniperAgent('EURUSD', ['EUR', 'USD']),  // 🎯 Prop-firm hard filter
    };

    this.news    = new NewsAgent('CURRENCY', ['AUD', 'EUR', 'USD']);
    this.head    = new HeadAgent('Maj.FX', 'CURRENCY', 'FX');

    [this.aud, this.eur].forEach(t => {
      t.head.addAnalyst(t.smc);
      t.head.addAnalyst(t.elliott);
      t.head.addAnalyst(t.fib);
      t.head.addAnalyst(t.rsi);
    });
  }

  _on(key, def = true) {
    // Employee/combo era: always compute every analyst so any combo has its
    // agents (the old per-analyst toggles silently broke employee combos).
    return def;
  }

  _applyWeight(report, agentName, regime, symbol) {
    if (typeof AgentScores === 'undefined' || !report) return report;
    const w = AgentScores.weight(agentName, { regime, symbol });
    if (w !== 1.0) {
      report.conf      = Math.max(20, Math.min(95, Math.round(report.conf * w)));
      report.weightMul = w;
    }
    return report;
  }

  _analyzePair(pair, data, prefix, market) {
    const agents = {};
    const reports = [];
    const regime = (typeof AgentScores !== 'undefined') ? AgentScores.classifyRegime(data.candles) : null;
    const symbol = prefix === 'AUD' ? 'AUDUSD' : 'EURUSD';
    const wt = (r, name) => this._applyWeight(r, prefix + '-' + name, regime, symbol);

    if (this._on('enableSMC',       true)) { agents.smc       = wt(pair.smc.analyze(data),       'SMC');       reports.push(agents.smc); }
    if (this._on('enableElliott',   true)) { agents.elliott   = wt(pair.elliott.analyze(data),   'Elliott');   reports.push(agents.elliott); }
    if (this._on('enableFib',       true)) { agents.fib       = wt(pair.fib.analyze(data),       'Fib');       reports.push(agents.fib); }
    if (this._on('enableRSI',       true)) { agents.rsi       = wt(pair.rsi.analyze(data),       'RSI');       reports.push(agents.rsi); }
    if (this._on('enableMACD',      true)) { agents.macd      = wt(pair.macd.analyze(data),      'MACD');      reports.push(agents.macd); }
    if (this._on('enableBollinger', true)) { agents.bollinger = wt(pair.bollinger.analyze(data), 'Bollinger'); reports.push(agents.bollinger); }
    if (this._on('enablePivot',     false)){ agents.pivot     = wt(pair.pivot.analyze(data),     'Pivot');     reports.push(agents.pivot); }
    if (this._on('enablePattern',   true)) { agents.pattern    = wt(pair.pattern.analyze(data),    'Pattern');    reports.push(agents.pattern); }
    if (this._on('enableDivergence',true)) { agents.divergence = wt(pair.divergence.analyze(data), 'Divergence'); reports.push(agents.divergence); }
    if (this._on('enableMTF',       true) && market) { agents.mtf = wt(pair.mtf.analyze(data, market), 'MTF'); reports.push(agents.mtf); }
    if (this._on('enableIchimoku',  true)) { agents.ichimoku  = wt(pair.ichimoku.analyze(data),  'Ichimoku');  reports.push(agents.ichimoku); }
    if (this._on('enableDXY',       true)) { agents.dxy       = wt(pair.dxy.analyze(data),       'DXY');       reports.push(agents.dxy); }
    if (this._on('enableUTBot',     true)) { agents.utbot     = wt(pair.utbot.analyze(data),     'UT-Bot');    reports.push(agents.utbot); }
    if (this._on('enableOrderBlock',true)) { agents.orderblock= wt(pair.orderblock.analyze(data),'OrderBlock');reports.push(agents.orderblock); }
    if (this._on('enableSweep',     true)) { agents.sweep     = wt(pair.sweep.analyze(data),     'Sweep');     reports.push(agents.sweep); }
    if (this._on('enableBreakout',  true)) { agents.breakout  = wt(pair.breakout.analyze(data),  'Breakout');  reports.push(agents.breakout); }
    if (this._on('enableFVG',       true)) { agents.fvg       = wt(pair.fvg.analyze(data),       'FVG');       reports.push(agents.fvg); }
    if (this._on('enableSniper',    true)) { agents.sniper    = wt(pair.sniper.analyze(data),    'FirmSniper'); reports.push(agents.sniper); }
    return { agents, agg: pair.head.aggregate(reports) };
  }

  analyze(audData, eurData, market) {
    const audRes = this._analyzePair(this.aud, audData, 'AUD', market);
    const eurRes = this._analyzePair(this.eur, eurData, 'EUR', market);
    const audAgg = audRes.agg;
    const eurAgg = eurRes.agg;
    const newsR  = this._on('enableNews', true) ? this.news.analyze() : { signal:'wait', conf:50, report:{events:[]} };

    // Overall team decision (best opportunity between AUD and EUR)
    const combined = this.head.aggregate([
      { signal: audAgg.signal, conf: audAgg.conf },
      { signal: eurAgg.signal, conf: eurAgg.conf },
      newsR,
    ]);

    // Determine which pair has better setup
    const leadPair = audAgg.conf >= eurAgg.conf ? 'AUDUSD' : 'EURUSD';

    return {
      team: this.name, symbols: this.symbols, icon: this.icon, color: this.color,
      head:   { signal: combined.signal, conf: combined.conf, votes: combined.votes, leadPair },
      aud:    { signal: audAgg.signal, conf: audAgg.conf, votes: audAgg.votes, price: audData.price, cfg: audData.cfg, agents: audRes.agents },
      eur:    { signal: eurAgg.signal, conf: eurAgg.conf, votes: eurAgg.votes, price: eurData.price, cfg: eurData.cfg, agents: eurRes.agents },
      news:   newsR,
    };
  }
}

/* ═══════════════════════════════════════════════════════
   ₿ CRYPTO DESK — BTCUSD (24/7, trades weekends too)
   Single-symbol team; computes the full agent set so any combo works.
   ═══════════════════════════════════════════════════════ */
class BtcTeam {
  constructor() {
    this.name = 'CRYPTO DESK'; this.symbol = 'BTCUSD'; this.icon = '₿'; this.color = 'orange';
    const S = 'BTCUSD';
    this.head       = new HeadAgent('Maj.BTC', 'BTC', 'BTCUSD');
    this.smc        = new SMCAgent(S);
    this.elliott    = new ElliottWaveAgent(S);
    this.fib        = new FibonacciAgent(S);
    this.rsi        = new RSIValueAgent(S);
    this.macd       = new MACDAgent(S);
    this.bollinger  = new BollingerAgent(S);
    this.pattern    = new PatternAgent(S);
    this.divergence = new DivergenceAgent(S);
    this.mtf        = new MTFAgent(S, 'BTCUSD');
    this.ichimoku   = new IchimokuAgent(S);
    this.dxy        = new DXYAgent(S);
    this.utbot      = new UTBotAgent(S);
    this.orderblock = new OrderBlockAgent(S);
    this.sweep      = new SweepAgent(S);
    this.breakout   = new BreakoutAgent(S);
    this.fvg        = new FVGAgent(S);
    this.sniper     = new PropFirmSniperAgent(S, ['BTC', 'USD']);
  }
  analyze(data, market) {
    const a = {}, reps = [];
    const P = (k, r) => { a[k] = r; reps.push(r); };
    P('smc', this.smc.analyze(data));         P('elliott', this.elliott.analyze(data));
    P('fib', this.fib.analyze(data));         P('rsi', this.rsi.analyze(data));
    P('macd', this.macd.analyze(data));       P('bollinger', this.bollinger.analyze(data));
    P('pattern', this.pattern.analyze(data)); P('divergence', this.divergence.analyze(data));
    if (market) P('mtf', this.mtf.analyze(data, market));
    P('ichimoku', this.ichimoku.analyze(data)); P('dxy', this.dxy.analyze(data));
    P('utbot', this.utbot.analyze(data));     P('orderblock', this.orderblock.analyze(data));
    P('sweep', this.sweep.analyze(data));     P('breakout', this.breakout.analyze(data));
    P('fvg', this.fvg.analyze(data));         P('sniper', this.sniper.analyze(data));
    const agg = this.head.aggregate(reps);
    return { team: this.name, symbol: this.symbol, icon: this.icon, color: this.color,
             head: { signal: agg.signal, conf: agg.conf, votes: agg.votes },
             agents: a, price: data.price, cfg: data.cfg };
  }
}

/* ═══════════════════════════════════════════════════════
   COMMANDER — Final Orchestrator
   ═══════════════════════════════════════════════════════ */
class Commander {
  constructor() {
    this.name = 'Commander';
    this.rank = 'GENERAL';
  }

  decide(goldReport, currReport) {
    let goldConf  = goldReport.head.conf;
    let currConf  = currReport.head.conf;
    let goldSig   = goldReport.head.signal;
    let currSig   = currReport.head.signal;

    // ── ADX gate: ในตลาด sideway (ADX ต่ำ) ลด confidence + ห้าม buy/sell signal ──
    const adxGate = (typeof Settings !== 'undefined') ? Settings.get('adxGate', 20) : 20;
    if (adxGate > 0) {
      const goldADX = parseFloat((goldReport.agents?.rsi?.report?.adx + '').split(' ')[0]) || 25;
      const audADX  = parseFloat((currReport.aud?.agents?.rsi?.report?.adx + '').split(' ')[0]) || 25;
      if (goldADX < adxGate && (goldSig === 'buy' || goldSig === 'sell')) {
        goldSig = 'watch'; goldConf = Math.min(goldConf, 50);
      }
      if (audADX < adxGate && (currSig === 'buy' || currSig === 'sell')) {
        currSig = 'watch'; currConf = Math.min(currConf, 50);
      }
    }

    // Phase 14.2: Commander consensus filter
    // Require minimum team consensus before generating buy/sell
    const minConsensus = 55;   // need 55%+ agents on same side to trade
    const goldConsensus = goldReport.head.consensusPct ?? 0;
    const audConsensus  = currReport.aud?.consensusPct ?? currReport.head.consensusPct ?? 0;
    const eurConsensus  = currReport.eur?.consensusPct ?? currReport.head.consensusPct ?? 0;

    if ((goldSig === 'buy' || goldSig === 'sell') && goldConsensus < minConsensus) {
      goldSig = 'watch';
      goldConf = Math.max(30, goldConf - 20);
    }
    if ((currSig === 'buy' || currSig === 'sell')) {
      const usedConsensus = currReport.head.leadPair === 'AUDUSD' ? audConsensus : eurConsensus;
      if (usedConsensus < minConsensus) {
        currSig = 'watch';
        currConf = Math.max(30, currConf - 20);
      }
    }

    // Pick highest-confidence actionable signal
    let primary = null;
    if ((goldSig === 'buy' || goldSig === 'sell') && goldConf >= 50) {
      primary = { sym: 'XAUUSD', signal: goldSig, conf: goldConf, price: goldReport.price, cfg: goldReport.cfg, consensus: goldConsensus };
    }
    if ((currSig === 'buy' || currSig === 'sell') && currConf >= (primary?.conf ?? 0)) {
      const fxSym = currReport.head.leadPair;
      const fxData = fxSym === 'AUDUSD' ? currReport.aud : currReport.eur;
      const fxConsensus = fxSym === 'AUDUSD' ? audConsensus : eurConsensus;
      primary = { sym: fxSym, signal: currSig, conf: currConf, price: fxData.price, cfg: fxData.cfg, consensus: fxConsensus };
    }

    if (!primary) {
      primary = { sym: 'ALL', signal: 'wait', conf: 30, price: goldReport.price, cfg: goldReport.cfg, consensus: 0 };
    }

    const { sym, signal, conf, price, cfg } = primary;
    const atr   = cfg.atr;

    // Trade mode multipliers — Scalp = quick in/out, Swing = hours, Position = days
    const mode  = (typeof Settings !== 'undefined') ? Settings.get('tradeMode', 'swing') : 'swing';
    const MODES = {
      scalp:    { slMult: 0.5, tpBase: 0.6, label: 'Scalp ⚡' },
      swing:    { slMult: 1.5, tpBase: 1.5, label: 'Swing 🌊' },
      position: { slMult: 2.5, tpBase: 2.5, label: 'Position 🏔' },
    };
    const m = MODES[mode] || MODES.swing;
    const rr = m.tpBase + (conf / 100) * 0.5; // confidence boost

    const sl    = signal === 'buy'  ? price - atr * m.slMult  : price + atr * m.slMult;
    const tp1   = signal === 'buy'  ? price + atr * rr        : price - atr * rr;
    const tp2   = signal === 'buy'  ? price + atr * rr * 2    : price - atr * rr * 2;
    const posSize = Math.min(2, (conf / 100) * 1.5).toFixed(1);
    const rrRatio = (Math.abs(tp1 - price) / Math.max(0.0001, Math.abs(sl - price))).toFixed(2);
    const d = cfg.digits - 1;

    // Position size calculator — lot จากบัญชี + risk%
    const accSize = typeof Settings !== 'undefined' ? Settings.get('accountSize', 30) : 30;
    const riskPct = typeof Settings !== 'undefined' ? Settings.get('riskPerTrade', 2) : 2;
    const riskUSD = accSize * (riskPct / 100);
    const slDist  = Math.abs(price - sl);
    // Pip value per 0.01 lot (micro):
    //   Forex: $0.10 per pip
    //   Gold:  $0.01 per $1 (so per "pip" = per $1) = $1 per $1 movement
    // We'll compute USD-loss per 0.01 lot at the SL distance
    let lossPer001Lot;
    if (sym === 'XAUUSD') {
      // 0.01 lot Gold = 1 oz, $1 move = $1 loss
      lossPer001Lot = slDist * 1;
    } else {
      // 0.01 lot FX = $0.10 per pip; pip = 0.0001 for AUD/EUR
      lossPer001Lot = (slDist / cfg.pip) * 0.10;
    }
    // Lot size that risks exactly riskUSD
    let recLot = lossPer001Lot > 0 ? (riskUSD / lossPer001Lot) * 0.01 : 0.01;
    const idealLot = recLot;
    recLot = Math.max(0.01, Math.min(10, recLot)); // clamp to broker limits
    recLot = +recLot.toFixed(2);
    const actualRisk = recLot / 0.01 * lossPer001Lot;
    const tpReward   = Math.abs(price - tp1) / slDist * actualRisk;
    const actualRiskPct = (actualRisk / accSize * 100).toFixed(1);
    // Warning if lot floor 0.01 causes risk > target
    const riskWarning = idealLot < 0.01
      ? `⚠️ Risk ${actualRiskPct}% เกินเป้า ${riskPct}% — ใช้ cent account หรือ TF เล็กกว่า`
      : null;

    // Aggregate votes from all analysts
    const allVotes = {
      SMC:     this._pickVote(goldReport.agents?.smc?.signal, currReport.aud?.agents?.smc?.signal),
      Elliott: this._pickVote(goldReport.agents?.elliott?.signal, currReport.aud?.agents?.elliott?.signal),
      Fib:     this._pickVote(goldReport.agents?.fib?.signal, currReport.aud?.agents?.fib?.signal),
      RSI:     this._pickVote(goldReport.agents?.rsi?.signal, currReport.aud?.agents?.rsi?.signal),
      News:    goldReport.agents?.news?.signal ?? 'wait',
    };

    return {
      signal, sym, conf,
      entry:  price.toFixed(d),
      sl:     sl.toFixed(d),
      tp1:    tp1.toFixed(d),
      tp2:    tp2.toFixed(d),
      rr:     `1:${rrRatio}`,
      pos:    `${posSize}%`,
      mode:   m.label,
      // Position sizing
      lotSize:    recLot.toFixed(2),
      riskUSD:    actualRisk.toFixed(2),
      rewardUSD:  tpReward.toFixed(2),
      accountSize: accSize,
      actualRiskPct,
      targetRiskPct: riskPct,
      riskWarning,
      votes:  allVotes,
      goldSig, goldConf, currSig, currConf,
      consensus: primary.consensus ?? 0,
      goldConsensus: Math.round(goldConsensus),
      audConsensus:  Math.round(audConsensus),
      eurConsensus:  Math.round(eurConsensus),
      summary: signal === 'wait' || signal === 'watch'
        ? `⏸ STANDBY — No high-confidence setup detected`
        : `${signal.toUpperCase()} ${sym} @ ${price.toFixed(d)} | SL ${sl.toFixed(d)} | TP1 ${tp1.toFixed(d)}`,
    };
  }

  _pickVote(g, c) {
    if (!g && !c) return 'wait';
    if (!c) return g;
    if (!g) return c;
    if (g === c) return g;
    if ((g === 'buy' && c === 'sell') || (g === 'sell' && c === 'buy')) return 'watch';
    return g === 'wait' ? c : g;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SMCAgent, ElliottWaveAgent, FibonacciAgent, RSIValueAgent, NewsAgent, HeadAgent, GoldTeam, CurrencyTeam, Commander };
}
