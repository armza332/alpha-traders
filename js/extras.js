/* ═══════════════════════════════════════════════════════
   EXTRAS — Signal Grading + Telegram + Settings + Help
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   CONFLUENCE — Category-based multi-technique agreement
   วิเคราะห์ว่าเทคนิคหลายประเภทเห็นด้วยกับสัญญาณไหม
   เหมือนกับ trader จริงดู trend + momentum + structure + pattern พร้อมกัน
   ═══════════════════════════════════════════════════════ */
const Confluence = {
  CATEGORIES: {
    TREND:     { icon: '📈', agents: ['mtf', 'elliott'] },
    MOMENTUM:  { icon: '⚡', agents: ['macd', 'rsi'] },
    STRUCTURE: { icon: '🏛', agents: ['smc', 'fib', 'pivot', 'bollinger'] },
    PATTERN:   { icon: '🕯', agents: ['pattern'] },
    SENTIMENT: { icon: '📰', agents: ['news'] },
  },

  /** Returns breakdown of category alignment with the given signal */
  analyze(agents, signal) {
    if (!agents || (signal !== 'buy' && signal !== 'sell')) {
      return { score: 0, aligned: 0, total: 0, breakdown: {}, label: '— Wait' };
    }
    const breakdown = {};
    let alignedCats = 0, totalCats = 0;

    for (const [cat, def] of Object.entries(this.CATEGORIES)) {
      const live = def.agents.map(name => agents[name]).filter(Boolean);
      if (live.length === 0) continue;
      totalCats++;
      const agree = live.filter(a => a.signal === signal).length;
      const dissent = live.filter(a => a.signal === (signal === 'buy' ? 'sell' : 'buy')).length;
      const aligned = agree > dissent && agree >= 1;
      if (aligned) alignedCats++;
      breakdown[cat] = {
        icon: def.icon,
        active: live.length,
        agree, dissent,
        aligned,
      };
    }

    const score = totalCats > 0 ? alignedCats / totalCats : 0;
    const label =
      score >= 0.8 ? '🟢 STRONG'    :
      score >= 0.6 ? '🟡 GOOD'      :
      score >= 0.4 ? '🟠 PARTIAL'   :
                     '🔴 WEAK';
    return { score, aligned: alignedCats, total: totalCats, breakdown, label };
  },

  /** Adjust grade based on confluence — boost or demote */
  adjustGrade(originalGrade, confluenceScore) {
    const order = ['D', 'C', 'B', 'A', 'S+'];
    let idx = order.indexOf(originalGrade);
    if (idx < 0) return originalGrade;
    if (confluenceScore >= 0.8) idx = Math.min(order.length - 1, idx + 1); // boost
    if (confluenceScore < 0.4)  idx = Math.max(0, idx - 1);                // demote
    return order[idx];
  },

  /** Render UI block for Commander panel */
  render(c) {
    if (!c || c.total === 0) return '';
    const rows = Object.entries(c.breakdown).map(([cat, d]) => {
      const mark = d.aligned ? '✅' : (d.dissent > d.agree ? '❌' : '⚪');
      const cls  = d.aligned ? 'text-green' : (d.dissent > d.agree ? 'text-red' : 'text-gray');
      return `<div class="row" style="font-size:6px">
        <span class="lbl">${d.icon} ${cat}</span>
        <span class="val ${cls}">${mark} ${d.agree}/${d.active}</span>
      </div>`;
    }).join('');
    return `<div style="margin-top:8px">
      <div class="cmd-section-title" style="font-size:7px;color:var(--gold)">⚖ CONFLUENCE — ${c.label} (${c.aligned}/${c.total})</div>
      <div class="trade-params">${rows}</div>
    </div>`;
  },
};
window.Confluence = Confluence;

/* ─── Signal Grading System ─── */
const SignalGrade = {

  /**
   * Grade a Commander signal:
   *   S+ = 90%+ Strong  (BIG ALERT, push Telegram)
   *   A  = 80–89%       (high confidence, push Telegram)
   *   B  = 65–79%       (good setup, watchlist)
   *   C  = 50–64%       (mediocre)
   *   D  = below 50%    (skip)
   */
  grade(cmdReport, goldReport, currReport) {
    const conf      = cmdReport.conf;
    const signal    = cmdReport.signal;
    const allAgents = [
      goldReport.agents.smc, goldReport.agents.elliott, goldReport.agents.fib, goldReport.agents.rsi,
      currReport.aud?.agents?.smc, currReport.aud?.agents?.elliott,
      currReport.eur?.agents?.smc, currReport.eur?.agents?.elliott,
    ].filter(Boolean);

    // Count how many agents AGREE with the final signal
    const agree = allAgents.filter(a => a.signal === signal).length;
    const total = allAgents.length;
    const consensus = total > 0 ? agree / total : 0;

    // Final score = confidence × consensus
    const finalScore = conf * (0.5 + consensus * 0.5);

    let grade, color, alert, sound;
    if (signal === 'wait' || signal === 'watch' || finalScore < 50) {
      grade = 'D'; color = '#555577'; alert = false; sound = false;
    } else if (finalScore >= 88) {
      grade = 'S+'; color = '#ff00ff'; alert = true; sound = true;
    } else if (finalScore >= 80) {
      grade = 'A';  color = '#00ff41'; alert = true; sound = true;
    } else if (finalScore >= 65) {
      grade = 'B';  color = '#ffe600'; alert = false; sound = false;
    } else {
      grade = 'C';  color = '#ff8c00'; alert = false; sound = false;
    }

    return {
      grade, color, alert, sound,
      conf,
      consensus: Math.round(consensus * 100),
      agree, total,
      finalScore: Math.round(finalScore),
    };
  },

  /** Render the big alert banner */
  renderBanner(cmdReport, gradeInfo) {
    const el = document.getElementById('alert-banner');
    if (!el) return;

    if (!gradeInfo.alert) {
      el.style.display = 'none';
      return;
    }

    const isB = cmdReport.signal === 'buy';
    const arrow = isB ? '▲' : '▼';
    const sigClass = isB ? 'buy' : 'sell';

    el.style.display = 'flex';
    el.className = `alert-banner ${sigClass}`;
    el.innerHTML = `
      <div class="banner-grade" style="background:${gradeInfo.color};color:#000">
        ${gradeInfo.grade}
      </div>
      <div class="banner-text">
        <div class="banner-action">${arrow} ${cmdReport.signal.toUpperCase()} ${cmdReport.sym}</div>
        <div class="banner-detail">
          ENTRY ${cmdReport.entry} • SL ${cmdReport.sl} • TP1 ${cmdReport.tp1} • R:R ${cmdReport.rr}
        </div>
        <div class="banner-meta">
          Confidence ${cmdReport.conf}% • Consensus ${gradeInfo.agree}/${gradeInfo.total} agents agree • Score ${gradeInfo.finalScore}
        </div>
      </div>
      <div class="banner-cta">
        ${gradeInfo.grade === 'S+' ? '🚨 STRONG SIGNAL' : '⚡ HIGH PROBABILITY'}
      </div>
    `;
  },

  /** Render grade badge in commander panel */
  renderGradeBadge(gradeInfo) {
    return `<div class="grade-badge" style="border-color:${gradeInfo.color};color:${gradeInfo.color}">
      <div class="grade-letter">${gradeInfo.grade}</div>
      <div class="grade-score">${gradeInfo.finalScore}/100</div>
    </div>`;
  },

  /** Play sound alert */
  playSound(gradeInfo) {
    if (!gradeInfo.sound) return;
    if (!Settings.get('sound', true)) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = gradeInfo.grade === 'S+' ? 880 : 660;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      setTimeout(() => { osc.stop(); ctx.close(); }, 350);
    } catch (e) { /* ignore */ }
  },
};

/* ═══════════════════════════════════════════════════════
   SETTINGS — localStorage backed
   ═══════════════════════════════════════════════════════ */
const Settings = {
  KEY: 'twr_settings',
  defaults: {
    telegramToken:  '',
    telegramChatId: '',
    telegramOn:     false,
    minGrade:       'A',
    sound:          true,
    cooldownMin:    5,
    priceApiKey:    '',
    priceFeedOn:    false,
    priceRefreshSec: 300,
    apiSaver:        true,
    apiProvider:    'twelvedata',  // 'twelvedata' | 'oanda'
    oandaToken:     '',
    oandaAccountId: '',
    tradeMode:      'swing',  // scalp | swing | position
    enableXAU:      true,
    enableAUD:      true,
    enableEUR:      true,
    enableBTC:      true,     // ₿ crypto desk (24/7)
    adxGate:        20,       // skip signal if ADX below this (0 = off)
    // Analyst toggles
    enableSMC:       true,
    enableElliott:   true,
    enableFib:       true,
    enableRSI:       true,
    enableMACD:      true,
    enableBollinger: true,
    enablePivot:     false,   // off by default — overlaps with Fib S/R
    enablePattern:   true,
    enableNews:      true,
    enableMTF:       true,
    enableDivergence: true,
    minAgentWeight:  0.5,     // skip agents with KB weight below this in voting
    keepAlive:       true,    // wake lock + browser notification
    accountSize:     30,      // USD balance — used to calculate lot size
    riskPerTrade:    2,       // % of account per trade
    accountCurrency: 'USD',
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.data = raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    } catch (e) { this.data = { ...this.defaults }; }
    return this.data;
  },

  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },

  get(key, fallback) { return this.data?.[key] ?? fallback; },
  set(key, val)      { this.data[key] = val; this.save(); },
};

Settings.load();

/* ═══════════════════════════════════════════════════════
   TELEGRAM BOT INTEGRATION
   ─ auto-detect: ถ้าอยู่บน Apps Script → ใช้ google.script.run (server-side, ปลอดภัย)
                 ถ้า static hosting → ใช้ fetch ตรงไป Telegram API
   ═══════════════════════════════════════════════════════ */
const Telegram = {
  lastSent: 0,

  /** Detect if running inside Google Apps Script HtmlService */
  _onAppsScript() {
    return typeof google !== 'undefined' && google.script && google.script.run;
  },

  /** Send via Apps Script server-side bridge */
  _sendViaAppsScript(msg) {
    return new Promise((resolve) => {
      google.script.run
        .withSuccessHandler(r => resolve(r && r.ok ? { ok: true } : { ok: false, msg: r?.error || 'failed' }))
        .withFailureHandler(e => resolve({ ok: false, msg: e.message }))
        .sendTelegram(msg);
    });
  },

  /** Send via direct browser fetch */
  async _sendViaFetch(msg) {
    const token  = Settings.get('telegramToken');
    const chatId = Settings.get('telegramChatId');
    if (!token || !chatId) return { ok: false, msg: 'Token หรือ Chat ID ว่าง' };
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
      });
      const data = await r.json();
      return data.ok ? { ok: true } : { ok: false, msg: data.description };
    } catch (e) { return { ok: false, msg: e.message }; }
  },

  async _send(msg) {
    return this._onAppsScript() ? this._sendViaAppsScript(msg) : this._sendViaFetch(msg);
  },

  // ── Thai translation of economic events ──
  _thaiEvents: {
    'USD Core PCE m/m':             'USD เงินเฟ้อ Core PCE รายเดือน',
    'USD Initial Jobless Claims':    'USD ผู้ขอสวัสดิการว่างงานครั้งแรก',
    'USD GDP q/q Second Estimate':   'USD GDP รายไตรมาส (ครั้งที่ 2)',
    'USD Non-Farm Payrolls':         'USD การจ้างงานนอกภาคเกษตร (NFP) ⭐',
    'USD Unemployment Rate':         'USD อัตราว่างงาน',
    'USD ISM Manufacturing':         'USD ISM ภาคการผลิต',
    'USD JOLTS Job Openings':        'USD ตำแหน่งงานว่าง (JOLTS)',
    'USD FOMC Minutes':              'USD รายงานการประชุม FOMC ⭐',
    'USD ADP Employment':            'USD การจ้างงาน ADP',
    'USD Consumer Sentiment':        'USD ความเชื่อมั่นผู้บริโภค',
    'EUR CPI y/y Flash':             'EUR เงินเฟ้อ CPI รายปี (Flash)',
    'EUR ECB Rate Decision':         'EUR ECB ประกาศอัตราดอกเบี้ย ⭐',
    'GBP BoE Rate Decision':         'GBP BoE ประกาศอัตราดอกเบี้ย',
    'GBP Manufacturing PMI':         'GBP PMI ภาคการผลิต',
    'AUD RBA Rate Statement':        'AUD RBA แถลงนโยบายอัตราดอกเบี้ย',
    'AUD RBA Meeting Minutes':       'AUD รายงานการประชุม RBA',
    'AUD CPI q/q':                   'AUD เงินเฟ้อ CPI รายไตรมาส',
    'AUD Retail Sales':              'AUD ยอดค้าปลีก',
    'XAU/Gold Technical Support':    'XAU แนวรับเชิงเทคนิคของทอง',
  },

  _impactThai: { high: '🔴 สำคัญมาก', medium: '🟡 ปานกลาง', low: '🟢 ผลน้อย' },
  _biasThai:   {
    bullish: '📈 หนุน', bearish: '📉 กด',
    hawkish: '🦅 hawkish', dovish: '🕊 dovish',
    neutral: '⚪ กลาง',
  },

  /** ส่งสรุปข่าวประจำวันเป็นภาษาไทย */
  async sendDailyNews() {
    if (!Settings.get('telegramOn') && !this._onAppsScript()) return { ok:false, msg:'Telegram ปิดอยู่' };

    // รวม events จาก calendar ของ NewsAgent
    const day = new Date().getUTCDay();
    const dayName = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][day];

    if (day === 0 || day === 6) {
      const msg = `📰 <b>ข่าวเศรษฐกิจวัน${dayName}</b>\n\n💤 ตลาดปิด (สุดสัปดาห์)\nไม่มี high-impact news`;
      const r = await this._send(msg);
      return r;
    }

    const newsAgent = new NewsAgent('ALL', ['XAU', 'USD', 'AUD', 'EUR', 'GBP']);
    const all = newsAgent._calendar();

    // กรองตาม symbols ที่ user เปิด
    const enabledCurrencies = ['USD']; // USD เกี่ยวข้องเสมอ
    if (Settings.get('enableXAU', true)) enabledCurrencies.push('XAU');
    if (Settings.get('enableAUD', true)) enabledCurrencies.push('AUD');
    if (Settings.get('enableEUR', true)) enabledCurrencies.push('EUR');

    const relevant = all.filter(e => enabledCurrencies.some(p => e.curr.includes(p)));

    if (relevant.length === 0) {
      const msg = `📰 <b>ข่าวเศรษฐกิจวัน${dayName}</b>\n\n✅ ไม่มีข่าวสำคัญสำหรับคู่ที่คุณติดตาม`;
      return await this._send(msg);
    }

    // จัด format
    let msg = `📰 <b>ข่าวเศรษฐกิจวัน${dayName}</b>\n`;
    msg += `<i>ส่งผลกับ: ${enabledCurrencies.join(', ')}</i>\n`;
    msg += `${'─'.repeat(28)}\n\n`;

    relevant.forEach(e => {
      const eventThai = this._thaiEvents[e.event] || e.event;
      const impactThai = this._impactThai[e.impact] || e.impact;
      const biasThai   = this._biasThai[e.bias] || e.bias;

      msg += `${impactThai}  <b>${e.time} UTC</b>\n`;
      msg += `📌 ${eventThai}\n`;
      msg += `   ${biasThai} ${e.curr}\n\n`;
    });

    msg += `${'─'.repeat(28)}\n`;
    msg += `⚠️ <i>แนะนำเลี่ยงเทรด 30 นาทีก่อน/หลังข่าว 🔴 สำคัญมาก</i>\n`;
    msg += `🕐 ${new Date().toLocaleString('th-TH')}`;

    return await this._send(msg);
  },

  /** ส่งข่าวเฉพาะ event ที่จะมาภายใน X ชม.ข้างหน้า */
  async sendUpcomingNews(hoursAhead = 1) {
    if (!Settings.get('telegramOn') && !this._onAppsScript()) return;

    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) return;

    const newsAgent = new NewsAgent('ALL', ['XAU', 'USD', 'AUD', 'EUR', 'GBP']);
    const all = newsAgent._calendar();
    const nowHour = new Date().getUTCHours();
    const nowMin  = new Date().getUTCMinutes();
    const nowDecimal = nowHour + nowMin / 60;

    const enabledCurr = ['USD'];
    if (Settings.get('enableXAU', true)) enabledCurr.push('XAU');
    if (Settings.get('enableAUD', true)) enabledCurr.push('AUD');
    if (Settings.get('enableEUR', true)) enabledCurr.push('EUR');

    const upcoming = all.filter(e => {
      if (!enabledCurr.some(p => e.curr.includes(p))) return false;
      const [eh, em] = e.time.split(':').map(Number);
      const eDecimal = eh + em / 60;
      const diff = eDecimal - nowDecimal;
      return diff > 0 && diff <= hoursAhead && e.impact === 'high';
    });

    if (upcoming.length === 0) return;

    let msg = `🚨 <b>เตือนข่าว ${hoursAhead} ชม. ข้างหน้า!</b>\n\n`;
    upcoming.forEach(e => {
      const eventThai = this._thaiEvents[e.event] || e.event;
      const biasThai  = this._biasThai[e.bias] || e.bias;
      msg += `🔴 <b>${e.time} UTC</b>\n`;
      msg += `   ${eventThai}\n`;
      msg += `   ${biasThai} ${e.curr}\n\n`;
    });
    msg += `⚠️ <i>เตรียม spread กว้าง — ระวัง slippage</i>`;

    return await this._send(msg);
  },

  /** Test bot connection */
  async test() {
    const env = this._onAppsScript() ? 'Apps Script' : 'Browser';
    const msg = `🤖 <b>Trading War Room — Test (${env})</b>\n` +
                `เชื่อมต่อสำเร็จ ${new Date().toLocaleString()}\n` +
                `ระบบจะส่งสัญญาณ Grade ${Settings.get('minGrade')}+ ขึ้นไป`;
    const r = await this._send(msg);
    return r.ok ? { ok: true, msg: `ส่งสำเร็จ (ผ่าน ${env})! ตรวจ Telegram` }
                : { ok: false, msg: r.msg };
  },

  /** Notify on strong signal */
  async notify(cmdReport, gradeInfo) {
    if (!Settings.get('telegramOn')) return;
    if (cmdReport.signal === 'wait' || cmdReport.signal === 'watch') return;

    // Symbol filter — only notify for symbols the user wants
    const sym = cmdReport.sym;
    if (sym === 'XAUUSD' && !Settings.get('enableXAU', true)) return;
    if (sym === 'AUDUSD' && !Settings.get('enableAUD', true)) return;
    if (sym === 'EURUSD' && !Settings.get('enableEUR', true)) return;

    const minGrade = Settings.get('minGrade', 'A');
    const order    = ['D', 'C', 'B', 'A', 'S+'];
    if (order.indexOf(gradeInfo.grade) < order.indexOf(minGrade)) return;

    const cooldownMs = Settings.get('cooldownMin', 5) * 60000;
    if (Date.now() - this.lastSent < cooldownMs) return;

    // Skip token check if on Apps Script (token is server-side)
    if (!this._onAppsScript()) {
      if (!Settings.get('telegramToken') || !Settings.get('telegramChatId')) return;
    }

    const arrow = cmdReport.signal === 'buy' ? '🟢▲' : '🔴▼';
    const msg = `${arrow} <b>${gradeInfo.grade} GRADE — ${cmdReport.signal.toUpperCase()} ${cmdReport.sym}</b>\n\n` +
                `💰 <b>Entry:</b> <code>${cmdReport.entry}</code>\n` +
                `🛑 <b>SL:</b> <code>${cmdReport.sl}</code>\n` +
                `🎯 <b>TP1:</b> <code>${cmdReport.tp1}</code>\n` +
                `🎯 <b>TP2:</b> <code>${cmdReport.tp2}</code>\n` +
                `📊 <b>R:R</b>: ${cmdReport.rr}\n` +
                `💼 <b>Position:</b> ${cmdReport.pos}\n\n` +
                `🎓 <b>Confidence:</b> ${cmdReport.conf}%\n` +
                `🤝 <b>Consensus:</b> ${gradeInfo.agree}/${gradeInfo.total} agents agree\n` +
                `⭐ <b>Final Score:</b> ${gradeInfo.finalScore}/100\n\n` +
                `<i>Trading War Room — ${new Date().toLocaleString()}</i>`;

    const r = await this._send(msg);
    if (r.ok) this.lastSent = Date.now();

    // Also log signal to Sheet if running on Apps Script
    if (this._onAppsScript()) {
      try {
        google.script.run.logSignal({
          grade: gradeInfo.grade,
          signal: cmdReport.signal,
          symbol: cmdReport.sym,
          entry: cmdReport.entry,
          sl: cmdReport.sl,
          tp1: cmdReport.tp1,
          tp2: cmdReport.tp2,
          rr: cmdReport.rr,
          conf: cmdReport.conf,
          consensus: gradeInfo.consensus,
        });
      } catch (e) { /* ignore */ }
    }
  },
};

/* ═══════════════════════════════════════════════════════
   MODAL MANAGER
   ═══════════════════════════════════════════════════════ */
const Modal = {
  open(name) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    const el = document.getElementById(`modal-${name}`);
    if (el) el.style.display = 'flex';
    if (name === 'settings') this.fillSettings();
    if (name === 'journal' && typeof Journal !== 'undefined') {
      document.getElementById('journal-body').innerHTML = Journal.render();
    }
    if (name === 'backtest' && typeof Backtest !== 'undefined') {
      document.getElementById('backtest-body').innerHTML = Backtest.renderUI();
    }
    if (name === 'botstatus' && typeof BotBridge !== 'undefined') {
      BotBridge.tick();   // fetch immediately when opened
      if (!BotBridge.timer) BotBridge.start();
    }
    if (name === 'company' && typeof Company !== 'undefined') {
      // ensure BotBridge polling so accountant/dev data is fresh
      if (typeof BotBridge !== 'undefined') { BotBridge.tick(); if (!BotBridge.timer) BotBridge.start(); }
      Company.refresh();
    }
    if (name === 'office' && typeof Office !== 'undefined') {
      if (typeof BotBridge !== 'undefined') { BotBridge.tick(); if (!BotBridge.timer) BotBridge.start(); }
      Office.refresh();
    }
  },
  close() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  },

  fillSettings() {
    document.getElementById('s-token').value     = Settings.get('telegramToken', '');
    document.getElementById('s-chatid').value    = Settings.get('telegramChatId', '');
    document.getElementById('s-on').checked      = Settings.get('telegramOn', false);
    document.getElementById('s-mingrade').value  = Settings.get('minGrade', 'A');
    document.getElementById('s-sound').checked   = Settings.get('sound', true);
    document.getElementById('s-cooldown').value  = Settings.get('cooldownMin', 5);
    const pk = document.getElementById('s-pricekey'); if (pk) pk.value = Settings.get('priceApiKey', '');
    const pf = document.getElementById('s-pricefeed'); if (pf) pf.checked = Settings.get('priceFeedOn', false);
    const pr = document.getElementById('s-pricerefresh'); if (pr) pr.value = Settings.get('priceRefreshSec', 120);
    const pv = document.getElementById('s-provider'); if (pv) pv.value = Settings.get('apiProvider', 'twelvedata');
    const ot = document.getElementById('s-oandatoken'); if (ot) ot.value = Settings.get('oandaToken', '');
    const oa = document.getElementById('s-oandaacct'); if (oa) oa.value = Settings.get('oandaAccountId', '');
    const tm = document.getElementById('s-trademode'); if (tm) tm.value = Settings.get('tradeMode', 'swing');
    const as = document.getElementById('s-accountsize'); if (as) as.value = Settings.get('accountSize', 30);
    const rk = document.getElementById('s-risk'); if (rk) rk.value = Settings.get('riskPerTrade', 2);
    const ex = document.getElementById('s-enableXAU'); if (ex) ex.checked = Settings.get('enableXAU', true);
    const ea = document.getElementById('s-enableAUD'); if (ea) ea.checked = Settings.get('enableAUD', true);
    const ee = document.getElementById('s-enableEUR'); if (ee) ee.checked = Settings.get('enableEUR', true);
    const tk = document.getElementById('s-tradeWithoutKB'); if (tk) tk.checked = Settings.get('tradeWithoutKB', false);
    const ag = document.getElementById('s-adxgate');   if (ag) ag.value   = Settings.get('adxGate', 20);
    const ka = document.getElementById('s-keepalive'); if (ka) ka.checked = Settings.get('keepAlive', true);
    // Analyst toggles
    ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'].forEach(name => {
      const el = document.getElementById('s-en-' + name);
      if (el) el.checked = Settings.get('enable' + name, name !== 'Pivot');
    });
    const mw = document.getElementById('s-minweight'); if (mw) mw.value = Settings.get('minAgentWeight', 0.5);
    const bb = document.getElementById('s-botbridge'); if (bb) bb.value = Settings.get('botBridgeURL', '');
    const ws = document.getElementById('s-web-ai-signals'); if (ws) ws.checked = Settings.get('webAISignalsToEA', false);
    const rc = document.getElementById('s-recency'); if (rc) rc.checked = Settings.get('kbRecencyDecay', 1.0) < 1.0;
    const aa = document.getElementById('s-autoapply'); if (aa) aa.checked = Settings.get('autoApplyStrategy', false);
  },

  saveSettings() {
    Settings.set('telegramToken',  document.getElementById('s-token').value.trim());
    Settings.set('telegramChatId', document.getElementById('s-chatid').value.trim());
    Settings.set('telegramOn',     document.getElementById('s-on').checked);
    Settings.set('minGrade',       document.getElementById('s-mingrade').value);
    Settings.set('sound',          document.getElementById('s-sound').checked);
    Settings.set('cooldownMin',    parseInt(document.getElementById('s-cooldown').value) || 5);
    const pk = document.getElementById('s-pricekey');     if (pk) Settings.set('priceApiKey', pk.value.trim());
    const pf = document.getElementById('s-pricefeed');    if (pf) Settings.set('priceFeedOn', pf.checked);
    const pr = document.getElementById('s-pricerefresh'); if (pr) {
      const prov = document.getElementById('s-provider')?.value || 'twelvedata';
      const minR = prov === 'ea_bridge' ? 15 : 60;   // EA Bridge can poll faster
      Settings.set('priceRefreshSec', Math.max(minR, parseInt(pr.value) || (prov === 'ea_bridge' ? 30 : 120)));
    }
    const pv = document.getElementById('s-provider');     if (pv) Settings.set('apiProvider', pv.value);
    const ot = document.getElementById('s-oandatoken');   if (ot) Settings.set('oandaToken', ot.value.trim());
    const oa = document.getElementById('s-oandaacct');    if (oa) Settings.set('oandaAccountId', oa.value.trim());
    const tm = document.getElementById('s-trademode');    if (tm) Settings.set('tradeMode', tm.value);
    const as = document.getElementById('s-accountsize');  if (as) Settings.set('accountSize', Math.max(10, parseFloat(as.value) || 30));
    const rk = document.getElementById('s-risk');         if (rk) Settings.set('riskPerTrade', Math.max(0.5, Math.min(10, parseFloat(rk.value) || 2)));
    const ex = document.getElementById('s-enableXAU');    if (ex) Settings.set('enableXAU', ex.checked);
    const ea = document.getElementById('s-enableAUD');    if (ea) Settings.set('enableAUD', ea.checked);
    const ee = document.getElementById('s-enableEUR');    if (ee) Settings.set('enableEUR', ee.checked);
    const tk = document.getElementById('s-tradeWithoutKB'); if (tk) Settings.set('tradeWithoutKB', tk.checked);
    const ag = document.getElementById('s-adxgate');      if (ag) Settings.set('adxGate', Math.max(0, Math.min(50, parseInt(ag.value) || 0)));
    const ka = document.getElementById('s-keepalive');    if (ka) {
      Settings.set('keepAlive', ka.checked);
      if (typeof KeepAlive !== 'undefined') {
        if (ka.checked) KeepAlive.enable(); else KeepAlive.disable();
      }
    }
    // Analyst toggles
    ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'].forEach(name => {
      const el = document.getElementById('s-en-' + name);
      if (el) Settings.set('enable' + name, el.checked);
    });
    const mw = document.getElementById('s-minweight'); if (mw) Settings.set('minAgentWeight', parseFloat(mw.value) || 0.5);
    const bb = document.getElementById('s-botbridge'); if (bb) {
      Settings.set('botBridgeURL', bb.value.trim());
      if (typeof BotBridge !== 'undefined' && bb.value.trim().length > 20) BotBridge.start();
    }
    const ws = document.getElementById('s-web-ai-signals');
    if (ws) Settings.set('webAISignalsToEA', ws.checked);
    const rc = document.getElementById('s-recency');
    if (rc) Settings.set('kbRecencyDecay', rc.checked ? 0.99 : 1.0);
    const aa = document.getElementById('s-autoapply');
    if (aa) Settings.set('autoApplyStrategy', aa.checked);

    const status = document.getElementById('s-status');
    status.textContent = '✓ บันทึกแล้ว';
    status.style.color = 'var(--green)';
    setTimeout(() => status.textContent = '', 2000);
  },

  // ⚡ Scalp Test (Phase 12.3): One-click config for gold scalping via EA Bridge
  enableScalpTest() {
    const bridge = Settings.get('botBridgeURL', '');
    if (!bridge || bridge.length < 20) {
      const s = document.getElementById('s-status');
      s.textContent = '✗ ต้องตั้ง Bot Bridge URL ก่อน (ส่วนล่างของ settings)';
      s.style.color = 'var(--red)';
      return;
    }
    // Apply scalp config
    Settings.set('apiProvider',     'ea_bridge');
    Settings.set('priceFeedOn',     true);
    Settings.set('priceRefreshSec', 30);
    Settings.set('tradeMode',       'scalp');
    Settings.set('enableXAU',       true);
    Settings.set('enableAUD',       true);
    Settings.set('enableEUR',       true);
    Settings.set('minGrade',        'B');     // scalp = more signals
    Settings.set('cooldownMin',     3);
    Settings.set('adxGate',         15);      // looser for scalp
    this.fillSettings();
    const s = document.getElementById('s-status');
    s.innerHTML = '⚡ <b>Scalp Test เปิดแล้ว!</b> EA Bridge + Scalp mode + ทอง/AUD/EUR · refresh 30s';
    s.style.color = 'var(--green)';
    // Restart price loop with new cadence
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom._realPriceLoop) {
      TradingWarRoom._realPriceLoop();
    }
  },

  async testPriceFeed() {
    this.saveSettings();
    const status = document.getElementById('s-status');
    status.textContent = '⏳ ดึงราคา...';
    status.style.color = 'var(--yellow)';
    try {
      const px = await TradingWarRoom.market.fetchRealPrices(Settings.get('priceApiKey'));
      if (px && isFinite(px.XAUUSD)) {
        status.innerHTML = `✓ XAU:<b>${px.XAUUSD.toFixed(2)}</b> AUD:<b>${px.AUDUSD.toFixed(4)}</b> EUR:<b>${px.EURUSD.toFixed(4)}</b>`;
        status.style.color = 'var(--green)';
      } else {
        status.textContent = '✗ ดึงราคาไม่ได้ (เช็ค API key)';
        status.style.color = 'var(--red)';
      }
    } catch (e) {
      status.textContent = '✗ ' + e.message;
      status.style.color = 'var(--red)';
    }
  },

  async testTelegram() {
    this.saveSettings();
    const status = document.getElementById('s-status');
    status.textContent = '⏳ กำลังทดสอบ...';
    status.style.color = 'var(--yellow)';

    const result = await Telegram.test();
    status.textContent = (result.ok ? '✓ ' : '✗ ') + result.msg;
    status.style.color = result.ok ? 'var(--green)' : 'var(--red)';
  },
};

/* ═══════════════════════════════════════════════════════
   TRADE JOURNAL — log every signal sent, track wins/losses
   ═══════════════════════════════════════════════════════ */
