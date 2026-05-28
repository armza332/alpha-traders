// ════════════════════════════════════════════════════════════════════
//  GEMINI — Master Strategist / Head Coach   (Phase 26, additive module)
//  ----------------------------------------------------------------------
//  GEMINI sits ABOVE the 6 employee specialists (Mina, Trent, Sienna,
//  Blaze, Ravi, Willa). It does NOT trade. Once a week (or every N new
//  trades) it reads the KnowledgeBase (AgentScores) + current market
//  regime and self-evolves the firm by:
//    1. Re-assigning each employee's COMBO to the best one for the regime
//    2. Tuning a per-employee CONFIDENCE WEIGHT (coach bias)
//    3. Re-authoring each employee's persona "system prompt" (rule-based,
//       or via a real Google Gemini call through AIBridge if a key is set)
//    4. Adjusting firm-wide guards (minGrade / risk) by weekly win-rate
//
//  It only uses PUBLIC surfaces already in the codebase:
//    AgentScores.load/stats/classifyRegime · Company.EMPLOYEES/COMBOS
//    Settings.get/set · UI.addLog · TradingWarRoom.market.candles
//  so it cannot corrupt the KB or the trading path.
// ════════════════════════════════════════════════════════════════════
const Gemini = {
  KEY: 'twr_gemini_coach_v1',
  EVERY_TRADES: 50,          // re-coach after this many new closed trades
  _lastTrades: 0,

  // ── persistent coach state ──────────────────────────────────────────
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || this._fresh(); }
    catch { return this._fresh(); }
  },
  _fresh() {
    return { assign: {}, confWeight: {}, prompts: {}, history: [], lastRun: 0 };
  },
  save(s) { localStorage.setItem(this.KEY, JSON.stringify(s)); },

  // ── current regime for a symbol (defensive — same source as agents) ──
  regimeNow(symbol) {
    try {
      const c = TradingWarRoom?.market?.candles?.[symbol];
      if (c && typeof AgentScores !== 'undefined') return AgentScores.classifyRegime(c);
    } catch {}
    return 'unknown';
  },

  // Confidence weight GEMINI has assigned an employee (read by the office
  // bubble logic). 1.0 = neutral until GEMINI has coached this employee.
  confWeightFor(empId) {
    const w = this.load().confWeight[empId];
    return (typeof w === 'number') ? w : 1.0;
  },
  comboFor(empId) { return this.load().assign[empId] || null; },
  promptFor(empId) { return this.load().prompts[empId] || null; },

  // ── score every combo for the regime the firm is currently in ────────
  //  Reuses the KB's per-agent accuracy + R that combos are built from.
  _comboScore(comboKey, regime) {
    if (typeof Company === 'undefined' || typeof AgentScores === 'undefined') return 0;
    const combo = Company.COMBOS[comboKey];
    if (!combo) return 0;
    const stats = AgentScores.stats();
    // map combo's technique keys → KB short names via _KEYMAP labels is lossy,
    // so we match on the KB stat rows whose name contains the technique key.
    let score = 0, n = 0;
    combo.agents.forEach(key => {
      const row = stats.find(s => s.name.toLowerCase().includes(key.toLowerCase()));
      if (!row) return;
      const bucket = row[ this._regimeBucket(regime) ] || null;  // regime-specific if present
      const acc = bucket ? bucket.acc : row.accuracy;
      const R   = bucket ? parseFloat(bucket.R) : parseFloat(row.totalR);
      score += (acc - 50) * 0.4 + R;   // edge over coinflip + realised R
      n++;
    });
    return n ? score / n : 0;
  },
  _regimeBucket(regime) {
    return ({ trending:'trending', ranging:'ranging',
              volatile_trending:'vol_tr', volatile_ranging:'vol_rg' })[regime] || 'all';
  },

  // ── THE WEEKLY REVIEW — the self-evolution pass ─────────────────────
  review({ silent = false } = {}) {
    if (typeof Company === 'undefined' || typeof AgentScores === 'undefined') return null;
    const state = this.load();
    const kb = AgentScores.load();
    const totalTrades = (kb.meta?.liveTrades || 0) + (kb.meta?.backtestTrades || 0);

    // pick the dominant regime across the 3 traded symbols
    const regimes = ['XAUUSD','AUDUSD','EURUSD'].map(s => this.regimeNow(s));
    const regime = this._mode(regimes.filter(r => r !== 'unknown')) || 'all';

    // firm-wide weekly win-rate (from KB 'all' buckets)
    const all = Object.values(kb.agents).reduce((o, a) => {
      const b = a.all || {}; o.w += b.w || 0; o.t += b.t || 0; return o;
    }, { w: 0, t: 0 });
    const wr = all.t ? Math.round(all.w / all.t * 100) : 0;

    // rank every combo for THIS regime
    const ranked = Object.keys(Company.COMBOS)
      .map(k => ({ key: k, score: this._comboScore(k, regime) }))
      .sort((a, b) => b.score - a.score);

    // 1+2. re-assign combos to the strongest employees, tune confidence weight
    const memo = [];
    Company.EMPLOYEES.forEach((emp, i) => {
      // best-available combo for this employee (top combos spread across the team)
      const pick = ranked[Math.min(i, ranked.length - 1)] || ranked[0];
      if (!pick) return;
      state.assign[emp.id] = pick.key;

      // confidence weight: positive combo score → boost, negative → throttle
      const w = Math.max(0.4, Math.min(1.6, 1.0 + pick.score / 120));
      state.confWeight[emp.id] = Math.round(w * 100) / 100;

      // 3. re-author the persona system prompt
      state.prompts[emp.id] = this._authorPrompt(emp, pick.key, regime, w);
      memo.push(`${emp.name} → ${Company.COMBOS[pick.key].name} ` +
                `(conf ×${state.confWeight[emp.id]}, ${regime})`);
    });

    // 4. firm guards by weekly WR  (mirrors the existing _doApply philosophy)
    if (typeof Settings !== 'undefined' && all.t >= 10) {
      if (wr < 45)      { Settings.set('minGrade', 'A'); Settings.set('riskPerTrade', 1.0); }
      else if (wr < 55) { Settings.set('minGrade', 'B'); }
      else if (wr >= 65){ Settings.set('minGrade', 'B'); Settings.set('riskPerTrade',
                            Math.min(2, Settings.get('riskPerTrade', 1.5))); }
    }

    state.lastRun = Date.now();
    state.history.unshift({ at: state.lastRun, regime, wr, trades: totalTrades, memo });
    state.history = state.history.slice(0, 12);
    this.save(state);
    this._lastTrades = totalTrades;

    const summary = `🧠 GEMINI re-coached the floor · regime=${regime} · firm WR=${wr}% · ${memo.length} agents tuned`;
    if (!silent && typeof UI !== 'undefined') UI.addLog?.('CMD', 'GEMINI', summary);
    if (typeof KeepAlive !== 'undefined') KeepAlive.notify?.('🧠 GEMINI Weekly Review', summary, {});

    // optional: ask the real Gemini LLM (via server-side bridge) to refine
    // the persona prompts — non-blocking; only runs if a key is on the server.
    if (typeof AIBridge !== 'undefined') this._refineWithLLM(state, regime, wr).catch(() => {});
    return { regime, wr, memo, ranked };
  },

  // run automatically — call from the same tick that runs autoApplyTick
  tick() {
    if (typeof Settings !== 'undefined' && !Settings.get('geminiAutoCoach', true)) return;
    if (typeof AgentScores === 'undefined') return;
    const kb = AgentScores.load();
    const total = (kb.meta?.liveTrades || 0) + (kb.meta?.backtestTrades || 0);
    if (total - this._lastTrades < this.EVERY_TRADES) return;
    this.review({ silent: false });
  },

  // ── persona prompt authoring (rule-based; LLM-refined if key present) ─
  _authorPrompt(emp, comboKey, regime, w) {
    const combo = Company.COMBOS[comboKey] || { name: comboKey, agents: [] };
    const stance = regime.includes('trending') ? 'ride momentum, never fade the trend'
                 : regime.includes('ranging')  ? 'fade extremes, respect the range, take partials early'
                 :                               'stay defensive, wait for a clean break before committing';
    const aggression = w >= 1.2 ? 'You are HOT — GEMINI raised your confidence weight; press your edge.'
                     : w <= 0.7 ? 'You are on a COLD streak — GEMINI throttled you; only take A+ setups.'
                     :            'You are steady — trade your book, no heroics.';
    return [
      `You are ${emp.name}, a ${combo.name} specialist on the Pixel Trading Firm floor.`,
      `Toolkit: ${combo.agents.join(' + ')}.`,
      `Current market regime is ${regime.toUpperCase()} — ${stance}.`,
      aggression,
      `Confidence ≥90 fires a COMBO order with the firm. Below 60, stay flat and say so.`
    ].join(' ');
  },

  // ── REAL LLM refinement via Google Gemini (server-side key, no leak) ──
  async _refineWithLLM(state, regime, wr) {
    const roster = Company.EMPLOYEES.map(e => ({
      id: e.id, name: e.name, combo: Company.COMBOS[state.assign[e.id]]?.name,
      confWeight: state.confWeight[e.id]
    }));
    const system = 'You are GEMINI, head coach of a systematic Forex/Gold firm. ' +
      'Reply with ONLY JSON: {"prompts":{"<empId>":"<system prompt, <=55 words, Thai or English>"}}. No prose.';
    const prompt = `Market regime=${regime}. Firm weekly win-rate=${wr}%. ` +
      `For each specialist, write a sharpened system prompt that fits the regime and their combo. ` +
      `Roster JSON: ${JSON.stringify(roster)}`;
    const res = await AIBridge.ask(prompt, system);
    if (!res || !res.ok || !res.text) return;
    try {
      const t = res.text;
      const parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      if (parsed.prompts) {
        Object.assign(state.prompts, parsed.prompts);
        this.save(state);
        if (typeof UI !== 'undefined') UI.addLog?.('CMD', 'GEMINI', '🧠 Gemini LLM refined agent prompts');
      }
    } catch (e) {}
  },

  // ── small helpers ────────────────────────────────────────────────────
  _mode(arr) {
    if (!arr.length) return null;
    const c = {}; arr.forEach(x => c[x] = (c[x] || 0) + 1);
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  },

  // ── coach panel for the dashboard (call Gemini.render() in a modal) ──
  render() {
    const s = this.load();
    const last = s.history[0];
    const rows = Company.EMPLOYEES.map(e => {
      const combo = Company.COMBOS[s.assign[e.id]];
      const w = s.confWeight[e.id] ?? 1.0;
      const tone = w >= 1.2 ? 'var(--green)' : w <= 0.7 ? 'var(--red)' : 'var(--gray)';
      return `<tr>
        <td style="color:${e.face.accColor}">${e.name}</td>
        <td>${combo ? combo.icon + ' ' + combo.name : '—'}</td>
        <td style="color:${tone}">×${w}</td>
        <td style="font-size:6px;color:var(--gray)">${(s.prompts[e.id]||'').slice(0,70)}…</td>
      </tr>`;
    }).join('');
    return `
      <div style="padding:8px">
        <div style="font-size:10px;color:var(--teal);font-weight:bold">🧠 GEMINI — Head Coach</div>
        <div style="font-size:7px;color:var(--gray);margin:4px 0">
          ${last ? `Last review: regime <b>${last.regime}</b> · firm WR <b>${last.wr}%</b> · ${new Date(last.at).toLocaleString()}`
                 : 'No review yet — click below to run the first one.'}
        </div>
        <table class="twr-table" style="width:100%;font-size:7px">
          <tr><th>Agent</th><th>Assigned Combo</th><th>Conf</th><th>System Prompt</th></tr>
          ${rows}
        </table>
        <button class="btn btn-primary" style="margin-top:6px;border-color:var(--teal);color:var(--teal)"
          onclick="Gemini.review();if(typeof Modal!=='undefined')Modal.open('gemini')">▶ Run Weekly Review now</button>
      </div>`;
  }
};
if (typeof window !== 'undefined') window.Gemini = Gemini;
