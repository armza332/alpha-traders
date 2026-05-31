/* =====================================================================
   agenthq-data.js — bridge TWR employees → Agent HQ scene (LIVE)
   Reads window.parent.Company employees + their live decisions and feeds
   the canvas engine. Defines window.ROLES / STATUS / AGENTS + a sync loop.
   ===================================================================== */

// ---- ROLES (shirt color + label) ------------------------------------
window.ROLES = {
  researcher: { label: "AUD Desk",  th: "ออสซี่",   shirt: "#a96bff", hair: "#2b2342" },
  coder:      { label: "Crypto",    th: "คริปโต",    shirt: "#2de2e6", hair: "#13313a" },
  writer:     { label: "EUR Desk",  th: "ยูโร",     shirt: "#ff5cce", hair: "#3a1430" },
  analyst:    { label: "Gold Desk", th: "ทองคำ",    shirt: "#ffc44d", hair: "#3a2c10" },
  designer:   { label: "Floating",  th: "หัวกระทิ",  shirt: "#3df58a", hair: "#0f3a28" },
  ops:        { label: "Crypto",    th: "คริปโต",    shirt: "#ffc44d", hair: "#3a2c10" },
};

// ---- STATUS (color + zone + bubble icon) ----------------------------
window.STATUS = {
  working: { label: "ยิงซิก", en: "FIRING",  color: "#2de2e6", zone: "desk", icon: "gear", glow: true  },
  idle:    { label: "ว่าง",   en: "IDLE",    color: "#3df58a", zone: "sofa", icon: "zzz",  glow: false },
  waiting: { label: "รอจังหวะ", en: "WAITING", color: "#ffc44d", zone: "wait", icon: "hour", glow: false },
  error:   { label: "ขาดทุน", en: "DRAWDOWN", color: "#ff4d6d", zone: "desk", icon: "bang", glow: true  },
};

const _SKINS = ["#f1c9a5", "#e0a878", "#c98a5e", "#a8693f", "#8a5a3a", "#f5d6b8"];
function _roleFor(emp) {
  switch (emp.sym) {
    case 'XAUUSD': return 'analyst';
    case 'AUDUSD': return 'researcher';
    case 'EURUSD': return 'writer';
    case 'BTCUSD': return 'ops';
    default:       return 'designer';   // floating elites (Claude / FirmSniper)
  }
}

function _PC() { try { return window.parent && window.parent.Company; } catch (e) { return null; } }

// ---- build the roster from real employees (fallback to a tiny mock) --
function _buildAgents() {
  const C = _PC();
  if (C && C.EMPLOYEES && C.EMPLOYEES.length) {
    return C.EMPLOYEES.map((emp, i) => ({
      id: emp.id, name: emp.name, role: _roleFor(emp),
      status: 'idle', task: 'กำลังเชื่อมต่อ…', progress: 0, tasksToday: 0,
      skin: _SKINS[i % _SKINS.length],
    }));
  }
  // standalone fallback (opened without the app)
  return [
    { id:'m1', name:'MINA', role:'analyst', status:'working', task:'demo', progress:60, tasksToday:3, skin:_SKINS[0] },
    { id:'m2', name:'SATOSHI', role:'ops', status:'idle', task:'demo', progress:100, tasksToday:1, skin:_SKINS[2] },
  ];
}
window.AGENTS = _buildAgents();

// ---- derive a live status for one employee --------------------------
function _decide(emp) {
  const C = _PC(); const P = window.parent;
  if (!C || !P) return null;
  const TWR = P.TradingWarRoom;
  const gold = TWR && TWR.lastGold, fx = TWR && TWR.lastFX, btc = TWR && TWR.lastBTC;
  const teamFor = (s) => s === 'XAUUSD' ? gold : s === 'AUDUSD' ? (fx && fx.aud)
                       : s === 'EURUSD' ? (fx && fx.eur) : s === 'BTCUSD' ? btc : null;
  const bot = P.BotBridge && P.BotBridge.lastStatus;
  const syms = emp.sym ? [emp.sym] : (C._SYMS || ['XAUUSD', 'AUDUSD', 'EURUSD', 'BTCUSD']);
  let best = null;
  syms.forEach(s => {
    try {
      const d = C._empDecision(emp, s, teamFor(s), bot);
      if (!best || (d.approved && !best.approved) || (d.conf || 0) > (best.conf || 0)) best = d;
    } catch (e) {}
  });
  return best;
}

function _statusFrom(emp, d, st) {
  const tasksToday = st ? (st.signals || 0) : 0;
  if (st && st.matched >= 3 && st.R < -3)
    return { status: 'error', task: `ผลลบ ${st.R.toFixed(1)}R — ทบทวนกลยุทธ์`, progress: 0, tasksToday };
  if (!d) return { status: 'idle', task: 'รอข้อมูล…', progress: 0, tasksToday };
  const sig = d.signal === 'buy' ? 'BUY' : d.signal === 'sell' ? 'SELL' : '';
  const pair = (d.sym || '').replace('USD', '');
  if (d.blockedBy && /พัก/.test(d.blockedBy))
    return { status: 'idle', task: '💤 พักอยู่', progress: 0, tasksToday };
  if (d.blockedBy && /ตลาดปิด/.test(d.blockedBy))
    return { status: 'idle', task: '🌙 ตลาดปิด — พัก', progress: 0, tasksToday };
  if (d.approved && sig)
    return { status: 'working', task: `${sig} ${pair} · conf ${d.conf}%`, progress: d.conf || 0, tasksToday };
  if (sig && d.blockedBy)
    return { status: 'waiting', task: `${sig} ${pair} — ${d.blockedBy}`, progress: d.conf || 0, tasksToday };
  return { status: 'idle', task: 'รอจังหวะ (ยังไม่มีสัญญาณ)', progress: d.conf || 0, tasksToday };
}

// ---- push live statuses into the scene ------------------------------
window.AGENTHQ_SYNC = function () {
  const C = _PC();
  if (!C || !C.EMPLOYEES || !window.SCENE || !window.SCENE.setAgentStatus) return;
  C.EMPLOYEES.forEach(emp => {
    const st = C._employeeStats ? C._employeeStats(emp.id) : null;
    const hold = C._employeeHolding ? C._employeeHolding(emp) : null;
    let patch;
    if (hold) {
      const pl = hold.profit || 0, sym = (hold.sym || '').replace(/[^A-Za-z].*$/, '');
      patch = { status: 'working', task: `📈 ถือไม้ ${hold.side === 'buy' ? 'BUY' : 'SELL'} ${sym} · P/L ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`, progress: 100, tasksToday: st ? st.signals : 0 };
    } else {
      patch = _statusFrom(emp, _decide(emp), st);
    }
    window.SCENE.setAgentStatus(emp.id, patch);
  });
};

// start syncing once the engine scene exists; refresh every 3s
(function _pump() {
  if (window.SCENE) window.AGENTHQ_SYNC();
  setTimeout(_pump, 3000);
})();