const Journal = {
  KEY: 'twr_journal',

  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch { return []; }
  },

  save(entries) { localStorage.setItem(this.KEY, JSON.stringify(entries)); },

  _nextId() { return Date.now() * 1000 + ((this._seq = (this._seq || 0) + 1) % 1000); },

  /** Add a new signal to the journal (called automatically by Telegram.notify) */
  add(cmdReport, gradeInfo) {
    const entries = this.load();
    entries.unshift({
      id:        this._nextId(),
      ts:        new Date().toISOString(),
      grade:     gradeInfo.grade,
      symbol:    cmdReport.sym,
      signal:    cmdReport.signal,
      entry:     cmdReport.entry,
      sl:        cmdReport.sl,
      tp1:       cmdReport.tp1,
      tp2:       cmdReport.tp2,
      rr:        cmdReport.rr,
      conf:      cmdReport.conf,
      mode:      cmdReport.mode || 'Swing',
      outcome:   'pending', // win | loss | breakeven | pending
      pnl:       null,      // user fills R-multiple later
      notes:     '',
    });
    // Keep last 200
    if (entries.length > 200) entries.length = 200;
    this.save(entries);
  },

  setOutcome(id, outcome, pnl, notes) {
    const entries = this.load();
    const e = entries.find(x => x.id === id);
    if (!e) return;
    e.outcome = outcome;
    if (pnl != null)   e.pnl = pnl;
    if (notes != null) e.notes = notes;
    this.save(entries);
    // Adaptive learning — update agent scores
    if (typeof AgentScores !== 'undefined') AgentScores.update(e);
  },

  remove(id) {
    this.save(this.load().filter(e => e.id !== id));
  },

  clear() { this.save([]); },

  stats() {
    const entries = this.load();
    const closed  = entries.filter(e => e.outcome !== 'pending');
    const wins    = closed.filter(e => e.outcome === 'win').length;
    const losses  = closed.filter(e => e.outcome === 'loss').length;
    const be      = closed.filter(e => e.outcome === 'breakeven').length;
    const totalR  = closed.reduce((s, e) => s + (parseFloat(e.pnl) || 0), 0);
    return {
      total: entries.length,
      pending: entries.length - closed.length,
      wins, losses, be,
      winRate: closed.length > 0 ? Math.round(wins / closed.length * 100) : 0,
      totalR: totalR.toFixed(2),
      avgR: closed.length > 0 ? (totalR / closed.length).toFixed(2) : '0.00',
    };
  },

  render() {
    const entries = this.load();
    const s = this.stats();

    const statsHTML = `
      <div class="journal-stats">
        <div class="js-tile"><div class="js-num">${s.total}</div><div class="js-lbl">Total Signals</div></div>
        <div class="js-tile" style="color:var(--green)"><div class="js-num">${s.wins}</div><div class="js-lbl">Wins</div></div>
        <div class="js-tile" style="color:var(--red)"><div class="js-num">${s.losses}</div><div class="js-lbl">Losses</div></div>
        <div class="js-tile" style="color:var(--yellow)"><div class="js-num">${s.be}</div><div class="js-lbl">Breakeven</div></div>
        <div class="js-tile" style="color:var(--teal)"><div class="js-num">${s.winRate}%</div><div class="js-lbl">Win Rate</div></div>
        <div class="js-tile" style="color:var(--gold)"><div class="js-num">${s.totalR}R</div><div class="js-lbl">Total P/L</div></div>
      </div>
    `;

    const rowsHTML = entries.length === 0
      ? '<div style="padding:20px;text-align:center;color:var(--gray);font-size:7px">📭 ยังไม่มี signal ที่บันทึก — รอให้ระบบส่ง Telegram ครั้งแรก</div>'
      : entries.map(e => {
          const d = new Date(e.ts);
          const time = `${d.toLocaleDateString()} ${d.toTimeString().slice(0,5)}`;
          const sigCls = e.signal === 'buy' ? 'text-green' : 'text-red';
          const outCls = e.outcome === 'win' ? 'text-green' : e.outcome === 'loss' ? 'text-red' : e.outcome === 'breakeven' ? 'text-yellow' : 'text-gray';
          return `<tr class="j-row" data-id="${e.id}">
            <td class="text-gray">${time}</td>
            <td class="text-teal">${e.symbol}</td>
            <td class="${sigCls}">${e.signal === 'buy' ? '▲' : '▼'} ${e.signal.toUpperCase()}</td>
            <td class="text-gold">${e.grade}</td>
            <td>${e.entry}</td>
            <td class="text-red">${e.sl}</td>
            <td class="text-green">${e.tp1}</td>
            <td class="${outCls}">${e.outcome}</td>
            <td>${e.pnl ?? '-'}R</td>
            <td>
              <button onclick="Journal.markWin(${e.id})" class="j-mini-btn text-green">W</button>
              <button onclick="Journal.markLoss(${e.id})" class="j-mini-btn text-red">L</button>
              <button onclick="Journal.markBE(${e.id})" class="j-mini-btn text-yellow">B</button>
              <button onclick="Journal.del(${e.id})" class="j-mini-btn text-gray">✕</button>
            </td>
          </tr>`;
        }).join('');

    return statsHTML + `
      <div class="j-table-wrap">
        <table class="j-table">
          <thead><tr>
            <th>Time</th><th>Sym</th><th>Side</th><th>Grade</th>
            <th>Entry</th><th>SL</th><th>TP1</th><th>Outcome</th><th>P/L</th><th>Action</th>
          </tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="Journal.exportCSV()">📥 Export CSV</button>
        <button class="btn btn-secondary" onclick="if(confirm('ลบประวัติทั้งหมด?')){Journal.clear();Modal.open('journal');}">🗑 Clear All</button>
      </div>
      ${(typeof AgentScores !== 'undefined') ? AgentScores.render() : ''}
      `;
  },

  markWin(id)  { const r = prompt('กำไรกี่ R? (เช่น 1.5)', '1');   if (r !== null) { this.setOutcome(id, 'win', parseFloat(r) || 1); Modal.open('journal'); } },
  markLoss(id) { const r = prompt('ขาดทุนกี่ R? (เช่น -1)', '-1'); if (r !== null) { this.setOutcome(id, 'loss', parseFloat(r) || -1); Modal.open('journal'); } },
  markBE(id)   { this.setOutcome(id, 'breakeven', 0); Modal.open('journal'); },
  del(id)      { if (confirm('ลบ entry นี้?')) { this.remove(id); Modal.open('journal'); } },

  exportCSV() {
    const entries = this.load();
    const headers = ['Time','Symbol','Signal','Grade','Entry','SL','TP1','TP2','RR','Confidence','Mode','Outcome','PnL_R','Notes'];
    const rows = entries.map(e => [
      e.ts, e.symbol, e.signal, e.grade, e.entry, e.sl, e.tp1, e.tp2, e.rr, e.conf, e.mode, e.outcome, e.pnl ?? '', e.notes
    ].map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `trading-journal-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ═══════════════════════════════════════════════════════
   KNOWLEDGE BASE / AGENT SCORES — Regime-aware learning
   จากทั้ง Journal (live) และ Backtest
   เก็บสถิติ per-agent แยกตาม:
     - all (overall)
     - regime: trending / ranging / volatile
     - symbol (XAUUSD / AUDUSD / EURUSD)
   ═══════════════════════════════════════════════════════ */
const AgentScores = {
  KEY: 'twr_agent_scores_v2',
  MIN_TRADES: 5,

  /** Classify market regime from candles — ใช้ตอน record + ตอน lookup */
  classifyRegime(candles) {
    if (!candles || candles.length < 30) return 'unknown';
    const adx = TA.adx(candles);
    const atr = TA.atr(candles);
    const atrAvg = TA.atr(candles, 30);
    const volatile = atr > atrAvg * 1.4;
    if (adx >= 25) return volatile ? 'volatile_trending' : 'trending';
    if (adx <= 18) return volatile ? 'volatile_ranging'  : 'ranging';
    return 'transitional';
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        // Phase 25.2: cache the parsed KB — the Employee Board calls load()
        // dozens of times per render; re-parsing a big KB each time was slow.
        if (this._cacheRaw === raw && this._cache) return this._cache;
        const parsed = JSON.parse(raw);
        this._cacheRaw = raw; this._cache = parsed;
        return parsed;
      }
      // Migrate from v1 if exists
      const old = localStorage.getItem('twr_agent_scores');
      if (old) {
        const oldScores = JSON.parse(old);
        const migrated = { agents: {}, meta: { liveTrades: 0, backtestTrades: 0, created: Date.now() }};
        Object.entries(oldScores).forEach(([name, s]) => {
          migrated.agents[name] = {
            all: { t: s.trades || 0, w: s.wins || 0, l: s.losses || 0, R: s.totalR || 0 }
          };
          migrated.meta.liveTrades += (s.trades || 0);
        });
        return migrated;
      }
    } catch {}
    return { agents: {}, meta: { liveTrades: 0, backtestTrades: 0, created: Date.now() } };
  },

  save(kb) {
    if (!kb.meta) kb.meta = {};
    kb.meta.lastUpdate = Date.now();
    const raw = JSON.stringify(kb);
    localStorage.setItem(this.KEY, raw);
    this._cacheRaw = raw; this._cache = kb;   // keep cache in sync
  },

  /** Generic record — เรียกจากทั้ง Journal และ Backtest */
  recordTrade(opts) {
    const { votes, signal, outcome, r, regime, symbol, source } = opts;
    if (!votes || votes.length === 0) return;
    if (outcome === 'pending' || outcome === 'breakeven') return;

    const kb = this.load();
    if (source === 'backtest') kb.meta.backtestTrades = (kb.meta.backtestTrades || 0) + 1;
    else                       kb.meta.liveTrades     = (kb.meta.liveTrades || 0)     + 1;

    const won = outcome === 'win';
    const rAbs = Math.abs(r || (won ? 1 : -1));

    votes.forEach(v => {
      if (!v || !v.agent) return;
      const agreed = v.signal === signal;
      const correct = (agreed && won) || (!agreed && !won);
      const rDelta = correct ? rAbs : -rAbs;

      if (!kb.agents[v.agent]) kb.agents[v.agent] = {};
      const a = kb.agents[v.agent];

      // Update buckets: 'all', regime, sym_SYMBOL
      const buckets = ['all'];
      if (regime) buckets.push(regime);
      if (symbol) buckets.push(`sym_${symbol}`);

      // Phase 19: Recency decay — fade old data so KB adapts to current market.
      // decay 1.0 = off (cumulative). 0.99 = recent trades dominate over time.
      const decay = (typeof Settings !== 'undefined') ? Settings.get('kbRecencyDecay', 1.0) : 1.0;

      buckets.forEach(bk => {
        if (!a[bk]) a[bk] = { t: 0, w: 0, l: 0, R: 0 };
        if (decay < 1.0) {
          a[bk].t *= decay; a[bk].w *= decay; a[bk].l *= decay; a[bk].R *= decay;
        }
        a[bk].t++;
        if (correct) a[bk].w++; else a[bk].l++;
        a[bk].R += rDelta;
      });
    });

    this.save(kb);
  },

  /** Legacy adapter — Journal.setOutcome → recordTrade */
  update(entry) {
    if (!entry.agentVotes) return;
    // Try to classify regime from current candles (live trade)
    let regime = null;
    try {
      const c = TradingWarRoom?.market?.candles?.[entry.sym];
      if (c) regime = this.classifyRegime(c);
    } catch {}
    this.recordTrade({
      votes:   entry.agentVotes,
      signal:  entry.signal,
      outcome: entry.outcome,
      r:       parseFloat(entry.pnl) || (entry.outcome === 'win' ? 1 : -1),
      regime,
      symbol:  entry.sym,
      source:  'live',
    });
  },

  /** Weight multiplier — รวม accuracy + average R per trade
   *  ทำให้ agent ที่ทั้งทายถูกบ่อย + ทำเงินได้เยอะ ได้ weight สูง
   *  agent ที่ทายถูกแต่กำไรน้อย (เช่น scratch trades) ไม่ได้ boost เต็ม */
  weight(agentName, ctx = {}) {
    const a = this.load().agents[agentName];
    if (!a) return 1.0;

    const bucketsToTry = [];
    if (ctx.regime)               bucketsToTry.push(ctx.regime);
    if (ctx.symbol)               bucketsToTry.push(`sym_${ctx.symbol}`);
    bucketsToTry.push('all');

    for (const bk of bucketsToTry) {
      const s = a[bk];
      if (s && s.t >= this.MIN_TRADES) {
        const acc  = s.w / s.t;
        const avgR = s.R / s.t;
        // Score: accuracy delta + avgR
        const score = (acc - 0.5) * 2 + Math.max(-0.6, Math.min(0.6, avgR * 0.5));
        let w = Math.max(0.2, Math.min(2.5, 1.0 + score));
        // Hard penalty: any agent with negative total R caps at 0.5
        // (filter จะ skip ทันที — ไม่ปล่อยให้ vote)
        if (s.R < 0 && s.t >= 10) w = Math.min(w, 0.5);
        // Bonus: agent with > +50R total in this bucket gets at least 1.2x
        if (s.R > 50 && s.t >= 20) w = Math.max(w, 1.2);
        return w;
      }
    }
    return 1.0;
  },

  /** Detail stats for UI */
  stats() {
    const kb = this.load();
    return Object.entries(kb.agents).map(([name, a]) => {
      const all = a.all || { t:0, w:0, l:0, R:0 };
      const regimeStats = (key) => {
        const b = a[key];
        if (!b || b.t === 0) return null;
        return { t: b.t, w: b.w, acc: Math.round(b.w/b.t*100), R: b.R.toFixed(1) };
      };
      return {
        name,
        total:    all.t,
        wins:     all.w,
        losses:   all.l,
        accuracy: all.t > 0 ? Math.round(all.w / all.t * 100) : 0,
        totalR:   all.R.toFixed(2),
        weight:   this.weight(name).toFixed(2),
        trending: regimeStats('trending'),
        ranging:  regimeStats('ranging'),
        vol_tr:   regimeStats('volatile_trending'),
        vol_rg:   regimeStats('volatile_ranging'),
        xau:      regimeStats('sym_XAUUSD'),
        aud:      regimeStats('sym_AUDUSD'),
        eur:      regimeStats('sym_EURUSD'),
      };
    }).sort((a, b) => b.total - a.total);
  },

  meta() {
    const kb = this.load();
    return kb.meta || {};
  },

  /** วิเคราะห์ KB หา Best Symbol + Best Agents */
  recommendStrategy() {
    const kb = this.load();
    // Group by symbol
    const symbols = { XAUUSD: [], AUDUSD: [], EURUSD: [] };
    Object.entries(kb.agents).forEach(([name, a]) => {
      const sym = ['XAUUSD','AUDUSD','EURUSD'].find(s => name.startsWith(s.slice(0,3) === 'XAU' ? 'Gold' : s.slice(0,3)));
      if (!sym) return;
      const bucket = a[`sym_${sym}`];
      if (!bucket || bucket.t < this.MIN_TRADES) return;
      const acc = bucket.w / bucket.t;
      symbols[sym].push({
        name,
        shortName: name.split('-')[1],
        trades: bucket.t,
        acc:  Math.round(acc * 100),
        R:    bucket.R,
        avgR: bucket.R / bucket.t,
      });
    });

    // Score each symbol: sum of POSITIVE agents' R only
    const symScores = {};
    Object.entries(symbols).forEach(([sym, agents]) => {
      const winners = agents.filter(a => a.R > 0);
      const losers  = agents.filter(a => a.R < 0);
      const totalR  = agents.reduce((s, a) => s + a.R, 0);
      const winnerR = winners.reduce((s, a) => s + a.R, 0);
      const goodAgents = winners.filter(a => a.acc >= 55 && a.R > 30).sort((a,b) => b.R - a.R);
      const badAgents  = losers.filter(a => a.R < -30).sort((a,b) => a.R - b.R);
      symScores[sym] = {
        symbol: sym,
        totalR, winnerR,
        agentCount: agents.length,
        winnerCount: winners.length,
        loserCount: losers.length,
        topAgents:  goodAgents.slice(0, 4),
        worstAgents: badAgents.slice(0, 3),
        winnersSorted: winners.slice().sort((a, b) => b.R - a.R),   // ALL positive-R (no noise), best first
        score: winnerR + (winners.length * 5) - (losers.length * 3),
      };
    });

    const sorted = Object.values(symScores).sort((a,b) => b.score - a.score);
    return sorted;
  },

  /** Apply recommended config — auto-set symbol filter + analyst toggles */
  applyRecommended() {
    const rec = this.recommendStrategy();
    if (!rec[0] || rec[0].topAgents.length < 2) {
      alert('❌ ยังไม่มีข้อมูลพอจะแนะนำ — รัน Auto-Opt เพิ่มก่อน');
      return;
    }

    const ALL_AGENTS = ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'];

    // 1. Profitable symbols = enable all with totalR > 0 AND winnerCount >= 2
    const profitableSyms = rec.filter(s => s.totalR > 30 && s.winnerCount >= 2);
    const enabledSyms = profitableSyms.map(s => s.symbol);

    // 2. Winning agents = any agent that wins on AT LEAST one profitable symbol
    const winners = new Set();
    profitableSyms.forEach(s => s.topAgents.forEach(a => winners.add(a.shortName)));

    // 3. List "universal losers" — agents that lose on EVERY symbol (no symbol wins with them)
    const universalLosers = [];
    ALL_AGENTS.forEach(name => {
      if (winners.has(name) || name === 'MTF' || name === 'News') return;
      // Check if this agent loses on every symbol that has it
      const hasProfit = rec.some(s => {
        const agent = [...s.topAgents, ...s.worstAgents, ...(s.agentCount > 0 ? [] : [])]
          .find(a => a.shortName === name);
        return agent && agent.R > 0;
      });
      if (!hasProfit) universalLosers.push(name);
    });

    // Build summary
    let report = `🎯 Smart Apply:\n\n`;
    report += `📌 Symbol Filter: เปิด ${enabledSyms.join(' + ')}\n`;
    if (enabledSyms.length < 3) {
      const skipped = ['XAUUSD','AUDUSD','EURUSD'].filter(s => !enabledSyms.includes(s));
      report += `   ⏸ Skip: ${skipped.join(', ')} (ยังไม่มี edge พอ)\n`;
    }
    report += `\n✅ เปิด analysts (winners ทุก symbol รวมกัน):\n   ${[...winners].join(', ')}\n`;
    if (universalLosers.length > 0) {
      report += `\n❌ ปิด analysts (แพ้ทุก symbol):\n   ${universalLosers.join(', ')}\n`;
    }
    report += `\n💡 ระบบจะใช้ KB filter ต่อ — agent ที่ห่วยเฉพาะ symbol จะถูก skip อัตโนมัติ\n`;
    report += `\nดำเนินการต่อ?`;

    report += `\n🧹 จะสร้างคอมโบใหม่จาก winner เท่านั้น (R>0) — ตัด noise/ตัวขาดทุนออกหมด\n`;
    if (!confirm(report)) return;
    this._doApply(enabledSyms, winners, universalLosers, ALL_AGENTS);
    const combos = this._rebuildWinnerCombos(rec);   // 🧹 winners-only, no noise
    if (typeof Company !== 'undefined') Company.refresh();
    alert(`✅ Smart Apply Done! (winners ล้วน · ไม่มี noise)\n\nSymbols: ${enabledSyms.join(', ')}\nคอมโบใหม่:\n${combos.join('\n')}`);
    if (typeof Modal !== 'undefined') Modal.open('journal');
  },

  // Phase C.6: rebuild each pair's employee combos from KB WINNERS ONLY (R>0) —
  // this is what actually drives signals, so it guarantees no "noise"/loser agent
  // ends up in any combo. Pair-locked employees get their symbol's top winners.
  _rebuildWinnerCombos(rec) {
    // full KB name → combo key (strip prefix; 'Gold-UT-Bot'→'utbot', 'AUD-OrderBlock'→'orderblock')
    const toKey = (a) => {
      const parts = ((a && a.name) || '').split('-'); parts.shift();
      return parts.join('').toLowerCase().replace(/[^a-z]/g, '');
    };
    const symEmp = {
      XAUUSD: { combos: ['xau_meanrev', 'xau_liquidity', 'blackglacier'], min: 3 },
      AUDUSD: { combos: ['aud_trend', 'aud_meanrev'], min: 3 },
      EURUSD: { combos: ['eur_trend', 'eur_structure'], min: 2 },
    };
    const changed = [];
    rec.forEach(s => {
      const cfg = symEmp[s.symbol]; if (!cfg) return;
      const wins = (s.winnersSorted || []).map(a => toKey(a)).filter(Boolean);
      if (wins.length < 2) return;                 // not enough proven winners → leave as-is
      cfg.combos.forEach((cid, i) => {
        if (!this.COMBOS[cid]) return;
        // give variety: combo #0 gets top N, combo #1 rotates start by 1, etc.
        const take = cid === 'blackglacier' ? 4 : 3;
        const picked = wins.slice(i, i + take);
        const agents = picked.length >= 2 ? picked : wins.slice(0, take);
        this.COMBOS[cid].agents = agents;
      });
      changed.push(`${s.symbol.replace('USD','')}: ${wins.slice(0,4).join('+')}`);
    });
    return changed;
  },
  // Phase 19: shared apply core (used by manual + auto)
  _doApply(enabledSyms, winners, universalLosers, ALL_AGENTS) {
    Settings.set('enableXAU', enabledSyms.includes('XAUUSD'));
    Settings.set('enableAUD', enabledSyms.includes('AUDUSD'));
    Settings.set('enableEUR', enabledSyms.includes('EURUSD'));
    ALL_AGENTS.forEach(name => {
      if (name === 'MTF' || name === 'News') Settings.set('enable' + name, true);
      else if (winners.has(name))            Settings.set('enable' + name, true);
      else if (universalLosers.includes(name)) Settings.set('enable' + name, false);
    });
    Settings.set('minGrade', 'A');
    Settings.set('riskPerTrade', Math.min(2, Settings.get('riskPerTrade', 2)));
  },

  // Phase 19: AUTO-APPLY — runs on schedule, no click needed, just notifies
  _lastAutoApply: 0,
  autoApplyTick() {
    if (typeof Settings === 'undefined' || !Settings.get('autoApplyStrategy', false)) return;
    const kb = this.load();
    const total = (kb.meta?.liveTrades || 0) + (kb.meta?.backtestTrades || 0);
    // re-apply every +100 trades of new data (avoid flipping mid-trade)
    if (total - this._lastAutoApply < 100) return;
    this._lastAutoApply = total;

    const rec = this.recommendStrategy();
    if (!rec[0] || rec[0].topAgents.length < 2) return;
    const ALL_AGENTS = ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'];
    const profitableSyms = rec.filter(s => s.totalR > 30 && s.winnerCount >= 2);
    if (profitableSyms.length === 0) return;
    const enabledSyms = profitableSyms.map(s => s.symbol);
    const winners = new Set();
    profitableSyms.forEach(s => s.topAgents.forEach(a => winners.add(a.shortName)));
    const universalLosers = [];
    ALL_AGENTS.forEach(name => {
      if (winners.has(name) || name === 'MTF' || name === 'News') return;
      const hasProfit = rec.some(s => [...s.topAgents, ...s.worstAgents].find(a => a.shortName === name && a.R > 0));
      if (!hasProfit) universalLosers.push(name);
    });
    this._doApply(enabledSyms, winners, universalLosers, ALL_AGENTS);
    this._rebuildWinnerCombos(rec);   // 🧹 winners-only combos (no noise)
    const msg = `🤖 Auto-Apply: เปิด ${enabledSyms.join('+')} · winners ${[...winners].slice(0,5).join(', ')}`;
    if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'Strategy', msg);
    if (typeof KeepAlive !== 'undefined') KeepAlive.notify('🤖 Strategy Auto-Apply', msg, {});
    console.log('Phase 19 Auto-Apply:', { enabledSyms, winners: [...winners], universalLosers });
  },

  /** Render recommended strategy panel */
  renderRecommend() {
    const rec = this.recommendStrategy();
    if (rec.length === 0 || rec[0].agentCount === 0) {
      return '<div style="padding:10px;font-size:7px;color:var(--gray);text-align:center">📭 ยังไม่มีข้อมูลพอ — รัน Auto-Opt ก่อน</div>';
    }

    const best = rec[0];
    const verdict = best.totalR > 100 ? '🟢 STRONG EDGE' :
                    best.totalR > 30  ? '🟡 OK EDGE'      :
                    best.totalR > 0   ? '🟠 WEAK EDGE'    :
                                        '🔴 NO EDGE';

    const symEmoji = best.symbol === 'XAUUSD' ? '🥇' : best.symbol === 'AUDUSD' ? '🇦🇺' : '🇪🇺';
    const topList = best.topAgents.map(a =>
      `<span class="text-green">${a.shortName} ${a.acc}% (+${a.R.toFixed(0)}R)</span>`
    ).join(' · ') || '<span class="text-gray">none yet</span>';
    const badList = best.worstAgents.map(a =>
      `<span class="text-red">${a.shortName} ${a.acc}% (${a.R.toFixed(0)}R)</span>`
    ).join(' · ') || '<span class="text-gray">none</span>';

    // Compare rest
    const otherRows = rec.slice(1).map(s => {
      const symEm = s.symbol === 'XAUUSD' ? '🥇' : s.symbol === 'AUDUSD' ? '🇦🇺' : '🇪🇺';
      const winList = s.topAgents.slice(0,3).map(a => `${a.shortName}(${a.acc}%)`).join(', ') || 'none';
      return `<tr>
        <td>${symEm} ${s.symbol}</td>
        <td class="${s.totalR > 0 ? 'text-green' : 'text-red'}">${s.totalR > 0 ? '+' : ''}${s.totalR.toFixed(0)}R</td>
        <td>${s.winnerCount}/${s.agentCount}</td>
        <td style="font-size:5px">${winList}</td>
      </tr>`;
    }).join('');

    // Phase 14.3: Per-symbol recommendation cards (all 3 side-by-side)
    const perSymbolCards = rec.map(s => {
      const symEm = s.symbol === 'XAUUSD' ? '🥇' : s.symbol === 'AUDUSD' ? '🇦🇺' : '🇪🇺';
      const sym3  = s.symbol.replace('USD','');
      const eligible = s.totalR > 30 && s.winnerCount >= 2;
      const dataLow = (s.agentCount > 0 && s.topAgents.reduce((sum, a) => sum + (a.T || 0), 0) < 200);
      const v = s.totalR > 100 ? { txt:'🟢 STRONG', col:'var(--green)' }
              : s.totalR > 30  ? { txt:'🟡 OK',     col:'var(--yellow)' }
              : s.totalR > 0   ? { txt:'🟠 WEAK',   col:'var(--orange)' }
              :                   { txt:'🔴 NONE',  col:'var(--red)' };
      const winTags = s.topAgents.slice(0,4).map(a =>
        `<span style="font-size:5px;background:rgba(0,255,65,0.15);padding:1px 4px;margin-right:2px;color:var(--green)">${a.shortName} ${a.acc}%</span>`
      ).join('') || '<span style="font-size:5px;color:var(--gray)">— ยังไม่มี winner —</span>';
      return `
        <div style="flex:1;min-width:0;padding:6px;border:1px solid ${v.col};background:rgba(255,255,255,0.02)">
          <div style="font-size:8px;margin-bottom:3px">
            ${symEm} <b style="color:var(--gold)">${sym3}</b>
            <span style="float:right;color:${v.col};font-size:7px">${v.txt}</span>
          </div>
          <div style="font-size:6px;color:var(--gray);margin-bottom:4px">
            R: <b style="color:${s.totalR > 0 ? 'var(--green)' : 'var(--red)'}">${s.totalR > 0 ? '+' : ''}${s.totalR.toFixed(0)}</b> ·
            Win agents: <b>${s.winnerCount}/${s.agentCount}</b>
            ${dataLow ? '<br><span style="color:var(--orange)">⚠ ข้อมูลน้อย — ต้อง backtest เพิ่ม</span>' : ''}
          </div>
          <div style="font-size:5px;color:var(--gray);margin-bottom:3px">TOP AGENTS:</div>
          <div>${winTags}</div>
          <div style="margin-top:5px;font-size:5px;text-align:center;color:${eligible ? 'var(--green)' : 'var(--gray)'}">
            ${eligible ? '✅ จะเปิดใน Apply' : '⏸ จะ skip (R/winner ต่ำ)'}
          </div>
        </div>`;
    }).join('');

    return `
      <div style="margin-top:14px;background:linear-gradient(90deg,rgba(0,255,65,0.1),transparent);border:2px solid var(--green);padding:10px">
        <div style="font-size:9px;color:var(--green);margin-bottom:6px">🎯 RECOMMENDED STRATEGY (จาก KB ของคุณ)</div>
        <div style="font-size:11px;color:var(--gold);margin:4px 0">
          ${symEmoji} <b>เทรด ${best.symbol}</b> เป็นหลัก — ${verdict}
          <span style="font-size:6px;color:var(--gray);margin-left:6px">(symbol ที่เก่งที่สุด)</span>
        </div>
        <div style="font-size:7px;color:var(--white);padding:4px 0">
          ✅ <b>Winner agents:</b> ${topList}
        </div>
        ${best.worstAgents.length > 0 ? `
        <div style="font-size:7px;color:var(--white);padding:4px 0">
          ❌ <b>Loser agents:</b> ${badList}
        </div>` : ''}
        <div style="font-size:6px;color:var(--gray);padding:4px 0">
          Total agents profitable: <b style="color:var(--green)">${best.winnerCount}/${best.agentCount}</b> ·
          Combined R: <b style="color:${best.totalR > 0 ? 'var(--green)' : 'var(--red)'}">${best.totalR > 0 ? '+' : ''}${best.totalR.toFixed(0)}R</b>
        </div>

        <!-- Phase 14.3: Per-symbol breakdown — ALL 3 SIDE BY SIDE -->
        <div style="margin-top:10px;font-size:7px;color:var(--gold);border-top:1px dashed var(--border);padding-top:8px">
          ⚖️ Per-Symbol Strategy (Apply จะใช้ best agents <b>แยกตาม symbol</b>)
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          ${perSymbolCards}
        </div>

        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn btn-primary" style="border-color:var(--green);color:var(--green);flex:1" onclick="AgentScores.applyRecommended()">
            ⚡ Smart Apply (เปิด winners ทุก symbol)
          </button>
          <button class="btn btn-secondary" style="font-size:6px" onclick="if(confirm('ใส่ Auto-Optimize แค่ EURUSD เพื่อเพิ่ม data?')){ Modal.open('backtest'); setTimeout(()=>{ const s=document.getElementById('bt-symbol'); if(s){s.value='EURUSD';s.dispatchEvent(new Event('change'));} }, 200); }">
            📊 Train EUR
          </button>
        </div>
        <div style="margin-top:4px;font-size:5px;color:var(--gray);text-align:center;font-style:italic">
          Smart Apply เปิด/ปิด symbol + agent อัตโนมัติ — KB filter ทำงานต่อแยกตาม symbol
        </div>
      </div>
    `;
  },

  /** Export KB as JSON string */
  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  /** Import & merge */
  importJSON(text) {
    try {
      const imported = JSON.parse(text);
      if (!imported.agents) return { ok: false, msg: 'invalid format' };
      const current = this.load();
      Object.entries(imported.agents).forEach(([name, a]) => {
        if (!current.agents[name]) current.agents[name] = {};
        Object.entries(a).forEach(([bk, s]) => {
          if (!current.agents[name][bk]) current.agents[name][bk] = { t:0, w:0, l:0, R:0 };
          current.agents[name][bk].t += s.t || 0;
          current.agents[name][bk].w += s.w || 0;
          current.agents[name][bk].l += s.l || 0;
          current.agents[name][bk].R += s.R || 0;
        });
      });
      this.save(current);
      return { ok: true, msg: 'merged ' + Object.keys(imported.agents).length + ' agents' };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  },

  reset() {
    this.save({ agents: {}, meta: { liveTrades: 0, backtestTrades: 0, created: Date.now() } });
  },

  /** Fresh Start — backup เก่าก่อนแล้วค่อย reset */
  async freshStart() {
    const meta = this.meta();
    const total = (meta.liveTrades || 0) + (meta.backtestTrades || 0);

    if (total < 10) {
      // ไม่มีข้อมูลให้ backup → reset ตรงเลย
      if (confirm(`KB ยังไม่มีข้อมูลพอที่จะ backup (${total} trades) — reset เลยไหม?`)) {
        this.reset();
        if (typeof Journal !== 'undefined') Journal.clear();
        if (typeof Modal !== 'undefined') Modal.open('journal');
      }
      return;
    }

    const confirmMsg = `🔄 FRESH START\n\n` +
                      `จะทำ 3 ขั้น:\n` +
                      `1. Backup KB ปัจจุบัน (${total} trades) → คัดลอกใส่ clipboard\n` +
                      `2. รีเซ็ต KB เป็นค่าศูนย์\n` +
                      `3. ล้าง Journal ทั้งหมด\n\n` +
                      `⚠️ ข้อมูลที่ผ่านการเรียนรู้จะหายไป — ต้องรัน Auto-Opt ใหม่เพื่อสร้าง KB กลับ\n\n` +
                      `ดำเนินการต่อ?`;
    if (!confirm(confirmMsg)) return;

    // Step 1: Backup to clipboard
    const json = this.exportJSON();
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      // Fallback: prompt user
      const ok = prompt(`Copy ข้อมูลนี้เก็บไว้ก่อน (Ctrl+A → Ctrl+C):`, json.slice(0, 200) + '...(truncated)');
      if (ok === null) return; // user cancelled
    }

    // Step 2 + 3: Reset KB + Journal
    this.reset();
    if (typeof Journal !== 'undefined') Journal.clear();

    alert(`✅ Fresh Start สำเร็จ!\n\n` +
          `• Backup ${total} trades → คัดลอกใน clipboard แล้ว (paste ใส่ Notepad เก็บไว้ได้)\n` +
          `• KB + Journal: รีเซ็ตเป็น 0\n\n` +
          `ขั้นต่อไป:\n` +
          `1. เปิด 🔬 BACKTEST\n` +
          `2. กด 🚀 Start Auto-Opt\n` +
          `3. ปล่อยไว้ ~30 นาที = ได้ KB ใหม่ที่ใช้ Weight Formula + Divergence Agent ใหม่`);

    if (typeof Modal !== 'undefined') Modal.open('journal');
  },

  /** Trade counts per symbol */
  symbolCounts() {
    const kb = this.load();
    const result = { XAUUSD: 0, AUDUSD: 0, EURUSD: 0 };
    Object.values(kb.agents).forEach(a => {
      ['XAUUSD','AUDUSD','EURUSD'].forEach(sym => {
        const b = a[`sym_${sym}`];
        if (b) result[sym] = Math.max(result[sym], b.t);
      });
    });
    return result;
  },

  /** Render progress bar for KB data quality */
  renderProgress() {
    const counts = this.symbolCounts();
    const TARGET_HIGH = 100;   // high confidence
    const TARGET_MIN  = 30;    // minimum usable

    const bar = (count, target) => {
      const pct = Math.min(100, Math.round(count / target * 100));
      const fill = '█'.repeat(Math.floor(pct / 10));
      const empty = '░'.repeat(10 - Math.floor(pct / 10));
      const color = pct >= 100 ? 'var(--green)' : pct >= 30 ? 'var(--yellow)' : 'var(--gray)';
      const status = count >= TARGET_HIGH ? '✅ ดีมาก' :
                     count >= TARGET_MIN  ? '⚠️ พอใช้' :
                                            '🔴 ยังน้อย';
      return `<div style="font-size:7px;color:var(--white);font-family:monospace">
        <span style="color:${color}">${fill}${empty}</span>
        <span style="color:${color}"> ${count}/${target}</span>
        <span style="color:var(--gray)"> — ${status}</span>
      </div>`;
    };

    return `
      <div style="margin-top:14px;font-size:8px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:4px">📊 KB DATA QUALITY</div>
      <div style="font-size:6px;color:var(--gray);padding:4px 0">
        เป้าหมาย: <b style="color:var(--yellow)">30</b> trades/symbol = พอใช้ |
        <b style="color:var(--green)">100</b> trades/symbol = ดีมาก
      </div>
      <div style="display:grid;grid-template-columns:60px 1fr;gap:4px;align-items:center;padding:4px 0">
        <span style="color:var(--gold)">🥇 XAU</span> ${bar(counts.XAUUSD, TARGET_HIGH)}
        <span style="color:var(--teal)">🇦🇺 AUD</span> ${bar(counts.AUDUSD, TARGET_HIGH)}
        <span style="color:var(--teal)">🇪🇺 EUR</span> ${bar(counts.EURUSD, TARGET_HIGH)}
      </div>
      ${counts.XAUUSD < TARGET_MIN || counts.AUDUSD < TARGET_MIN || counts.EURUSD < TARGET_MIN
        ? '<div style="margin-top:4px;font-size:6px;color:var(--yellow);border-left:2px solid var(--yellow);padding-left:6px">💡 รัน Auto-Optimize อีกหน่อย — แต่ละ cycle เพิ่ม 5-15 trades/symbol</div>'
        : ''}
    `;
  },

  /** Render UI panel for inclusion in Journal modal */
  render() {
    const s = this.stats();
    const meta = this.meta();
    const progressHTML = this.renderProgress();
    if (s.length === 0) {
      return progressHTML + '<div style="padding:10px;font-size:7px;color:var(--gray);text-align:center">📭 ยังไม่มีข้อมูล — รัน Backtest หรือบันทึก W/L ใน Journal (min ' + this.MIN_TRADES + ' trades/bucket)</div>';
    }

    const cell = (b, fallback = '—') => {
      if (!b) return `<span style="color:var(--gray)">${fallback}</span>`;
      const cls = b.acc >= 60 ? 'text-green' : b.acc >= 40 ? 'text-yellow' : 'text-red';
      return `<span class="${cls}">${b.acc}%</span><span style="color:var(--gray);font-size:5px"> (${b.t})</span>`;
    };

    const rows = s.map(a => {
      const accCls = a.accuracy >= 60 ? 'text-green' : a.accuracy >= 40 ? 'text-yellow' : 'text-red';
      const wCls   = parseFloat(a.weight) >= 1.2 ? 'text-green' : parseFloat(a.weight) <= 0.8 ? 'text-red' : 'text-gray';
      return `<tr>
        <td class="text-teal">${a.name}</td>
        <td>${a.total}</td>
        <td class="${accCls}">${a.accuracy}%</td>
        <td class="${parseFloat(a.totalR) > 0 ? 'text-green' : 'text-red'}">${a.totalR}R</td>
        <td class="${wCls}">${a.weight}x</td>
        <td>${cell(a.trending)}</td>
        <td>${cell(a.ranging)}</td>
        <td>${cell(a.xau)}</td>
        <td>${cell(a.aud)}</td>
        <td>${cell(a.eur)}</td>
      </tr>`;
    }).join('');

    return `
      ${progressHTML}
      ${this.renderRecommend()}
      <div style="margin-top:14px;font-size:8px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:4px">🧠 KNOWLEDGE BASE — Regime-Aware Learning</div>
      <div style="font-size:6px;color:var(--gray);padding:4px 0">
        Live trades: <b style="color:var(--green)">${meta.liveTrades || 0}</b> |
        Backtest trades: <b style="color:var(--teal)">${meta.backtestTrades || 0}</b> |
        Total: <b>${(meta.liveTrades || 0) + (meta.backtestTrades || 0)}</b>
      </div>
      <div style="font-size:6px;color:var(--gray);padding:2px 0 6px">
        💡 Weight ใช้ <b>regime-specific</b> ก่อน (ถ้ามี ≥${this.MIN_TRADES} trades) → ตกลงไป symbol → ตกลงไป all.
        Agent ที่ accuracy ต่ำในตลาดบางแบบ จะถูกลดน้ำหนัก<b>เฉพาะตลาดนั้น</b> ไม่กระทบตลาดที่ทายเก่ง
      </div>
      <div class="j-table-wrap" style="max-height:240px">
        <table class="j-table" style="font-size:5px">
          <thead><tr>
            <th>Agent</th><th>T</th><th>Acc</th><th>R</th><th>W</th>
            <th>🟢Trend</th><th>🔵Range</th>
            <th>XAU</th><th>AUD</th><th>EUR</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(AgentScores.exportJSON()).then(()=>alert('Copied to clipboard — paste in another device'))">📤 Export JSON</button>
        <button class="btn btn-secondary" onclick="const t=prompt('Paste KB JSON:');if(t){const r=AgentScores.importJSON(t);alert(r.msg);Modal.open('journal');}">📥 Import & Merge</button>
        <button class="btn btn-secondary" onclick="if(confirm('Reset KB only (not Journal)?')){AgentScores.reset();Modal.open('journal');}">🔄 Reset KB</button>
        <button class="btn btn-primary" style="border-color:var(--orange);color:var(--orange)" onclick="AgentScores.freshStart()">🆕 Fresh Start (backup + reset all)</button>
      </div>
      <div style="margin-top:6px;font-size:6px;color:var(--gray);border-left:2px solid var(--orange);padding-left:6px">
        💡 <b>Fresh Start</b>: ใช้เมื่อต้องการ <b>วัดผลระบบใหม่</b> หลัง update — backup + reset ในขั้นเดียว
      </div>
    `;
  },
};

// Hook journal into Telegram.notify (auto-log every signal sent + capture agent votes)
const _origNotify = Telegram.notify.bind(Telegram);
Telegram.notify = async function(cmd, grade) {
  // Check if would actually send (replicate gate logic for journal)
  if (Settings.get('telegramOn') && cmd.signal !== 'wait' && cmd.signal !== 'watch') {
    const minGrade = Settings.get('minGrade', 'A');
    const order    = ['D', 'C', 'B', 'A', 'S+'];
    if (order.indexOf(grade.grade) >= order.indexOf(minGrade)) {
      const sym = cmd.sym;
      const enabled =
        (sym === 'XAUUSD' && Settings.get('enableXAU', true)) ||
        (sym === 'AUDUSD' && Settings.get('enableAUD', true)) ||
        (sym === 'EURUSD' && Settings.get('enableEUR', true));
      if (enabled) Journal.add(cmd, grade);
    }
  }
  return _origNotify(cmd, grade);
};

// Capture agent votes when adding to journal (called from app.js fullUpdate)
Journal._origAdd = Journal.add;
Journal.add = function(cmd, grade) {
  this._origAdd(cmd, grade);
  // Attach votes to the latest entry
  if (cmd._agentVotes) {
    const entries = this.load();
    if (entries[0]) {
      entries[0].agentVotes = cmd._agentVotes;
      this.save(entries);
    }
  }
};

/* ═══════════════════════════════════════════════════════
   KEEP-ALIVE — Wake Lock + Browser Notifications
   ป้องกัน tab sleep + ส่ง native notification เสริม Telegram
   ═══════════════════════════════════════════════════════ */
const KeepAlive = {
  wakeLock: null,
  enabled: false,

  async enable() {
    this.enabled = true;
    // 1. Wake Lock — ห้ามจอดับ (รองรับ Chrome/Edge/Safari mobile)
    //    หมายเหตุ: ต้องเรียกหลัง user gesture ครั้งแรก → ครั้งแรกอาจ silently fail
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          if (this.enabled) setTimeout(() => this.enable(), 1000);
        });
      }
    } catch (e) { /* user denied or unsupported */ }

    // 2. Re-acquire wake lock เมื่อกลับมา foreground
    if (!this._visBound) {
      this._visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (this.enabled && document.visibilityState === 'visible' && !this.wakeLock) {
          this.enable();
        }
      });
    }
    return true;
  },

  /** Request notification permission (must be called from user click) */
  async requestNotifPerm() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
      return await Notification.requestPermission();
    } catch (e) { return 'denied'; }
  },

  disable() {
    this.enabled = false;
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  },

  /** Show browser notification (เสริมจาก Telegram) */
  notify(title, body, opts = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        icon: opts.icon || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMGEwYTBmIi8+PHRleHQgeD0iMzIiIHk9IjQ0IiBmb250LXNpemU9IjQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZkNzAwIj7ihLk8L3RleHQ+PC9zdmc+',
        badge: opts.badge,
        tag: opts.tag || 'twr-signal',
        requireInteraction: opts.requireInteraction ?? false,
        silent: opts.silent ?? false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 10000);
    } catch (e) { /* silent */ }
  },

  status() {
    return {
      wakeLockSupported: 'wakeLock' in navigator,
      wakeLockActive:    !!this.wakeLock && !this.wakeLock.released,
      notifPermission:   'Notification' in window ? Notification.permission : 'unsupported',
      enabled:           this.enabled,
    };
  },
};

/* ═══════════════════════════════════════════════════════
   ADAPTIVE STRATEGY ENGINE
     - Auto-pick agents per symbol from KB performance
     - Session quality multiplier (Asia weak, London/NY strong)
     - Volatility-adjusted position sizing
     - Playbook display
   ═══════════════════════════════════════════════════════ */
const AdaptiveStrategy = {
  /** Session multiplier — Asia weak, London/NY peak */
  sessionMultiplier() {
    const h = new Date().getUTCHours();
    if (h >= 8 && h < 12)  return { mult: 1.20, label: '🇬🇧 London Open', quality: 'high' };
    if (h >= 12 && h < 13) return { mult: 1.30, label: '🌍 London/NY Overlap', quality: 'peak' };
    if (h >= 13 && h < 17) return { mult: 1.20, label: '🇺🇸 NY Active', quality: 'high' };
    if (h >= 17 && h < 20) return { mult: 0.90, label: '🌙 NY Wind Down', quality: 'medium' };
    if (h >= 0  && h < 7)  return { mult: 0.70, label: '🇯🇵 Asia Quiet', quality: 'low' };
    return { mult: 0.80, label: '⏸ Off-Peak', quality: 'low' };
  },

  /** Volatility adjustment — high vol = reduce size */
  volatilityAdjust(candles) {
    if (!candles || candles.length < 50) return { multiplier: 1, label: '○ Normal', reason: 'No data' };
    const atr    = TA.atr(candles, 14);
    const atrAvg = TA.atr(candles, 50);
    const ratio  = atrAvg > 0 ? atr / atrAvg : 1;
    if (ratio > 2.0)  return { multiplier: 0,    ratio, label: '🔴 EXTREME VOL', reason: 'ATR > 2x avg — SKIP', skip: true };
    if (ratio > 1.5)  return { multiplier: 0.5,  ratio, label: '🟠 HIGH VOL',    reason: 'ATR > 1.5x → half size' };
    if (ratio > 1.2)  return { multiplier: 0.75, ratio, label: '🟡 ABOVE AVG',   reason: 'Slightly elevated → 75%' };
    if (ratio < 0.5)  return { multiplier: 1.3,  ratio, label: '🟢 LOW VOL',     reason: 'Quiet → can size up' };
    return { multiplier: 1.0, ratio, label: '⚪ NORMAL', reason: 'ATR normal' };
  },

  /** Detect market regime more detailed */
  detectMarket(candles) {
    if (!candles || candles.length < 30) return { label: 'Unknown', adx: 0 };
    const adx = TA.adx(candles, 14);
    const struct = TA.structure(candles);
    if (adx >= 30) {
      return {
        label: struct.trend === 'bullish' ? '🚀 Strong Uptrend' : '📉 Strong Downtrend',
        regime: 'strong_trend', adx, trend: struct.trend,
      };
    }
    if (adx >= 22) return { label: '📈 Trending', regime: 'trending', adx, trend: struct.trend };
    if (adx <= 15) return { label: '↔️ Tight Range', regime: 'tight_range', adx };
    if (adx <= 20) return { label: '⏸ Loose Range', regime: 'range', adx };
    return { label: '🔄 Transitional', regime: 'transitional', adx };
  },

  /** Recommend agents to use for current (symbol, regime) based on KB */
  recommendAgents(symbol) {
    if (typeof AgentScores === 'undefined') return null;
    const prefix = symbol === 'XAUUSD' ? 'Gold' : (symbol === 'AUDUSD' ? 'AUD' : 'EUR');
    const allAgents = AgentScores.stats().filter(a => a.name.startsWith(prefix + '-'));

    const winners = allAgents.filter(a => parseFloat(a.totalR) >= 30);
    const losers  = allAgents.filter(a => parseFloat(a.totalR) <= -30);
    const neutral = allAgents.filter(a => Math.abs(parseFloat(a.totalR)) < 30);

    return {
      symbol,
      winners:  winners.map(a => ({ name: a.name, short: a.name.split('-')[1], acc: a.accuracy, R: parseFloat(a.totalR) })),
      losers:   losers.map(a => ({ name: a.name, short: a.name.split('-')[1], acc: a.accuracy, R: parseFloat(a.totalR) })),
      neutral:  neutral.map(a => ({ name: a.name, short: a.name.split('-')[1], acc: a.accuracy, R: parseFloat(a.totalR) })),
      hasEnoughData: allAgents.some(a => a.total >= 20),
    };
  },

  /** Cascade quality check — multiple gates must pass */
  qualityCheck(opts) {
    const { symbol, signal, confluenceScore, candles } = opts;
    const session = this.sessionMultiplier();
    const vol     = this.volatilityAdjust(candles);
    const market  = this.detectMarket(candles);
    const agents  = this.recommendAgents(symbol);

    const checks = [];
    if (session.quality === 'low') checks.push({ ok: false, msg: 'Session quality ต่ำ (Asia/off-peak)' });
    else                            checks.push({ ok: true,  msg: `Session ${session.label}` });

    if (vol.skip) checks.push({ ok: false, msg: vol.reason });
    else          checks.push({ ok: true,  msg: vol.label });

    if (!confluenceScore || confluenceScore < 0.6) checks.push({ ok: false, msg: 'Confluence weak (<60%)' });
    else                                           checks.push({ ok: true,  msg: 'Confluence strong' });

    const numWinners = agents?.winners?.length || 0;
    if (numWinners < 2) checks.push({ ok: false, msg: `Only ${numWinners} winning agents on ${symbol}` });
    else                checks.push({ ok: true,  msg: `${numWinners} winning agents available` });

    const allPass = checks.every(c => c.ok);
    return { pass: allPass, checks, session, vol, market, agents };
  },

  /** Render Playbook panel for Commander */
  renderPlaybook(symbol, signal, confluenceScore, candles) {
    const qc = this.qualityCheck({ symbol, signal, confluenceScore, candles });

    const rowItems = qc.checks.map(c =>
      `<div class="row"><span class="lbl">${c.ok ? '✅' : '❌'} ${c.msg.split(' ')[0]}</span><span class="val ${c.ok ? 'up' : 'dn'}">${c.msg.split(' ').slice(1).join(' ') || (c.ok ? 'OK' : 'FAIL')}</span></div>`
    ).join('');

    const verdict = qc.pass ? '🟢 GO' : '🔴 SKIP';
    const verdictColor = qc.pass ? 'var(--green)' : 'var(--red)';

    return `
      <div style="margin-top:8px;background:linear-gradient(90deg,rgba(${qc.pass?'0,255,65':'255,51,51'},0.1),transparent);border-left:3px solid ${verdictColor};padding:6px 8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:7px;color:${verdictColor}">⚙ ADAPTIVE PLAYBOOK</span>
          <span style="font-size:9px;color:${verdictColor};font-weight:bold">${verdict}</span>
        </div>
        <div class="trade-params" style="font-size:6px">${rowItems}</div>
        <div style="font-size:6px;color:var(--gray);padding-top:4px">
          Market: ${qc.market.label} · ATR ratio: ${qc.vol.ratio?.toFixed(2)}x · Position mult: ${qc.vol.multiplier}x
        </div>
      </div>
    `;
  },
};
window.AdaptiveStrategy = AdaptiveStrategy;

/* ═══════════════════════════════════════════════════════
   BOT BRIDGE — Read status from MT5 EA via Apps Script
   ═══════════════════════════════════════════════════════ */
const BotBridge = {
  POLL_SEC: 15,   // Phase 25.7: poll EA every 15s (was 30) — cards/positions update faster
  timer: null,
  lastStatus: null,

  start() {
    this.stop();
    this.tick();
    this.timer = setInterval(() => this.tick(), this.POLL_SEC * 1000);
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  async tick() {
    const url = Settings.get('botBridgeURL', '');
    if (!url || url.length < 20) return;
    try {
      const r = await fetch(url + '?action=status&t=' + Date.now());
      const data = await r.json();
      if (data.ok && data.status) {
        this.lastStatus = data.status;
        this.render();
        this._reconcilePreset(data.status);   // Phase D.9: self-heal preset to user's pick
      }
    } catch (e) { /* silent */ }
    // Phase 12.6: also poll live trades for AI training
    this.syncLiveTrades(url);
  },

  // Phase D.9: if the EA's running preset doesn't match the user's chosen one
  // (e.g. the EA was reloaded and skipped the queued command), re-send it — throttled
  // to once / 30s so it never floods the one-command-per-poll queue. Stops once synced.
  _presetResyncAt: 0,
  _reconcilePreset(status) {
    try {
      if (typeof Settings === 'undefined') return;
      const want = Settings.get('riskPreset', 'auto');
      const have = (status && status.preset) || 'auto';
      if (want === have) return;                       // already in sync — nothing to do
      const now = Date.now();
      if (now - this._presetResyncAt < 30000) return;  // throttle
      this._presetResyncAt = now;
      this.sendCommand('preset_' + want, { silent: true });
      if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'Preset', `🔁 ส่งซ้ำ preset → ${want.toUpperCase()} (EA ยังเป็น ${have})`);
    } catch (e) { /* silent */ }
  },

  // Phase 12.6: pull recently closed trades → feed into KB
  liveSeenTrades: null,
  liveStats: { count: 0, wins: 0, losses: 0, totalR: 0 },
  recentTrades: [],   // Phase 15.5: raw trades for reason display
  allTrades: [],      // Phase 16: full list for analytics
  _autoAdjustDone: 0, // Phase 16: last consecutive-loss count we acted on

  // Phase 16: consecutive-loss guard — Strategy Officer auto-reduces risk
  checkAutoAdjust(trades) {
    if (!Array.isArray(trades) || trades.length === 0) return;
    // trades are newest-first (unshift). Count leading losses.
    let streak = 0;
    for (const t of trades) {
      if (t.outcome === 'loss') streak++;
      else break;
    }
    this.lossStreak = streak;
    // Act once per new streak level (3, 4, 5...)
    if (streak >= 3 && streak > this._autoAdjustDone) {
      this._autoAdjustDone = streak;
      const curRisk = Settings.get('riskPerTrade', 2);
      if (streak === 3) {
        UI.addLog?.('CMD', 'Strategy', `⚠️ แพ้ 3 ไม้ติด — Strategy Officer เฝ้าระวัง`);
      } else if (streak === 4) {
        const newRisk = Math.max(0.5, curRisk * 0.5);
        Settings.set('riskPerTrade', newRisk);
        UI.addLog?.('CMD', 'Strategy', `🛡 แพ้ 4 ไม้ติด — ลด Risk ${curRisk}%→${newRisk}% อัตโนมัติ`);
      } else if (streak >= 5) {
        // Phase 26: when bypass (data-collection) is ON, losing streaks are
        // expected — don't auto-pause (it was fighting the user's data run).
        const collecting = (typeof Settings !== 'undefined') && Settings.get('tradeWithoutKB', false);
        if (collecting) {
          UI.addLog?.('CMD', 'Strategy', `⚠️ แพ้ ${streak} ไม้ติด — แต่เปิด bypass (เก็บข้อมูล KB) อยู่ จึงไม่ pause`);
        } else {
          // Auto-pause via EA command (silent — no confirm popup)
          this.sendCommand('pause', { silent: true });
          UI.addLog?.('CMD', 'Strategy', `🛑 แพ้ ${streak} ไม้ติด — สั่ง PAUSE บอท + แจ้ง CEO`);
          if (typeof KeepAlive !== 'undefined') {
            KeepAlive.notify('🛑 Strategy Officer', `แพ้ ${streak} ไม้ติด — Pause บอทอัตโนมัติ`, {});
          }
        }
      }
    }
    // Reset when a win breaks the streak
    if (streak === 0) this._autoAdjustDone = 0;
  },
  lossStreak: 0,

  async syncLiveTrades(url) {
    // dedupe via posId in localStorage
    if (!this.liveSeenTrades) {
      try { this.liveSeenTrades = new Set(JSON.parse(localStorage.getItem('TWR_LIVE_SEEN') || '[]')); }
      catch { this.liveSeenTrades = new Set(); }
    }
    try {
      const r = await fetch(url + '?action=trades&t=' + Date.now());
      const data = await r.json();
      if (!data.ok || !Array.isArray(data.trades)) return;
      this.recentTrades = data.trades.slice(0, 15);   // Phase 15.5: keep latest 15 for display
      this.allTrades = data.trades;                     // Phase 16: full list for analytics
      this.checkAutoAdjust(data.trades);                // Phase 16: consecutive-loss guard
      if (typeof AgentScores !== 'undefined') AgentScores.autoApplyTick();  // Phase 19: auto-apply strategy
      if (typeof Gemini !== 'undefined') Gemini.tick();                     // Phase 26: GEMINI head-coach review
      let newCount = 0;
      data.trades.forEach(t => {
        if (!t || !t.posId) return;
        if (this.liveSeenTrades.has(t.posId)) return;
        this.liveSeenTrades.add(t.posId);
        this.learnFromTrade(t);
        newCount++;
      });
      if (newCount > 0) {
        // Persist seen set (truncate to last 500 ids)
        const arr = Array.from(this.liveSeenTrades);
        if (arr.length > 500) this.liveSeenTrades = new Set(arr.slice(-500));
        localStorage.setItem('TWR_LIVE_SEEN', JSON.stringify(Array.from(this.liveSeenTrades)));
        console.log(`📚 AI learned from ${newCount} new live trade(s) | total seen: ${this.liveSeenTrades.size}`);
      }
      // Compute aggregate stats from full set
      this.liveStats = data.trades.reduce((acc, t) => {
        acc.count++;
        if (t.outcome === 'win') acc.wins++;
        else if (t.outcome === 'loss') acc.losses++;
        acc.totalR += (parseFloat(t.rMult) || 0);
        return acc;
      }, { count: 0, wins: 0, losses: 0, totalR: 0 });
    } catch (e) { /* silent */ }
  },

  // Inject a closed live trade into the web KnowledgeBase, crediting the agents
  // that ACTUALLY fired it (the pair's EA combo) — see Phase D.2 notes below.
  learnFromTrade(t) {
    if (typeof AgentScores === 'undefined') return;
    if (!t.outcome || t.outcome === 'breakeven') return;
    // Phase 24: attribute this closed trade to the employee who fired its signal (audit)
    if (typeof Company !== 'undefined' && Company._attachOutcome) {
      try { Company._attachOutcome(t.sym, t.outcome, t.rMult, t.agent); } catch (e) {}
    }

    const sigDir = (t.side === 'buy') ? 'buy' : 'sell';
    // Symbol short form (strip suffix m/c/z/r). Prefix MUST match backtest's
    // (Gold/AUD/EUR, EUR as catch-all) so live + backtest land on the same KB rows.
    const symKey = (t.sym || '').replace(/[mczr]$/i, '').toUpperCase();
    const prefix = symKey === 'XAUUSD' ? 'Gold' : symKey === 'AUDUSD' ? 'AUD' : 'EUR';

    // Phase D.2 FIX: the old code hard-coded votes to ea-rsi/ea-bollinger/ea-fib —
    // the LEGACY agents that no longer trade. Credit the REAL combo the EA ran for
    // this pair instead. The EA only fires when its combo members agree on direction
    // with none opposing, so every member is recorded as agreeing with the trade's
    // side (same convention backtest uses). Names match KB rows: `${prefix}-${tech}`.
    let votes = null;
    if (typeof Company !== 'undefined' && Company._eaComboFor && Company._KEYMAP) {
      const sel = Company._eaComboFor(symKey);
      if (sel && sel.agents.length) {
        votes = sel.agents.map(key => ({ agent: `${prefix}-${Company._KEYMAP[key] || key}`, signal: sigDir }));
      }
    }
    if (!votes || !votes.length) votes = [{ agent: `${prefix}-EA`, signal: sigDir }];  // safety net

    // Phase D.2 FIX: real regime from the live candles (same classifier backtest
    // uses) instead of the crude trend/range guess — so live + backtest buckets align.
    let regime = null;
    try {
      const c = (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.market && TradingWarRoom.market.candles)
              ? (TradingWarRoom.market.candles[t.sym] || TradingWarRoom.market.candles[symKey]) : null;
      if (c) regime = AgentScores.classifyRegime(c);
    } catch (e) {}

    AgentScores.recordTrade({
      votes,
      signal:  sigDir,
      outcome: t.outcome,
      r:       parseFloat(t.rMult) || (t.outcome === 'win' ? 1 : -1),
      regime,
      symbol:  symKey,
      source:  'live',
    });
  },

  // Phase 13: Web AI → EA signal pipeline
  // Auto-called from app.js when Commander emits Grade A+ buy/sell signal
  // Sends ai_buy_<SYM> or ai_sell_<SYM> command; EA bypasses cooldown
  _lastAISignalKey: null,
  async sendAISignal(sym, side, empId) {
    if (!Settings.get('webAISignalsToEA', false)) {
      if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'AI→EA', '⚠️ ไม่ส่ง: ปิด "ส่งสัญญาณ AI ไป EA" อยู่');
      return;
    }
    const url = Settings.get('botBridgeURL', '');
    if (!url || url.length < 20) {
      if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'AI→EA', '⚠️ ไม่ส่ง: ยังไม่ตั้ง Bot Bridge URL ฝั่งเว็บ (กด ✎ ที่การ์ดพอร์ต)');
      return;
    }

    // Phase 23.1: SMALL-PORTFOLIO GUARD — wait for open trades to close before
    // firing a new one when the account is small (limits concurrent exposure).
    const bot = this.lastStatus;
    const openPos = (bot && bot.positions) ? bot.positions.length : 0;
    const bal = (bot && typeof bot.balance === 'number') ? bot.balance
              : (typeof Settings !== 'undefined' ? Settings.get('accountSize', 30) : 30);
    // auto cap by balance: <$50 = 1 trade, <$150 = 2, else 3 (override via setting)
    const autoCap = bal < 50 ? 1 : bal < 150 ? 2 : 3;
    const maxConc = (typeof Settings !== 'undefined') ? Settings.get('maxConcurrent', autoCap) : autoCap;
    if (openPos >= maxConc) {
      if (typeof UI !== 'undefined' && UI.addLog)
        UI.addLog('CMD', 'RiskGuard', `⏳ มี ${openPos} ไม้เปิดอยู่ (เพดาน ${maxConc} · พอร์ต $${bal.toFixed(0)}) — รอปิดก่อนค่อยเข้าใหม่`);
      return;
    }

    // Map web symbol → broker symbol. If the EA's symbol list hasn't been
    // received yet, fall back to the base symbol (EA's SymBaseMatch maps
    // XAUUSD → XAUUSDm), so a signal is never silently dropped.
    const brokerSym = this._mapToBrokerSym(sym) || sym.replace(/\W/g, '').toUpperCase();
    // Dedupe — don't spam if same signal repeats every analysis tick
    const key = brokerSym + '_' + side + '_' + Math.floor(Date.now() / (5 * 60 * 1000));
    if (this._lastAISignalKey === key) return;
    this._lastAISignalKey = key;

    // Phase 26: append agent tag (emp_cl → cl) so the EA can attribute the trade
    const tag = (empId || '').replace('emp_', '');
    const cmd = 'ai_' + side + '_' + brokerSym + (tag ? '_' + tag : '');
    try {
      await fetch(url, {
        method: 'POST',
        mode:   'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ type: 'cmd', secret: 'twr-secret', cmd })
      });
      console.log(`🧠 Phase 13: AI signal sent → ${cmd}`);
    } catch (e) { /* silent */ }
  },

  _mapToBrokerSym(webSym) {
    // Try to find matching symbol from last status (broker-actual names)
    const known = this.lastStatus?.symbols || [];
    const base = webSym.replace(/\W/g, '').toUpperCase();  // XAUUSD, AUDUSD, EURUSD
    return known.find(s => s.toUpperCase().startsWith(base)) || null;
  },

  // Phase 12.4: send remote command to EA via Apps Script
  async sendCommand(cmd, opts = {}) {
    const url = Settings.get('botBridgeURL', '');
    if (!url || url.length < 20) return alert('ตั้ง Bot Bridge URL ก่อน');
    const confirmMsgs = {
      close_all: '⚠️ ปิด ALL positions ของบอท?\nไม้ที่กำลังกำไร/ขาดทุนจะถูกปิดทันทีตามราคาตลาด',
      pause:     '⏸ หยุดเทรดชั่วคราว?\nบอทจะไม่เปิด order ใหม่ แต่จะดูแล position ที่เปิดอยู่ต่อ',
      resume:    '▶️ เริ่มเทรดต่อ?',
      reset_pnl: '🔄 Reset ตัวเลข W/L/PnL วันนี้?'
    };
    // Symbol toggle commands don't need confirm
    if (!opts.silent && !cmd.startsWith('sym_') && !confirm(confirmMsgs[cmd] || ('Send: ' + cmd))) return;
    try {
      const r = await fetch(url, {
        method: 'POST',
        mode:   'no-cors',  // Apps Script needs no-cors for cross-origin POST
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ type: 'cmd', secret: 'twr-secret', cmd: cmd })
      });
      // no-cors → can't read response; assume queued
      const el = document.getElementById('bot-cmd-status');
      if (el) {
        el.textContent = '✓ Command sent: ' + cmd + ' (EA จะรับใน 15s)';
        el.style.color = 'var(--green)';
        setTimeout(() => { el.textContent = ''; }, 4000);
      }
    } catch (e) {
      alert('Send failed: ' + e.message);
    }
  },

  render() {
    const el = document.getElementById('bot-status-body');
    if (!el || !this.lastStatus) return;
    const s = this.lastStatus;
    const onlineColor = s.online ? 'var(--green)' : 'var(--red)';
    const onlineText  = s.online ? '🟢 ONLINE' : '🔴 OFFLINE (' + s.ageSec + 's ago)';
    const pausedBadge = s.paused ? '<span style="color:var(--orange);font-size:7px;margin-left:6px">⏸ PAUSED</span>' : '';

    const positions = (s.positions || []).map(p => {
      const sideEm = p.side === 'buy' ? '▲' : '▼';
      const profCls = p.profit > 0 ? 'text-green' : p.profit < 0 ? 'text-red' : 'text-gray';
      return `<tr>
        <td class="text-teal">${p.sym}</td>
        <td class="${p.side === 'buy' ? 'text-green' : 'text-red'}">${sideEm} ${p.side.toUpperCase()}</td>
        <td>${p.vol}</td>
        <td>${p.open}</td>
        <td class="text-red">${p.sl}</td>
        <td class="text-green">${p.tp}</td>
        <td class="${profCls}">$${p.profit.toFixed(2)}</td>
      </tr>`;
    }).join('');
    const posRows = positions || '<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:8px">No open positions</td></tr>';

    const pnlCls = s.todayPnL > 0 ? 'text-green' : s.todayPnL < 0 ? 'text-red' : 'text-gray';

    el.innerHTML = `
      <!-- Phase 12.4: Remote Control Buttons -->
      <div style="display:flex;gap:4px;margin-bottom:8px;padding:6px;border:1px solid var(--border);background:var(--bg-card)">
        <button class="btn btn-secondary" style="font-size:6px;padding:4px 8px;background:var(--red);color:#fff" onclick="BotBridge.sendCommand('close_all')">🔴 Close All</button>
        ${s.paused
          ? `<button class="btn btn-secondary" style="font-size:6px;padding:4px 8px;background:var(--green);color:#000" onclick="BotBridge.sendCommand('resume')">▶️ Resume</button>`
          : `<button class="btn btn-secondary" style="font-size:6px;padding:4px 8px;background:var(--orange)" onclick="BotBridge.sendCommand('pause')">⏸ Pause</button>`
        }
        <button class="btn btn-secondary" style="font-size:6px;padding:4px 8px" onclick="BotBridge.sendCommand('reset_pnl')">🔄 Reset Today</button>
        <button class="btn btn-secondary" style="font-size:6px;padding:4px 8px;margin-left:auto" onclick="BotBridge.tick()">⟳ Refresh</button>
        <span id="bot-cmd-status" style="font-size:6px;color:var(--gray);align-self:center;margin-left:8px"></span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border)">
        <div style="background:var(--bg-card);padding:8px;text-align:center">
          <div style="font-size:6px;color:var(--gray)">Status</div>
          <div style="font-size:8px;color:${onlineColor};margin-top:3px">${onlineText}${pausedBadge}</div>
        </div>
        <div style="background:var(--bg-card);padding:8px;text-align:center">
          <div style="font-size:6px;color:var(--gray)">Balance</div>
          <div style="font-size:11px;color:var(--teal);margin-top:3px">$${s.balance.toFixed(2)}</div>
        </div>
        <div style="background:var(--bg-card);padding:8px;text-align:center">
          <div style="font-size:6px;color:var(--gray)">Equity</div>
          <div style="font-size:11px;color:var(--white);margin-top:3px">$${s.equity.toFixed(2)}</div>
        </div>
        <div style="background:var(--bg-card);padding:8px;text-align:center">
          <div style="font-size:6px;color:var(--gray)">Today P/L</div>
          <div style="font-size:11px;margin-top:3px" class="${pnlCls}">$${s.todayPnL > 0 ? '+' : ''}${s.todayPnL.toFixed(2)}</div>
        </div>
        <div style="background:var(--bg-card);padding:8px;text-align:center">
          <div style="font-size:6px;color:var(--gray)">W/L Today</div>
          <div style="font-size:11px;color:var(--gold);margin-top:3px">${s.todayWins}/${s.todayLosses}</div>
        </div>
      </div>
      <!-- Phase 15: Portfolio risk gauge -->
      ${this.renderPortfolioRisk(s)}

      <!-- Phase 12.9: per-symbol enable/disable toggles -->
      ${this.renderSymbolToggles(s)}

      <div style="margin-top:8px;font-size:7px;color:var(--gold)">📊 Open Positions</div>
      <div class="j-table-wrap" style="max-height:140px">
        <table class="j-table" style="font-size:6px">
          <thead><tr><th>Symbol</th><th>Side</th><th>Vol</th><th>Open</th><th>SL</th><th>TP</th><th>Profit</th></tr></thead>
          <tbody>${posRows}</tbody>
        </table>
      </div>
      <div style="margin-top:4px;font-size:6px;color:var(--gray);line-height:1.7">
        <span style="color:var(--gold)">⚡ TRADING:</span> ${(s.tradeSymbols || s.symbols || []).filter(Boolean).join(', ') || '—'}
        ${s.watchSymbols && s.watchSymbols[0] ? ` · <span style="color:var(--teal)">👁 WATCH:</span> ${s.watchSymbols.filter(Boolean).join(', ')}` : ''}
        ${s.mode ? ` · <span style="color:var(--purple)">MODE:</span> <b style="color:${s.mode === 'scalp' ? 'var(--orange)' : 'var(--green)'}">${s.mode === 'scalp' ? '⚡ SCALP M1' : '🌊 SWING'}</b>` : ''}
        · Updated ${s.ageSec}s ago
      </div>

      <!-- Phase 12.6: Live AI Training Status -->
      ${this.renderLiveTraining()}
    `;
  },

  // Phase 15: Portfolio risk gauge (stop-out guard)
  renderPortfolioRisk(s) {
    if (s.portfolioRisk === undefined) return '';
    const risk = parseFloat(s.portfolioRisk) || 0;
    const max  = parseFloat(s.maxPortfolioRisk) || 6;
    const pct  = Math.min(100, (risk / max) * 100);
    const col  = risk >= max ? 'var(--red)' : risk >= max * 0.7 ? 'var(--orange)' : 'var(--green)';
    const status = risk >= max ? '🔴 MAX — บล็อก trade ใหม่' : risk >= max * 0.7 ? '🟡 สูง' : '🟢 ปลอดภัย';
    return `
      <div style="margin-top:8px;padding:6px;border:1px solid ${col};background:rgba(255,255,255,0.02)">
        <div style="display:flex;justify-content:space-between;font-size:6px;margin-bottom:3px">
          <span style="color:var(--gold)">🛡 PORTFOLIO RISK (stop-out guard)</span>
          <span style="color:${col}">${risk.toFixed(1)}% / ${max.toFixed(0)}% · ${status}</span>
        </div>
        <div style="height:6px;background:var(--bg-card);border:1px solid var(--border);position:relative">
          <div style="height:100%;width:${pct}%;background:${col};transition:width 0.3s"></div>
        </div>
      </div>`;
  },

  // Phase 12.9: per-symbol enable/disable buttons
  renderSymbolToggles(s) {
    const list = Array.isArray(s.symEnabled) ? s.symEnabled : [];
    if (list.length === 0) return '';
    const buttons = list.map((e, idx) => {
      const on = e.on === true;
      const bg = on ? 'var(--green)' : '#444';
      const col = on ? '#000' : '#aaa';
      const icon = on ? '🟢' : '⚫';
      const cmd = 'sym_' + (idx + 1) + (on ? '_off' : '_on');
      const label = on ? 'ON' : 'OFF';
      return `<button class="btn" style="background:${bg};color:${col};font-size:6px;padding:4px 8px"
        onclick="BotBridge.sendCommand('${cmd}')" title="คลิกเพื่อ ${on ? 'ปิด' : 'เปิด'}เทรด ${e.sym}">
        ${icon} ${e.sym} <b>${label}</b>
      </button>`;
    }).join('');
    return `
      <div style="margin-top:8px;padding:6px;border:1px solid var(--gold);background:rgba(255,230,0,0.05)">
        <div style="font-size:6px;color:var(--gold);margin-bottom:4px">🎚 SYMBOL TRADING (กดเปิด/ปิดต่อตัว — มีผลใน 15s)</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${buttons}</div>
      </div>
    `;
  },

  renderLiveTraining() {
    const st = this.liveStats || { count: 0, wins: 0, losses: 0, totalR: 0 };
    const wr  = st.count > 0 ? ((st.wins / (st.wins + st.losses)) * 100) : 0;
    const avgR = st.count > 0 ? (st.totalR / st.count) : 0;
    const seen = this.liveSeenTrades ? this.liveSeenTrades.size : 0;
    const wrCls   = wr >= 55 ? 'text-green' : wr >= 45 ? 'text-yellow' : 'text-red';
    const rCls    = avgR > 0 ? 'text-green' : avgR < 0 ? 'text-red' : 'text-gray';
    return `
      <div style="margin-top:10px;padding:8px;border:1px solid var(--purple);background:rgba(120,80,255,0.08)">
        <div style="font-size:7px;color:var(--purple);margin-bottom:6px">🧠 AI LIVE TRAINING <span style="color:var(--gray);font-size:6px">(KB learns from every closed trade)</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:6px">
          <div><span style="color:var(--gray)">Total Trades</span><br><span style="color:var(--teal);font-size:9px">${st.count}</span></div>
          <div><span style="color:var(--gray)">Win Rate</span><br><span class="${wrCls}" style="font-size:9px">${wr.toFixed(1)}%</span></div>
          <div><span style="color:var(--gray)">Avg R</span><br><span class="${rCls}" style="font-size:9px">${avgR > 0 ? '+' : ''}${avgR.toFixed(2)}R</span></div>
          <div><span style="color:var(--gray)">KB Updates</span><br><span style="color:var(--gold);font-size:9px">${seen}</span></div>
        </div>
        <div style="margin-top:4px;font-size:6px;color:var(--gray)">
          📈 W:${st.wins} L:${st.losses} · ผลรวม R: ${st.totalR > 0 ? '+' : ''}${st.totalR.toFixed(2)} · ดู KB stats ที่ <span style="color:var(--teal);cursor:pointer" onclick="Modal.open('journal')">📓 JOURNAL</span>
        </div>
      </div>
    `;
  },
};
window.BotBridge = BotBridge;

/* ═══════════════════════════════════════════════════════
   COMPANY VIEW (Phase 15.1) — Personal AI Trading Firm
   Reframes the whole system as an org:
     👔 CEO (you) · 📋 Secretary · 📈 3 Traders ·
     🧠 Strategy Officer · 📊 Accountant · 💻 Dev · 🤖 Claude Advisor
   ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   PIXEL OFFICE (Phase 17) — clickable HQ landing room
   Characters at desks → click opens detail panel
   ═══════════════════════════════════════════════════════ */
const Office = {
  refresh() {
    const el = document.getElementById('office-body');
    if (el) el.innerHTML = this.render();
  },

  // pixel-head spec per office role (no emoji)
  _faces: {
    ceo:        { skin:'#e9b48c', hair:'#2a2a2a', style:'short', acc:'tie',     accColor:'#c0392b' },
    sec:        { skin:'#f0c8a0', hair:'#7a4a1a', style:'long',  acc:'headset', accColor:'#ff66cc' },
    xau:        { skin:'#e9b48c', hair:'#101015', style:'bun',   acc:'headband',accColor:'#ffd700' },
    aud:        { skin:'#e9b48c', hair:'#3a2a1a', style:'spiky', acc:'headband',accColor:'#00ccff' },
    eur:        { skin:'#e9b48c', hair:'#4a3a2a', style:'short', acc:'visor',   accColor:'#4169e1' },
    strategy:   { skin:'#e3c9a0', hair:'#888',    style:'short', acc:'glasses', accColor:'#a060ff' },
    accountant: { skin:'#e9b48c', hair:'#2a2a3a', style:'short', acc:'glasses', accColor:'#2ecc71' },
    dev:        { skin:'#e9b48c', hair:'#1f1f1f', style:'short', acc:'headset', accColor:'#7fff00' },
    claude:     { skin:'#cdd6e0', hair:'#88a',    style:'short', acc:'robot',   accColor:'#00e5ff' },
  },

  // a desk character tile (pixel head)
  _char(faceKey, name, role, sig, onclick, glow) {
    const sigCol = sig === 'buy' ? '#00ff41' : sig === 'sell' ? '#ff3333'
                 : sig === 'watch' ? '#ff8c00' : sig === 'online' ? '#00ffc8' : '#7a8aa0';
    const speech = sig === 'buy' ? 'BUY!' : sig === 'sell' ? 'SELL!' : sig === 'watch' ? '...' : '';
    const spec = this._faces[faceKey] || this._faces.dev;
    const head = (typeof UI !== 'undefined' && UI.pixelFace)
      ? UI.pixelFace(spec, 40)
      : `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${(spec.accColor||'#888')}33;color:${spec.accColor||'#ccc'};font-size:16px;font-weight:bold">${(name||'?').slice(0,1)}</div>`;
    return `
      <div onclick="${onclick}" title="คลิกดู ${name}" class="office-char" style="
        cursor:pointer;position:relative;text-align:center;
        padding:9px 6px 7px;border:2px solid ${glow?sigCol:'#243049'};border-radius:9px;
        background:linear-gradient(180deg, ${sigCol}14 0%, rgba(16,22,38,0.95) 64%);
        transition:transform .12s, box-shadow .12s;
        ${glow?`box-shadow:0 0 10px ${sigCol}55`:''}"
        onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 14px ${sigCol}88'"
        onmouseout="this.style.transform='';this.style.boxShadow='${glow?`0 0 10px ${sigCol}55`:'none'}'">
        ${speech ? `<div style="position:absolute;top:-9px;right:-3px;background:${sigCol};color:#000;font-size:7px;padding:1px 5px;border-radius:6px 6px 6px 0;font-weight:bold">${speech}</div>` : ''}
        <div style="display:inline-block;background:#0b0f1a;border:1px solid ${sigCol}55;border-radius:5px;padding:2px;box-shadow:0 0 8px ${sigCol}44">${head}</div>
        <div style="margin-top:4px;font-size:9px;color:#fff;font-weight:bold;letter-spacing:.3px">${name}</div>
        <div style="font-size:6.5px;color:${sigCol};margin-top:1px">${role}</div>
      </div>`;
  },

  // PHASE 25.2: AURA-style trading floor — 6 employees at pixel desks
  _deskScene() {
    if (typeof Company === 'undefined') return '';
    Company._initCustom(); Company._injectFX();
    const gold = TradingWarRoom?.lastGold, fx = TradingWarRoom?.lastFX;
    const teamFor = (sym) => sym === 'XAUUSD' ? gold : sym === 'AUDUSD' ? fx?.aud : sym === 'EURUSD' ? fx?.eur : (typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.lastBTC : null);
    const bot = BotBridge?.lastStatus;
    const winners = Company._pairWinners(teamFor, bot);
    const winnerOf = (id) => Object.keys(winners).find(s => winners[s] && winners[s].emp.id === id);
    const cards = Company.EMPLOYEES.map(e => {
      const combo = Company.COMBOS[e.combo] || { icon:'', name:'' };
      let best = null;
      Company._SYMS.forEach(s => { if (e.sym && e.sym !== s) return; const d = Company._empDecision(e, s, teamFor(s), bot); if (!best || d.score > best.score) best = d; });
      const active = winnerOf(e.id);
      const sig  = best ? best.signal : 'wait';
      const conf = best ? (best.conf || 0) : 0;
      const sigCol = sig === 'buy' ? '#00ff66' : sig === 'sell' ? '#ff4040' : '#5a6a82';
      const dirTxt = sig === 'buy' ? '▲ BUY' : sig === 'sell' ? '▼ SELL' : '· WAIT';
      const pairBadge = e.sym ? e.sym.replace('USD','') : 'FLOAT';
      return `<div class="twr-emp${active?' active':''}" style="position:relative;border:1px solid ${active?sigCol:e.face.accColor+'55'};border-radius:8px;background:#0c1220;padding:7px;text-align:center;${active?`box-shadow:0 0 12px ${sigCol}66;color:${sigCol};`:''}">
        ${active?`<div style="position:absolute;top:5px;right:5px;z-index:2;font-size:6px;font-weight:bold;color:#04140d;background:${sigCol};padding:1px 5px;border-radius:4px">ออกไม้ ${active.replace('USD','')}</div>`:''}
        <div style="width:100%;height:112px;overflow:hidden;border-radius:6px;background:linear-gradient(#131d2e,#0a0f18);display:flex;align-items:center;justify-content:center">
          <img class="twr-ava" data-sc="${(e.sprite&&e.sprite[0])||0}" data-sr="${(e.sprite&&e.sprite[1])||0}" style="height:108px;width:auto;image-rendering:pixelated;filter:drop-shadow(0 2px 3px #000)">
        </div>
        <div style="font-size:9px;color:#fff;font-weight:bold;margin-top:4px">${e.name} <span style="font-size:6px;color:${e.face.accColor}">· ${pairBadge}</span></div>
        <div style="font-size:6px;color:${e.face.accColor};margin-bottom:3px">${combo.icon} ${combo.name}</div>
        <div style="font-size:7px;font-weight:bold;color:${sigCol}">${dirTxt} · ${conf}%</div>
        <div style="height:4px;background:#1a2030;border-radius:2px;overflow:hidden;margin-top:2px"><div style="height:100%;width:${conf}%;background:${sigCol}"></div></div>
      </div>`;
    }).join('');
    return `<div style="font-size:8px;color:var(--gold);text-align:center;margin-bottom:8px">💼 TRADING FLOOR — พนักงาน ${Company.EMPLOYEES.length} คน <span style="font-size:6px;color:#9aa">(การ์ดเรืองแสง = กำลังออกไม้)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin-bottom:14px">${cards}</div>`;
  },

  render() {
    const bot  = BotBridge?.lastStatus;
    const gold = TradingWarRoom?.lastGold;
    const fx   = TradingWarRoom?.lastFX;
    const live = BotBridge?.liveStats || { count:0, wins:0, losses:0, totalR:0 };
    const wr   = (live.wins+live.losses)>0 ? (live.wins/(live.wins+live.losses)*100) : 0;
    const bal  = bot?.balance || 0;
    const goalPct = Math.max(0, Math.min(100, ((bal-30)/(100-30))*100));
    const online = bot?.online;
    const autoPilot = Settings.get('autoPilot', false);

    const sig = (t) => t?.signal || t?.head?.signal || 'wait';

    return `
      <!-- top status bar -->
      <div style="display:flex;align-items:center;gap:16px;padding:10px 14px;background:linear-gradient(90deg,rgba(0,255,200,0.08),transparent);border-bottom:2px solid var(--teal)">
        <div style="font-size:13px;color:var(--gold);font-weight:bold">🏢 TRADING WAR ROOM CORP</div>
        <div style="margin-left:auto;display:flex;gap:18px;align-items:center;font-size:8px">
          <div>😊 MORALE<br><div style="width:80px;height:6px;background:#222;border-radius:3px;margin-top:2px"><div style="height:100%;width:${wr}%;background:${wr>=55?'var(--green)':'var(--orange)'};border-radius:3px"></div></div></div>
          <div>🎯 GOAL $100<br><div style="width:80px;height:6px;background:#222;border-radius:3px;margin-top:2px"><div style="height:100%;width:${goalPct}%;background:linear-gradient(90deg,var(--green),var(--gold));border-radius:3px"></div></div></div>
          <div style="text-align:center">${online?'🟢':'🔴'}<br><span style="color:${online?'var(--green)':'var(--red)'}">${online?'OPEN':'CLOSED'}</span></div>
          ${autoPilot?'<div style="text-align:center;color:var(--green)">🤖<br>AUTO</div>':''}
        </div>
      </div>

      <!-- office floor: pixel window wall (city skyline behind glass) -->
      <div style="position:relative;height:40px;background:linear-gradient(180deg,#0e1830 0%,#14223e 100%);border-bottom:3px solid #243049;overflow:hidden">
        <div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:5px;padding:0 14px;opacity:.6">
          ${[14,22,10,28,18,24,12,30,16,26,20,14].map((h,i)=>`<div style="flex:1;height:${h}px;background:linear-gradient(180deg,#2a3e66,#16233f);box-shadow:inset 0 2px 0 #3a527f"></div>`).join('')}
        </div>
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 70px,#243049 70px 73px)"></div>
        <span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:#5a7099;letter-spacing:3px">EAT · SLEEP · TRADE · REPEAT</span>
      </div>

      <!-- room -->
      <div style="padding:16px;background:radial-gradient(ellipse at top,#141c2e,#0a0f18)">

        <!-- Executive row -->
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:420px;margin:0 auto 14px">
          ${this._char('ceo','CEO (คุณ)','Boss · click=Company','online',"Modal.open('company')",true)}
          ${this._char('sec','Janie','เลขา · คุยได้','online',"Modal.open('company')",true)}
        </div>

        <!-- AURA trading floor: 6 employees at pixel desks -->
        ${this._deskScene()}

        <!-- Support staff row -->
        <div style="font-size:8px;color:var(--purple);text-align:center;margin-bottom:6px">🏛 SUPPORT</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${this._char('strategy','Strategy','KB · click=Journal','online',"Modal.open('journal')",false)}
          ${this._char('accountant','Accountant','P&L · click=BOT','online',"Modal.open('botstatus')",false)}
          ${this._char('dev','Dev','Health','online',"Modal.open('botstatus')",false)}
          ${this._char('claude','Claude','Advisor','online',"Modal.open('company')",false)}
        </div>
      </div>

      <!-- console feed -->
      <div style="padding:8px 14px;background:#0a0f18;border-top:1px solid #2a3550">
        <div style="font-size:7px;color:var(--teal);margin-bottom:3px">🖥 SYSTEM CONSOLE</div>
        <div style="font-size:8px;color:#8fa;line-height:1.6">
          ${bot ? `[${bot.ageSec||0}s ago] EA ${online?'online':'offline'} · BAL $${bal.toFixed(2)} · ${(bot.positions||[]).length} positions open` : '[--] รอเชื่อม EA...'}<br>
          [live] KB ${live.count} trades · WR ${wr.toFixed(0)}% · Total ${live.totalR>0?'+':''}${live.totalR.toFixed(1)}R
          ${BotBridge?.lossStreak>=3?` · <span style="color:var(--red)">⚠️ แพ้ ${BotBridge.lossStreak} ติด</span>`:''}
        </div>
      </div>

      <!-- footer nav -->
      <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #2a3550;background:#0d1320">
        <button class="btn btn-primary" style="font-size:9px;padding:6px 14px" onclick="Modal.close()">📊 เข้า Dashboard (กราฟเต็ม)</button>
        <button class="btn btn-secondary" style="font-size:9px;padding:6px 12px" onclick="Modal.open('company')">📋 Company</button>
        <button class="btn btn-secondary" style="font-size:9px;padding:6px 12px" onclick="Modal.open('botstatus')">🤖 BOT</button>
        <button class="btn btn-secondary" style="font-size:9px;padding:6px 12px" onclick="Modal.open('journal')">📓 Journal</button>
        <button class="btn ${Settings.get('homeView','dashboard')==='office'?'btn-primary':'btn-secondary'}" style="font-size:9px;padding:6px 12px;margin-left:auto"
          onclick="Office.toggleHome()">
          ${Settings.get('homeView','dashboard')==='office'?'🏠 หน้าแรก = Office ✓':'🏠 ตั้ง Office เป็นหน้าแรก'}
        </button>
      </div>
    `;
  },

  toggleHome() {
    const cur = Settings.get('homeView', 'dashboard');
    Settings.set('homeView', cur === 'office' ? 'dashboard' : 'office');
    this.refresh();
  },
};
window.Office = Office;

