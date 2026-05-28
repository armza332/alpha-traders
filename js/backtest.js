/* ═══════════════════════════════════════════════════════
   BACKTEST ENGINE
     - รัน strategy บน historical candles
     - เปิด trade เมื่อมี signal Grade B+
     - Walk-forward จนกว่า SL หรือ TP จะแตะก่อน
     - คำนวณ win rate, total R, max drawdown, equity curve
   ═══════════════════════════════════════════════════════ */

const Backtest = {
  running: false,
  lastResult: null,

  /** TF ที่เหมาะกับแต่ละ mode (default mapping) */
  TF_FOR_MODE: {
    scalp:    '5min',
    swing:    '1h',
    position: '4h',
  },

  /** Run backtest on given symbol */
  async run(symbol = 'XAUUSD', opts = {}) {
    if (this.running) return { error: 'Backtest กำลังทำงานอยู่' };
    this.running = true;

    try {
      const market = TradingWarRoom.market;
      const mode = opts.mode || Settings.get('tradeMode', 'swing');
      // ถ้า user ไม่ระบุ interval → ใช้ default ตาม mode
      const interval = opts.interval || this.TF_FOR_MODE[mode] || '5min';

      // ดึง history ของ TF นี้
      const apiKey = Settings.get('priceApiKey');
      let candles = null;

      if (apiKey) {
        // Try fetch fresh (with cache)
        candles = await market.fetchHistory(symbol, interval, 500, apiKey);
      }

      // Fallback to simulator candles if no real history
      if (!candles || candles.length < 100) {
        candles = market.candles[symbol];
      }

      if (!candles || candles.length < 150) {
        return { error: 'ต้องมีอย่างน้อย 150 candles — เปิด "ดึงราคาจริง" + รอโหลด history ก่อน' };
      }

      const cfg = market.symbols[symbol];
      const minConf = opts.minConf || 60;
      const minGradeOrder = ['D','C','B','A','S+'];
      const minGradeIdx = minGradeOrder.indexOf(opts.minGrade || 'B');

      // Temp team instance — ปิด MTF (ไม่มี historical MTF data)
      const wasMTF = Settings.get('enableMTF', true);
      Settings.set('enableMTF', false);
      const team = (symbol === 'XAUUSD') ? new GoldTeam() : null;
      let pairTeam = null;
      if (!team) {
        // For forex, create a single-pair analyzer
        // Phase 14.4 fix: include ALL agents that XAU GoldTeam has (except MTF — needs market.candles)
        const newsPairs = symbol === 'AUDUSD' ? ['AUD','USD'] : ['EUR','USD'];
        pairTeam = {
          head:       new HeadAgent('BT', symbol, symbol),
          smc:        new SMCAgent(symbol),
          elliott:    new ElliottWaveAgent(symbol),
          fib:        new FibonacciAgent(symbol),
          rsi:        new RSIValueAgent(symbol),
          macd:       new MACDAgent(symbol),
          bollinger:  new BollingerAgent(symbol),
          pattern:    new PatternAgent(symbol),
          divergence: new DivergenceAgent(symbol),    // ← FIX: was missing
          ichimoku:   new IchimokuAgent(symbol),       // ← FIX: was missing (Phase 14)
          dxy:        new DXYAgent(symbol),             // ← FIX: was missing (Phase 14)
          utbot:      new UTBotAgent(symbol),           // Phase 15.3
          orderblock: new OrderBlockAgent(symbol),      // Phase 19
          sweep:      new SweepAgent(symbol),
          breakout:   new BreakoutAgent(symbol),
          fvg:        new FVGAgent(symbol),             // Phase 19.1
          news:       new NewsAgent('BT', newsPairs),   // ← FIX: was missing
        };
      }

      const TP_MULT = { scalp: 0.6, swing: 1.5, position: 2.5 };
      const SL_MULT = { scalp: 0.5, swing: 1.5, position: 2.5 };
      const tpM = TP_MULT[mode] || 1.5;
      const slM = SL_MULT[mode] || 1.5;
      const rrFactor = 1.6;

      const trades = [];
      const equityCurve = [];
      let equity = 0;
      let openTrade = null;
      const startIdx = 100;       // warm-up
      const endIdx   = candles.length - 1;
      const checkEvery = 3;       // ตรวจ signal ทุก 3 candles

      for (let i = startIdx; i <= endIdx; i++) {
        const slice = candles.slice(0, i + 1);
        const c = candles[i];

        // ── ตรวจ exit ของ trade ที่เปิดอยู่ ──
        if (openTrade) {
          const isLong = openTrade.signal === 'buy';
          const hitSL = isLong ? c.low  <= openTrade.sl : c.high >= openTrade.sl;
          const hitTP = isLong ? c.high >= openTrade.tp : c.low  <= openTrade.tp;

          if (hitSL && hitTP) {
            // ทั้งสองชนกัน → assume SL ก่อน (conservative)
            openTrade.exit = openTrade.sl;
            openTrade.outcome = 'loss';
            openTrade.r = -1;
            openTrade.exitIdx = i;
          } else if (hitSL) {
            openTrade.exit = openTrade.sl;
            openTrade.outcome = 'loss';
            openTrade.r = -1;
          } else if (hitTP) {
            openTrade.exit = openTrade.tp;
            openTrade.outcome = 'win';
            openTrade.r = +rrFactor;
            openTrade.exitIdx = i;
          }

          if (openTrade.outcome) {
            openTrade.exitIdx = i;
            openTrade.duration = i - openTrade.entryIdx;
            equity += openTrade.r;
            equityCurve.push({ idx: i, equity, ts: c.ts });
            trades.push(openTrade);

            // Feed KB — backtest learning loop
            if (typeof AgentScores !== 'undefined' && openTrade.agentVotes) {
              AgentScores.recordTrade({
                votes:   openTrade.agentVotes,
                signal:  openTrade.signal,
                outcome: openTrade.outcome,
                r:       openTrade.r,
                regime:  openTrade.regime,
                symbol:  symbol,
                source:  'backtest',
              });
            }
            openTrade = null;
          }
        }

        // ── หา signal ใหม่ (ถ้าไม่มี trade เปิดอยู่) ──
        if (!openTrade && i % checkEvery === 0) {
          const fakeData = {
            candles: slice,
            price:   c.close,
            sym:     symbol,
            cfg,
          };

          let res = null;
          let agentReports = {};   // for vote tracking
          if (team) {
            res = team.analyze(fakeData);
            agentReports = res.agents || {};
          } else if (pairTeam) {
            const agents = [];
            const collect = (r, key) => { if (r) { agentReports[key] = r; agents.push(r); } };
            if (Settings.get('enableSMC', true))        collect(pairTeam.smc.analyze(fakeData),        'smc');
            if (Settings.get('enableElliott', true))    collect(pairTeam.elliott.analyze(fakeData),    'elliott');
            if (Settings.get('enableFib', true))        collect(pairTeam.fib.analyze(fakeData),        'fib');
            if (Settings.get('enableRSI', true))        collect(pairTeam.rsi.analyze(fakeData),        'rsi');
            if (Settings.get('enableMACD', true))       collect(pairTeam.macd.analyze(fakeData),       'macd');
            if (Settings.get('enableBollinger', true))  collect(pairTeam.bollinger.analyze(fakeData),  'bollinger');
            if (Settings.get('enablePattern', true))    collect(pairTeam.pattern.analyze(fakeData),    'pattern');
            // Phase 14.4 fix: add the 4 missing agents (parity with GoldTeam)
            if (Settings.get('enableDivergence', true)) collect(pairTeam.divergence.analyze(fakeData), 'divergence');
            if (Settings.get('enableIchimoku', true))   collect(pairTeam.ichimoku.analyze(fakeData),   'ichimoku');
            if (Settings.get('enableDXY', true))        collect(pairTeam.dxy.analyze(fakeData),        'dxy');
            if (Settings.get('enableUTBot', true))      collect(pairTeam.utbot.analyze(fakeData),      'utbot');
            if (Settings.get('enableOrderBlock', true)) collect(pairTeam.orderblock.analyze(fakeData), 'orderblock');
            if (Settings.get('enableSweep', true))      collect(pairTeam.sweep.analyze(fakeData),      'sweep');
            if (Settings.get('enableBreakout', true))   collect(pairTeam.breakout.analyze(fakeData),   'breakout');
            if (Settings.get('enableFVG', true))        collect(pairTeam.fvg.analyze(fakeData),        'fvg');
            if (Settings.get('enableNews', true))       collect(pairTeam.news.analyze(),               'news');
            const agg = pairTeam.head.aggregate(agents);
            res = { head: { signal: agg.signal, conf: agg.conf } };
          }

          if (res && (res.head.signal === 'buy' || res.head.signal === 'sell') && res.head.conf >= minConf) {
            const atr = TA.atr(slice);
            if (atr > 0) {
              const entry = c.close;
              const sl = res.head.signal === 'buy' ? entry - atr * slM : entry + atr * slM;
              const tp = res.head.signal === 'buy' ? entry + atr * tpM * rrFactor : entry - atr * tpM * rrFactor;

              // Snapshot agent votes + regime for KB feedback
              const prefix = symbol === 'XAUUSD' ? 'Gold' : (symbol === 'AUDUSD' ? 'AUD' : 'EUR');
              const nameMap = { smc:'SMC', elliott:'Elliott', fib:'Fib', rsi:'RSI', macd:'MACD', bollinger:'Bollinger', pivot:'Pivot', pattern:'Pattern', divergence:'Divergence', mtf:'MTF', ichimoku:'Ichimoku', dxy:'DXY', utbot:'UT-Bot', orderblock:'OrderBlock', sweep:'Sweep', breakout:'Breakout', fvg:'FVG', news:'News' };
              const votes = Object.entries(agentReports).map(([key, r]) => ({
                agent: `${prefix}-${nameMap[key] || key}`,
                signal: r.signal,
                conf: r.conf,
              }));
              const regime = AgentScores.classifyRegime(slice);

              openTrade = {
                entryIdx: i,
                entry, sl, tp,
                signal: res.head.signal,
                conf: res.head.conf,
                ts: c.ts,
                agentVotes: votes,
                regime,
              };
            }
          }
        }
      }

      // Restore MTF setting
      Settings.set('enableMTF', wasMTF);

      // ── Calculate stats ──
      const wins   = trades.filter(t => t.outcome === 'win').length;
      const losses = trades.filter(t => t.outcome === 'loss').length;
      const winRate = trades.length > 0 ? Math.round(wins / trades.length * 100) : 0;
      const totalR  = trades.reduce((s,t) => s + t.r, 0);
      const avgR    = trades.length > 0 ? totalR / trades.length : 0;

      // Max drawdown
      let peak = 0, maxDD = 0;
      equityCurve.forEach(p => {
        if (p.equity > peak) peak = p.equity;
        const dd = peak - p.equity;
        if (dd > maxDD) maxDD = dd;
      });

      // Expectancy = avg R per trade
      const profitFactor = (() => {
        const gross_w = trades.filter(t => t.r > 0).reduce((s,t) => s + t.r, 0);
        const gross_l = Math.abs(trades.filter(t => t.r < 0).reduce((s,t) => s + t.r, 0));
        return gross_l > 0 ? (gross_w / gross_l).toFixed(2) : '∞';
      })();

      this.lastResult = {
        symbol, mode, interval, minGrade: opts.minGrade || 'B',
        period: {
          fromTs: candles[startIdx]?.ts,
          toTs:   candles[endIdx]?.ts,
          totalCandles: candles.length,
        },
        totalTrades: trades.length,
        wins, losses, winRate,
        totalR:    totalR.toFixed(2),
        avgR:      avgR.toFixed(2),
        maxDrawdown: maxDD.toFixed(2),
        profitFactor,
        equityCurve,
        trades: trades.slice(-30), // last 30 for display
      };

      return this.lastResult;
    } finally {
      this.running = false;
    }
  },

  /** Render results to HTML */
  render(result) {
    if (!result) {
      return '<div style="padding:20px;text-align:center;font-size:7px;color:var(--gray)">ยังไม่ได้รัน backtest — เลือก symbol แล้วกด ▶ Run Backtest</div>';
    }
    if (result.error) {
      return `<div style="padding:20px;text-align:center;font-size:8px;color:var(--red)">❌ ${result.error}</div>`;
    }

    const grade = parseFloat(result.totalR) > 0 && result.winRate >= 50 ? 'A' : parseFloat(result.totalR) > 0 ? 'B' : 'F';
    const gradeColor = grade === 'A' ? '#00ff41' : grade === 'B' ? '#ffe600' : '#ff3333';

    const fromDate = new Date(result.period.fromTs).toLocaleDateString();
    const toDate   = new Date(result.period.toTs).toLocaleDateString();

    // Equity curve as SVG sparkline
    const eq = result.equityCurve;
    let sparkSVG = '';
    if (eq.length > 1) {
      const minE = Math.min(0, ...eq.map(p => p.equity));
      const maxE = Math.max(0, ...eq.map(p => p.equity));
      const W = 600, H = 80;
      const points = eq.map((p, i) => {
        const x = (i / (eq.length - 1)) * W;
        const y = H - ((p.equity - minE) / Math.max(0.01, maxE - minE)) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const zeroY = H - ((0 - minE) / Math.max(0.01, maxE - minE)) * H;
      sparkSVG = `<svg width="100%" height="80" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="background:var(--bg-dark);border:1px solid var(--border)">
        <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#555" stroke-dasharray="2,2"/>
        <polyline points="${points}" stroke="${gradeColor}" stroke-width="1.5" fill="none"/>
      </svg>`;
    }

    const tradesRows = result.trades.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:10px;color:var(--gray)">ไม่มี trade เลย — ลองลด minConf หรือ minGrade</td></tr>'
      : result.trades.map(t => {
          const sigCls = t.signal === 'buy' ? 'text-green' : 'text-red';
          const outCls = t.outcome === 'win' ? 'text-green' : 'text-red';
          return `<tr>
            <td>${new Date(t.ts).toLocaleString().slice(0,16)}</td>
            <td class="${sigCls}">${t.signal === 'buy'?'▲':'▼'}</td>
            <td>${t.entry.toFixed(4)}</td>
            <td class="text-red">${t.sl.toFixed(4)}</td>
            <td class="text-green">${t.tp.toFixed(4)}</td>
            <td>${t.duration}</td>
            <td class="${outCls}">${t.outcome === 'win' ? `+${t.r.toFixed(1)}R` : `${t.r.toFixed(1)}R`}</td>
          </tr>`;
        }).join('');

    return `
      <div style="background:var(--bg-card);border:1px solid var(--border);padding:6px 10px;margin-bottom:8px;font-size:7px">
        <span class="text-teal">${result.symbol}</span> ·
        <span class="text-gold">${result.mode}</span> ·
        <span class="text-purple">TF ${result.interval || '5min'}</span>
      </div>
      <div class="journal-stats">
        <div class="js-tile" style="border-color:${gradeColor};color:${gradeColor}"><div class="js-num">${grade}</div><div class="js-lbl">Strategy Grade</div></div>
        <div class="js-tile"><div class="js-num">${result.totalTrades}</div><div class="js-lbl">Total Trades</div></div>
        <div class="js-tile" style="color:var(--green)"><div class="js-num">${result.wins}</div><div class="js-lbl">Wins</div></div>
        <div class="js-tile" style="color:var(--red)"><div class="js-num">${result.losses}</div><div class="js-lbl">Losses</div></div>
        <div class="js-tile" style="color:var(--teal)"><div class="js-num">${result.winRate}%</div><div class="js-lbl">Win Rate</div></div>
        <div class="js-tile" style="color:var(--gold)"><div class="js-num">${result.totalR}R</div><div class="js-lbl">Total P/L</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">
        <div class="js-tile"><div class="js-num" style="font-size:10px">${result.avgR}R</div><div class="js-lbl">Avg R/Trade</div></div>
        <div class="js-tile" style="color:var(--orange)"><div class="js-num" style="font-size:10px">-${result.maxDrawdown}R</div><div class="js-lbl">Max Drawdown</div></div>
        <div class="js-tile" style="color:var(--purple)"><div class="js-num" style="font-size:10px">${result.profitFactor}</div><div class="js-lbl">Profit Factor</div></div>
        <div class="js-tile"><div class="js-num" style="font-size:7px">${fromDate}<br>→ ${toDate}</div><div class="js-lbl">Period</div></div>
      </div>
      <div style="margin-top:10px;font-size:7px;color:var(--gold)">📈 Equity Curve (R-multiples)</div>
      ${sparkSVG}
      <div style="margin-top:10px;font-size:7px;color:var(--gold)">🗂 Last ${result.trades.length} Trades</div>
      <div class="j-table-wrap" style="max-height:240px">
        <table class="j-table">
          <thead><tr>
            <th>Time</th><th>Side</th><th>Entry</th><th>SL</th><th>TP</th><th>Bars</th><th>R</th>
          </tr></thead>
          <tbody>${tradesRows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;font-size:6px;color:var(--gray);border-left:2px solid var(--purple);padding-left:6px">
        ⚠️ Backtest = ผลในอดีต ไม่รับประกันอนาคต. รัน multiple times + เทียบหลาย mode/grade เพื่อหา strategy เสถียรที่สุด.
        ปิด MTF ระหว่าง backtest เพราะไม่มี historical MTF cache
      </div>
    `;
  },

  /** Render configuration form + result panel */
  renderUI() {
    const symbol = document.getElementById('bt-symbol')?.value || 'XAUUSD';
    const mode   = document.getElementById('bt-mode')?.value   || Settings.get('tradeMode', 'swing');
    const tf     = document.getElementById('bt-tf')?.value     || 'auto';
    const minCf  = document.getElementById('bt-minconf')?.value || 60;
    return `
      <div style="background:var(--bg-dark);border:1px solid var(--border);padding:10px;margin-bottom:10px">
        <div style="font-size:8px;color:var(--gold);margin-bottom:8px">🔬 BACKTEST CONFIG</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px">
          <div>
            <label class="form-label">Symbol</label>
            <select id="bt-symbol" class="form-input">
              <option value="XAUUSD" ${symbol==='XAUUSD'?'selected':''}>🥇 XAUUSD</option>
              <option value="AUDUSD" ${symbol==='AUDUSD'?'selected':''}>🇦🇺 AUDUSD</option>
              <option value="EURUSD" ${symbol==='EURUSD'?'selected':''}>🇪🇺 EURUSD</option>
            </select>
          </div>
          <div>
            <label class="form-label">Mode</label>
            <select id="bt-mode" class="form-input">
              <option value="scalp" ${mode==='scalp'?'selected':''}>⚡ Scalp</option>
              <option value="swing" ${mode==='swing'?'selected':''}>🌊 Swing</option>
              <option value="position" ${mode==='position'?'selected':''}>🏔 Position</option>
            </select>
          </div>
          <div>
            <label class="form-label">Timeframe</label>
            <select id="bt-tf" class="form-input">
              <option value="auto"  ${tf==='auto'?'selected':''}>Auto (ตาม Mode)</option>
              <option value="1min"  ${tf==='1min'?'selected':''}>1 min</option>
              <option value="5min"  ${tf==='5min'?'selected':''}>5 min ⚡</option>
              <option value="15min" ${tf==='15min'?'selected':''}>15 min</option>
              <option value="30min" ${tf==='30min'?'selected':''}>30 min</option>
              <option value="1h"    ${tf==='1h'?'selected':''}>1 hour 🌊</option>
              <option value="4h"    ${tf==='4h'?'selected':''}>4 hour 🏔</option>
              <option value="1day"  ${tf==='1day'?'selected':''}>Daily</option>
            </select>
          </div>
          <div>
            <label class="form-label">Min Conf</label>
            <input id="bt-minconf" class="form-input" type="number" min="40" max="95" value="${minCf}">
          </div>
          <div style="display:flex;align-items:end;gap:4px">
            <button class="btn btn-primary" onclick="Backtest.runFromUI()" style="flex:1">▶ Run</button>
          </div>
        </div>
        <div style="font-size:6px;color:var(--gray);margin-top:6px">
          💡 <b>TF Auto mapping</b>: ⚡ Scalp → 5min | 🌊 Swing → 1h | 🏔 Position → 4h
        </div>
      </div>

      <div style="background:linear-gradient(90deg,rgba(157,78,221,0.15),transparent);border:1px solid var(--purple);padding:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:8px;color:var(--purple)">🤖 AUTO-OPTIMIZE — ทดสอบหลาย combinations + พัฒนาตัวเอง</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary" onclick="AutoOptimize.start({maxCycles: 999})">🚀 Start Auto-Opt</button>
            <button class="btn" style="background:var(--red);color:#fff" onclick="AutoOptimize.stop()">⏹ STOP</button>
          </div>
        </div>
        <div style="font-size:6px;color:var(--gray)">
          จะทดสอบทุก combinations ของ 3 symbols × 3 modes × 4 confidence × 3 ADX gates ต่อ cycle.<br>
          ระหว่าง cycle จะ re-fetch history ใหม่. ส่ง Telegram ทุก cycle. Auto-apply best config เมื่อเสร็จ.<br>
          <b style="color:var(--yellow)">💡 เปิดทิ้งไว้ค้างคืน → ตื่นเช้ามาได้ best strategy ที่พิสูจน์แล้ว</b>
        </div>
        <div id="auto-progress" style="margin-top:8px"></div>
      </div>

      <div id="bt-result">${this.render(this.lastResult)}</div>
    `;
  },

  async runFromUI() {
    const symbol = document.getElementById('bt-symbol').value;
    const mode   = document.getElementById('bt-mode').value;
    const tf     = document.getElementById('bt-tf').value;
    const minConf = parseInt(document.getElementById('bt-minconf').value) || 60;
    const opts = { mode, minConf };
    if (tf !== 'auto') opts.interval = tf;
    document.getElementById('bt-result').innerHTML = '<div style="padding:30px;text-align:center;font-size:9px;color:var(--teal)"><div class="pixel-loader"></div> กำลังรัน backtest...</div>';
    const result = await this.run(symbol, opts);
    document.getElementById('bt-result').innerHTML = this.render(result);
  },
};

window.Backtest = Backtest;

/* ═══════════════════════════════════════════════════════
   AUTO-OPTIMIZE — Self-improving loop
     - รัน backtest หลาย combinations อัตโนมัติ
     - Re-fetch history ระหว่าง cycle
     - เก็บ best configs ตาม Total R + Win Rate
     - ส่ง Telegram progress
     - Auto-apply config ที่ดีที่สุดเมื่อเสร็จ
   ═══════════════════════════════════════════════════════ */
const AutoOptimize = {
  running:   false,
  startTs:   0,
  cycles:    0,
  iterations: 0,
  bestPerSym: {},   // best config per symbol
  history:   [],    // all runs
  log:       [],

  // Phase 20: warn before refresh/close while optimizing (KB itself is saved
  // per-trade, but in-progress cycles would be lost on reload).
  _installUnloadGuard() {
    if (this._guardInstalled) return;
    this._guardInstalled = true;
    window.addEventListener('beforeunload', (e) => {
      if (AutoOptimize.running || (window.Backtest && Backtest.running)) {
        e.preventDefault();
        e.returnValue = 'กำลัง Backtest/Auto-Optimize อยู่ — KB เซฟแล้วทุกไม้ แต่รอบที่กำลังรันจะหยุด ถ้ารีเฟรช';
        return e.returnValue;
      }
    });
  },

  async start(opts = {}) {
    if (this.running) return;
    this._installUnloadGuard();
    this.running = true;
    this.startTs = Date.now();
    this.cycles = 0;
    this.iterations = 0;
    this.bestPerSym = {};
    this.history = [];
    this.log = [];

    const symbols = opts.symbols || ['XAUUSD', 'AUDUSD', 'EURUSD'];
    const modes   = opts.modes   || ['scalp', 'swing', 'position'];
    const confs   = opts.confs   || [55, 65, 75, 85];
    const adxGates = opts.adxGates || [0, 20, 25];
    const maxCycles = opts.maxCycles || 200;
    const refetchEachCycle = opts.refetchEachCycle ?? false;   // Phase 25.6: reuse loaded candles by default (save API quota)
    // Phase 22.1: by default DON'T auto-stop on convergence — keep training
    // until the user presses STOP (or maxCycles / quota). Opt-in via opts.
    const stopOnConverge = opts.stopOnConverge ?? false;

    this._addLog(`🤖 Auto-Optimize started — symbols: ${symbols.join(',')}, modes: ${modes.join(',')}, confs: ${confs.join(',')}, ADX: ${adxGates.join(',')}`);

    if (Settings.get('telegramOn')) {
      await Telegram._send(
        `🤖 <b>Auto-Optimize เริ่มแล้ว</b>\n` +
        `เริ่ม: ${new Date().toLocaleString('th-TH')}\n` +
        `Symbols: ${symbols.join(', ')}\n` +
        `Modes: ${modes.join(', ')}\n` +
        `Conf: ${confs.join('/')}\n` +
        `Max cycles: ${maxCycles}\n\n` +
        `<i>จะส่ง progress ทุก cycle และส่ง best config ตอนเสร็จ</i>`
      );
    }

    // Silence live Telegram during optimization (avoid spam)
    const origTelegramOn = Settings.get('telegramOn');
    Settings.set('telegramOn', false);

    let _quotaWarned = false;
    try {
      while (this.running && this.cycles < maxCycles) {
        // Phase 25.6: if API quota is exhausted, DON'T stop — just stop fetching
        // and keep training on cached/generated candles (backtest falls back).
        const apiOK = (typeof RateLimiter === 'undefined') || RateLimiter.quotaOK();
        if (!apiOK && !_quotaWarned) {
          _quotaWarned = true;
          this._addLog('⚠️ API quota ≥90% — สลับใช้ข้อมูล cache (ไม่ fetch ใหม่) · เทรนต่อได้');
        }

        const cycleStart = Date.now();
        this.cycles++;
        this._addLog(`▶ Cycle ${this.cycles}/${maxCycles}`);

        // Re-fetch fresh history only if enabled AND quota allows
        if (refetchEachCycle && apiOK && this.cycles > 1) {
          await this._refetchAll(symbols);
        }

        const cycleResults = [];
        for (const sym of symbols) {
          for (const mode of modes) {
            for (const conf of confs) {
              for (const adx of adxGates) {
                if (!this.running) break;
                Settings.set('adxGate', adx);
                const r = await Backtest.run(sym, { mode, minConf: conf });
                this.iterations++;
                if (r && !r.error && r.totalTrades >= 5) {
                  const score = parseFloat(r.totalR) + (r.winRate / 100) * 2; // weighted score
                  const config = {
                    symbol: sym, mode, minConf: conf, adxGate: adx,
                    cycle: this.cycles,
                    trades: r.totalTrades,
                    winRate: r.winRate,
                    totalR:  parseFloat(r.totalR),
                    avgR:    parseFloat(r.avgR),
                    maxDD:   parseFloat(r.maxDrawdown),
                    PF:      r.profitFactor,
                    score,
                  };
                  cycleResults.push(config);
                  this.history.push(config);

                  // Track best per symbol
                  const cur = this.bestPerSym[sym];
                  if (!cur || score > cur.score) this.bestPerSym[sym] = config;
                }
                // Yield to UI
                await new Promise(r => setTimeout(r, 30));
                this._renderProgress();
              }
            }
          }
        }

        const cycleDur = ((Date.now() - cycleStart) / 1000).toFixed(0);
        this._addLog(`✓ Cycle ${this.cycles} done in ${cycleDur}s, found ${cycleResults.length} valid configs`);

        // Send Telegram progress for this cycle
        if (origTelegramOn) {
          await this._sendCycleProgress(cycleResults);
        }

        // If no improvement for 3 cycles, stop early
        if (stopOnConverge && this.cycles >= 3 && this._noImprovement(3)) {
          this._addLog('🎯 No improvement for 3 cycles — stopping early (converged)');
          break;
        }
      }

      // Send final summary
      Settings.set('telegramOn', origTelegramOn);
      if (origTelegramOn) await this._sendFinalSummary();

      // Auto-apply best XAUUSD config (most common use)
      if (opts.autoApply !== false) this._applyBest();

      this._addLog(`🏁 Done — ${this.cycles} cycles, ${this.iterations} iterations, ${this.history.length} valid results`);
    } finally {
      this.running = false;
      Settings.set('telegramOn', origTelegramOn);
      // Phase 24.2: restore agent toggles after a per-employee training run
      if (this._restoreEnables) {
        Object.entries(this._restoreEnables).forEach(([k, v]) => Settings.set(k, v));
        this._restoreEnables = null;
        if (typeof UI !== 'undefined' && UI.addLog) UI.addLog('CMD', 'Train', '✅ เทรนจบ — คืนค่า agent เดิมเรียบร้อย');
      }
      this._renderProgress();
    }
  },

  stop() {
    if (this.running) {
      this.running = false;
      this._addLog('⏹ Stopped by user');
    }
  },

  _addLog(msg) {
    const ts = new Date().toLocaleTimeString();
    this.log.unshift(`[${ts}] ${msg}`);
    if (this.log.length > 50) this.log.length = 50;
    if (typeof UI !== 'undefined') UI.addLog('CMD', 'AutoOpt', msg);
  },

  async _refetchAll(symbols) {
    const apiKey = Settings.get('priceApiKey');
    if (!apiKey && !TradingWarRoom.market._onAppsScript()) return;
    let refreshed = 0, cached = 0;
    for (const sym of symbols) {
      try {
        // Check cache first — skip if data is < 5 min old
        const cacheData = HistoryCache.get(sym, '5min', 500);
        if (cacheData) {
          TradingWarRoom.market.applyHistory(sym, cacheData);
          cached++;
          continue;
        }
        const h = await TradingWarRoom.market.fetchHistory(sym, '5min', 500, apiKey);
        if (h && h.length > 100) {
          TradingWarRoom.market.applyHistory(sym, h);
          refreshed++;
        }
      } catch (e) { /* silent */ }
    }
    this._addLog(`📊 Symbols: ${refreshed} refetched, ${cached} from cache`);
  },

  _noImprovement(window) {
    if (this.history.length < window * 4) return false;
    const recent = this.history.slice(-window * 4);
    const earlier = this.history.slice(-window * 8, -window * 4);
    if (earlier.length === 0) return false;
    const maxRecent = Math.max(...recent.map(c => c.score));
    const maxEarlier = Math.max(...earlier.map(c => c.score));
    return maxRecent <= maxEarlier;
  },

  async _sendCycleProgress(cycleResults) {
    const top3 = cycleResults.slice().sort((a,b) => b.score - a.score).slice(0, 3);
    if (top3.length === 0) return;
    const elapsed = ((Date.now() - this.startTs) / 60000).toFixed(0);
    let msg = `🤖 <b>Auto-Opt Cycle ${this.cycles}</b>\n`;
    msg += `⏱ Elapsed: ${elapsed} นาที | Iterations: ${this.iterations}\n\n`;
    msg += `<b>Top 3 this cycle:</b>\n`;
    top3.forEach((c, i) => {
      msg += `${i+1}. ${c.symbol} ${c.mode} conf${c.minConf} ADX${c.adxGate}\n`;
      msg += `   ${c.trades}T | ${c.winRate}% | <b>${c.totalR > 0 ? '+' : ''}${c.totalR.toFixed(2)}R</b> | DD ${c.maxDD}R\n`;
    });
    await Telegram._send(msg);
  },

  async _sendFinalSummary() {
    const top10 = this.history.slice().sort((a,b) => b.score - a.score).slice(0, 10);
    const symBest = Object.values(this.bestPerSym);
    const totalMin = ((Date.now() - this.startTs) / 60000).toFixed(0);

    let msg = `🏁 <b>Auto-Optimize เสร็จสมบูรณ์!</b>\n`;
    msg += `${'─'.repeat(28)}\n`;
    msg += `⏱ ใช้เวลา: ${totalMin} นาที\n`;
    msg += `🔄 Cycles: ${this.cycles} | Tests: ${this.iterations}\n`;
    msg += `✅ Valid configs: ${this.history.length}\n\n`;

    msg += `<b>🏆 Best per Symbol:</b>\n`;
    symBest.forEach(c => {
      const tag = c.totalR > 0 ? '🟢' : '🔴';
      msg += `${tag} <b>${c.symbol}</b>: ${c.mode} conf${c.minConf}\n`;
      msg += `   ${c.trades}T | <b>${c.winRate}%</b> | ${c.totalR > 0 ? '+' : ''}${c.totalR.toFixed(2)}R | PF ${c.PF}\n`;
    });

    msg += `\n<b>🌟 Top 5 Overall:</b>\n`;
    top10.slice(0, 5).forEach((c, i) => {
      msg += `${i+1}. ${c.symbol}/${c.mode}/c${c.minConf}/adx${c.adxGate}\n`;
      msg += `   <b>${c.totalR > 0 ? '+' : ''}${c.totalR.toFixed(2)}R</b> | ${c.winRate}% (${c.trades}T)\n`;
    });

    msg += `\n<i>💡 ระบบจะ auto-apply config ที่ดีที่สุดของ symbol แต่ละตัว — ปรับใน Settings ได้</i>`;
    await Telegram._send(msg);
  },

  /** Apply the best config (highest score) to live Settings */
  _applyBest() {
    const all = Object.values(this.bestPerSym);
    if (all.length === 0) return;
    // Apply config of best symbol overall
    const best = all.slice().sort((a,b) => b.score - a.score)[0];
    Settings.set('tradeMode', best.mode);
    Settings.set('adxGate',   best.adxGate);
    this._addLog(`✨ Applied best config: ${best.symbol}/${best.mode}/conf${best.minConf}/adx${best.adxGate} (+${best.totalR.toFixed(2)}R)`);
  },

  _renderProgress() {
    const el = document.getElementById('auto-progress');
    if (!el) return;
    if (!this.running && this.iterations === 0) {
      el.innerHTML = '';
      return;
    }
    // Throttle: re-render at most ~2×/sec so the DOM (and any buttons) isn't
    // churned every 30ms (which made clicks miss).
    const now = Date.now();
    if (this.running && this._lastRender && (now - this._lastRender) < 500) return;
    this._lastRender = now;
    const elapsed = ((Date.now() - this.startTs) / 60000).toFixed(1);
    const top = this.history.slice().sort((a,b) => b.score - a.score).slice(0, 5);
    const status = this.running ? '🤖 RUNNING' : '🏁 DONE';
    const sc = this.running ? 'var(--green)' : 'var(--gold)';

    let rows = top.map((c, i) => `<tr>
      <td>${i+1}</td>
      <td class="text-teal">${c.symbol}</td>
      <td>${c.mode}</td>
      <td>${c.minConf}</td>
      <td>${c.adxGate}</td>
      <td>${c.trades}</td>
      <td class="${c.winRate >= 50 ? 'text-green' : 'text-red'}">${c.winRate}%</td>
      <td class="${c.totalR > 0 ? 'text-green' : 'text-red'}">${c.totalR > 0 ? '+' : ''}${c.totalR.toFixed(2)}R</td>
      <td>${c.PF}</td>
    </tr>`).join('');
    if (rows === '') rows = '<tr><td colspan="9" style="text-align:center;color:var(--gray);padding:10px">ยังไม่มีผลลัพธ์...</td></tr>';

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:${sc};font-size:8px">
        <span>${status} — Cycle ${this.cycles} | Iter ${this.iterations} | Elapsed ${elapsed}m | Found ${this.history.length}</span>
        ${this.running ? '<span style="color:var(--gray);font-size:6px">↑ ใช้ปุ่ม STOP สีแดงด้านบน</span>' : ''}
      </div>
      <div style="font-size:7px;color:var(--gold);margin:4px 0">🏆 Top 5 Configs</div>
      <div class="j-table-wrap" style="max-height:140px">
        <table class="j-table">
          <thead><tr>
            <th>#</th><th>Sym</th><th>Mode</th><th>Conf</th><th>ADX</th><th>T</th><th>WR</th><th>PnL</th><th>PF</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },
};

window.AutoOptimize = AutoOptimize;