const Company = {
  chatLog: [],   // {role:'user'|'sec', text}
  showPerf: false,   // Phase 16: performance analytics toggle

  togglePerf() {
    this.showPerf = !this.showPerf;
    this.refreshData();
  },

  // Phase 16: Performance Analytics from full trade history
  _performancePanel() {
    if (!this.showPerf) {
      return `<div style="margin-top:10px">
        <button class="btn btn-secondary" style="font-size:9px;padding:6px 12px" onclick="Company.togglePerf()">
          📊 เปิด Performance Analytics ▼
        </button>
      </div>`;
    }
    const trades = BotBridge?.allTrades || [];
    if (trades.length === 0) {
      return `<div style="margin-top:10px">
        <button class="btn btn-secondary" style="font-size:9px;padding:6px 12px" onclick="Company.togglePerf()">📊 ปิด Performance Analytics ▲</button>
        <div style="font-size:9px;color:var(--gray);padding:10px">— ยังไม่มี trade ปิด —</div>
      </div>`;
    }

    // Group helpers
    const bucket = (keyFn, labelFn) => {
      const m = {};
      trades.forEach(t => {
        const k = keyFn(t);
        if (k == null) return;
        if (!m[k]) m[k] = { n:0, w:0, r:0 };
        m[k].n++;
        if (t.outcome === 'win') m[k].w++;
        m[k].r += parseFloat(t.rMult) || 0;
      });
      return Object.keys(m).sort().map(k => ({ label: labelFn(k), ...m[k] }));
    };

    // By hour of day (UTC from closeTime)
    const byHour = bucket(
      t => { const d = new Date((t.closeTime||0)*1000); return isFinite(d) ? d.getUTCHours() : null; },
      k => String(k).padStart(2,'0') + ':00'
    );
    // By session
    const bySession = bucket(
      t => t.sessionAtEntry || null,
      k => k.toUpperCase()
    );
    // By symbol
    const bySym = bucket(
      t => (t.sym||'').replace(/[mczr]$/i,'').replace('USD',''),
      k => k
    );

    const row = (b) => {
      const wr = b.n>0 ? (b.w/b.n*100).toFixed(0) : 0;
      const rcol = b.r>0?'var(--green)':'var(--red)';
      return `<tr style="font-size:8px">
        <td style="padding:2px 6px">${b.label}</td>
        <td style="text-align:center">${b.n}</td>
        <td style="text-align:center;color:${wr>=55?'var(--green)':'var(--red)'}">${wr}%</td>
        <td style="text-align:right;color:${rcol}">${b.r>0?'+':''}${b.r.toFixed(1)}R</td>
      </tr>`;
    };
    const tbl = (title, rows) => `
      <div style="flex:1;min-width:0">
        <div style="font-size:8px;color:var(--gold);margin-bottom:3px">${title}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="font-size:6px;color:var(--gray)"><th style="text-align:left;padding:2px 6px">—</th><th>N</th><th>WR</th><th style="text-align:right">R</th></tr></thead>
          <tbody>${rows.map(row).join('')}</tbody>
        </table>
      </div>`;

    // Best/worst hour insight
    let insight = '';
    if (byHour.length > 0) {
      const sorted = [...byHour].filter(b=>b.n>=2).sort((a,b)=>b.r-a.r);
      if (sorted.length >= 2) {
        const best = sorted[0], worst = sorted[sorted.length-1];
        insight = `💡 ชั่วโมงดีสุด <b style="color:var(--green)">${best.label}</b> (${best.r>0?'+':''}${best.r.toFixed(1)}R) · แย่สุด <b style="color:var(--red)">${worst.label}</b> (${worst.r.toFixed(1)}R)`;
      }
    }

    return `<div style="margin-top:10px;padding:10px;border:1px solid var(--gold);background:rgba(255,215,0,0.04);border-radius:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:10px;color:var(--gold);font-weight:bold">📊 PERFORMANCE ANALYTICS (${trades.length} trades)</span>
        <button class="btn btn-secondary" style="font-size:8px;padding:3px 8px" onclick="Company.togglePerf()">▲ ปิด</button>
      </div>
      ${insight ? `<div style="font-size:8px;color:var(--white);margin-bottom:8px">${insight}</div>` : ''}
      <div style="display:flex;gap:12px">
        ${tbl('⏰ By Hour (UTC)', byHour)}
        ${tbl('🌍 By Session', bySession)}
        ${tbl('💱 By Symbol', bySym)}
      </div>
    </div>`;
  },

  // Full build (called once when modal opens)
  refresh() {
    const el = document.getElementById('company-body');
    if (!el) return;
    // If shell not built yet, build it; otherwise only update office (preserve chat input)
    if (!document.getElementById('company-office')) {
      el.innerHTML = this.render();
    } else {
      this.refreshData();
    }
    this.mountFloor();      // build the walking floor once + keep loops alive
    this._startJanie();     // proactive notifications (closed trades / drawdown)
    this._renderChat();
  },

  // Lightweight update — only re-renders data panels, NEVER touches chat input
  refreshData() {
    const office = document.getElementById('company-office');
    if (office) office.innerHTML = this.renderOffice();
    // update autopilot banner + button state
    const ap = Settings.get('autoPilot', false);
    const apBtn = document.getElementById('company-ap-btn');
    if (apBtn) {
      apBtn.textContent = `🤖 AUTO PILOT: ${ap ? 'ON' : 'OFF'}`;
      apBtn.style.background = ap ? 'var(--green)' : '#333';
      apBtn.style.color = ap ? '#000' : '#aaa';
    }
  },

  // ═══ SECRETARY CHAT BRAIN (Groq AI + rule-based fallback + command exec) ═══
  async askSecretary(text) {
    if (!text || !text.trim()) return;
    const q = text.trim();
    this.chatLog.push({ role: 'user', text: q });
    this._renderChat();
    const lower = q.toLowerCase();

    // 1) Pending confirmation (approval pattern — risky actions ask first)
    if (this._pendingAction) {
      if (/ยืนยัน|ตกลง|^ok|ใช่|เอาเลย|จัดไป|confirm/i.test(lower)) {
        const fn = this._pendingAction.run; this._pendingAction = null; this._pushSec(fn()); return;
      }
      if (/ยกเลิก|ไม่เอา|ไม่ต้อง|cancel|^no|หยุด/i.test(lower)) {
        this._pendingAction = null; this._pushSec('ยกเลิกให้แล้วค่ะ ✅ ไม่ได้ทำอะไรนะคะ'); return;
      }
    }

    // 2) Tool layer — deterministic actions that actually DO things (with guards)
    const act = this._secretaryAction(lower, q);
    if (act != null) { this._pushSec(act); return; }

    // Natural conversation via Groq (only if a key is on the bridge)
    if (typeof AIBridge !== 'undefined' && AIBridge.url()) {
      try {
        const st = await AIBridge.status();
        if (st && st.hasKey) {
          this._pushSec('…');                                   // typing indicator
          const res = await AIBridge.ask(this._secretaryPrompt(q), this._secretarySystem());
          if (this.chatLog[this.chatLog.length - 1]?.text === '…') this.chatLog.pop();
          if (res && res.ok && res.text) { this._pushSec(res.text.trim()); return; }
        }
      } catch (e) { /* fall through to rule-based */ }
    }
    this._pushSec(this._secretaryRespond(lower));
  },

  _pushSec(text) {
    this.chatLog.push({ role: 'sec', text });
    if (this.chatLog.length > 40) this.chatLog = this.chatLog.slice(-40);
    this._renderChat();
  },

  // ─── PROACTIVE (C): Janie speaks up on closed trades + drawdown ───
  _janieNote(text) {
    this.chatLog = this.chatLog || [];
    this.chatLog.push({ role: 'sec', text: '🔔 ' + text });
    if (this.chatLog.length > 40) this.chatLog = this.chatLog.slice(-40);
    if (document.getElementById('sec-chat-log')) this._renderChat();   // shows now if open; else when reopened
  },
  _janieProactiveTick() {
    const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    if (!bot) return;
    const all = (typeof BotBridge !== 'undefined' && BotBridge.allTrades) ? BotBridge.allTrades : [];
    const eq  = bot.equity || bot.balance || 0;
    if (this._janieSeen === undefined) { this._janieSeen = { trades: all.length, peakEq: eq, warnedDD: false }; return; }
    const s = this._janieSeen;
    // new closed trade → report it
    if (all.length > s.trades) {
      const t = all[all.length - 1];
      if (t && t.outcome && t.outcome !== 'breakeven') {
        const r = parseFloat(t.rMult) || 0;
        const sym = (t.sym || '').replace(/[mzcr.].*$/i, '');
        this._janieNote(`${t.outcome === 'win' ? '🟢 ปิดไม้ได้กำไร' : '🔴 ปิดไม้ขาดทุน'}ค่ะ — ${sym} ${t.side || ''} ${r > 0 ? '+' : ''}${r.toFixed(2)}R ($${(t.profit || 0).toFixed(2)})`);
      }
      s.trades = all.length;
    }
    // drawdown alert (from session peak)
    if (eq > s.peakEq) s.peakEq = eq;
    const ddPct = s.peakEq > 0 ? (s.peakEq - eq) / s.peakEq * 100 : 0;
    if (ddPct >= 8 && !s.warnedDD) { this._janieNote(`⚠️ เตือนค่ะ — equity ลดจากจุดสูงสุด ${ddPct.toFixed(1)}% (เหลือ $${eq.toFixed(2)}) ถ้าไม่สบายใจพิมพ์ "ปิดทุกไม้" ได้นะคะ`); s.warnedDD = true; }
    if (ddPct < 4) s.warnedDD = false;   // reset once recovered
  },
  _startJanie() {
    if (this._janieTimer) return;
    this._janieTimer = setInterval(() => { try { this._janieProactiveTick(); } catch (e) {} }, 20000);
  },

  _isSecretaryCommand(q) {
    return ['ปิดทุก','ปิดหมด','close all','ปิดออเดอร์','ปิดไม้','หยุดบอท','พักเทรด','pause',
            'หยุดเทรด','เริ่มเทรด','resume','ทำงานต่อ','ปลดล็อก','autopilot','auto pilot',
            'ออโต้','อัตโนมัติ','เปิดออโต้'].some(k => q.includes(k));
  },

  // ─── TOOL LAYER (A): NL → real action, with confirm-guard on risky ones ───
  _pendingAction: null,
  _secretaryAction(q, raw) {
    const has = (...kw) => kw.some(k => q.includes(k));
    const ask = (msg, fn) => { this._pendingAction = { run: fn }; return msg + '\n\n👉 พิมพ์ "ยืนยัน" เพื่อทำ หรือ "ยกเลิก" ค่ะ'; };
    const bridge = (typeof BotBridge !== 'undefined' && BotBridge.sendCommand);

    // close all — needs confirmation (destructive)
    if (has('ปิดทุก','ปิดหมด','close all','ปิดออเดอร์','ปิดไม้','เคลียร์ไม้'))
      return ask('⚠️ จะให้ปิด *ทุกออเดอร์* ทันทีนะคะ', () => { if (bridge) BotBridge.sendCommand('close_all'); return '🔴 สั่งปิดทุกออเดอร์แล้วค่ะ — EA จะเคลียร์ภายใน ~15 วิ'; });
    // pause / resume
    if (has('หยุดบอท','พักเทรด','pause','หยุดเทรด')) { if (bridge) BotBridge.sendCommand('pause'); return '⏸ พักบอทแล้วค่ะ — ไม่เปิดไม้ใหม่ แต่ดูแลไม้เก่าต่อ'; }
    if (has('เริ่มเทรด','resume','ทำงานต่อ','ปลดล็อก','เปิดบอท')) { if (bridge) BotBridge.sendCommand('resume'); return '▶️ บอทกลับมาเทรดต่อแล้วค่ะ'; }
    // autopilot
    if (has('เปิดออโต้','เปิด autopilot','เปิดอัตโนมัติ','เปิด auto')) { this.setAutoPilot(true); return '🤖 เปิด AUTO PILOT แล้วค่ะ — ทีมตัดสินใจเอง เจอ Grade A+ ส่ง EA ทันที'; }
    if (has('ปิดออโต้','ปิด autopilot','ปิดอัตโนมัติ','ปิด auto')) { this.setAutoPilot(false); return '🛑 ปิด AUTO PILOT แล้วค่ะ — กลับมาโหมด CEO อนุมัติเอง'; }
    // signal mode
    if (has('โหมด both','ทั้งเว็บและ ea','โหมดทั้งคู่')) { this.setSignalMode('both'); return '🔀 สลับเป็นโหมด BOTH แล้วค่ะ (เว็บ + EA)'; }
    if (has('โหมดเว็บ','โหมด web')) { this.setSignalMode('web'); return '🌐 สลับเป็นโหมด WEB แล้วค่ะ'; }
    if (has('โหมด ea','ea คิดเอง')) { this.setSignalMode('ea'); return '⚡ สลับเป็นโหมด EA แล้วค่ะ'; }
    // conf threshold  ("ตั้ง conf 80", "ความมั่นใจ 75")
    const cm = q.match(/(?:conf|มั่นใจ|เกณฑ์)\D{0,8}(\d{2})/);
    if (cm) { const v = parseInt(cm[1], 10); if (v >= 50 && v <= 95) { this.setTraderConf(v); return `🎯 ตั้ง conf ขั้นต่ำ = ${v}% แล้วค่ะ`; } }
    // enable / disable a pair (incl BTC)
    const pairs = [[/ทอง|gold|xau/i,'enableXAU','ทอง'],[/ยูโร|eur/i,'enableEUR','ยูโร'],[/ออส|aud|aussie/i,'enableAUD','ออสซี่'],[/btc|บิท|คริปโต|satoshi/i,'enableBTC','BTC']];
    for (const [re, key, name] of pairs) {
      if (re.test(raw || q)) {
        // check ENABLE first — "เปิด" contains the substring "ปิด"
        if (has('เปิด','on','ดูคู่'))             { Settings.set(key, true);  this.refresh(); return `✅ เปิดคู่ ${name} แล้วค่ะ`; }
        if (has('ปิด','off','หยุดดู','เลิกดู'))   { Settings.set(key, false); this.refresh(); return `⛔ ปิดคู่ ${name} แล้วค่ะ — หยุดวิเคราะห์/ยิง`; }
      }
    }
    // solo FirmSniper
    if (has('firmsniper เดี่ยว','โหมดเดี่ยว','เฉพาะ firmsniper','ให้ firmsniper คนเดียว')) { this.setSoloEmployee('emp_fs'); return '🎯 โหมด FirmSniper เดี่ยวแล้วค่ะ — คนอื่นหยุดยิง'; }
    // rest / wake employees (all)
    if (has('พักทั้งหมด','พักทุกคน','ให้ทุกคนพัก','พักทีม')) { this.restAll(); return '💤 ให้พนักงานทุกคนพักแล้วค่ะ — หยุดออกสัญญาณทั้งทีม'; }
    if (has('ปลุกทั้งหมด','ปลุกทุกคน','เรียกทุกคน','เข้างานทั้งหมด')) { this.wakeAll(); return '⏰ ปลุกพนักงานทุกคนกลับมาทำงานแล้วค่ะ'; }
    // rest / wake a specific employee by name
    if (has('พัก','ปลุก','เรียก','หยุดพนักงาน')) {
      const who = this.EMPLOYEES.find(e => q.includes(e.name.toLowerCase()));
      if (who) {
        if (has('ปลุก','เรียก','กลับมา','เข้างาน')) { this.wakeEmployee(who.id); return `⏰ ปลุก ${who.name} กลับมาทำงานแล้วค่ะ`; }
        this.restEmployee(who.id); return `💤 ให้ ${who.name} พักแล้วค่ะ — หยุดออกสัญญาณ`;
      }
    }
    // push combos to EA
    if (has('ส่ง combo','อัปเดต ea','อัพเดท ea','อัปเดตสูตร')) { this.pushCombosToEA(); return '🧬 ส่งสูตรคนเก่งสุดให้ EA แล้วค่ะ'; }
    // team report / who's best
    if (has('ใครเก่ง','เก่งสุด','ผลงานพนักงาน','สรุปทีม','รายงานทีม','ท็อปฟอร์ม')) return this._teamReport();
    // why is <name> not trading?
    if (has('ทำไม') && (has('ไม่เทรด','ไม่ออก','ไม่เข้า','ไม่ยิง'))) {
      const who = this.EMPLOYEES.find(e => q.includes(e.name.toLowerCase()));
      if (who) return this._empWhyNot(who);
    }
    return null;   // not an action → let LLM / rule-based handle it
  },
  _teamReport() {
    const rows = this.EMPLOYEES.map(e => ({ name: e.name, ...this._employeeStats(e.id) }))
      .filter(r => r.matched > 0).sort((a, b) => b.R - a.R);
    if (!rows.length) return 'ยังไม่มีผลงานที่จับคู่กับไม้จริงเลยค่ะ — รอเก็บสถิติก่อนนะคะ 📊';
    const top = rows.slice(0, 3).map((r, i) => `${['🥇','🥈','🥉'][i]} ${r.name}: ${r.R > 0 ? '+' : ''}${r.R.toFixed(1)}R · WR ${r.wr}% (${r.matched} ไม้)`).join('\n');
    const worst = rows[rows.length - 1];
    return `🏆 ท็อปฟอร์มตอนนี้ค่ะ:\n${top}` + (rows.length > 3 ? `\n\n⚠️ ต้องจับตา: ${worst.name} (${worst.R.toFixed(1)}R)` : '');
  },
  _empWhyNot(emp) {
    const gold = TradingWarRoom?.lastGold, fx = TradingWarRoom?.lastFX, btc = TradingWarRoom?.lastBTC;
    const bot  = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const teamFor = (s) => s === 'XAUUSD' ? gold : s === 'AUDUSD' ? (fx && fx.aud) : s === 'EURUSD' ? (fx && fx.eur) : s === 'BTCUSD' ? btc : null;
    const syms = emp.sym ? [emp.sym] : this._SYMS;
    let best = null;
    syms.forEach(s => { try { const d = this._empDecision(emp, s, teamFor(s), bot); if (!best || (d.approved && !best.approved) || (d.conf || 0) > (best.conf || 0)) best = d; } catch (_) {} });
    if (!best) return `${emp.name} ยังไม่มีข้อมูลพอประเมินค่ะ`;
    if (best.approved) return `จริง ๆ ${emp.name} ผ่านเกณฑ์แล้วค่ะ — ${best.signal.toUpperCase()} ${(best.sym||'').replace('USD','')} conf ${best.conf}% (เปิด "หัวหน้าโต๊ะยิงเอง" + autopilot ถึงจะยิงจริง)`;
    return `${emp.name} ยังไม่ยิงเพราะ: ${best.blockedBy || 'ยังไม่เจอสัญญาณ'} ค่ะ${best.conf ? ` (conf ตอนนี้ ${best.conf}%)` : ''}`;
  },
  // ─── RICH CONTEXT (B): everything the LLM needs to answer grounded ───
  _secretaryContext() {
    const bot  = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const live = (typeof BotBridge !== 'undefined' && BotBridge.liveStats) ? BotBridge.liveStats : { count:0, wins:0, losses:0, totalR:0 };
    const gold = TradingWarRoom?.lastGold, fx = TradingWarRoom?.lastFX, btc = TradingWarRoom?.lastBTC;
    const teamFor = (s) => s === 'XAUUSD' ? gold : s === 'AUDUSD' ? (fx && fx.aud) : s === 'EURUSD' ? (fx && fx.eur) : s === 'BTCUSD' ? btc : null;
    const firing = [], blocked = [];
    this.EMPLOYEES.forEach(e => { try {
      const syms = e.sym ? [e.sym] : this._SYMS; let best = null;
      syms.forEach(s => { const d = this._empDecision(e, s, teamFor(s), bot); if (!best || (d.approved && !best.approved) || (d.conf||0) > (best.conf||0)) best = d; });
      if (best) {
        if (best.approved && (best.signal === 'buy' || best.signal === 'sell')) firing.push(`${e.name} ${best.signal.toUpperCase()} ${(best.sym||'').replace('USD','')} ${best.conf}%`);
        else if (best.blockedBy) blocked.push(`${e.name}: ${best.blockedBy}`);
      }
    } catch (_) {} });
    const ranked = this.EMPLOYEES.map(e => ({ name: e.name, ...this._employeeStats(e.id) })).filter(r => r.matched > 0).sort((a, b) => b.R - a.R);
    const S = (typeof Settings !== 'undefined') ? Settings : { get: (k, d) => d };
    return {
      online: bot ? !!bot.online : false, balance: bot ? bot.balance : null, equity: bot ? bot.equity : null,
      todayPnL: bot ? bot.todayPnL : null, openPositions: bot ? (bot.positions || []).length : null,
      signalMode: S.get('signalMode', 'web'), confThreshold: S.get('traderMinConf', 80), autoPilot: S.get('autoPilot', false),
      pairsOn: [['ทอง','enableXAU'],['AUD','enableAUD'],['EUR','enableEUR'],['BTC','enableBTC']].filter(([n, k]) => S.get(k, true)).map(([n]) => n),
      marketOpen: { forex: this._marketOpen('EURUSD'), btc: this._marketOpen('BTCUSD') },
      liveTrades: live.count, liveWR: (live.wins + live.losses) > 0 ? Math.round(live.wins / (live.wins + live.losses) * 100) : null, totalR: live.totalR,
      topEmployees: ranked.slice(0, 3).map(r => `${r.name} ${r.R > 0 ? '+' : ''}${r.R.toFixed(1)}R/${r.wr}%`),
      firingNow: firing, blockedNow: blocked.slice(0, 6),
    };
  },
  _secretarySystem() {
    return 'คุณคือ "Janie" เลขาสาวของบริษัทเทรด Forex/Gold/BTC ชื่อ Alpha Traders. ' +
      'พูดไทยสุภาพ เป็นกันเอง กระชับ ลงท้าย "ค่ะ". หน้าที่: รายงานสถานะ/กำไร/สัญญาณ, อธิบายว่าพนักงานคนไหนทำอะไร/ทำไมไม่เทรด, แนะนำ และให้กำลังใจ CEO. ' +
      'คุณสั่งงานได้จริง (ปิดไม้/พัก/autopilot/สลับโหมด/ตั้ง conf/เปิด-ปิดคู่/FirmSniper เดี่ยว) — ถ้า CEO สั่ง ให้บอกว่าทำได้และแนะนำให้พิมพ์คำสั่งตรง ๆ. ' +
      'ใช้เฉพาะตัวเลขจาก context ที่ให้มา ห้ามแต่งเอง ถ้าไม่มีให้บอกตรง ๆ. ตอบสั้น 2-4 ประโยค.';
  },

  _secretaryPrompt(userText) {
    let ctx;
    try { ctx = this._secretaryContext(); }
    catch (e) {
      const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
      ctx = { online: bot ? !!bot.online : false, balance: bot ? bot.balance : null, todayPnL: bot ? bot.todayPnL : null };
    }
    return 'context บริษัทล่าสุด (JSON): ' + JSON.stringify(ctx) + '\n\nคำถาม/คำสั่งจาก CEO: ' + userText;
  },

  _secretaryRespond(q) {
    const bot = BotBridge?.lastStatus;
    const cmd = TradingWarRoom?.lastCmd;
    const live = BotBridge?.liveStats || { count:0, wins:0, losses:0, totalR:0 };
    const has = (...kw) => kw.some(k => q.includes(k));

    // ─── Commands ───
    if (has('ปิดทุก','ปิดหมด','close all','ปิดออเดอร์','ปิดไม้')) {
      if (typeof BotBridge !== 'undefined') BotBridge.sendCommand('close_all');
      return '🔴 รับทราบค่ะ CEO — สั่ง Close All ให้ทีมเทรดแล้ว EA จะปิดทุก position ภายใน 15 วินาที';
    }
    if (has('หยุดบอท','พักเทรด','pause','หยุดเทรด')) {
      if (typeof BotBridge !== 'undefined') BotBridge.sendCommand('pause');
      return '⏸ ค่ะ สั่ง Pause ให้ทีมเทรดแล้ว — บอทจะไม่เปิดไม้ใหม่ แต่ position เก่ายังดูแลต่อนะคะ';
    }
    if (has('เริ่มเทรด','resume','ทำงานต่อ','ปลดล็อก')) {
      if (typeof BotBridge !== 'undefined') BotBridge.sendCommand('resume');
      return '▶️ ค่ะ สั่ง Resume แล้ว — ทีมเทรดกลับมาทำงานต่อแล้วค่ะ';
    }
    if (has('autopilot','auto pilot','ออโต้','อัตโนมัติ','เปิดออโต้')) {
      const on = !Settings.get('autoPilot', false);
      Company.setAutoPilot(on);
      return on
        ? '🤖 เปิด AUTO PILOT แล้วค่ะ! ตอนนี้ทีมกลยุทธ์ + เทรดจะตัดสินใจเอง 100% เมื่อเจอ Grade A+ จะส่งให้ EA เทรดทันที CEO ไม่ต้องกดอะไร'
        : '🛑 ปิด AUTO PILOT แล้วค่ะ — กลับมาโหมด manual (CEO อนุมัติเอง)';
    }

    // ─── Status questions ───
    if (has('สถานะ','status','เป็นไง','ภาพรวม','ตอนนี้')) {
      if (!bot) return '📭 ยังไม่ได้เชื่อม EA ค่ะ — ตั้ง Bot Bridge URL ใน Settings ก่อนนะคะ';
      const onl = bot.online ? '🟢 ONLINE' : '🔴 OFFLINE';
      return `รายงานสถานะค่ะ:\n${onl} · Balance $${(bot.balance||0).toFixed(2)} · Equity $${(bot.equity||0).toFixed(2)}\nToday P/L $${(bot.todayPnL||0).toFixed(2)} (${bot.todayWins||0}W/${bot.todayLosses||0}L)\nOpen positions: ${(bot.positions||[]).length} · Mode: ${bot.mode||'?'}`;
    }
    if (has('กำไร','ขาดทุน','pnl','p/l','เงิน','balance','บาลานซ์')) {
      if (!bot) return '📭 ยังไม่มีข้อมูลบัญชีค่ะ';
      const pnl = bot.todayPnL || 0;
      const emo = pnl > 0 ? '🟢 กำไร' : pnl < 0 ? '🔴 ขาดทุน' : '⚪ เสมอตัว';
      return `วันนี้ ${emo} $${pnl.toFixed(2)} ค่ะ\nBalance: $${(bot.balance||0).toFixed(2)} · Equity: $${(bot.equity||0).toFixed(2)}\nLive trades สะสม: ${live.count} ไม้ · WR ${(live.wins+live.losses)>0?((live.wins/(live.wins+live.losses))*100).toFixed(0):'—'}% · Total ${live.totalR>0?'+':''}${live.totalR.toFixed(1)}R`;
    }
    if (has('ทำไมไม่เทรด','ไม่ออกไม้','ไม่เข้า','ทำไมไม่เข้า','รออะไร')) {
      if (cmd && (cmd.signal === 'buy' || cmd.signal === 'sell')) {
        return `จริง ๆ มีสัญญาณ ${cmd.signal.toUpperCase()} ${cmd.sym} Grade ${cmd.gradeInfo?.grade||'?'} อยู่ค่ะ — ถ้าเปิด Auto Pilot จะเทรดทันที หรือ CEO กดเองได้`;
      }
      return 'ตอนนี้ทีมเทรดยังไม่เจอ setup ที่มั่นใจพอค่ะ 🔍\nเหตุผล: RSI ยังไม่ extreme / ราคายังไม่แตะ Bollinger / team consensus < 55%\nทีมกำลังเฝ้าตลาดอยู่ รอจังหวะดี ๆ ค่ะ';
    }
    if (has('สัญญาณ','signal','เข้าไม้ไหน','เทรดอะไร')) {
      if (cmd && (cmd.signal === 'buy' || cmd.signal === 'sell')) {
        return `สัญญาณล่าสุดค่ะ: ${cmd.signal.toUpperCase()} ${cmd.sym} @ ${cmd.entry}\nSL ${cmd.sl} · TP1 ${cmd.tp1} · Grade ${cmd.gradeInfo?.grade||'?'} · Conf ${cmd.conf}%`;
      }
      return 'ตอนนี้ยังไม่มีสัญญาณ buy/sell ค่ะ — ทุกทีมอยู่ในโหมด WAIT/WATCH';
    }
    if (has('risk','เสี่ยง','พอร์ต','portfolio','stop out')) {
      if (!bot) return 'ยังไม่มีข้อมูล risk ค่ะ';
      const r = parseFloat(bot.portfolioRisk)||0, m = parseFloat(bot.maxPortfolioRisk)||6;
      return `Portfolio risk ตอนนี้ ${r.toFixed(1)}% จากเพดาน ${m.toFixed(0)}% ค่ะ\n${r>=m?'🔴 ถึงเพดานแล้ว — Risk Officer บล็อกไม้ใหม่':r>=m*0.7?'🟡 เริ่มสูง ระวังหน่อยนะคะ':'🟢 ยังปลอดภัยค่ะ'}`;
    }
    if (has('กลยุทธ์','strategy','agent ไหนดี','เทคนิคไหน','ปรับ')) {
      return 'เรื่องกลยุทธ์ ขอประสานกับ 🧠 Strategy Officer นะคะ —\nดูได้ที่ panel Strategy Officer ด้านล่าง หรือกด 📓 JOURNAL เพื่อดู KB stats เต็ม ๆ\nถ้าอยากปรับอัตโนมัติ กดปุ่ม "ปรับกลยุทธ์" ได้เลยค่ะ';
    }
    // ─── Per-symbol trader questions ───
    if (has('ทอง','gold','xau')) {
      const t = TradingWarRoom?.lastGold;
      if (t) return `🥷 XAU Trader รายงานค่ะ:\nสัญญาณ ${(t.head?.signal||'wait').toUpperCase()} · Confidence ${t.head?.conf||0}%\nConsensus ${t.head?.consensusPct||0}% · ราคา ${(t.price||0).toFixed(2)}\n${t.head?.signal==='buy'||t.head?.signal==='sell'?'มี setup น่าสนใจค่ะ':'ยังเฝ้าดูอยู่ค่ะ'}`;
      return '🥷 XAU Trader ยังไม่มีข้อมูลค่ะ — รอ market วิเคราะห์';
    }
    if (has('ยูโร','eur','euro')) {
      const t = TradingWarRoom?.lastFX?.eur;
      if (t) return `⚔️ EUR Trader: ${(t.signal||'wait').toUpperCase()} · Conf ${t.conf||0}% · ราคา ${(t.price||0).toFixed(4)}`;
      return '⚔️ EUR Trader ยังไม่มีข้อมูลค่ะ';
    }
    if (has('ออส','aud','aussie')) {
      const t = TradingWarRoom?.lastFX?.aud;
      if (t) return `🏹 AUD Trader: ${(t.signal||'wait').toUpperCase()} · Conf ${t.conf||0}% · ราคา ${(t.price||0).toFixed(4)}`;
      return '🏹 AUD Trader ยังไม่มีข้อมูลค่ะ';
    }

    // ─── Coaching / how-to ───
    if (has('สอน','วิธี','ยังไง','how','ทำไง','เริ่มยังไง')) {
      return 'ได้ค่ะ ดิฉันแนะนำได้:\n• อยากให้บอทเทรดเอง → พิมพ์ "เปิด autopilot"\n• อยากดูผลงาน → ถาม "กำไร" หรือกด 📊 JOURNAL\n• อยากปรับกลยุทธ์ → คุยกับ 🧠 Strategy Officer\n• กังวลเรื่องเสี่ยง → ถาม "risk"\nมีอะไรให้ช่วยอีกไหมคะ?';
    }
    // ─── Thanks / encouragement ───
    if (has('ขอบคุณ','thank','เก่ง','ดีมาก','สุดยอด')) {
      return 'ยินดีค่ะ CEO 🙏 ดิฉันกับทีมพร้อมทำงานให้เต็มที่ค่ะ ถ้ามีอะไรเรียกได้ตลอดนะคะ 💪';
    }
    if (has('เป็นห่วง','กังวล','กลัว','เครียด','worry')) {
      const bot = BotBridge?.lastStatus;
      const dd = bot ? (bot.equity - bot.balance) : 0;
      return `เข้าใจค่ะ 🤗 ตอนนี้มี Risk Officer คุม portfolio ≤ ${bot?(parseFloat(bot.maxPortfolioRisk)||6):6}% + Breakeven/Trailing SL กันทุนให้\n${dd<-2?'⚠️ ตอนนี้ equity ติดลบนิดหน่อย ถ้าไม่สบายใจ บอก "ปิดทุกไม้" ได้เลยค่ะ':'ระบบมีกันชนหลายชั้น ไม่ต้องกังวลมากค่ะ'}`;
    }
    if (has('สวัสดี','hello','hi','หวัดดี','ดีค่ะ','ดีครับ','เลขา')) {
      const greet = ['สวัสดีค่ะ CEO 👋','สวัสดีค่ะนาย 😊','ดีค่ะ CEO ✨'][Math.floor(Math.random()*3)];
      return `${greet} ดิฉัน Janie เลขาประจำบริษัทค่ะ\nถามได้เลยนะคะ: "สถานะ", "กำไร", "ทำไมไม่เทรด", "ทอง/EUR/AUD เป็นไง", "เปิด autopilot" หรือพิมพ์ "ช่วย"`;
    }
    if (has('ช่วย','help','ทำอะไรได้','คำสั่ง','เมนู')) {
      return 'ดิฉันช่วยได้หลายอย่างค่ะ:\n📊 "สถานะ" / "กำไร" / "risk" — รายงานบัญชี/ความเสี่ยง\n🏆 "ใครเก่งสุด" — จัดอันดับผลงานพนักงาน\n🔍 "ทำไม Satoshi ไม่เทรด" — อธิบายรายคน\n💎 "ทอง/EUR/AUD/BTC เป็นไง" — ถามแต่ละ trader\n— สั่งงานได้จริง —\n🔴 "ปิดทุกไม้" (ถามยืนยันก่อน) · "หยุดบอท" · "เริ่มเทรด"\n🤖 "เปิด/ปิด autopilot" · 🔀 "โหมด both/web/ea"\n🎯 "ตั้ง conf 80" · "เปิด/ปิดคู่ BTC" · "FirmSniper เดี่ยว"\n🧬 "ส่ง combo ให้ EA"';
    }

    // ─── Fallback (smarter — guess intent) ───
    if (has('?','ไหม','อะไร','เท่าไหร่','เมื่อไหร่')) {
      const bot = BotBridge?.lastStatus;
      return `ขอโทษค่ะ ดิฉันไม่แน่ใจว่าหมายถึงอะไร 🤔\nแต่ตอนนี้: ${bot?`EA ${bot.online?'🟢 online':'🔴 offline'} · P/L วันนี้ $${(bot.todayPnL||0).toFixed(2)}`:'ยังไม่เชื่อม EA'}\nลองถามชัด ๆ เช่น "กำไรเท่าไหร่", "ทองเป็นไง", "risk เท่าไหร่" นะคะ`;
    }
    return 'ขอโทษค่ะ ดิฉันยังไม่เข้าใจ 🙏 ลองพิมพ์ "ช่วย" เพื่อดูสิ่งที่ดิฉันทำได้ หรือถามแบบ: "สถานะ", "กำไร", "ทองเป็นไง", "เปิด autopilot" ค่ะ';
  },

  _renderChat() {
    const el = document.getElementById('sec-chat-log');
    if (!el) return;
    if (this.chatLog.length === 0) {
      el.innerHTML = `<div style="font-size:9px;color:var(--gray);text-align:center;padding:20px">
        💬 คุยกับเลขาได้เลยค่ะ<br>เช่น "สถานะตอนนี้", "กำไรเท่าไหร่", "เปิด autopilot"</div>`;
      return;
    }
    el.innerHTML = this.chatLog.map(m => {
      if (m.role === 'user') {
        return `<div style="text-align:right;margin:6px 0">
          <span style="display:inline-block;background:var(--gold);color:#000;padding:6px 10px;border-radius:8px 8px 0 8px;font-size:10px;max-width:80%;text-align:left">${m.text}</span>
          <div style="font-size:7px;color:var(--gray);margin-top:2px">👔 CEO</div>
        </div>`;
      }
      return `<div style="text-align:left;margin:6px 0">
        <span style="display:inline-block;background:var(--bg-card);border:1px solid var(--teal);color:var(--white);padding:6px 10px;border-radius:8px 8px 8px 0;font-size:10px;max-width:85%;text-align:left;white-space:pre-line">${m.text}</span>
        <div style="font-size:7px;color:var(--teal);margin-top:2px">📋 เลขา Janie</div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  },

  _onChatKey(e) {
    if (e.key === 'Enter') {
      const inp = document.getElementById('sec-chat-input');
      this.askSecretary(inp.value);
      inp.value = '';
    }
  },

  sendChat() {
    const inp = document.getElementById('sec-chat-input');
    this.askSecretary(inp.value);
    inp.value = '';
  },

  // ═══ AUTO PILOT ═══
  setAutoPilot(on) {
    Settings.set('autoPilot', on);
    if (on) {
      // Enable full autonomy chain
      Settings.set('webAISignalsToEA', true);   // web → EA signals
      UI.addLog('CMD', 'AutoPilot', '🤖 AUTO PILOT ON — Strategy + Trade teams เทรดเอง 100%');
    } else {
      UI.addLog('CMD', 'AutoPilot', '🛑 AUTO PILOT OFF — กลับสู่ manual mode');
    }
    this.refresh();
  },

  // Consolidate a team report into a single "Trader" persona
  _traderCard(sym, teamData, faceKey, name) {
    const spec = (typeof Office !== 'undefined' && (Office._faces[faceKey] || Office._faces.dev)) || { accColor:'#888' };
    const head = (typeof UI !== 'undefined' && UI.pixelFace)
      ? UI.pixelFace(spec, 34)
      : `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:${(spec.accColor||'#888')}33;color:${spec.accColor||'#ccc'};font-size:14px;font-weight:bold">${(name||'?').slice(0,1)}</div>`;
    const headBox = `<span style="display:inline-block;background:#0b0f1a;border:1px solid #2a3550;border-radius:5px;padding:2px">${head}</span>`;
    if (!teamData) {
      return `<div style="flex:1;padding:8px;border:1px solid var(--border);opacity:0.5">
        <div style="display:flex;align-items:center;gap:6px;font-size:9px">${headBox}<span>${name}</span></div>
        <div style="font-size:6px;color:var(--gray);margin-top:4px">— ยังไม่มีข้อมูล —</div>
      </div>`;
    }
    const sig  = teamData.signal || teamData.head?.signal || 'wait';
    const conf = teamData.conf   || teamData.head?.conf   || 0;
    const agents = teamData.agents || {};
    // Count technique agreement
    const techs = Object.entries(agents).filter(([k,v]) => v);
    const agree = techs.filter(([k,v]) => v.signal === sig).length;
    const total = techs.length;
    // Top 3 agreeing techniques
    const topTechs = techs
      .filter(([k,v]) => v.signal === sig && (sig === 'buy' || sig === 'sell'))
      .sort((a,b) => (b[1].conf||0) - (a[1].conf||0))
      .slice(0, 3)
      .map(([k]) => k.toUpperCase());

    // KB win rate for this symbol
    let kbWR = '—';
    if (typeof AgentScores !== 'undefined') {
      try {
        const stats = AgentScores.stats().filter(a => a.name.includes(sym.replace('USD','')));
        if (stats.length) {
          const tot = stats.reduce((s,a) => s + (a.t||0), 0);
          const won = stats.reduce((s,a) => s + (a.w||0), 0);
          if (tot > 0) kbWR = ((won/tot)*100).toFixed(0) + '%';
        }
      } catch {}
    }

    const sigCol = sig === 'buy' ? 'var(--green)' : sig === 'sell' ? 'var(--red)' : sig === 'watch' ? 'var(--orange)' : 'var(--yellow)';
    const sigTxt = sig === 'buy' ? '▲ BUY' : sig === 'sell' ? '▼ SELL' : sig === 'watch' ? '⚠ WATCH' : '⏸ WAIT';

    return `
      <div style="flex:1;min-width:0;padding:10px;border:1px solid ${sigCol};background:rgba(255,255,255,0.02);border-radius:4px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          ${headBox}
          <div style="line-height:1.3">
            <div style="font-size:11px;color:var(--gold);font-weight:bold">${name}</div>
            <div style="font-size:7px;color:var(--gray)">${sym} Specialist</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:12px;color:${sigCol};font-weight:bold">${sigTxt}</div>
            <div style="font-size:8px;color:var(--gray)">${conf}%</div>
          </div>
        </div>
        <div style="font-size:8px;color:var(--white);margin:4px 0">
          🤝 ${agree}/${total} เทคนิคเห็นตรงกัน
        </div>
        <div style="height:6px;background:var(--bg-card);border:1px solid var(--border);margin:3px 0;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${total>0?(agree/total*100):0}%;background:${sigCol}"></div>
        </div>
        ${topTechs.length ? `<div style="font-size:7px;color:var(--green);margin-top:4px">⭐ ${topTechs.join(' · ')}</div>` : ''}
        <div style="font-size:7px;color:var(--gray);margin-top:4px">KB Win Rate: <b style="color:var(--teal)">${kbWR}</b></div>
      </div>`;
  },

  // ═══════════════════════════════════════════════════════
  //  PHASE 21: TRADER ROSTER — 2 traders/pair, distinct techniques
  // ═══════════════════════════════════════════════════════
  // map live-report agent key -> KB short name
  _KEYMAP: {
    rsi:'RSI', bollinger:'Bollinger', fib:'Fib', divergence:'Divergence',
    elliott:'Elliott', macd:'MACD', smc:'SMC', pattern:'Pattern', news:'News',
    ichimoku:'Ichimoku', dxy:'DXY', utbot:'UT-Bot', orderblock:'OrderBlock',
    sweep:'Sweep', breakout:'Breakout', fvg:'FVG', mtf:'MTF', sniper:'FirmSniper',
  },
  roster: [
    // XAU — gold desk
    { id:'xau_mr', sym:'XAUUSD', name:'Goldie',  desc:'Mean-Reversion',      speed:'Swing',  kit:['rsi','bollinger','fib','divergence'],
      face:{ skin:'#f0c8a0', hair:'#caa24a', style:'long',  acc:'glasses',  accColor:'#ffd700' } },
    { id:'xau_sd', sym:'XAUUSD', name:'Aurum',   desc:'Supply/Demand Zone',  speed:'Scalp',  kit:['orderblock','fvg','sweep','utbot'],
      face:{ skin:'#e9b48c', hair:'#101015', style:'bun',   acc:'headband', accColor:'#ffd700' } },
    // AUD — aussie desk
    { id:'aud_tr', sym:'AUDUSD', name:'Matilda', desc:'Trend Follower',      speed:'Swing',  kit:['utbot','macd','mtf','ichimoku'],
      face:{ skin:'#e9b48c', hair:'#6b4a2a', style:'long',  acc:'visor',    accColor:'#00ccff' } },
    { id:'aud_sd', sym:'AUDUSD', name:'Boomer',  desc:'Zone Breakout',       speed:'Scalp',  kit:['orderblock','fvg','sweep','breakout'],
      face:{ skin:'#cd9b6a', hair:'#3a2410', style:'spiky', acc:'headband', accColor:'#00ccff' } },
    // EUR — euro desk
    { id:'eur_mr', sym:'EURUSD', name:'Pierre',  desc:'Wave / Reversion',    speed:'Swing',  kit:['rsi','fib','elliott','divergence'],
      face:{ skin:'#e3c9a0', hair:'#2a2a3a', style:'short', acc:'glasses',  accColor:'#4169e1' } },
    { id:'eur_mo', sym:'EURUSD', name:'Hans',    desc:'Momentum Breakout',   speed:'Fast',   kit:['breakout','utbot','macd','sweep'],
      face:{ skin:'#e9b48c', hair:'#caa24a', style:'short', acc:'headset',  accColor:'#4169e1' } },
  ],

  // KB record for a trader's kit, on their symbol
  _traderRecord(trader) {
    const out = { w:0, l:0, R:0, total:0, skills:[] };
    if (typeof AgentScores === 'undefined') return out;
    const kb = AgentScores.load();
    const prefix = trader.sym === 'XAUUSD' ? 'Gold' : trader.sym === 'AUDUSD' ? 'AUD' : 'EUR';
    const symKey = 'sym_' + trader.sym;
    trader.kit.forEach(key => {
      const short = this._KEYMAP[key] || key;
      const rec = kb.agents[prefix + '-' + short] || kb.agents[prefix + '-' + short.toLowerCase()];
      const b = rec && (rec[symKey] || rec.all);
      if (b && b.t > 0) {
        out.w += b.w; out.l += b.l; out.R += b.R; out.total += b.t;
        out.skills.push({ key, short, acc: Math.round(b.w / b.t * 100), R: b.R, t: b.t });
      } else {
        out.skills.push({ key, short, acc: 0, R: 0, t: 0 });
      }
    });
    return out;
  },

  // Live signal from only this trader's kit
  _traderSignal(teamData, kit) {
    const agents = teamData?.agents || {};
    let buy = 0, sell = 0, n = 0, buyConf = 0, sellConf = 0;
    kit.forEach(key => {
      const a = agents[key];
      if (!a) return;
      n++;
      if (a.signal === 'buy')  { buy++;  buyConf  += a.conf || 50; }
      else if (a.signal === 'sell') { sell++; sellConf += a.conf || 50; }
    });
    let signal = 'wait', conf = 0;
    const need = Math.max(1, Math.ceil(n / 2));
    // conf = average of the WINNING side only (was mixing both sides → inflated)
    if (n > 0 && buy > sell && buy >= need)      { signal = 'buy';  conf = Math.round(buyConf / buy); }
    else if (n > 0 && sell > buy && sell >= need) { signal = 'sell'; conf = Math.round(sellConf / sell); }
    return { signal, conf, buy, sell, n };
  },

  // ── PHASE 21: one-click strategy presets ──
  PRESETS: {
    gold_sd_scalp: { label:'🥇 Gold S/D Scalp', who:'Aurum',  syms:['XAUUSD'], agents:['orderblock','fvg','sweep','utbot'], mode:'scalp', tf:'M5' },
    gold_meanrev:  { label:'🥇 Gold Mean-Rev',  who:'Goldie', syms:['XAUUSD'], agents:['rsi','bollinger','fib','divergence'], mode:'swing', tf:'M15' },
    aud_trend:     { label:'🇦🇺 AUD Trend',      who:'Matilda',syms:['AUDUSD'], agents:['utbot','macd','mtf','ichimoku'], mode:'swing', tf:'H1' },
    eur_breakout:  { label:'🇪🇺 EUR Breakout',   who:'Hans',   syms:['EURUSD'], agents:['breakout','utbot','macd','sweep'], mode:'scalp', tf:'M5' },
  },
  _SETKEY: { orderblock:'OrderBlock', fvg:'FVG', sweep:'Sweep', utbot:'UTBot', rsi:'RSI',
    bollinger:'Bollinger', fib:'Fib', divergence:'Divergence', macd:'MACD', breakout:'Breakout',
    ichimoku:'Ichimoku', elliott:'Elliott', smc:'SMC', pattern:'Pattern', mtf:'MTF', dxy:'DXY', news:'News', sniper:'FirmSniper' },
  applyPreset(key) {
    const p = this.PRESETS[key];
    if (!p || typeof Settings === 'undefined') return;
    if (!confirm(`ใช้ preset "${p.label}" (สไตล์ ${p.who})?\n\nเปิดคู่: ${p.syms.join(', ')}\nเทคนิค: ${p.agents.join(', ')}\nโหมด: ${p.mode} (EA TF = ${p.tf})\n\n⚠️ จะปิด agent อื่น + คู่เงินอื่นชั่วคราว`)) return;
    // symbols
    Settings.set('enableXAU', p.syms.includes('XAUUSD'));
    Settings.set('enableAUD', p.syms.includes('AUDUSD'));
    Settings.set('enableEUR', p.syms.includes('EURUSD'));
    // agents — only this preset's kit on (+MTF kept for bias)
    const ALL = ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'];
    const on = p.agents.map(a => this._SETKEY[a]);
    ALL.forEach(name => Settings.set('enable' + name, on.includes(name) || name === 'MTF'));
    Settings.set('tradeMode', p.mode);
    Settings.set('minGrade', 'A');
    Settings.set('riskPerTrade', Math.min(2, Settings.get('riskPerTrade', 2)));
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Strategy', `⚡ Preset: ${p.label} (${p.who})`);
    alert(`✅ ใช้ ${p.label} แล้ว\n\n📌 อย่าลืมตั้งใน MT5: ScalpMode=true, ScalpTF=${p.tf}\nระบบจะส่งสัญญาณเฉพาะคู่ ${p.syms.join(',')} เกรด A+ ไป EA`);
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) TradingWarRoom.fullUpdate();
    if (typeof Company !== 'undefined') Company.refresh();
  },
  _presetBar() {
    const btns = Object.keys(this.PRESETS).map(k =>
      `<button onclick="Company.applyPreset('${k}')" class="btn btn-secondary" style="font-size:7px;padding:3px 7px">${this.PRESETS[k].label}</button>`
    ).join('');
    const td = (typeof Settings !== 'undefined') && Settings.get('traderDrivenSignals', false);
    const mc = (typeof Settings !== 'undefined') ? Settings.get('traderMinConf', 80) : 80;
    const confBtns = [70,80,85,90].map(v =>
      `<button onclick="Company.setTraderConf(${v})" class="btn ${mc===v?'btn-primary':'btn-secondary'}" style="font-size:7px;padding:2px 6px">${v}%</button>`
    ).join('');
    return `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:5px 7px;background:rgba(255,215,0,0.05);border:1px dashed var(--gold);border-radius:5px">
      <button onclick="Company.applyBestSpecialists()" class="btn btn-primary" style="font-size:8px;padding:4px 10px;font-weight:bold">🏆 ใช้ทีมหัวกระทิ (Best จาก KB)</button>
      <button onclick="Company.toggleTraderDriven()" class="btn ${td?'btn-primary':'btn-secondary'}" style="font-size:8px;padding:4px 10px">${td?'🎯 หัวหน้าโต๊ะยิงเอง: ON':'หัวหน้าโต๊ะยิงเอง: OFF'}</button>
      <span style="font-size:7px;color:var(--gold)">conf ขั้นต่ำ:</span>${confBtns}
      <span style="font-size:7px;color:#778">|</span>${btns}
      <span style="font-size:6px;color:#778;margin-left:auto">🎯 ON = หัวหน้าโต๊ะยิงคู่ตัวเองเมื่อ conf ≥ ${mc}% + KB เป็นบวก (ตอนนี้ ${mc}%)</span>
    </div>`;
  },
  setTraderConf(v) {
    Settings.set('traderMinConf', v);
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD','Strategy',`🎯 ตั้ง conf ขั้นต่ำหัวหน้าโต๊ะ = ${v}% (ยิงเฉพาะสัญญาณมั่นใจสูง)`);
    if (typeof Company !== 'undefined') Company.refresh();
  },
  toggleTraderDriven() {
    const on = !Settings.get('traderDrivenSignals', false);
    Settings.set('traderDrivenSignals', on);
    if (on) Settings.set('webAISignalsToEA', true);   // master switch must be on too
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD','Strategy', on?'🎯 Trader-Driven Signals: ON — หัวหน้าโต๊ะยิงคู่ตัวเอง':'Trader-Driven OFF — กลับไปใช้ Commander');
    alert(on ? '🎯 เปิดโหมดหัวหน้าโต๊ะยิงเอง\n\nAurum/Matilda/Pierre จะส่งสัญญาณคู่ตัวเองอิสระ เมื่อ conf ≥60% และ KB เป็นบวก (cooldown 15 นาที/คู่)\n\n⚠️ ต้องเปิด "ส่งสัญญาณ AI ไป EA" ใน Settings ด้วย (เปิดให้แล้ว)' : 'ปิดโหมดหัวหน้าโต๊ะ — กลับไปใช้ Commander ส่งคู่เดียวที่ดีสุด');
    if (typeof Company !== 'undefined') Company.refresh();
  },

  // Pick which trader presses the order for a pair
  _pickPresser(traders) {
    let best = null, bestScore = -1e9;
    traders.forEach(t => {
      if (t.live.signal !== 'buy' && t.live.signal !== 'sell') return;
      // score = KB edge (R) + small live-confidence boost
      const score = t.rec.R + t.live.conf * 0.2;
      if (score > bestScore) { bestScore = score; best = t.id; }
    });
    return best;
  },

  // ═══════════════════════════════════════════════════════
  //  PHASE 23: CONFLUENCE COMBOS (not solo agents)
  //  Real traders use techniques TOGETHER. We score & trade COMBOS —
  //  coherent groups that confirm each other — instead of lone agents.
  // ═══════════════════════════════════════════════════════
  COMBOS: {
    mean_rev:    { name:'Mean-Reversion', icon:'🎯', agents:['bollinger','rsi','divergence'], desc:'ราคาสุดขอบ BB + RSI สุดขั้ว + divergence กลับตัว' },
    trend:       { name:'Trend-Follow',   icon:'📈', agents:['utbot','macd','mtf'],           desc:'เทรนด์ UT-Bot + momentum MACD + MTF ยืนยัน' },
    smart_money: { name:'Smart-Money',    icon:'🧱', agents:['orderblock','fvg','sweep'],     desc:'โซน OB + ช่อง FVG + กวาด liquidity (S/D)' },
    breakout:    { name:'Breakout',       icon:'🚀', agents:['breakout','utbot','pattern'],   desc:'เบรกกรอบ + เทรนด์หนุน + แท่งยืนยัน' },
    reversal_sr: { name:'Reversal @ S/R', icon:'🔄', agents:['pivot','rsi','pattern'],        desc:'ราคาถึงแนว S/R + RSI สุดขั้ว + แท่งกลับตัว' },
    wave:        { name:'Wave/Structure', icon:'🌊', agents:['elliott','fib','smc'],          desc:'นับ Elliott + Fib retrace + โครงสร้าง SMC' },
    claude_elite:{ name:'Claude Confluence', icon:'🧠', agents:['utbot','smc','rsi'], desc:'คัดจาก KB 459k: UT-Bot (บวกทุกคู่ AUD+98/EUR+62) + SMC (AUD+37) + RSI (EUR+25) — ตัดตัวขาดทุน (Divergence/MTF) ออก เน้น winner ล้วน' },
    // ── Phase 26.2: pair combos RE-TUNED from realistic (spread-modeled) KB ──
    xau_meanrev:  { name:'Gold Elite',     icon:'🥇', agents:['elliott','fvg','bollinger'], desc:'ทอง (winner ล้วน): Elliott +43R⭐ + FVG +41R⭐ + Bollinger +18R — 3 ตัวกำไรสูงสุดของทองจาก KB 459k' },
    xau_liquidity:{ name:'Gold Structure', icon:'🥇', agents:['smc','fvg','orderblock'],  desc:'ทอง (โครงสร้าง): SMC +6R + FVG +41R⭐ + Order Block +5R — เน้นโซน/ช่องว่างที่ KB ยืนยันบวก' },
    aud_trend:    { name:'Aussie Trend',   icon:'🇦🇺', agents:['utbot','smc','ichimoku'],     desc:'AUD เทพสุด: UT-Bot +98R⭐⭐ + SMC +37R + Ichimoku +15R — 3 winner แท้ (ตัด Divergence −98R ออก)' },
    aud_meanrev:  { name:'Aussie Range',   icon:'🇦🇺', agents:['bollinger','smc','rsi'],      desc:'AUD เล่นกรอบ/สวนตัว: Bollinger +32R (ranging +50R⭐) + SMC +13R + RSI — เหมาะตลาดออกข้าง (แทน utbot/ichimoku ที่เป็น trend-follower ไล่ราคาในกรอบแล้วโดนสวน)' },
    eur_trend:    { name:'Euro Trend',     icon:'🇪🇺', agents:['utbot','rsi','sweep'],         desc:'EUR: UT-Bot +62R⭐ + RSI +25R + Sweep (กลางๆ) — สองตัวแรงสุดของ EUR (ตัด Divergence −62R)' },
    eur_structure:{ name:'Euro Momentum',  icon:'🇪🇺', agents:['utbot','rsi','sweep'],          desc:'EUR โมเมนตัม: UT-Bot +62R⭐ + RSI +25R + Sweep — winner ของ EUR (เลิกใช้ MTF/Divergence ที่ลบ)' },
    // ── BlackGlacier: elite gold specialist — 4-factor confluence, max discipline ──
    blackglacier: { name:'BlackGlacier Gold', icon:'🧊', agents:['fvg','elliott','bollinger','smc'], desc:'ทองระดับกองทุน (4 winner จาก KB): FVG +41R + Elliott +43R + Bollinger +18R + SMC +6R — ยืนยัน 4 ชั้นจากตัวที่กำไรจริง เข้าน้อยแต่แม่น (เลิกใช้ MTF/Ichimoku/Sweep ที่ลบ)' },
    // ── FirmSniper: prop-firm challenge specialist — hard-filter 5-layer confluence (single mega-agent) ──
    firm_sniper:  { name:'Firm Sniper', icon:'🎯', agents:['sniper'], desc:'พนักงานสอบกองทุน: hard filter 5 ชั้นพร้อมกัน — (1)ไม่มีข่าวแรง (2)Liquidity Sweep (3)โซน Discount/Premium (4)Order Block+FVG (5)Macro DXY ไม่สวน → ยิงเฉพาะ confluence เต็ม conf 95 ออกน้อยมาก winrate สูง drawdown ต่ำ เหมาะผ่าน challenge (ดีสุดในโหมด WEB/BOTH เพราะใช้ DXY+ข่าว)' },
    // ── BTC crypto desk — trades 24/7 incl. weekends; trend + momentum + breakout ──
    btc_trend:    { name:'Crypto Momentum', icon:'₿', agents:['utbot','macd','breakout'], desc:'BTC 24/7: UT-Bot คุมเทรนด์ + MACD โมเมนตัม + Breakout เบรกกรอบ — 3 ตัวโหวตจริง (ไม่พึ่ง MTF ที่ต้องต่อ feed) เหมาะคริปโตวิ่งแรง ออกซิกได้เสาร์-อาทิตย์' },
  },
  // Pick the COMBO whose members are collectively best on this pair (KB avg
  // member edge). Defaults to a theory-sound combo if KB has no clear winner.
  bestComboFor(sym) {
    const defaultKey = sym === 'XAUUSD' ? 'mean_rev' : 'trend';
    if (typeof AgentScores === 'undefined') return { key: defaultKey, ...this.COMBOS[defaultKey] };
    const kb = AgentScores.load();
    const prefix = sym === 'XAUUSD' ? 'Gold' : sym === 'AUDUSD' ? 'AUD' : 'EUR';
    let bestKey = null, bestScore = -1e9;
    Object.entries(this.COMBOS).forEach(([k, c]) => {
      let sum = 0, n = 0;
      c.agents.forEach(key => {
        const short = this._KEYMAP[key] || key;
        const rec = kb.agents[prefix + '-' + short] || kb.agents[prefix + '-' + short.toLowerCase()];
        const b = rec && (rec['sym_' + sym] || rec.all);
        if (b && b.t > 0) { sum += b.R / b.t; n++; }
      });
      const score = n >= 2 ? sum / n : -999;   // avg member edge (need >=2 with data)
      if (score > bestScore) { bestScore = score; bestKey = k; }
    });
    if (!bestKey || bestScore <= 0) bestKey = defaultKey;   // no positive combo -> safe default
    return { key: bestKey, score: bestScore, ...this.COMBOS[bestKey] };
  },
  // Returns the chosen combo's agents as the trader's kit (+ KB skill rows).
  bestKitFor(sym) {
    const combo = this.bestComboFor(sym);
    const kb = (typeof AgentScores !== 'undefined') ? AgentScores.load() : { agents:{} };
    const prefix = sym === 'XAUUSD' ? 'Gold' : sym === 'AUDUSD' ? 'AUD' : 'EUR';
    const skills = combo.agents.map(key => {
      const short = this._KEYMAP[key] || key;
      const rec = kb.agents[prefix + '-' + short] || kb.agents[prefix + '-' + short.toLowerCase()];
      const b = rec && (rec['sym_' + sym] || rec.all);
      return b && b.t > 0 ? { key, short, R: b.R, t: b.t, avgR: b.R / b.t, acc: Math.round(b.w / b.t * 100) }
                          : { key, short, R: 0, t: 0, avgR: 0, acc: 0 };
    });
    return { kit: combo.agents, skills, combo: combo.name, comboIcon: combo.icon, comboDesc: combo.desc };
  },

  // 3 head traders — 1 per pair, each runs the best CONFLUENCE COMBO for that pair
  _buildRoster() {
    const defs = [
      { sym:'XAUUSD', name:'Aurum',   speed:'Scalp', face:{ skin:'#e9b48c',hair:'#101015',style:'bun',  acc:'headband',accColor:'#ffd700' } },
      { sym:'AUDUSD', name:'Matilda', speed:'Swing', face:{ skin:'#e9b48c',hair:'#6b4a2a',style:'long', acc:'visor',   accColor:'#00ccff' } },
      { sym:'EURUSD', name:'Pierre',  speed:'Swing', face:{ skin:'#e3c9a0',hair:'#2a2a3a',style:'short',acc:'glasses', accColor:'#4169e1' } },
    ];
    return defs.map(d => {
      const best = this.bestKitFor(d.sym);
      return { ...d, id:'best_'+d.sym, kit: best.kit, combo: best.combo,
               desc:`${best.comboIcon||''} คอมโบ: ${best.combo} (${best.kit.map(k => this._KEYMAP[k] || k).join('+')})` };
    });
  },

  // Apply the best multi-technique combo across all 3 pairs (does NOT trade
  // single technique — uses a curated KB-proven blend per pair)
  applyBestSpecialists() {
    const roster = this._buildRoster();
    const lines = roster.map(t => `${t.name} (${t.sym.replace('USD','')}): ${t.kit.map(k=>this._KEYMAP[k]).join('+')}`).join('\n');
    if (!confirm('🏆 ใช้ "ทีมหัวกระทิ" (Best Specialists)?\n\nเปิดเฉพาะเทคนิคที่ KB พิสูจน์แล้วว่าดีที่สุดของแต่ละคู่ (ผสมหลายตัว) + ปิดตัวที่ขาดทุนชัด:\n\n'+lines)) return;
    const union = new Set();
    roster.forEach(t => t.kit.forEach(k => union.add(this._SETKEY[k] || k)));
    const ALL = ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'];
    ALL.forEach(name => Settings.set('enable' + name, union.has(name) || name === 'MTF'));
    Settings.set('enableXAU', true); Settings.set('enableAUD', true); Settings.set('enableEUR', true);
    Settings.set('minGrade', 'A');
    Settings.set('riskPerTrade', Math.min(2, Settings.get('riskPerTrade', 2)));
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD','Strategy','🏆 Best Specialists applied');
    alert('✅ ทีมหัวกระทิพร้อมเทรด!\n\n'+lines+'\n\n(เทคนิคพวกนี้ KB บอกว่ากำไรดีสุดต่อคู่ · จะปรับเองเมื่อ KB โตขึ้น)');
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) TradingWarRoom.fullUpdate();
    if (typeof Company !== 'undefined') Company.refresh();
  },

  // ═══════════════════════════════════════════════════════
  //  PHASE 22: UNIFIED NESTED BRAIN
  //  Agents → Head-trader decides per pair (KB-best kit) →
  //  Commander-style approval gate (grade + risk + consensus) → EA.
  //  ONE decision path, no parallel brains.
  // ═══════════════════════════════════════════════════════
  _GRADE_RANK: { 'S+':4, 'A':3, 'B':2, 'C':1, 'D':0 },
  deskDecision(sym, teamData, bot) {
    const trader = this._buildRoster().find(t => t.sym === sym) || this._buildRoster()[0];
    const live = this._traderSignal(teamData, trader.kit);
    const rec  = this._traderRecord(trader);
    const wr   = rec.total > 0 ? (rec.w / rec.total * 100) : 0;
    const minConf = (typeof Settings !== 'undefined') ? Settings.get('traderMinConf', 80) : 80;
    const out = { trader, live, rec, wr, signal: live.signal, conf: live.conf, grade: '-', approved: false, blockedBy: null };

    if (live.signal !== 'buy' && live.signal !== 'sell') { out.blockedBy = 'ไม่มีสัญญาณ'; return out; }

    // Phase 26: bypass KB-proof gates when KB is still empty (opt-in)
    const bypassKB = (typeof Settings !== 'undefined') && Settings.get('tradeWithoutKB', false);

    // ── Grade (head-trader conviction) ──
    const fullAgree = live.n > 0 && (live.buy === live.n || live.sell === live.n);
    let grade = 'C';
    if (bypassKB) {
      // no KB history → grade from live conviction alone
      grade = (live.conf >= 90 && fullAgree) ? 'S+' : live.conf >= 85 ? 'A' : live.conf >= 80 ? 'B' : 'C';
    } else if (live.conf >= 90 && wr >= 68 && fullAgree) grade = 'S+';
    else if (live.conf >= 85 && wr >= 60)               grade = 'A';
    else if (live.conf >= 80 && wr >= 55)               grade = 'B';
    out.grade = grade;

    // ── Commander-style approval gates (each can block) ──
    const need = Math.max(1, Math.ceil(live.n / 2));
    const agree = Math.max(live.buy, live.sell);
    const minGrade = (typeof Settings !== 'undefined') ? Settings.get('minGrade', 'A') : 'A';
    if (agree < need)                       out.blockedBy = 'เทคนิคไม่พอเห็นตรงกัน';
    else if (live.conf < minConf)           out.blockedBy = `conf ${live.conf}% < ${minConf}%`;
    else if (!bypassKB && rec.R <= 0)       out.blockedBy = 'KB ยังไม่ทำกำไร';
    else if (!bypassKB && wr < 50)          out.blockedBy = `WR ${wr.toFixed(0)}% < 50%`;
    else if (!bypassKB && (this._GRADE_RANK[grade]||0) < (this._GRADE_RANK[minGrade]||3))
                                            out.blockedBy = `Grade ${grade} < ${minGrade}`;
    else if (bot && parseFloat(bot.portfolioRisk||0) >= parseFloat(bot.maxPortfolioRisk||6))
                                            out.blockedBy = 'ความเสี่ยงพอร์ตเต็ม';
    out.approved = !out.blockedBy;
    return out;
  },

  // ═══════════════════════════════════════════════════════
  //  PHASE 24: EMPLOYEE BOARD — many combo-specialists + AUDIT
  //  6 employees, each owns ONE combo. They COMPETE per pair; the best
  //  approved one fires. Every signal is logged & audited so the CEO can
  //  see who's actually good.
  // ═══════════════════════════════════════════════════════
  EMPLOYEES: [
    // 🥇 GOLD desk
    { id:'emp_mr', sym:'XAUUSD', combo:'xau_meanrev',  name:'Mina',   sprite:[1,0], face:{skin:'#f0c8a0',hair:'#caa24a',style:'long', acc:'glasses', accColor:'#ffd700'} },
    { id:'emp_sm', sym:'XAUUSD', combo:'xau_liquidity',name:'Sienna', sprite:[1,1], face:{skin:'#e9b48c',hair:'#101015',style:'bun',  acc:'headband',accColor:'#ffd700'} },
    { id:'emp_bg', sym:'XAUUSD', combo:'blackglacier', name:'BlackGlacier', sprite:[2,1], face:{skin:'#cdab8a',hair:'#0a0a12',style:'short',acc:'glasses',accColor:'#7fd0ff'} },
    // 🇦🇺 AUD desk
    { id:'emp_tr', sym:'AUDUSD', combo:'aud_trend',    name:'Trent',  sprite:[4,0], face:{skin:'#e9b48c',hair:'#3a2a1a',style:'short',acc:'headset', accColor:'#00ccff'} },
    { id:'emp_rv', sym:'AUDUSD', combo:'aud_meanrev',  name:'Ravi',   sprite:[3,0], face:{skin:'#cd9b6a',hair:'#2a2a3a',style:'short',acc:'glasses', accColor:'#00ccff'} },
    // 🇪🇺 EUR desk
    { id:'emp_wv', sym:'EURUSD', combo:'eur_trend',    name:'Willa',  sprite:[3,1], face:{skin:'#e3c9a0',hair:'#bfe0ff',style:'long', acc:'none',    accColor:'#4169e1'} },
    { id:'emp_bo', sym:'EURUSD', combo:'eur_structure',name:'Blaze',  sprite:[2,0], face:{skin:'#e9b48c',hair:'#3a2a1a',style:'spiky',acc:'visor',   accColor:'#4169e1'} },
    // 🧠 floating elite — competes on every pair
    { id:'emp_cl', combo:'claude_elite',name:'Claude', sprite:[0,0], face:{skin:'#e9b48c',hair:'#1a1a22',style:'short',acc:'headset', accColor:'#ff9d3c'} },
    // 🎯 prop-firm specialist — floating elite, hard-filter sniper (takes any FX pair on perfect confluence)
    { id:'emp_fs', combo:'firm_sniper', name:'FirmSniper', sprite:[0,1], face:{skin:'#d8b48c',hair:'#14181f',style:'short',acc:'glasses', accColor:'#36e08f'} },
    // ₿ crypto desk — BTCUSD, trades weekends (24/7 market)
    { id:'emp_bt', sym:'BTCUSD', combo:'btc_trend', name:'Satoshi', sprite:[4,1], face:{skin:'#e9b48c',hair:'#e08a2a',style:'short',acc:'visor', accColor:'#f7931a'} },
  ],

  // PHASE 25.1: beep when an employee fires (buy = rising, sell = falling)
  _beep(dir) {
    if (typeof Settings !== 'undefined' && !Settings.get('sound', true)) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'square';
      const f = dir === 'buy' ? [660, 990] : [494, 330];
      o.frequency.setValueAtTime(f[0], ctx.currentTime);
      o.frequency.setValueAtTime(f[1], ctx.currentTime + 0.09);
      g.gain.setValueAtTime(0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      o.start(); o.stop(ctx.currentTime + 0.28);
    } catch (e) {}
  },

  // ── PHASE 24.4: AURA-style "alive" office animations (inject CSS once) ──
  _injectFX() {
    if (this._fxInjected || typeof document === 'undefined') return; this._fxInjected = true;
    const css = `
      @keyframes twrBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
      @keyframes twrPulse { 0%,100%{box-shadow:0 0 6px currentColor} 50%{box-shadow:0 0 16px currentColor} }
      @keyframes twrBlink { 0%,100%{opacity:.35} 50%{opacity:1} }
      @keyframes twrPop { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
      @keyframes twrType { 0%{content:'·'} 33%{content:'··'} 66%{content:'···'} }
      .twr-head { animation: twrBob 2.6s ease-in-out infinite; }
      .twr-emp.active .twr-head { animation: twrBob 1.1s ease-in-out infinite; }
      .twr-emp.active { animation: twrPulse 1.4s ease-in-out infinite; }
      .twr-bubble { position:absolute; top:-14px; left:38px; font-size:7px; font-weight:bold; padding:2px 6px; border-radius:7px 7px 7px 0; color:#000; animation: twrPop .3s ease-out; white-space:nowrap; z-index:5; }
      .twr-think { animation: twrBlink 1.2s ease-in-out infinite; }
    `;
    const s = document.createElement('style'); s.id = 'twr-fx'; s.textContent = css; document.head.appendChild(s);
  },

  // ── PHASE 24.1: custom combos / employees (add your own, persisted) ──
  _initCustom() {
    if (this._customInited) return; this._customInited = true;
    try { const cc = JSON.parse(localStorage.getItem('twr_custom_combos') || '{}'); Object.assign(this.COMBOS, cc); } catch {}
    try {
      const ce = JSON.parse(localStorage.getItem('twr_custom_employees') || '[]');
      ce.forEach(e => { if (!this.EMPLOYEES.find(x => x.id === e.id)) this.EMPLOYEES.push(e); });
    } catch {}
  },
  _BUILTIN_EMP: ['emp_mr','emp_tr','emp_sm','emp_bo','emp_rv','emp_wv','emp_cl','emp_bg','emp_fs','emp_bt'],
  _SYMS: ['XAUUSD','AUDUSD','EURUSD','BTCUSD'],   // all desks employees can compete on (BTC = 24/7)
  addCombo() {
    const avail = Object.keys(this._KEYMAP).filter(k => k !== 'mtf');
    const name = prompt('ชื่อคอมโบใหม่ (เช่น "Gold Scalp X"):'); if (!name) return;
    const agentsStr = prompt('ใส่เทคนิค 2-4 ตัว คั่นด้วย , \nเลือกจาก: ' + avail.join(', '), 'bollinger,rsi,sweep');
    if (!agentsStr) return;
    const agents = agentsStr.split(',').map(s => s.trim().toLowerCase()).filter(k => avail.includes(k));
    if (agents.length < 2) { alert('❌ ต้องมีอย่างน้อย 2 เทคนิคที่ถูกต้อง (พิมพ์ผิด?)'); return; }
    const empName = prompt('ชื่อพนักงานที่จะถือคอมโบนี้:', name.slice(0, 8)); if (!empName) return;
    const key = 'cmb_' + Date.now();
    const combo = { name, icon: '⭐', agents, desc: 'คอมโบกำหนดเอง: ' + agents.map(a => this._KEYMAP[a]).join('+') };
    this.COMBOS[key] = combo;
    const palette = ['#ff66cc','#00e5ff','#7fff00','#ffd700','#ff4500','#9370db','#1e90ff'];
    const emp = { id: 'emp_' + Date.now(), combo: key, name: empName,
                  face: { skin:'#e9b48c', hair:'#3a2a1a', style:'short', acc:'glasses', accColor: palette[Math.floor(Math.random()*palette.length)] } };
    this.EMPLOYEES.push(emp);
    try { const cc = JSON.parse(localStorage.getItem('twr_custom_combos')||'{}'); cc[key] = combo; localStorage.setItem('twr_custom_combos', JSON.stringify(cc)); } catch {}
    try { const ce = JSON.parse(localStorage.getItem('twr_custom_employees')||'[]'); ce.push(emp); localStorage.setItem('twr_custom_employees', JSON.stringify(ce)); } catch {}
    alert(`✅ จ้างพนักงานใหม่: ${empName}\nคอมโบ: ${name} (${agents.map(a => this._KEYMAP[a]).join('+')})`);
    if (typeof Company !== 'undefined') Company.refresh();
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) TradingWarRoom.fullUpdate();
  },

  // Phase 26: one click — enable exactly the analysts every combo needs
  enableComboAnalysts() {
    if (typeof Settings === 'undefined') return;
    const need = new Set(['MTF']);
    this.EMPLOYEES.forEach(e => {
      const c = this.COMBOS[e.combo]; if (!c) return;
      c.agents.forEach(k => need.add(this._SETKEY[k] || k));
    });
    need.forEach(name => Settings.set('enable' + name, true));
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) { try { TradingWarRoom.fullUpdate(); } catch (e) {} }
    if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'Strategy', `✅ เปิด analysts ที่ทีมต้องใช้: ${[...need].join(', ')}`);
    alert('✅ เปิด Analysts ที่ทุกคอมโบต้องใช้แล้ว:\n' + [...need].join(', ') + '\n\n(เปิด Settings เช็คได้ — ตอนนี้ทุกทีมยิงได้ครบ)');
    if (typeof Company !== 'undefined') Company.refresh();
  },
  // PHASE 25.4: wipe old test results (KB win-rates + audit) to test fresh
  freshTest() {
    if (!confirm('🧹 ล้างผลเทสเก่าทั้งหมด (KB win-rate จาก backtest + audit log) เพื่อเริ่มเทสใหม่?\n\n⚠️ หลังล้าง พนักงานจะ "ยังไม่ออกไม้" จนกว่าจะรัน Auto-Optimize ใหม่ให้ KB มีข้อมูล (เพราะเกณฑ์ต้องมี WR/R)')) return;
    if (typeof AgentScores !== 'undefined' && AgentScores.reset) AgentScores.reset();
    try { localStorage.removeItem('twr_audit'); } catch {}
    this._lastTraderFire = {};
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Strategy', '🧹 ล้างผลเทสเก่า — KB + audit รีเซ็ต เริ่มเทสใหม่');
    alert('✅ ล้างผลเทสเก่าเรียบร้อย!\n\nขั้นต่อไป:\n1. เปิด BACKTEST → Start Auto-Opt 2-5 นาที (สร้าง win-rate ใหม่)\n2. กด STOP\n→ จากนั้นพนักงานถึงจะออกไม้ได้ตามผลใหม่');
    if (typeof Company !== 'undefined') Company.refresh();
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) TradingWarRoom.fullUpdate();
  },
  removeEmployee(empId) {
    if (this._BUILTIN_EMP.includes(empId)) { alert('พนักงานหลัก 6 คนลบไม่ได้'); return; }
    if (!confirm('ปลดพนักงานคนนี้?')) return;
    this.EMPLOYEES = this.EMPLOYEES.filter(e => e.id !== empId);
    try { const ce = JSON.parse(localStorage.getItem('twr_custom_employees')||'[]').filter(e => e.id !== empId); localStorage.setItem('twr_custom_employees', JSON.stringify(ce)); } catch {}
    if (typeof Company !== 'undefined') Company.refresh();
  },

  // KB record for an arbitrary combo (agents) on a symbol
  _comboRecord(sym, agents) {
    const out = { w:0, l:0, R:0, total:0 };
    if (typeof AgentScores === 'undefined') return out;
    const kb = AgentScores.load();
    const prefix = sym === 'XAUUSD' ? 'Gold' : sym === 'AUDUSD' ? 'AUD' : 'EUR';
    agents.forEach(key => {
      const short = this._KEYMAP[key] || key;
      const rec = kb.agents[prefix + '-' + short] || kb.agents[prefix + '-' + short.toLowerCase()];
      const b = rec && (rec['sym_' + sym] || rec.all);
      if (b && b.t > 0) { out.w += b.w; out.l += b.l; out.R += b.R; out.total += b.t; }
    });
    return out;
  },

  // One employee's decision on a pair (their combo + same gates as deskDecision)
  // Is the market open for this symbol now? Forex/metals close on the weekend
  // (Fri 22:00 → Sun 22:00 UTC); crypto (BTC/ETH) trades 24/7.
  _marketOpen(sym) {
    const s = (sym || '').toUpperCase();
    if (/BTC|ETH|LTC|XRP|DOGE|SOL|USDT|CRYPTO/.test(s)) return true;   // 24/7
    const now = new Date(), day = now.getUTCDay(), h = now.getUTCHours();
    if (day === 6) return false;             // Saturday — closed
    if (day === 0 && h < 22) return false;   // Sunday before 22:00 UTC
    if (day === 5 && h >= 22) return false;  // Friday after 22:00 UTC
    return true;
  },
  _empDecision(emp, sym, teamData, bot) {
    const combo = this.COMBOS[emp.combo];
    const live = this._traderSignal(teamData, combo.agents);
    const rec  = this._comboRecord(sym, combo.agents);
    const wr   = rec.total > 0 ? (rec.w / rec.total * 100) : 0;
    const minConf = (typeof Settings !== 'undefined') ? Settings.get('traderMinConf', 80) : 80;
    const out = { emp, combo, sym, live, rec, wr, signal: live.signal, conf: live.conf, grade: '-', approved: false, blockedBy: null };
    if (this.isRested(emp.id)) { out.blockedBy = '💤 พักอยู่'; return out; }
    if (!this._marketOpen(sym)) { out.blockedBy = '🌙 ตลาดปิด (เสาร์-อาทิตย์)'; return out; }
    if (live.signal !== 'buy' && live.signal !== 'sell') { out.blockedBy = 'ไม่มีสัญญาณ'; return out; }
    if (sym === 'BTCUSD' && typeof Settings !== 'undefined' && !Settings.get('enableBTC', true)) { out.blockedBy = 'ปิดพอร์ต BTC'; return out; }
    const bypassKB = (typeof Settings !== 'undefined') && Settings.get('tradeWithoutKB', false);
    const fullAgree = live.n > 0 && (live.buy === live.n || live.sell === live.n);
    let grade = 'C';
    if (bypassKB) {
      grade = (live.conf >= 90 && fullAgree) ? 'S+' : live.conf >= 85 ? 'A' : live.conf >= 80 ? 'B' : 'C';
    } else if (live.conf >= 90 && wr >= 68 && fullAgree) grade = 'S+';
    else if (live.conf >= 85 && wr >= 60)               grade = 'A';
    else if (live.conf >= 80 && wr >= 55)               grade = 'B';
    out.grade = grade;
    const need = Math.max(1, Math.ceil(live.n / 2));
    const agree = Math.max(live.buy, live.sell);
    const minGrade = (typeof Settings !== 'undefined') ? Settings.get('minGrade', 'A') : 'A';
    if (agree < need)            out.blockedBy = 'เทคนิคไม่พอเห็นตรงกัน';
    else if (live.conf < minConf) out.blockedBy = `conf ${live.conf}% < ${minConf}%`;
    else if (!bypassKB && rec.R <= 0) out.blockedBy = 'KB ยังไม่ทำกำไร';
    else if (!bypassKB && wr < 50)    out.blockedBy = `WR ${wr.toFixed(0)}% < 50%`;
    else if (!bypassKB && (this._GRADE_RANK[grade]||0) < (this._GRADE_RANK[minGrade]||3)) out.blockedBy = `Grade ${grade} < ${minGrade}`;
    else if (bot && parseFloat(bot.portfolioRisk||0) >= parseFloat(bot.maxPortfolioRisk||6)) out.blockedBy = 'ความเสี่ยงพอร์ตเต็ม';
    out.approved = !out.blockedBy;
    out.score = (out.signal === 'wait' ? -1 : 1) * (live.conf + rec.R / Math.max(1, rec.total) * 100);
    return out;
  },

  // Find the winning employee per pair (best approved decision)
  _pairWinners(teamFor, bot) {
    const solo = (typeof Settings !== 'undefined') ? Settings.get('soloEmployee', '') : '';
    const winners = {};
    this._SYMS.forEach(sym => {
      let best = null;
      this.EMPLOYEES.forEach(e => {
        if (solo && e.id !== solo) return;    // 🎯 solo mode: only the chosen employee may fire
        if (e.sym && e.sym !== sym) return;   // pair-locked specialist only competes on its own pair
        const d = this._empDecision(e, sym, teamFor(sym), bot);
        if (d.approved && (!best || d.score > best.score)) best = d;
      });
      winners[sym] = best;
    });
    return winners;
  },
  // 🎯 Solo mode — let ONE employee be the only one that fires signals (max discipline).
  // Pass '' to clear. FirmSniper-only = prop-firm discipline (rare but precise).
  setSoloEmployee(id) {
    if (typeof Settings === 'undefined') return;
    const cur = Settings.get('soloEmployee', '');
    const next = (cur === id) ? '' : id;     // toggle off if already solo
    Settings.set('soloEmployee', next);
    const emp = this.EMPLOYEES.find(e => e.id === next);
    if (typeof UI !== 'undefined' && UI.addLog) {
      UI.addLog('CMD', 'Roster', next ? `🎯 โหมดเดี่ยว: เฉพาะ ${emp ? emp.name : next} เท่านั้นที่ยิงสัญญาณ (ปิดที่เหลือ)` : '👥 ปิดโหมดเดี่ยว — พนักงานทุกคนแข่งกันเหมือนเดิม');
    }
    alert(next ? `🎯 โหมดเดี่ยว ${emp ? emp.name : next}\n\nตอนนี้เฉพาะ ${emp ? emp.name : next} เท่านั้นที่ส่งสัญญาณ — คนอื่นหยุดเสนอ\n(กดปุ่มซ้ำเพื่อกลับเป็นทีมเต็ม)` : '👥 กลับเป็นทีมเต็มแล้ว — ทุกคนแข่งกันยิงตามปกติ');
    if (typeof Company !== 'undefined') Company.refresh();
  },

  // ── 💤 REST / ⏰ WAKE — pause employees individually or all (persisted) ──
  _REST_KEY: 'twr_rested',
  _loadRested() { try { return new Set(JSON.parse(localStorage.getItem(this._REST_KEY) || '[]')); } catch (e) { return new Set(); } },
  _saveRested(set) { try { localStorage.setItem(this._REST_KEY, JSON.stringify([...set])); } catch (e) {} },
  isRested(id) { if (!this._restedCache) this._restedCache = this._loadRested(); return this._restedCache.has(id); },
  restEmployee(id) {
    const s = this._loadRested(); s.add(id); this._saveRested(s); this._restedCache = s;
    const e = this.EMPLOYEES.find(x => x.id === id);
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Roster', `💤 ให้ ${e ? e.name : id} พัก — หยุดออกสัญญาณ`);
    this.refresh();
  },
  wakeEmployee(id) {
    const s = this._loadRested(); s.delete(id); this._saveRested(s); this._restedCache = s;
    const e = this.EMPLOYEES.find(x => x.id === id);
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Roster', `⏰ ปลุก ${e ? e.name : id} — กลับมาทำงาน`);
    this.refresh();
  },
  toggleRest(id) { this.isRested(id) ? this.wakeEmployee(id) : this.restEmployee(id); },
  restAll() {
    const s = new Set(this.EMPLOYEES.map(e => e.id)); this._saveRested(s); this._restedCache = s;
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Roster', '💤 ให้พนักงานทั้งหมดพัก — หยุดออกสัญญาณทุกคน');
    this.refresh();
  },
  wakeAll() {
    this._saveRested(new Set()); this._restedCache = new Set();
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Roster', '⏰ ปลุกพนักงานทั้งหมด — กลับมาทำงานครบทีม');
    this.refresh();
  },
  // ── 📈 OPEN POSITION → owner employee (so "holding a live trade" shows everywhere) ──
  _employeeHolding(emp) {
    const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const pos = (bot && bot.positions) ? bot.positions : [];
    if (!pos.length) return null;
    const tag = emp.id.replace('emp_', '');
    const baseSym = (s) => (s || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6);
    const tagOf = (p) => { const a = (p.comment || '').split('-'); return a.length >= 3 ? a[2] : ''; };
    // 1) exact agent-tag match from the EA comment (e.g. TWR-S-tr-R35 → Trent)
    for (const p of pos) { if (tagOf(p) && tagOf(p) === tag) return p; }
    // 2) symbol attribution (works for pairs with 2+ traders): a position tagged
    //    to a specific peer belongs to that peer; an untagged one (EA-local /
    //    pre-comment EA) is shown by the PRIMARY (first-listed) trader of the pair.
    if (emp.sym) {
      const peers = this.EMPLOYEES.filter(x => x.sym === emp.sym);
      const isPrimary = peers.length && peers[0].id === emp.id;
      for (const p of pos) {
        if (baseSym(p.sym) !== emp.sym) continue;
        const pt = tagOf(p);
        const tagged = pt && peers.find(x => x.id.replace('emp_', '') === pt);
        if (tagged) { if (tagged.id === emp.id) return p; continue; }  // owned by a tagged peer
        if (isPrimary) return p;                                       // untagged → primary trader
      }
    }
    return null;
  },

  // ── AUDIT LOG (per-employee signal history + outcomes) ──
  _AUDIT_KEY: 'twr_audit',
  _loadAudit() { try { return JSON.parse(localStorage.getItem(this._AUDIT_KEY) || '[]'); } catch { return []; } },
  _saveAudit(a) { try { localStorage.setItem(this._AUDIT_KEY, JSON.stringify(a.slice(-500))); } catch {} },
  _logSignal(empId, sym, signal, grade, conf) {
    const a = this._loadAudit();
    a.push({ ts: Date.now(), empId, sym, signal, grade, conf, outcome: null, rMult: null });
    this._saveAudit(a);
  },
  // Attach a closed-trade outcome to the most recent unmatched signal for that symbol
  _attachOutcome(sym, outcome, rMult, agent) {
    const base = (sym || '').replace(/[mzcr.]+$/i, '').replace('USD', '');
    // exact attribution if the EA reported a known employee tag (e.g. 'tr' → emp_tr)
    const exactEmp = (agent && this.EMPLOYEES.some(e => e.id === 'emp_' + agent)) ? ('emp_' + agent) : null;
    const a = this._loadAudit();

    // 1) EXACT web-signal match ONLY. A web-driven trade carries a real employee
    //    tag → attach the outcome to THAT employee's most recent pending signal.
    //    Phase D.5 FIX: generic EA-local tags ('local'/'ea') skip this — the old
    //    code attached them to "any pending signal on the pair", so a trade fired
    //    by one employee's combo could land on a peer whose proposal was logged
    //    more recently (Willa's trade showing up under Blaze).
    if (exactEmp) {
      for (let i = a.length - 1; i >= 0; i--) {
        const e = a[i];
        if (e.outcome) continue;
        const eb = (e.sym || '').replace(/[mzcr.]+$/i, '').replace('USD', '');
        if (eb !== base) continue;
        if (e.empId !== exactEmp) continue;
        if ((Date.now() - e.ts) < 4 * 3600 * 1000) {
          e.outcome = outcome; e.rMult = rMult; this._saveAudit(a); return e.empId;
        }
      }
    }

    // 2) Otherwise credit the REAL owner of this pair's EA trades = the employee
    //    whose combo the EA actually runs (same _eaComboFor source of truth as
    //    pushCombosToEA + the KB learning loop), so office + leaderboard + KB all
    //    agree on who made the trade. Falls back to the first listed peer only if
    //    no owner can be resolved.
    let ownerId = exactEmp;
    if (!ownerId) { const sel = this._eaComboFor(base + 'USD'); if (sel && sel.empId) ownerId = sel.empId; }
    if (!ownerId) {
      const symFull = { XAU: 'XAUUSD', AUD: 'AUDUSD', EUR: 'EURUSD', BTC: 'BTCUSD' }[base];
      const peers = symFull ? this.EMPLOYEES.filter(e => e.sym === symFull) : [];
      if (peers.length) ownerId = peers[0].id;
    }
    if (ownerId) {
      a.push({ ts: Date.now(), empId: ownerId, sym, signal: '-', grade: 'EA', conf: 0, outcome, rMult });
      this._saveAudit(a.slice(-500));
      return ownerId;
    }
    return null;
  },
  _employeeStats(empId) {
    const a = this._loadAudit().filter(e => e.empId === empId);
    const matched = a.filter(e => e.outcome);
    const w = matched.filter(e => e.outcome === 'win').length;
    const l = matched.filter(e => e.outcome === 'loss').length;
    const R = matched.reduce((s, e) => s + (parseFloat(e.rMult) || 0), 0);
    const wr = (w + l) ? Math.round(w / (w + l) * 100) : 0;
    return { signals: a.length, matched: matched.length, w, l, wr, R };
  },

  // Phase 24.2: Train ONE employee = enable ONLY their combo's agents, then
  // run Auto-Optimize (so the KB update focuses on that combo). Original
  // agent toggles are restored automatically when training stops.
  trainEmployee(empId) {
    const e = this.EMPLOYEES.find(x => x.id === empId); if (!e) return;
    const combo = this.COMBOS[e.combo]; if (!combo) return;
    if (typeof AutoOptimize === 'undefined') { alert('ระบบ Train ยังไม่พร้อม'); return; }
    const kitTxt = combo.agents.map(k => this._KEYMAP[k] || k).join('+');
    if (!confirm(`🎓 เทรน ${e.name} เฉพาะคอมโบ ${combo.name}?\n\nจะเปิดเฉพาะ ${kitTxt} แล้วรัน Auto-Optimize\nกด STOP ที่ Backtest เมื่อพอ → คืนค่า agent เดิมให้อัตโนมัติ`)) return;
    const ALL = ['SMC','Elliott','Fib','RSI','MACD','Bollinger','Pivot','Pattern','Divergence','MTF','Ichimoku','DXY','UTBot','OrderBlock','Sweep','Breakout','FVG','News'];
    const snap = {}; ALL.forEach(n => snap['enable' + n] = Settings.get('enable' + n));
    const on = combo.agents.map(k => this._SETKEY[k] || k);
    ALL.forEach(n => Settings.set('enable' + n, on.includes(n)));
    AutoOptimize._restoreEnables = snap;   // backtest.js restores this on stop
    if (AutoOptimize.running) AutoOptimize.stop();   // stop any prior run first
    if (typeof Modal !== 'undefined') Modal.open('backtest');
    if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', e.name, `🎓 ${e.name} เทรนคอมโบ ${combo.name} (เฉพาะ ${kitTxt})`);
    alert(`🎓 ${e.name} กำลังเริ่มเทรนคอมโบ ${combo.name}\nเปิดเฉพาะ: ${kitTxt}\n\n→ Auto-Optimize จะเริ่มรันทันที (ดูแถบ "RUNNING — Cycle…")\nกด ⏹ STOP เมื่อพอ — ระบบคืนค่า agent เดิมให้เอง`);
    // start AFTER the alert is dismissed (modal already open) — reliable, no race
    setTimeout(() => { if (!AutoOptimize.running) AutoOptimize.start({ maxCycles: 999, symbols: ['XAUUSD','AUDUSD','EURUSD'] }); }, 200);
  },

  // PHASE 24.3: Audit Log + Leaderboard (CEO checks who's actually good)
  _showAudit: false,
  toggleAudit() { this._showAudit = !this._showAudit; if (typeof Company !== 'undefined') Company.refresh(); },
  auditPanel() {
    if (!this._showAudit) {
      return `<button onclick="Company.toggleAudit()" class="btn btn-secondary" style="font-size:8px;padding:5px 12px;margin-bottom:8px">📋 เปิด Audit & Leaderboard ▼</button>`;
    }
    this._initCustom();
    const ranked = this.EMPLOYEES.map(e => ({ e, st: this._employeeStats(e.id) }))
      .sort((a, b) => b.st.R - a.st.R || b.st.wr - a.st.wr);
    const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
    const ell = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const lb = ranked.map((r, i) => {
      const c = r.st.R > 0 ? 'var(--green)' : r.st.R < 0 ? 'var(--red)' : '#9aa';
      const combo = this.COMBOS[r.e.combo];
      return `<tr style="font-size:7px"><td>${medal(i)}</td><td style="color:var(--gold);${ell}">${r.e.name}</td><td style="${ell}" title="${combo?combo.name:''}">${combo ? combo.name : '—'}</td><td>${r.st.signals}</td><td style="white-space:nowrap"><span style="color:var(--green)">${r.st.w}</span>/<span style="color:var(--red)">${r.st.l}</span></td><td style="color:var(--teal)">${r.st.wr}%</td><td style="color:${c};font-weight:bold;white-space:nowrap">${r.st.R > 0 ? '+' : ''}${r.st.R.toFixed(1)}R</td></tr>`;
    }).join('');
    // ── only trades that ACTUALLY executed (have an outcome) — drop proposals ──
    const log = this._loadAudit().filter(a => a.outcome).slice(-40).reverse().map(a => {
      const emp = this.EMPLOYEES.find(e => e.id === a.empId);
      const oc = a.outcome === 'win' ? '<span style="color:var(--green)">✓ win</span>'
               : a.outcome === 'loss' ? '<span style="color:var(--red)">✗ loss</span>' : '<span style="color:#9aa">BE</span>';
      const rm = (a.rMult != null) ? ` <b>${a.rMult >= 0 ? '+' : ''}${(parseFloat(a.rMult) || 0).toFixed(1)}R</b>` : '';
      const sig = a.signal === '-' ? 'EA' : a.signal;
      const sc = a.signal === 'buy' ? 'var(--green)' : a.signal === 'sell' ? 'var(--red)' : '#9aa';
      const t = new Date(a.ts).toLocaleString('th-TH', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `<tr style="font-size:6px"><td style="white-space:nowrap">${t}</td><td style="color:var(--gold);${ell}">${emp ? emp.name : a.empId}</td><td>${(a.sym||'').replace(/USD.*/,'')}</td><td style="color:${sc};white-space:nowrap">${sig}</td><td style="white-space:nowrap">${oc}${rm}</td></tr>`;
    }).join('') || '<tr><td colspan="5" style="color:#778;text-align:center">— ยังไม่มีไม้ที่ออกสำเร็จ —</td></tr>';

    // ── P/L summary: total / Web / Local (from real closed trades reported by EA) ──
    const trades = (typeof BotBridge !== 'undefined' && BotBridge.allTrades) ? BotBridge.allTrades : [];
    const agg = { all:{n:0,p:0,r:0,w:0}, web:{n:0,p:0,r:0,w:0}, local:{n:0,p:0,r:0,w:0} };
    trades.forEach(t => {
      if (!t || !t.outcome || t.outcome === 'breakeven') return;
      const k = (t.agent === 'local' || t.agent === 'ea') ? 'local' : 'web';
      [agg.all, agg[k]].forEach(g => { g.n++; g.p += parseFloat(t.profit) || 0; g.r += parseFloat(t.rMult) || 0; if (t.outcome === 'win') g.w++; });
    });
    const sCell = (label, g, col) => {
      const pc = g.p > 0 ? 'var(--green)' : g.p < 0 ? 'var(--red)' : '#9aa';
      return `<div style="flex:1;min-width:88px;border:1px solid ${col};border-radius:5px;padding:5px 7px;background:${col}14">
        <div style="font-size:7px;color:${col};font-weight:bold">${label}</div>
        <div style="font-size:12px;font-weight:bold;color:${pc}">${g.p >= 0 ? '+' : ''}$${g.p.toFixed(2)}</div>
        <div style="font-size:6px;color:#9aa">${g.n} ไม้ · WR ${g.n ? Math.round(g.w / g.n * 100) : 0}% · ${g.r >= 0 ? '+' : ''}${g.r.toFixed(1)}R</div>
      </div>`;
    };
    const summary = `<div style="display:flex;gap:6px;margin-bottom:8px">${sCell('💰 รวมทั้งหมด', agg.all, 'var(--gold)')}${sCell('🌐 Web', agg.web, 'var(--teal)')}${sCell('⚡ Local (EA)', agg.local, 'var(--purple)')}</div>`;

    return `<div style="margin-bottom:8px;padding:8px;border:1px solid var(--purple);border-radius:6px;background:rgba(120,80,255,0.05)">
      <button onclick="Company.toggleAudit()" class="btn btn-secondary" style="font-size:8px;padding:3px 10px;margin-bottom:6px">📋 ปิด Audit ▲</button>
      <div style="font-size:8px;color:var(--gold);font-weight:bold;margin-bottom:4px">📊 สรุปกำไรจริง (ไม้ที่ปิดแล้ว · จาก MT5)</div>
      ${summary}
      <div style="font-size:8px;color:var(--purple);font-weight:bold;margin-bottom:3px">🏆 LEADERBOARD — เรียงตามผลจริง (R)</div>
      <table class="j-table" style="width:100%;table-layout:fixed"><colgroup><col style="width:22px"><col style="width:62px"><col><col style="width:30px"><col style="width:38px"><col style="width:34px"><col style="width:48px"></colgroup><thead><tr style="font-size:6px"><th>#</th><th>พนักงาน</th><th>คอมโบ</th><th>ซิก</th><th>W/L</th><th>WR</th><th>R</th></tr></thead><tbody>${lb}</tbody></table>
      <div style="font-size:8px;color:var(--purple);font-weight:bold;margin:8px 0 3px">📜 ไม้ที่ออกสำเร็จ — ล่าสุด</div>
      <div class="j-table-wrap" style="max-height:170px;overflow:auto"><table class="j-table" style="width:100%;table-layout:fixed"><colgroup><col style="width:62px"><col style="width:66px"><col style="width:34px"><col style="width:34px"><col></colgroup><thead><tr style="font-size:6px"><th>เวลา</th><th>พนักงาน</th><th>คู่</th><th>ทิศ</th><th>ผล</th></tr></thead><tbody>${log}</tbody></table></div>
    </div>`;
  },

  renderEmployeeBoard() {
    this._initCustom();
    this._injectFX();
    const gold = TradingWarRoom?.lastGold, fx = TradingWarRoom?.lastFX;
    const teamFor = (sym) => sym === 'XAUUSD' ? gold : sym === 'AUDUSD' ? fx?.aud : sym === 'EURUSD' ? fx?.eur : (typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.lastBTC : null);
    const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const winners = this._pairWinners(teamFor, bot);
    const symEm = { XAUUSD:'🥇', AUDUSD:'🇦🇺', EURUSD:'🇪🇺', BTCUSD:'₿' };

    // winner banner
    const wBanner = this._SYMS.map(s => {
      const w = winners[s];
      return `<span style="font-size:7px;margin-right:12px">${symEm[s]} ${s.replace('USD','')}: ${w ? `<b style="color:var(--green)">${w.emp.name}</b> ${w.signal==='buy'?'▲':'▼'} G${w.grade}` : '<span style="color:#778">— รอ —</span>'}</span>`;
    }).join('');

    // employee cards — each shows best current signal + audit
    const winnerOf = (empId) => Object.keys(winners).find(s => winners[s] && winners[s].emp.id === empId);
    const cards = this.EMPLOYEES.map(e => {
      const combo = this.COMBOS[e.combo];
      // best decision across pairs (for display) — prefer the most ACTIVE sym
      // (approved > has-signal > open-market wait > market-closed) so a floating
      // employee shows its tradeable pair (e.g. BTC) instead of "🌙 closed".
      const _prio = (d) => (d.approved ? 3 : 0)
        + ((d.signal === 'buy' || d.signal === 'sell') ? 2 : 0)
        + ((d.blockedBy && d.blockedBy.indexOf('ตลาดปิด') >= 0) ? -2 : 0);
      let best = null;
      this._SYMS.forEach(s => {
        if (e.sym && e.sym !== s) return;
        const d = this._empDecision(e, s, teamFor(s), bot);
        if (!best || _prio(d) > _prio(best) || (_prio(d) === _prio(best) && (d.conf || 0) > (best.conf || 0))) best = d;
      });
      const st = this._employeeStats(e.id);
      const activePair = winnerOf(e.id);
      const rested = this.isRested(e.id);
      const holding = this._employeeHolding(e);   // live open position owned by this employee
      const mktClosed = best && best.blockedBy && best.blockedBy.indexOf('ตลาดปิด') >= 0;
      const sig = (best && !mktClosed && !rested) ? best.signal : 'wait';
      const approved = !!(best && best.approved);
      const leaning = (sig === 'buy' || sig === 'sell') && !approved;   // มีสัญญาณแต่ยังไม่ผ่านเกณฑ์ = จ่อ
      const hp = holding ? (holding.profit || 0) : 0;
      const sigCol = holding ? (holding.side === 'buy' ? 'var(--green)' : 'var(--red)')
                   : rested ? '#8a7bb0' : mktClosed ? '#7c8aa5'
                   : leaning ? '#ffc44d'
                   : sig === 'buy' ? 'var(--green)' : sig === 'sell' ? 'var(--red)' : '#778';
      const sigTxt = holding ? `📈 ถือ ${(holding.sym||'').replace(/[^A-Za-z].*$/,'').replace('USD','')} ${holding.side==='buy'?'BUY':'SELL'}`
                   : rested ? '💤 พัก' : mktClosed ? '🌙 ปิด'
                   : leaning ? (sig === 'buy' ? '🔭 จ่อ BUY' : '🔭 จ่อ SELL')
                   : sig === 'buy' ? '▲ BUY' : sig === 'sell' ? '▼ SELL' : '⏸ WAIT';
      // fallback shown only until the sprite half-body loads (then it covers this)
      const head = `<span style="font-size:13px;font-weight:bold;color:${e.face.accColor}">${e.name[0]}</span>`;
      const stCol = st.R > 0 ? 'var(--green)' : st.R < 0 ? 'var(--red)' : '#9aa';
      const ratingStars = st.matched >= 3 ? (st.wr >= 60 ? '⭐⭐⭐' : st.wr >= 45 ? '⭐⭐' : '⭐') : '—';
      const bubble = activePair ? `<div class="twr-bubble" style="background:${sigCol}">${sig==='buy'?'▲ BUY':'▼ SELL'} ${activePair.replace('USD','')}!</div>` : '';
      // why is this employee (not) acting?
      const tdOn = (typeof Settings !== 'undefined') && Settings.get('traderDrivenSignals', false);
      let statusLine = '';
      if (holding) {
        const pc = hp > 0 ? 'var(--green)' : hp < 0 ? 'var(--red)' : '#9aa';
        statusLine = `<div style="font-size:6px;color:${pc};margin-top:3px">💼 ถือไม้อยู่ใน MT5: ${holding.side==='buy'?'BUY':'SELL'} ${(holding.sym||'').replace(/[^A-Za-z].*$/,'')} · P/L <b>${hp>=0?'+':''}$${hp.toFixed(2)}</b></div>`;
      } else if (best && (sig === 'buy' || sig === 'sell')) {
        const p = best.sym.replace('USD','');
        if (best.approved) {
          statusLine = activePair
            ? `<div style="font-size:6px;color:var(--green);margin-top:3px">✅ ผ่านเกณฑ์ + ชนะคู่ ${p} → ${tdOn ? 'ยิงเลย' : '⚠️ เปิด 🎯 หัวหน้าโต๊ะยิงเอง ก่อนถึงจะยิงจริง'}</div>`
            : `<div style="font-size:6px;color:var(--teal);margin-top:3px">✅ ${p} ผ่านเกณฑ์ แต่พนักงานอื่นชนะคู่นี้ (เลือกคนเดียว/คู่)</div>`;
        } else {
          statusLine = `<div style="font-size:6px;color:var(--orange);margin-top:3px">⛔ ${p}: ${best.blockedBy} — ยังไม่ออก</div>`;
        }
      }
      return `<div class="twr-emp${activePair?' active':''}" style="flex:1;min-width:200px;padding:8px;border:1px solid ${rested?'#5b4d80':activePair?sigCol:'var(--border)'};border-radius:6px;background:${rested?'rgba(120,100,180,0.06)':activePair?sigCol+'14':'rgba(255,255,255,0.02)'};position:relative;opacity:${rested?'0.62':'1'};${activePair?`color:${sigCol};`:''}">
        ${rested?'<div style="position:absolute;top:4px;right:6px;font-size:8px;color:#b6a8e0">💤 พัก</div>':''}
        ${bubble}
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="twr-head" style="position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;background:#0b0f1a;border:1px solid ${e.face.accColor}66;border-radius:5px;width:40px;height:46px;flex:none;vertical-align:middle">${head}<img class="twr-ava" data-sc="${(e.sprite&&e.sprite[0])||0}" data-sr="${(e.sprite&&e.sprite[1])||0}" data-half="1" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center top;image-rendering:pixelated;pointer-events:none"></span>
          <div style="line-height:1.25;min-width:0">
            <div style="font-size:10px;color:var(--gold);font-weight:bold">${e.name}${activePair?` <span style="font-size:7px;color:var(--green)">🎯 ${activePair.replace('USD','')}</span>`:''}${!this._BUILTIN_EMP.includes(e.id)?` <span onclick="event.stopPropagation();Company.removeEmployee('${e.id}')" title="ปลด" style="cursor:pointer;color:var(--red);font-size:8px">✕</span>`:''}</div>
            <div style="font-size:6px;color:#9aa">${combo.icon} ${combo.name} · ${combo.agents.map(k=>this._KEYMAP[k]||k).join('+')}</div>
          </div>
          <div style="margin-left:auto;text-align:right;flex:none">
            <div style="font-size:10px;color:${sigCol};font-weight:bold">${sigTxt}${best && sig!=='wait' ? ' ' + best.sym.replace('USD','') : ''}</div>
            <div style="font-size:6px;color:#9aa">${best?best.conf:0}% · G${best?best.grade:'-'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;font-size:6px;border-top:1px dashed #2a3550;padding-top:4px">
          <span style="color:#9aa">ออกซิก <b style="color:#fff">${st.signals}</b></span>
          <span style="color:var(--green)">${st.w}W</span><span style="color:var(--red)">${st.l}L</span>
          <span style="color:var(--teal)">WR ${st.wr}%</span>
          <span style="color:${stCol}">${st.R>0?'+':''}${st.R.toFixed(1)}R</span>
          <span style="margin-left:auto">${ratingStars}</span>
        </div>
        ${statusLine}
        <div style="display:flex;gap:4px;margin-top:5px">
          <button onclick="Company.toggleRest('${e.id}')" class="btn" title="${rested?'ปลุกให้กลับมาทำงาน':'ให้พัก หยุดออกสัญญาณ'}" style="font-size:7px;padding:2px 6px;flex:0 0 auto;border:1px solid ${rested?'var(--green)':'#5b4d80'};color:${rested?'var(--green)':'#b6a8e0'};background:transparent">${rested?'⏰ ปลุก':'💤 พัก'}</button>
          <button onclick="Company.trainEmployee('${e.id}')" class="btn btn-secondary" style="font-size:7px;padding:2px 6px;flex:1">🎓 เทรน</button>
        </div>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:10px">
      <div style="font-size:10px;color:var(--gold);font-weight:bold;margin-bottom:4px">👔 EMPLOYEE BOARD — ${this.EMPLOYEES.length} พนักงาน (1 คอมโบ/คน · แข่งกันออกซิก)
        <button onclick="Company.addCombo()" class="btn btn-secondary" style="font-size:7px;padding:2px 8px;margin-left:4px">+ จ้างพนักงาน/คอมโบใหม่</button>
        <button onclick="Company.restAll()" class="btn" title="ให้พนักงานทุกคนพัก (หยุดออกสัญญาณ)" style="font-size:7px;padding:2px 8px;margin-left:4px;border:1px solid #5b4d80;color:#b6a8e0;background:transparent">💤 พักทั้งหมด</button>
        <button onclick="Company.wakeAll()" class="btn" title="ปลุกพนักงานทุกคนกลับมาทำงาน" style="font-size:7px;padding:2px 8px;margin-left:4px;border:1px solid var(--green);color:var(--green);background:transparent">⏰ ปลุกทั้งหมด</button>
        ${this._loadRested().size ? `<span style="font-size:7px;color:#b6a8e0;margin-left:4px">😴 พักอยู่ ${this._loadRested().size} คน</span>` : ''}
        <button onclick="Company.freshTest()" class="btn" style="font-size:7px;padding:2px 8px;margin-left:4px;background:var(--orange);color:#000">🧹 ล้างผลเทส เริ่มใหม่</button>
      </div>
      ${this._riskPresetBar()}
      ${this._modeBar()}
      ${this._modePerf()}
      <div style="font-size:7px;padding:4px 6px;background:rgba(0,255,200,0.05);border:1px solid var(--teal);border-radius:5px;margin-bottom:6px">🎯 รอบนี้ใครได้คุม: ${wBanner}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${cards}</div>
      <div style="font-size:6px;color:#778;margin-top:4px">⭐ = เรตติ้งจากผลจริง (ต้อง ≥3 ไม้ถึงให้ดาว) · ออกซิก = จำนวนครั้งที่ยิง · W/L/R = ผลที่จับคู่กับไม้จริงได้</div>
    </div>`;
  },

  // Phase D.9: risk-preset selector — one click sets mode + risk + timeframe on the EA.
  // Frequency comes from a shorter TF + shorter cooldown, NOT from lowering the entry
  // quality bar (conf gate stays high) — ไม้ถี่แต่ยังคัดจุดเข้าที่ดี ไม่ใช่ยิงมั่ว.
  _PRESETS: [
    { k:'low',  label:'🟢 เสี่ยงน้อย', sub:'ไม้น้อย·คัดสุด', desc:'H1 · เสี่ยง 1%/ไม้ · เพดาน 3% · R:R 1.8 · conf≥78 · cooldown 60น · 1 ไม้/คู่ — เน้นไม้คุณภาพ เหมาะทุนน้อย/สอบกองทุน' },
    { k:'mid',  label:'🟡 เสี่ยงกลาง', sub:'ปานกลาง',       desc:'M15 · เสี่ยง 1.5%/ไม้ · เพดาน 4% · R:R 1.6 · conf≥72 · cooldown 30น · 2 ไม้/คู่ — สมดุลความถี่กับความเสี่ยง' },
    { k:'high', label:'🔴 เสี่ยงมาก', sub:'ไม้เยอะ·ถี่',     desc:'M5 · เสี่ยง 2%/ไม้ · เพดาน 5% · R:R 1.4 · conf≥70 · cooldown 10น · 2 ไม้/คู่ — ถี่ขึ้นแต่ยังคัด conf สูง (ไม่ยิงมั่ว)' },
  ],
  _riskPresetBar() {
    // Highlight = what the USER picked (Settings) so the click reacts instantly.
    // The EA's actual reported preset is shown separately (it confirms within ~15s).
    const cur = (typeof Settings !== 'undefined' ? Settings.get('riskPreset', 'auto') : 'auto');
    const eaPreset = (typeof BotBridge !== 'undefined' && BotBridge.lastStatus && BotBridge.lastStatus.preset) || null;
    const btns = this._PRESETS.map(p => {
      const on = (cur === p.k);
      const col = p.k==='low'?'#36e08f':p.k==='mid'?'#ffd24d':'#ff6b6b';
      return `<button onclick="Company.setPreset('${p.k}')" title="${p.desc}" class="btn"
        style="font-size:8px;padding:4px 11px;border:1px solid ${on?col:'var(--border)'};border-radius:5px;
               background:${on?col+'26':'transparent'};color:${on?col:'#9aa'};font-weight:${on?'bold':'normal'};line-height:1.25">
        ${p.label}${on?' ●':''}<br><span style="font-size:6px;opacity:.8">${p.sub}</span></button>`;
    }).join('');
    // Confirmation line: green when the EA already runs the picked preset, amber while waiting.
    let liveBits = '';
    if (typeof BotBridge !== 'undefined' && BotBridge.lastStatus && BotBridge.lastStatus.effRisk) {
      const s = BotBridge.lastStatus;
      const synced = (eaPreset === cur);
      liveBits = `<span style="font-size:6px;color:${synced?'#36e08f':'#ffd24d'}">
        ${synced?'✓ EA ตั้งแล้ว':'⏳ รอ EA รับ ('+(eaPreset||'auto')+')'} · ใช้จริง: เสี่ยง ${s.effRisk}%/ไม้ · R:R 1:${s.effRR} · conf≥${s.effConf}</span>`;
    } else {
      liveBits = `<span style="font-size:6px;color:#778">⚠️ ยังไม่เห็นสถานะ EA — ตรวจ Bot Bridge URL / EA online</span>`;
    }
    const autoOn = (cur === 'auto');
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px;margin-bottom:6px;border:1px solid #3a2f55;border-radius:5px;flex-wrap:wrap;background:rgba(120,80,255,.04)">
      <span style="font-size:7px;color:#c9b6ff;font-weight:bold">⚙ ระดับความเสี่ยง:</span>${btns}
      <button onclick="Company.setPreset('auto')" title="กลับไปใช้ค่าใน EA Inputs (ScalpMode) — ไม่บังคับจากเว็บ" class="btn"
        style="font-size:7px;padding:4px 9px;border:1px solid ${autoOn?'var(--teal)':'var(--border)'};color:${autoOn?'var(--teal)':'#889'};background:transparent">⚙ AUTO${autoOn?' ●':''}</button>
      <span style="font-size:6px;color:#778;width:100%;margin-top:2px">เลือกระดับ → EA ปรับ timeframe + ความเสี่ยง + pullback ให้เองใน ~15 วิ (ไม่ต้อง recompile). ${liveBits}</span>
    </div>`;
  },
  setPreset(p) {
    if (typeof BotBridge !== 'undefined' && BotBridge.sendCommand) BotBridge.sendCommand('preset_' + p, { silent: true });
    if (typeof Settings !== 'undefined') Settings.set('riskPreset', p);
    const names = { low:'🟢 เสี่ยงน้อย ไม้น้อย (H1)', mid:'🟡 เสี่ยงกลาง (M15)', high:'🔴 เสี่ยงมาก ไม้ถี่ (M5)', auto:'⚙ AUTO (ตาม EA Inputs)' };
    if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'Preset', `⚙ ตั้งระดับความเสี่ยง → ${names[p]||p} (ส่งคำสั่งไป EA แล้ว)`);
    if (typeof Company !== 'undefined') Company.refresh();   // re-render Employee Board so the highlight updates
  },

  // Phase A: signal-mode selector (sends mode_web/ea/both command to the EA)
  _modeBar() {
    const cur = (typeof BotBridge !== 'undefined' && BotBridge.lastStatus && BotBridge.lastStatus.signalMode)
              || (typeof Settings !== 'undefined' ? Settings.get('signalMode', 'web') : 'web');
    const modes = [
      { k:'web',  label:'🌐 WEB',  desc:'สัญญาณจากเว็บ (agent บนเว็บ → EA)' },
      { k:'ea',   label:'⚡ EA',   desc:'EA คิดเอง (UT-Bot+Divergence) เร็วสุด' },
      { k:'both', label:'🔀 BOTH', desc:'ทั้งเว็บ + EA' },
    ];
    const btns = modes.map(m => {
      const on = (cur === m.k);
      return `<button onclick="Company.setSignalMode('${m.k}')" title="${m.desc}" class="btn"
        style="font-size:8px;padding:3px 10px;border:1px solid ${on?'var(--teal)':'var(--border)'};
               background:${on?'rgba(0,255,200,.15)':'transparent'};color:${on?'var(--teal)':'#9aa'};font-weight:${on?'bold':'normal'}">${m.label}${on?' ●':''}</button>`;
    }).join('');
    const solo = (typeof Settings !== 'undefined') ? Settings.get('soloEmployee', '') : '';
    const soloOn = (solo === 'emp_fs');
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;margin-bottom:6px;border:1px dashed #2a3550;border-radius:5px;flex-wrap:wrap">
      <span style="font-size:7px;color:#9aa">โหมดสัญญาณ:</span>${btns}
      <button onclick="Company.pushCombosToEA({force:true})" title="ส่ง combo คนเก่งสุดต่อคู่ไป EA (Phase C)" class="btn btn-secondary" style="font-size:8px;padding:3px 8px;border-color:var(--purple);color:#a78bfa">🧬 ส่ง combo → EA</button>
      <button onclick="Company.setSoloEmployee('emp_fs')" title="ให้ FirmSniper เป็นคนเดียวที่ยิงสัญญาณ (ปิดพนักงานที่เหลือ) — วินัยสุด เหมาะสอบกองทุน" class="btn"
        style="font-size:8px;padding:3px 9px;border:1px solid ${soloOn?'#36e08f':'var(--border)'};background:${soloOn?'rgba(54,224,143,.15)':'transparent'};color:${soloOn?'#36e08f':'#9aa'};font-weight:${soloOn?'bold':'normal'}">🎯 FirmSniper เดี่ยว${soloOn?' ●':''}</button>
      <span style="font-size:6px;color:#778;margin-left:auto">${soloOn?'🎯 เฉพาะ FirmSniper ยิง — คนอื่นหยุด':'EA mode = EA คิดเอง · 🧬 = อัปเดตสูตรให้ EA'}</span>
    </div>`;
  },
  // Phase A: auto-measure EA-local vs Web from REAL closed trades (no manual watching)
  _modePerf() {
    const trades = (typeof BotBridge !== 'undefined' && BotBridge.allTrades) ? BotBridge.allTrades : [];
    const agg = { local: { n:0, w:0, R:0 }, web: { n:0, w:0, R:0 } };
    trades.forEach(t => {
      if (!t || !t.outcome || t.outcome === 'breakeven') return;
      const isLocal = (t.agent === 'local');
      const k = isLocal ? 'local' : (t.agent && t.agent !== 'ea') ? 'web' : null;
      if (!k) return;
      agg[k].n++; if (t.outcome === 'win') agg[k].w++; agg[k].R += parseFloat(t.rMult) || 0;
    });
    const cell = (label, a, col) => {
      const wr = a.n ? Math.round(a.w / a.n * 100) : 0;
      const rc = a.R > 0 ? 'var(--green)' : a.R < 0 ? 'var(--red)' : '#9aa';
      return `<span style="color:${col}">${label}</span> <b>${a.n}</b> ไม้ · WR <b>${wr}%</b> · <b style="color:${rc}">${a.R>=0?'+':''}${a.R.toFixed(1)}R</b>`;
    };
    const verdict = (agg.local.n >= 5 && agg.web.n >= 5)
      ? (agg.local.R > agg.web.R ? ' → ⚡ EA นำ' : agg.web.R > agg.local.R ? ' → 🌐 Web นำ' : ' → เสมอ')
      : ' (เก็บ ≥5 ไม้/ฝั่ง เพื่อเทียบ)';
    return `<div style="font-size:7px;padding:5px 8px;margin-bottom:6px;border:1px solid var(--purple);border-radius:5px;background:rgba(120,80,255,.05)">
      📊 <b style="color:var(--purple)">วัดผลโหมด</b> (จากไม้จริงที่ปิดแล้ว) — ${cell('⚡ EA-local', agg.local, 'var(--teal)')} &nbsp;|&nbsp; ${cell('🌐 Web', agg.web, 'var(--gold)')}
      <span style="color:#778">${verdict}</span>
    </div>`;
  },
  // Phase C: push each pair's BEST employee's combo to the EA (living roster).
  // The EA then trades that combo locally — so selecting/training/hiring on the
  // web flows straight into what the EA fires.
  // Vetted default per pair = the SAME combo the EA already runs by default,
  // so a push never downgrades the EA — it only changes once an employee has
  // PROVEN (≥5 real trades) a better R.
  // Phase D.6: these MUST match the EA's hardcoded default combos (GetComboKeys):
  //   XAU = elliott/fvg/bollinger (Mina/xau_meanrev) · AUD = utbot/smc/ichimoku
  //   (Trent/aud_trend) · EUR = utbot/rsi/sweep (Willa/eur_trend). If they differ,
  //   EA-local trades get credited to an employee whose combo the EA isn't running.
  //   BlackGlacier (emp_bg) stays on the gold roster as a competing specialist —
  //   it takes over once its KB record beats Mina's (best proven ≥5, via _eaComboFor).
  _DEFAULT_EMP: { XAUUSD: 'emp_mr', AUDUSD: 'emp_rv', EURUSD: 'emp_wv' },  // AUD → Ravi (aud_meanrev=bollinger.smc.rsi) — range-trader beats utbot/ichimoku trend-combo in chop
  // Single source of truth: which combo (and its agent kit) the EA runs for a
  // pair = the best PROVEN employee's combo (≥5 matched trades), else the vetted
  // default. Used by BOTH pushCombosToEA (sends it to the EA) and the live
  // learning loop (credits the SAME agents in the KB) so they can never drift.
  _eaComboFor(sym) {
    const base = (sym || '').replace(/[mczr]$/i, '').toUpperCase();
    const emps = (this.EMPLOYEES || []).filter(e => e.sym === base);
    if (!emps.length) return null;
    let best = null, bestR = -1e9;
    emps.forEach(e => { const st = this._employeeStats(e.id); if (st.matched >= 5 && st.R > bestR) { bestR = st.R; best = e; } });
    const proven = !!best;
    if (!best) best = emps.find(e => e.id === this._DEFAULT_EMP[base]) || emps[0];  // keep vetted default
    const combo = best && this.COMBOS[best.combo];
    if (!combo || !combo.agents) return null;
    return { key: best.combo, name: best.name, empId: best.id, agents: combo.agents.slice(), proven };
  },
  pushCombosToEA(opts = {}) {
    if (typeof BotBridge === 'undefined' || !BotBridge.sendCommand) return;
    if (!this._lastPushedCombos) this._lastPushedCombos = {};
    const lines = [];
    ['XAUUSD', 'AUDUSD', 'EURUSD'].forEach(sym => {
      const sel = this._eaComboFor(sym);
      if (!sel) return;
      const sig = sel.agents.join('.');
      // Dedupe: only queue a combo command when it actually CHANGED. The EA drains
      // one command per ~15s poll, so re-sending identical combos every coach tick
      // floods the queue and starves other commands (preset/mode). (Fix 2026-06-03)
      if (!opts.force && this._lastPushedCombos[sym] === sig) return;
      this._lastPushedCombos[sym] = sig;
      BotBridge.sendCommand('combo_' + sym + '_' + sig, { silent: true });
      lines.push(`${sym.replace('USD', '')}→${sel.name}${sel.proven ? '✓' : '(default)'}`);
    });
    if (lines.length && typeof UI !== 'undefined') UI.addLog?.('CMD', 'Commander', `🧬 ส่ง combo รายคู่ไป EA: ${lines.join(' · ')} (✓=พิสูจน์แล้ว ≥5 ไม้)`);
  },
  setSignalMode(m) {
    if (typeof BotBridge !== 'undefined' && BotBridge.sendCommand) BotBridge.sendCommand('mode_' + m, { silent: true });
    if (typeof Settings !== 'undefined') Settings.set('signalMode', m);
    if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'Mode', `🔀 สลับโหมดสัญญาณ → ${m.toUpperCase()} (ส่งคำสั่งไป EA แล้ว)`);
    if (typeof Company !== 'undefined') Company.refresh();
  },

  // Fire approved per-pair signals to EA (gated behind traderDrivenSignals)
  _lastTraderFire: {},
  traderSignalsTick(goldR, fxR) {
    if (typeof Settings === 'undefined') return;
    if (!Settings.get('traderDrivenSignals', false)) return;
    if (!Settings.get('webAISignalsToEA', false)) return;   // respect master switch
    const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const teamFor = (sym) => sym === 'XAUUSD' ? goldR : sym === 'AUDUSD' ? fxR?.aud : sym === 'EURUSD' ? fxR?.eur : (typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.lastBTC : null);
    const now = Date.now();
    const COOLDOWN = 15 * 60 * 1000;
    // Phase 24: the winning EMPLOYEE (best combo) fires for each pair + audit log
    const winners = this._pairWinners(teamFor, bot);
    this._SYMS.forEach(sym => {
      const d = winners[sym];
      if (!d) return;
      const last = this._lastTraderFire[sym];
      if (last && last.sig === d.signal && (now - last.ts) < COOLDOWN) return;
      this._lastTraderFire[sym] = { sig: d.signal, ts: now };
      this._logSignal(d.emp.id, sym, d.signal, d.grade, d.conf);   // AUDIT
      this._beep(d.signal);                                        // SOUND
      if (typeof BotBridge !== 'undefined' && BotBridge.sendAISignal) {
        BotBridge.sendAISignal(sym, d.signal, d.emp && d.emp.id);
        if (typeof UI !== 'undefined' && UI.addLog)
          UI.addLog('CMD', d.emp.name, `🎯 ${d.emp.name} (${d.combo.name}) ยิง ${d.signal.toUpperCase()} ${sym.replace('USD','')} · Grade ${d.grade} · conf ${d.conf}%`);
      }
    });
  },

  // PHASE 22.4: LIVE SCORECARD — real MT5 trades only (NOT backtest).
  // This is the number that actually matters for judging the strategy.
  liveScorecard() {
    const trades = (typeof BotBridge !== 'undefined' && BotBridge.allTrades) ? BotBridge.allTrades : [];
    const bot = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const bal = bot && typeof bot.balance === 'number' ? bot.balance : null;
    const wrap = (inner) => `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--green);border-radius:6px;background:linear-gradient(90deg,rgba(0,255,65,0.08),transparent)">
      <div style="font-size:10px;color:var(--green);font-weight:bold;margin-bottom:5px">📊 LIVE SCORECARD <span style="font-size:6px;color:#9aa">(เฉพาะไม้จริงใน MT5 · ไม่นับ backtest)</span></div>${inner}</div>`;
    if (!trades.length) {
      return wrap(`<div style="font-size:8px;color:#9aa">— ยังไม่มีไม้ปิดจริง — ${bal!=null?`พอร์ตตอนนี้ <b style="color:var(--gold)">$${bal.toFixed(2)}</b>`:'รอเชื่อม EA'} · เก็บให้ครบ 30-50 ไม้ก่อนตัดสินกลยุทธ์</div>`);
    }
    let w = 0, l = 0, R = 0, net = 0; const bySym = {};
    trades.forEach(t => {
      const win = t.outcome === 'win', loss = t.outcome === 'loss';
      if (win) w++; else if (loss) l++;
      R += parseFloat(t.rMult) || 0; net += parseFloat(t.profit) || 0;
      const s = (t.sym || '').replace(/[mzcr.]+$/i, '').replace('USD', '') || '?';
      if (!bySym[s]) bySym[s] = { w:0, l:0, R:0 };
      if (win) bySym[s].w++; else if (loss) bySym[s].l++;
      bySym[s].R += parseFloat(t.rMult) || 0;
    });
    const tot = w + l, wr = tot ? Math.round(w / tot * 100) : 0;
    const rCol = R > 0 ? 'var(--green)' : R < 0 ? 'var(--red)' : '#9aa';
    const netCol = net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : '#9aa';
    const cell = (lbl, val, col) => `<div style="text-align:center"><div style="font-size:6px;color:#9aa">${lbl}</div><div style="font-size:12px;font-weight:bold;color:${col||'#fff'}">${val}</div></div>`;
    const symRows = Object.keys(bySym).map(s => {
      const b = bySym[s]; const swr = (b.w+b.l)?Math.round(b.w/(b.w+b.l)*100):0;
      const c = b.R>0?'var(--green)':b.R<0?'var(--red)':'#9aa';
      return `<span style="font-size:7px;color:#9aa;margin-right:10px">${s}: <b style="color:${c}">${b.w}W/${b.l}L · ${b.R>0?'+':''}${b.R.toFixed(1)}R</b></span>`;
    }).join('');
    return wrap(`
      <div style="display:flex;gap:14px;align-items:center;justify-content:space-around;margin-bottom:5px">
        ${cell('ไม้จริง', tot, '#fff')}
        ${cell('ชนะ', w, 'var(--green)')}
        ${cell('แพ้', l, 'var(--red)')}
        ${cell('WR', wr+'%', wr>=50?'var(--green)':'var(--orange)')}
        ${cell('รวม R', (R>0?'+':'')+R.toFixed(1), rCol)}
        ${cell('กำไรสุทธิ', (net>0?'+':'')+'$'+net.toFixed(2), netCol)}
        ${bal!=null?cell('พอร์ต', '$'+bal.toFixed(2), 'var(--gold)'):''}
      </div>
      <div style="border-top:1px dashed #2a3550;padding-top:4px">${symRows||''}</div>`);
  },

  renderTraders() {
    const gold = TradingWarRoom?.lastGold;
    const fx   = TradingWarRoom?.lastFX;
    const teamFor = (sym) => sym === 'XAUUSD' ? gold : sym === 'AUDUSD' ? fx?.aud : sym === 'EURUSD' ? fx?.eur : (typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.lastBTC : null);
    const bal = BotBridge?.lastStatus?.balance || Settings.get('accountSize', 30);

    let html = this.liveScorecard() + this._presetBar() + this.renderEmployeeBoard() + this.auditPanel();
    return html;
  },

  _traderSkillCard(t, d, bal) {
    const isPresser = d.approved;
    const sig = t.live.signal;
    const sigCol = sig === 'buy' ? 'var(--green)' : sig === 'sell' ? 'var(--red)' : 'var(--gray)';
    const sigTxt = sig === 'buy' ? '▲ BUY' : sig === 'sell' ? '▼ SELL' : '⏸ WAIT';
    const wr = t.rec.total > 0 ? Math.round(t.rec.w / t.rec.total * 100) : 0;
    const rCol = t.rec.R > 0 ? 'var(--green)' : t.rec.R < 0 ? 'var(--red)' : 'var(--gray)';
    const head = (typeof UI !== 'undefined' && UI.pixelFace) ? UI.pixelFace(t.face, 36)
      : `<div style="width:36px;height:36px;background:${t.face.accColor}33;display:flex;align-items:center;justify-content:center;color:${t.face.accColor};font-weight:bold">${t.name[0]}</div>`;
    // skill bars
    const bars = t.rec.skills.map(s => {
      const bw = Math.max(4, Math.min(100, s.acc));
      const bc = s.t === 0 ? '#444' : s.R > 0 ? 'var(--green)' : 'var(--red)';
      return `<div style="display:flex;align-items:center;gap:4px;margin:2px 0">
        <span style="font-size:6px;color:#9aa;width:34px;flex:none">${s.short}</span>
        <div style="flex:1;height:5px;background:#1a2030;border-radius:3px;overflow:hidden"><div style="height:100%;width:${bw}%;background:${bc}"></div></div>
        <span style="font-size:6px;color:${bc};width:20px;text-align:right;flex:none">${s.t>0?s.acc+'%':'—'}</span>
      </div>`;
    }).join('');
    // Commander approval line (nested-brain status)
    const gradeCol = d.grade==='S+'?'var(--gold)':d.grade==='A'?'var(--green)':d.grade==='B'?'var(--teal)':'#9aa';
    const riskNote = isPresser
      ? `<div style="font-size:6px;color:var(--green);margin-top:4px;border-top:1px dashed var(--green);padding-top:3px">✅ <b>Grade ${d.grade}</b> · Commander อนุมัติ → ยิง · พอร์ต $${bal.toFixed(0)} · ${t.speed}</div>`
      : (d.signal==='buy'||d.signal==='sell')
        ? `<div style="font-size:6px;color:var(--orange);margin-top:4px;border-top:1px dashed #443;padding-top:3px">🔸 Grade <b style="color:${gradeCol}">${d.grade}</b> · Commander ยังไม่อนุมัติ: ${d.blockedBy}</div>`
        : '';
    return `
      <div style="flex:1;min-width:0;padding:8px;border:1px solid ${isPresser?sigCol:'var(--border)'};border-radius:5px;background:${isPresser?sigCol+'14':'rgba(255,255,255,0.02)'};${isPresser?`box-shadow:0 0 8px ${sigCol}55`:''}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="background:#0b0f1a;border:1px solid ${t.face.accColor}66;border-radius:4px;padding:1px">${head}</span>
          <div style="line-height:1.25;min-width:0">
            <div style="font-size:10px;color:var(--gold);font-weight:bold">${t.name}${isPresser?' <span style="font-size:7px;color:var(--green)">🎯</span>':''}</div>
            <div style="font-size:6px;color:#9aa">${t.desc} · ${t.speed}</div>
          </div>
          <div style="margin-left:auto;text-align:right;flex:none">
            <div style="font-size:10px;color:${sigCol};font-weight:bold">${sigTxt}</div>
            <div style="font-size:6px;color:#9aa">${t.live.conf}%</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;font-size:6px;margin-bottom:4px">
          <span style="color:var(--green)">${t.rec.w}W</span>
          <span style="color:var(--red)">${t.rec.l}L</span>
          <span style="color:var(--teal)">WR ${wr}%</span>
          <span style="margin-left:auto;color:${rCol};font-weight:bold">${t.rec.R>0?'+':''}${t.rec.R.toFixed(0)}R</span>
        </div>
        <div style="font-size:6px;color:#778;margin-bottom:2px">ทักษะ (KB acc · R สี)</div>
        ${bars}
        ${riskNote}
      </div>`;
  },

  _secretaryBriefing() {
    const cmd = TradingWarRoom?.lastCmd;
    const bot = BotBridge?.lastStatus;
    const lines = [];
    if (cmd) {
      const g = cmd.gradeInfo?.grade || '?';
      if (cmd.signal === 'buy' || cmd.signal === 'sell') {
        lines.push(`📢 มีสัญญาณ <b style="color:var(--gold)">Grade ${g}</b> — ${cmd.signal.toUpperCase()} ${cmd.sym} @ ${cmd.entry}`);
      } else {
        lines.push(`💤 ยังไม่มี setup ที่ชัดเจน — ทีมกำลังเฝ้าตลาด`);
      }
    }
    if (bot) {
      if (!bot.online) lines.push(`🔴 <b style="color:var(--red)">EA OFFLINE</b> — ตรวจ MT5 ด่วน!`);
      else lines.push(`🟢 EA ONLINE · Balance $${(bot.balance||0).toFixed(2)} · Today P/L $${(bot.todayPnL||0).toFixed(2)}`);
      const risk = parseFloat(bot.portfolioRisk) || 0;
      const maxR = parseFloat(bot.maxPortfolioRisk) || 6;
      if (risk >= maxR) lines.push(`⚠️ <b style="color:var(--red)">Portfolio risk ${risk.toFixed(1)}%</b> ถึงเพดาน — หยุดเปิดไม้ใหม่`);
    } else {
      lines.push(`📭 ยังไม่ได้เชื่อม EA — ตั้ง Bot Bridge URL ใน Settings`);
    }
    return lines.map(l => `<div style="font-size:6px;color:var(--white);padding:2px 0">${l}</div>`).join('');
  },

  _strategyReport() {
    if (typeof AgentScores === 'undefined') return '<div style="font-size:6px;color:var(--gray)">KB ไม่พร้อม</div>';
    const kb = AgentScores.load();
    const live = kb.meta?.liveTrades || 0;
    const bt   = kb.meta?.backtestTrades || 0;
    // stats() returns {total, totalR(string)} — normalize to numbers, ignore tiny samples
    const stats = AgentScores.stats()
      .map(a => ({ name: a.name, R: parseFloat(a.totalR) || 0, t: a.total || 0 }))
      .filter(a => a.t >= 20);
    const sorted = [...stats].sort((a,b) => b.R - a.R);
    const best = sorted.slice(0, 3);
    const worst = sorted.slice(-3).reverse();
    const fmt = a => `${a.name} <b style="color:${a.R>0?'var(--green)':'var(--red)'}">${a.R>0?'+':''}${a.R.toFixed(0)}R</b> (${Math.round(a.t)}t)`;
    const streak = BotBridge?.lossStreak || 0;
    const streakWarn = streak >= 3 ? `<div style="font-size:8px;color:var(--red);background:rgba(255,50,50,0.1);padding:4px 6px;margin-bottom:5px;border-left:2px solid var(--red)">
      ⚠️ แพ้ ${streak} ไม้ติด — ${streak>=5?'🛑 Auto-PAUSED':streak>=4?'🛡 ลด risk อัตโนมัติ':'เฝ้าระวัง'}</div>` : '';
    return `
      ${streakWarn}
      <div style="font-size:8px;color:var(--gray);margin-bottom:5px">📚 KB: ${live} live + ${bt} backtest trades</div>
      <div style="font-size:8px;color:var(--green);margin-bottom:3px">🏆 Top performers:</div>
      ${best.map(a => `<div style="font-size:8px;padding:2px 0">${fmt(a)}</div>`).join('')}
      <div style="font-size:8px;color:var(--red);margin:5px 0 3px">⚠️ Underperformers:</div>
      ${worst.map(a => `<div style="font-size:8px;padding:2px 0">${fmt(a)}</div>`).join('')}
      <div style="margin-top:8px">
        <button class="btn btn-secondary" style="font-size:8px;padding:5px 8px" onclick="Modal.open('journal')">📊 รายงานเต็ม</button>
        <button class="btn btn-secondary" style="font-size:8px;padding:5px 8px" onclick="AgentScores.applyRecommended()">⚡ ปรับกลยุทธ์</button>
      </div>`;
  },

  // Phase 15.5: build human reason from trade entry context
  _tradeReason(t) {
    const parts = [];
    const rsi = parseFloat(t.rsiAtEntry);
    if (isFinite(rsi)) {
      if (rsi <= 35) parts.push(`RSI ${rsi.toFixed(0)} (oversold)`);
      else if (rsi >= 65) parts.push(`RSI ${rsi.toFixed(0)} (overbought)`);
      else parts.push(`RSI ${rsi.toFixed(0)}`);
    }
    const bb = parseFloat(t.bbPosAtEntry);
    if (isFinite(bb)) {
      if (bb <= 0.2) parts.push('แตะ BB ล่าง');
      else if (bb >= 0.8) parts.push('แตะ BB บน');
      else parts.push('กลาง BB');
    }
    if (t.sessionAtEntry && t.sessionAtEntry !== '?') parts.push(t.sessionAtEntry.toUpperCase());
    return parts.join(' · ') || 'ไม่มีข้อมูล';
  },

  _accountantReport() {
    const bot = BotBridge?.lastStatus;
    const live = BotBridge?.liveStats || { count:0, wins:0, losses:0, totalR:0 };
    if (!bot) return '<div style="font-size:9px;color:var(--gray)">รอข้อมูลจาก EA...</div>';
    const wr = (live.wins+live.losses) > 0 ? (live.wins/(live.wins+live.losses)*100).toFixed(0) : '—';
    const pnl = bot.todayPnL || 0;
    const pnlCol = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--gray)';
    const bal = bot.balance || 0;

    // Goal progress $30 → $100
    const goalStart = 30, goalEnd = 100;
    const goalPct = Math.max(0, Math.min(100, ((bal - goalStart) / (goalEnd - goalStart)) * 100));

    // Recent trades with reasons
    const trades = BotBridge?.recentTrades || [];
    const tradeRows = trades.slice(0, 5).map(t => {
      const win = t.outcome === 'win';
      const sideEm = t.side === 'buy' ? '▲' : '▼';
      const rcol = (parseFloat(t.rMult)||0) > 0 ? 'var(--green)' : 'var(--red)';
      const sym3 = (t.sym||'').replace(/[mczr]$/i,'').replace('USD','');
      return `<div style="font-size:7px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span style="color:${t.side==='buy'?'var(--green)':'var(--red)'}">${sideEm} ${sym3}</span>
        <span style="color:${rcol};margin-left:4px">${win?'✅':'❌'} ${(parseFloat(t.rMult)||0)>0?'+':''}${(parseFloat(t.rMult)||0).toFixed(1)}R</span>
        <br><span style="color:var(--gray);font-size:6px">↳ ${this._tradeReason(t)}</span>
      </div>`;
    }).join('') || '<div style="font-size:7px;color:var(--gray)">— ยังไม่มี trade ปิด —</div>';

    return `
      <!-- Key numbers -->
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <div style="flex:1;text-align:center;padding:6px;background:rgba(0,255,255,0.05);border:1px solid var(--teal);border-radius:4px">
          <div style="font-size:6px;color:var(--gray)">BALANCE</div>
          <div style="font-size:13px;color:var(--teal);font-weight:bold">$${bal.toFixed(2)}</div>
        </div>
        <div style="flex:1;text-align:center;padding:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:4px">
          <div style="font-size:6px;color:var(--gray)">TODAY P/L</div>
          <div style="font-size:13px;color:${pnlCol};font-weight:bold">${pnl>0?'+':''}$${pnl.toFixed(2)}</div>
        </div>
      </div>

      <!-- Goal progress -->
      <div style="font-size:7px;color:var(--gray);margin-bottom:2px">🎯 เป้า $30 → $100 (${goalPct.toFixed(0)}%)</div>
      <div style="height:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="height:100%;width:${goalPct}%;background:linear-gradient(90deg,var(--green),var(--gold))"></div>
      </div>

      <!-- Stats grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:8px;margin-bottom:2px">
        <div style="text-align:center"><span style="color:var(--gray);font-size:6px">วันนี้ W/L</span><br><b style="color:var(--gold)">${bot.todayWins||0}/${bot.todayLosses||0}</b></div>
        <div style="text-align:center"><span style="color:var(--gray);font-size:6px">WIN RATE (รวม)</span><br><b style="color:${wr>=55?'var(--green)':'var(--red)'}">${wr}%</b></div>
        <div style="text-align:center"><span style="color:var(--gray);font-size:6px">TOTAL R (รวม)</span><br><b style="color:${live.totalR>0?'var(--green)':'var(--red)'}">${live.totalR>0?'+':''}${live.totalR.toFixed(1)}</b></div>
      </div>
      <div style="font-size:6px;color:var(--gray);text-align:center;margin-bottom:6px">📊 ${live.count} ไม้สะสม (ตั้งแต่เริ่มเชื่อม) · วันนี้นับจาก EA reset เที่ยงคืน</div>

      <!-- Recent trades with reasons -->
      <div style="font-size:7px;color:var(--gold);margin-bottom:2px">📋 Trade ล่าสุด (เข้าเพราะอะไร)</div>
      <div style="max-height:120px;overflow-y:auto">${tradeRows}</div>
    `;
  },

  _devMonitor() {
    const bot = BotBridge?.lastStatus;
    const url = Settings.get('botBridgeURL','');
    const checks = [];
    checks.push({ ok: url.length > 20, label: 'Bot Bridge URL' });
    checks.push({ ok: !!bot, label: 'EA data received' });
    checks.push({ ok: bot?.online, label: 'EA online (<5min)' });
    checks.push({ ok: bot?.prices && Object.keys(bot.prices||{}).length > 0, label: 'Price feed flowing' });
    checks.push({ ok: !bot?.paused, label: 'Trading active (not paused)' });
    return checks.map(c =>
      `<div style="font-size:9px;padding:2px 0;color:${c.ok?'var(--green)':'var(--red)'}">${c.ok?'✅':'❌'} ${c.label}</div>`
    ).join('');
  },

  _claudeAdvisory() {
    // Generate advisory based on KB + live stats
    const live = BotBridge?.liveStats || { count:0, wins:0, losses:0, totalR:0 };
    const notes = [];
    const wr = (live.wins+live.losses) > 0 ? (live.wins/(live.wins+live.losses)*100) : null;
    if (live.count < 10) {
      notes.push('🎓 ข้อมูล live ยังน้อย — ปล่อยให้บอทเทรด + รัน Auto-Optimize เพิ่ม data ก่อนปรับใหญ่');
    } else if (wr !== null && wr < 45) {
      notes.push('⚠️ Live WR < 45% — แนะนำ Pause EA + review กลยุทธ์ผ่าน Strategy Officer ก่อนเทรดต่อ');
    } else if (wr !== null && wr >= 60) {
      notes.push('✅ Live WR ดี (≥60%) — strategy ใช้ได้ พิจารณาเพิ่ม RiskPercent เล็กน้อย (max 2%)');
    }
    if (live.totalR < -5) {
      notes.push('🛑 ขาดทุนสะสม > 5R — Risk Officer ควรลด exposure, CEO พิจารณาหยุดพักทบทวน');
    }
    const bot = BotBridge?.lastStatus;
    if (bot && parseFloat(bot.portfolioRisk) >= parseFloat(bot.maxPortfolioRisk)) {
      notes.push('🛡 Portfolio risk เต็มเพดาน — รอ position เก่าปิดก่อนเปิดใหม่');
    }
    if (notes.length === 0) notes.push('👍 ทุกอย่างปกติ — ระบบทำงานตามแผน ไม่มีคำแนะนำเร่งด่วน');
    return notes.map(n => `<div style="font-size:9px;color:var(--white);padding:3px 0;border-left:2px solid var(--purple);padding-left:8px;margin:3px 0">${n}</div>`).join('');
  },

  // SHELL — built once; contains persistent chat + #company-office (refreshable)
  render() {
    const autoPilot = Settings.get('autoPilot', false);
    const apCol = autoPilot ? 'var(--green)' : 'var(--gray)';
    return `
      <!-- CEO bar + Auto Pilot -->
      <div style="display:flex;align-items:center;gap:12px;padding:14px;background:linear-gradient(135deg,rgba(255,215,0,0.12),transparent);border:2px solid var(--gold);margin-bottom:12px;border-radius:6px">
        <span style="font-size:40px">👔</span>
        <div>
          <div style="font-size:14px;color:var(--gold);font-weight:bold">CEO — คุณ</div>
          <div style="font-size:9px;color:var(--gray);margin-top:2px">Human-in-the-loop · ตั้ง risk limits</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <button id="company-ap-btn" class="btn" style="font-size:10px;padding:8px 14px;background:${autoPilot?'var(--green)':'#333'};color:${autoPilot?'#000':'#aaa'};border:2px solid ${apCol};font-weight:bold" onclick="Company.setAutoPilot(!Settings.get('autoPilot',false))">
            🤖 AUTO PILOT: ${autoPilot ? 'ON' : 'OFF'}
          </button>
          <button class="btn" style="font-size:10px;padding:8px 14px;background:var(--red);color:#fff;border:none" onclick="BotBridge.sendCommand('close_all')">🔴 Close All</button>
          <button class="btn" style="font-size:10px;padding:8px 14px;background:var(--orange);color:#000;border:none" onclick="BotBridge.sendCommand('pause')">⏸ Pause</button>
        </div>
      </div>

      <!-- 2-column: left = office (refreshable), right = secretary chat (persistent) -->
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px">
        <div>
          <div id="twr-floor"></div>
          <div id="company-office">${this.renderOffice()}</div>
        </div>

        <!-- RIGHT: Secretary chat — NEVER re-rendered (input stays) -->
        <div style="display:flex;flex-direction:column;border:2px solid var(--teal);border-radius:6px;background:rgba(0,255,255,0.03);height:540px">
          <div style="padding:10px;border-bottom:1px solid var(--teal);display:flex;align-items:center;gap:8px">
            <span style="font-size:24px">📋</span>
            <div>
              <div style="font-size:11px;color:var(--teal);font-weight:bold">เลขา Janie</div>
              <div style="font-size:8px;color:var(--gray)">Secretary · ประสานงานทุกแผนก</div>
            </div>
            <span style="margin-left:auto;font-size:8px;color:var(--green)">🟢 พร้อมคุย</span>
          </div>
          <div id="sec-chat-log" style="flex:1;overflow-y:auto;padding:10px"></div>
          <div style="padding:8px;border-top:1px solid var(--teal)">
            <div style="display:flex;gap:6px">
              <input id="sec-chat-input" type="text" placeholder="ถามเลขา / สั่งงาน..." autocomplete="off"
                style="flex:1;background:var(--bg-card);border:1px solid var(--border);color:var(--white);padding:8px;font-size:11px;font-family:inherit"
                onkeydown="Company._onChatKey(event)">
              <button class="btn btn-primary" style="font-size:10px;padding:8px 14px" onclick="Company.sendChat()">ส่ง</button>
            </div>
            <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
              ${['สถานะ','กำไร','ใครเก่งสุด','ทำไมไม่เทรด','สัญญาณ','risk','autopilot','ช่วย'].map(s =>
                `<button class="btn btn-secondary" style="font-size:8px;padding:3px 6px" onclick="Company.askSecretary('${s}')">${s}</button>`
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // OFFICE — data panels, safe to re-render every tick (no chat input here)
  // Phase 26.4: live pixel room — each agent sits at a desk on the room art,
  // with a status bubble that colours by confidence (≥90% = COMBO glow).
  ROOM_POS: {
    emp_mr: { x:16, y:62 }, emp_sm: { x:38, y:74 }, emp_tr: { x:55, y:54 },
    emp_rv: { x:69, y:40 }, emp_wv: { x:82, y:50 }, emp_bo: { x:90, y:63 },
    emp_cl: { x:47, y:88 }, emp_fs: { x:28, y:90 }, emp_bg: { x:24, y:46 }, emp_bt: { x:62, y:88 },
  },
  // Static floor scene — figs built ONCE (stable ids); a separate loop walks
  // them + updates their signal bubble so positions persist across re-renders.
  floorSceneHTML() {
    const figs = this.EMPLOYEES.map(e => {
      const pos = this.ROOM_POS[e.id] || { x:50, y:50 };
      return `<div id="twrfig-${e.id}" class="twr-fig" data-x="${pos.x}" data-y="${pos.y}"
          style="position:absolute;left:${pos.x}%;top:${pos.y}%;transform:translate(-50%,-100%);z-index:${Math.round(pos.y)+5};width:84px;text-align:center;pointer-events:none;transition:left 2.6s linear, top 2.6s linear">
        <div class="twr-bubble-slot" style="min-height:11px"></div>
        <img class="twr-ava" data-sc="${(e.sprite&&e.sprite[0])||0}" data-sr="${(e.sprite&&e.sprite[1])||0}" style="height:62px;image-rendering:pixelated;display:block;margin:1px auto 0;filter:drop-shadow(0 3px 4px rgba(0,0,0,.7));transition:transform .25s">
        <div style="font-size:7px;font-weight:bold;color:${e.face.accColor};text-shadow:0 1px 2px #000">${e.name}</div>
      </div>`;
    }).join('');
    return `<div id="twr-floor-scene" style="position:relative;width:100%;max-width:940px;margin:0 auto 12px;border-radius:8px;overflow:hidden;border:1px solid var(--border);box-shadow:0 6px 20px rgba(0,0,0,.55)">
      <img src="assets/room-bg.png?v=55" style="width:100%;display:block;image-rendering:pixelated">
      <div style="position:absolute;left:12px;top:8px;font-size:11px;color:#9ec5ff;font-weight:bold;text-shadow:0 1px 4px #000">🏢 ALPHA TRADERS — Live Floor</div>
      ${figs}
    </div>`;
  },
  // Mount the floor once into #twr-floor, then keep walk + status loops alive.
  mountFloor() {
    const host = document.getElementById('twr-floor');
    if (!host) return;
    if (!document.getElementById('twr-floor-scene')) {
      host.innerHTML = this.floorSceneHTML();
      if (typeof SpriteSlicer !== 'undefined') SpriteSlicer.fillAvatars();
    }
    this._floorStatusTick();
    if (!this._roamTimer)     this._roamTimer     = setInterval(() => this._roamTick(), 2800);
    if (!this._floorStatTimer) this._floorStatTimer = setInterval(() => this._floorStatusTick(), 2500);
  },
  // Random wander across the wooden floor (each tick ~half the team moves).
  _roamTick() {
    if (!document.getElementById('twr-floor-scene')) return;
    this.EMPLOYEES.forEach(e => {
      if (Math.random() > 0.5) return;
      const fig = document.getElementById('twrfig-' + e.id); if (!fig) return;
      const nx = 14 + Math.random() * 74;   // 14–88%  (floor width)
      const ny = 58 + Math.random() * 32;   // 58–90%  (wooden floor only)
      const cx = parseFloat(fig.dataset.x) || 50;
      const img = fig.querySelector('.twr-ava');
      if (img) img.style.transform = (nx < cx) ? 'scaleX(-1)' : 'scaleX(1)';
      fig.dataset.x = nx.toFixed(1); fig.dataset.y = ny.toFixed(1);
      fig.style.left = nx + '%'; fig.style.top = ny + '%';
      fig.style.zIndex = Math.round(ny) + 5;
    });
  },
  // Update each fig's signal bubble in place (no element recreation = no flicker).
  _floorStatusTick() {
    if (!document.getElementById('twr-floor-scene')) return;
    const gold = TradingWarRoom?.lastGold, fx = TradingWarRoom?.lastFX;
    const bot  = (typeof BotBridge !== 'undefined') ? BotBridge.lastStatus : null;
    const teamFor = (s) => s === 'XAUUSD' ? gold : s === 'AUDUSD' ? (fx && fx.aud) : s === 'EURUSD' ? (fx && fx.eur) : (typeof TradingWarRoom !== 'undefined' ? TradingWarRoom.lastBTC : null);
    this.EMPLOYEES.forEach(e => {
      const fig = document.getElementById('twrfig-' + e.id); if (!fig) return;
      const slot = fig.querySelector('.twr-bubble-slot'); if (!slot) return;
      let sig = 'wait', conf = 0;
      try {
        if (e.sym) { const d = this._empDecision(e, e.sym, teamFor(e.sym), bot); sig = d.signal; conf = d.conf || 0; }
        else this._SYMS.forEach(s => { const d = this._empDecision(e, s, teamFor(s), bot); if ((d.conf||0) > conf) { conf = d.conf||0; sig = d.signal; } });
      } catch (_) {}
      const active = (sig === 'buy' || sig === 'sell');
      const isCombo = conf >= 90 && active;
      const bg = isCombo ? (sig === 'buy' ? '#00ffae' : '#ff4d6d') : `hsl(${Math.min(120, conf*1.2)} 85% 55%)`;
      const dir = sig === 'buy' ? 'BUY' : sig === 'sell' ? 'SELL' : '···';
      slot.innerHTML = active
        ? `<div style="display:inline-block;font-size:7px;font-weight:bold;padding:1px 5px;border-radius:6px 6px 6px 0;color:#04140d;background:${bg};white-space:nowrap;${isCombo?'box-shadow:0 0 10px '+bg+';animation:twrPulse 0.9s ease-in-out infinite':''}">${isCombo?'⚡':''}${dir} ${conf}%</div>`
        : '';
    });
  },

  renderOffice() {
    const gold = TradingWarRoom?.lastGold;
    const fx   = TradingWarRoom?.lastFX;
    const autoPilot = Settings.get('autoPilot', false);
    return `
      ${autoPilot ? `<div style="padding:8px 12px;background:rgba(0,255,65,0.1);border:1px solid var(--green);margin-bottom:10px;font-size:9px;color:var(--green)">
        🤖 <b>AUTO PILOT ON</b> — ทีมตัดสินใจเอง 100% · Grade A+ → EA ทันที
      </div>` : ''}
      ${typeof Portfolios !== 'undefined' ? Portfolios.render() : ''}
      <div style="font-size:11px;color:var(--gold);margin-bottom:6px;font-weight:bold">📈 TRADE DESK — 6 Traders (2 ต่อคู่ · คนละเทคนิค)</div>
      <div style="margin-bottom:12px">
        ${this.renderTraders()}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="padding:10px;border:1px solid var(--purple);background:rgba(120,80,255,0.05);border-radius:4px">
          <div style="font-size:10px;color:var(--purple);margin-bottom:6px;font-weight:bold">🧠 Strategy Officer</div>
          ${this._strategyReport()}
        </div>
        <div style="padding:10px;border:1px solid var(--green);background:rgba(0,255,65,0.05);border-radius:4px">
          <div style="font-size:10px;color:var(--green);margin-bottom:6px;font-weight:bold">📊 Accountant</div>
          ${this._accountantReport()}
        </div>
        <div style="padding:10px;border:1px solid var(--orange);background:rgba(255,140,0,0.05);border-radius:4px">
          <div style="font-size:10px;color:var(--orange);margin-bottom:6px;font-weight:bold">💻 Dev Monitor</div>
          ${this._devMonitor()}
        </div>
        <div style="padding:10px;border:1px solid #a78bfa;background:rgba(167,139,250,0.08);border-radius:4px">
          <div style="font-size:10px;color:#a78bfa;margin-bottom:6px;font-weight:bold">🤖 Claude — Board Advisor</div>
          ${this._claudeAdvisory()}
        </div>
      </div>

      <!-- Phase 16: Performance Analytics (toggleable) -->
      ${this._performancePanel()}
    `;
  },
};
window.Company = Company;

/* ═══════════════════════════════════════════════════════
   PHASE 21: PORTFOLIO MANAGER — รับดูแลหลายพอร์ต (สูงสุด 5)
   ═══════════════════════════════════════════════════════ */
const Portfolios = {
  MAX: 5,
  load() {
    let arr = (typeof Settings !== 'undefined') ? Settings.get('portfolios', null) : null;
    if (!Array.isArray(arr) || arr.length === 0) {
      arr = [{ id:'p1', name:'พอร์ตหลัก (คุณ)', client:'ตัวเอง', start:30, target:100,
               bridgeURL: (typeof Settings!=='undefined'? Settings.get('botBridgeURL','') : ''), active:true }];
      if (typeof Settings !== 'undefined') Settings.set('portfolios', arr);
    }
    return arr;
  },
  save(arr) { if (typeof Settings !== 'undefined') Settings.set('portfolios', arr); },
  active() { const a = this.load(); return a.find(p => p.active) || a[0]; },

  // Phase 21: poll EVERY portfolio's bridge so all show live (not just active)
  _live: {},      // id -> { balance, equity, online, ageSec, pnl, pos }
  _timer: null,
  async pollAll() {
    const a = this.load();
    await Promise.all(a.map(async p => {
      if (!p.bridgeURL || p.bridgeURL.length < 20) return;
      try {
        const r = await fetch(p.bridgeURL + '?action=status&t=' + Date.now());
        const d = await r.json();
        if (d.ok && d.status) {
          this._live[p.id] = {
            balance: d.status.balance, equity: d.status.equity,
            online: d.status.online, ageSec: d.status.ageSec,
            pnl: d.status.todayPnL, pos: (d.status.positions || []).length,
          };
        }
      } catch (e) { /* silent — offline portfolio */ }
    }));
    // refresh panel if Company modal is open
    if (typeof Company !== 'undefined' && document.getElementById('company-office')) {
      const el = document.getElementById('company-office');
      if (el) el.innerHTML = Company.renderOffice();
    }
  },
  startPolling() {
    if (this._timer) return;
    this.pollAll();
    this._timer = setInterval(() => this.pollAll(), 30000);
  },
  setActive(id) {
    const a = this.load();
    a.forEach(p => p.active = (p.id === id));
    this.save(a);
    const act = a.find(p => p.active);
    if (act && typeof Settings !== 'undefined') {
      Settings.set('botBridgeURL', act.bridgeURL || '');
      if (typeof BotBridge !== 'undefined') { BotBridge.lastStatus = null; try { BotBridge.tick(); } catch {} }
    }
    if (typeof Company !== 'undefined') Company.refresh();
  },
  add() {
    const a = this.load();
    if (a.length >= this.MAX) { alert('⚠️ รับดูแลได้สูงสุด ' + this.MAX + ' พอร์ต'); return; }
    const name = prompt('ชื่อพอร์ต / ชื่อลูกค้า:');
    if (!name) return;
    const start  = parseFloat(prompt('เงินต้นในพอร์ต ($):', '30')) || 30;
    const target = parseFloat(prompt('เป้าหมาย ($):', String(Math.round(start * 3)))) || start * 3;
    const url    = prompt('Bot Bridge URL (Apps Script /exec) ของพอร์ตนี้ — เว้นว่างได้:', '') || '';
    a.push({ id:'p'+Date.now(), name, client:name, start, target, bridgeURL:url, active:false });
    this.save(a);
    if (typeof Company !== 'undefined') Company.refresh();
  },
  // Phase 26: set / change a portfolio's bridge URL (was only settable on add)
  editURL(id) {
    const a = this.load();
    const p = a.find(x => x.id === id); if (!p) return;
    const cur = p.bridgeURL || ((typeof Settings !== 'undefined') ? Settings.get('botBridgeURL', '') : '');
    const url = prompt('Bot Bridge URL (Apps Script /exec) ของพอร์ต "' + p.name + '":', cur);
    if (url === null) return;
    p.bridgeURL = url.trim();
    this.save(a);
    if (p.active && typeof Settings !== 'undefined') {
      Settings.set('botBridgeURL', p.bridgeURL);
      if (typeof BotBridge !== 'undefined') { BotBridge.lastStatus = null; try { BotBridge.tick(); } catch {} }
    }
    this.pollAll();
    if (typeof Company !== 'undefined') Company.refresh();
  },
  remove(id) {
    let a = this.load();
    if (a.length <= 1) { alert('ต้องมีอย่างน้อย 1 พอร์ต'); return; }
    if (!confirm('ลบพอร์ตนี้ออกจากการดูแล?')) return;
    const wasActive = a.find(p => p.id === id)?.active;
    a = a.filter(p => p.id !== id);
    if (wasActive && a.length) a[0].active = true;
    this.save(a);
    this.setActive(a.find(p => p.active)?.id || a[0].id);
  },
  render() {
    const a = this.load();
    if (typeof this.startPolling === 'function') this.startPolling();
    const chips = a.map(p => {
      const lv = this._live[p.id];
      const hasLive = lv && typeof lv.balance === 'number';
      const bal = hasLive ? lv.balance : p.start;
      const online = hasLive ? lv.online : false;
      const pct = Math.max(0, Math.min(100, ((bal - p.start) / Math.max(1, p.target - p.start)) * 100));
      const onTrack = bal >= p.start;
      const dot = !p.bridgeURL ? '⚪' : online ? '🟢' : '🔴';
      const pnlTxt = hasLive ? ` · วันนี้ ${lv.pnl>=0?'+':''}$${(lv.pnl||0).toFixed(2)} · ${lv.pos||0} ไม้` : (p.bridgeURL ? ' · offline' : ' · ยังไม่ใส่ URL');
      return `<div style="flex:1;min-width:140px;padding:7px 9px;border:1px solid ${p.active?'var(--teal)':'var(--border)'};border-radius:6px;background:${p.active?'rgba(0,255,200,0.07)':'rgba(255,255,255,0.02)'};position:relative">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:9px;color:${p.active?'var(--teal)':'#9aa'};font-weight:bold">${dot} ${p.name}</span>
          <span onclick="event.stopPropagation();Portfolios.editURL('${p.id}')" title="ใส่/แก้ Bridge URL" style="margin-left:auto;cursor:pointer;color:var(--teal);font-size:9px">✎</span>
          ${a.length>1?`<span onclick="event.stopPropagation();Portfolios.remove('${p.id}')" title="ลบ" style="margin-left:6px;cursor:pointer;color:var(--red);font-size:9px">✕</span>`:''}
        </div>
        <div style="font-size:7px;color:#9aa;margin:2px 0">$${bal.toFixed(2)} / 🎯 $${p.target}${pnlTxt}</div>
        <div style="height:5px;background:#1a2030;border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${onTrack?'linear-gradient(90deg,var(--green),var(--gold))':'var(--red)'}"></div></div>
        ${!p.active?`<button onclick="Portfolios.setActive('${p.id}')" class="btn btn-secondary" style="font-size:7px;padding:2px 6px;margin-top:4px;width:100%">เลือกควบคุมพอร์ตนี้</button>`:'<div style="font-size:6px;color:var(--teal);margin-top:4px;text-align:center">● ควบคุมอยู่ (ส่งคำสั่งได้)</div>'}
      </div>`;
    }).join('');
    return `<div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--gold);font-weight:bold;margin-bottom:6px">💼 พอร์ตที่รับดูแล (${a.length}/${this.MAX})
        ${a.length < this.MAX ? `<button onclick="Portfolios.add()" class="btn btn-secondary" style="font-size:7px;padding:2px 8px;margin-left:6px">+ เพิ่มพอร์ต</button>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${chips}</div>
      <div style="font-size:6px;color:#778;margin-top:4px">หมายเหตุ: แต่ละพอร์ต = บัญชี MT5 + Bridge URL ของตัวเอง · ระบบดึงสถานะ <b>ทุกพอร์ตพร้อมกัน</b> ทุก 30 วิ (🟢=online) · พอร์ตที่ "ควบคุมอยู่" คือพอร์ตที่รับคำสั่ง/สัญญาณ AI</div>
    </div>`;
  },
};
window.Portfolios = Portfolios;

/* ═══════════════════════════════════════════════════════
   TOP-DOWN ANALYZER — เทรดเดอร์ตัวจริงคิดยังไง
     1. HTF Bias        → ทิศหลัก (Daily/4h)
     2. MTF Structure   → อยู่ที่ระดับสำคัญไหม (4h/1h)
     3. LTF Trigger     → setup ใน LTF (1h/15min)
     4. Conflict        → trend vs reversal ขัดกันไหม
     5. Verdict         → GO / WAIT / SKIP + เหตุผล
   ═══════════════════════════════════════════════════════ */
const TopDownAnalyzer = {
  /** TF stack ที่จะใช้ตาม trade mode */
  TF_STACKS: {
    scalp:    { htf: '1h',   mtf: '15min', ltf: '5min',  label: '1h→15m→5m' },
    swing:    { htf: '4h',   mtf: '1h',    ltf: '15min', label: '4h→1h→15m' },
    position: { htf: '1day', mtf: '4h',    ltf: '1h',    label: 'D→4h→1h' },
  },

  /** กลุ่มของ agent ตามบทบาท */
  TREND_AGENTS:    ['mtf', 'elliott'],
  STRUCTURE_AGENTS:['smc', 'fib', 'pivot'],
  REVERSAL_AGENTS: ['divergence', 'pattern'],
  MOMENTUM_AGENTS: ['macd', 'rsi'],

  /** Run full top-down analysis */
  analyze(symbol, mode, agents, market, signal) {
    const stack = this.TF_STACKS[mode] || this.TF_STACKS.swing;
    const mtfData = market.getMTF ? market.getMTF(symbol) : {};

    // STEP 1: HTF Bias
    const htf = mtfData[stack.htf];
    const mtf = mtfData[stack.mtf];
    const ltf = mtfData[stack.ltf];
    const biasHTF = htf?.trend || '?';
    const biasMTF = mtf?.trend || '?';
    const biasLTF = ltf?.trend || '?';
    const biases = [biasHTF, biasMTF, biasLTF].filter(b => b === 'bull' || b === 'bear');
    const allBull = biases.length >= 2 && biases.every(b => b === 'bull');
    const allBear = biases.length >= 2 && biases.every(b => b === 'bear');
    const aligned = allBull || allBear;
    const dominantBias = allBull ? 'bull' : allBear ? 'bear' : 'mixed';

    // STEP 2: Structure check (where are we?)
    const structureSignals = this.STRUCTURE_AGENTS.map(k => agents[k]?.signal).filter(Boolean);
    const structureSupport = structureSignals.filter(s => s === signal).length;
    const structureDissent = structureSignals.filter(s => s === (signal === 'buy' ? 'sell' : 'buy')).length;

    // STEP 3: LTF Trigger
    const reversalSignals = this.REVERSAL_AGENTS.map(k => agents[k]?.signal).filter(Boolean);
    const triggerForSignal = reversalSignals.includes(signal);
    const reversalAgainst = reversalSignals.filter(s => s === (signal === 'buy' ? 'sell' : 'buy'));

    // STEP 4: Conflict — Trend says X, Reversal says Y
    const trendSignals = this.TREND_AGENTS.map(k => agents[k]?.signal).filter(Boolean);
    const trendAgree   = trendSignals.filter(s => s === signal).length;
    const trendDissent = trendSignals.filter(s => s === (signal === 'buy' ? 'sell' : 'buy')).length;

    const conflicts = [];
    if (signal === 'buy' && reversalAgainst.length > 0 && trendAgree > 0)
      conflicts.push(`📈 Trend ขึ้น แต่ ${reversalAgainst.length} reversal agents เตือนกลับตัว`);
    if (signal === 'sell' && reversalAgainst.length > 0 && trendAgree > 0)
      conflicts.push(`📉 Trend ลง แต่ ${reversalAgainst.length} reversal agents เตือนกลับตัว`);
    // HTF bias conflict (bull bias + sell signal OR bear bias + buy signal)
    const htfConflict = (signal === 'buy' && biasHTF === 'bear') || (signal === 'sell' && biasHTF === 'bull');
    if (htfConflict)
      conflicts.push(`⚠️ ${stack.htf} bias ${biasHTF.toUpperCase()} สวนกับ signal ${signal.toUpperCase()}`);

    // STEP 5: Verdict + Narrative
    // แปลง bias (bull/bear) ให้ match กับ signal (buy/sell)
    const biasMatch = (bias, sig) =>
      (bias === 'bull' && sig === 'buy') ||
      (bias === 'bear' && sig === 'sell') ||
      !bias || bias === 'unknown';

    let verdict, score, narrative;
    const htfMatch = biasMatch(biasHTF, signal);

    // Also fix conflict detection
    if (!biasMatch(biasHTF, signal) && biasHTF !== 'unknown' && biasHTF && signal !== 'wait') {
      // Already added to conflicts above — fix that check too
    }

    if (!htfMatch) {
      verdict = '🔴 SKIP';
      score = 'D';
      narrative = `HTF (${stack.htf}) trend = ${biasHTF.toUpperCase()} แต่จะ ${signal.toUpperCase()} = สวนทาง. อย่าเทรดสวน HTF.`;
    } else if (conflicts.length >= 2) {
      verdict = '🟠 WAIT';
      score = 'C';
      narrative = `เจอ conflict ${conflicts.length} จุด — รอ confirmation ก่อน`;
    } else if (aligned && structureSupport >= 1 && triggerForSignal) {
      verdict = '🟢 STRONG GO';
      score = 'A';
      narrative = `${dominantBias.toUpperCase()} aligned ทั้ง ${stack.htf}+${stack.mtf}+${stack.ltf} + structure support + LTF trigger ครบ — textbook setup`;
    } else if (aligned && (structureSupport >= 1 || triggerForSignal)) {
      verdict = '🟢 GO';
      score = 'B';
      narrative = `${dominantBias.toUpperCase()} aligned + ${structureSupport >= 1 ? 'structure' : 'trigger'} support — setup ดี`;
    } else if (htfMatch && triggerForSignal) {
      verdict = '🟡 SMALL GO';
      score = 'C';
      narrative = `HTF support แต่ MTF/LTF ยังไม่ align — เข้า size ครึ่ง`;
    } else {
      verdict = '🟠 WAIT';
      score = 'C';
      narrative = `ยังไม่ครบเงื่อนไข — ดู structure/trigger ก่อน`;
    }

    return {
      stack: stack.label,
      bias: { htf: biasHTF, mtf: biasMTF, ltf: biasLTF, aligned, dominant: dominantBias },
      structure: { support: structureSupport, dissent: structureDissent, total: structureSignals.length },
      trigger: { for: triggerForSignal, against: reversalAgainst.length },
      conflicts,
      verdict,
      score,
      narrative,
      htfTF: stack.htf, mtfTF: stack.mtf, ltfTF: stack.ltf,
    };
  },

  /** Render Setup Analysis panel */
  render(td, signal) {
    if (!td) return '';
    const arrow = (b) => b === 'bull' ? '🟢 ↑' : b === 'bear' ? '🔴 ↓' : '⚪ —';
    const sigEmoji = signal === 'buy' ? '▲' : signal === 'sell' ? '▼' : '⏸';
    const vColor = td.verdict.includes('STRONG') || td.verdict.includes('GO') ? 'var(--green)'
                 : td.verdict.includes('WAIT') ? 'var(--yellow)'
                 : td.verdict.includes('SMALL') ? 'var(--orange)'
                 : 'var(--red)';

    return `
      <div style="margin-top:8px;background:var(--bg-dark);border:2px solid ${vColor};padding:8px 10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:8px;color:var(--gold)">📊 TOP-DOWN ANALYSIS (${td.stack})</span>
          <span style="font-size:10px;color:${vColor};font-weight:bold">${td.verdict}</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:7px;margin-bottom:6px">
          <div style="text-align:center;padding:4px;background:var(--bg-card);border:1px solid var(--border)">
            <div style="color:var(--gold)">${td.htfTF.toUpperCase()} (Bias)</div>
            <div style="font-size:10px;margin-top:2px">${arrow(td.bias.htf)}</div>
          </div>
          <div style="text-align:center;padding:4px;background:var(--bg-card);border:1px solid var(--border)">
            <div style="color:var(--teal)">${td.mtfTF.toUpperCase()} (Structure)</div>
            <div style="font-size:10px;margin-top:2px">${arrow(td.bias.mtf)}</div>
          </div>
          <div style="text-align:center;padding:4px;background:var(--bg-card);border:1px solid var(--border)">
            <div style="color:var(--purple)">${td.ltfTF.toUpperCase()} (Trigger)</div>
            <div style="font-size:10px;margin-top:2px">${arrow(td.bias.ltf)}</div>
          </div>
        </div>

        <div class="trade-params" style="font-size:6px">
          <div class="row"><span class="lbl">Structure agents</span><span class="val ${td.structure.support > td.structure.dissent ? 'up' : 'dn'}">${td.structure.support}/${td.structure.total} support ${sigEmoji}</span></div>
          <div class="row"><span class="lbl">Reversal trigger</span><span class="val ${td.trigger.for ? 'up' : 'warn'}">${td.trigger.for ? '✓ มี' : '○ ยังไม่มี'} ${td.trigger.against > 0 ? '(⚠️ ' + td.trigger.against + ' เตือนกลับตัว)' : ''}</span></div>
          <div class="row"><span class="lbl">MTF aligned</span><span class="val ${td.bias.aligned ? 'up' : 'warn'}">${td.bias.aligned ? '✅ ครบทุก TF' : '⚠️ Mixed'}</span></div>
        </div>

        ${td.conflicts.length > 0 ? `
        <div style="margin-top:6px;padding:4px 6px;background:rgba(255,140,0,0.1);border-left:2px solid var(--orange);font-size:6px;color:var(--orange)">
          ${td.conflicts.map(c => `⚠️ ${c}`).join('<br>')}
        </div>` : ''}

        <div style="margin-top:6px;padding:4px 6px;background:rgba(157,78,221,0.1);border-left:2px solid var(--purple);font-size:7px;color:var(--white);font-style:italic">
          💬 "${td.narrative}"
        </div>
      </div>
    `;
  },
};
window.TopDownAnalyzer = TopDownAnalyzer;

window.KeepAlive    = KeepAlive;
window.SignalGrade  = SignalGrade;
window.Settings     = Settings;
window.Telegram     = Telegram;
window.Modal        = Modal;
window.Journal      = Journal;
window.AgentScores  = AgentScores;
