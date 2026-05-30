/* ═══════════════════════════════════════════════════════
   UI RENDERING ENGINE
   ═══════════════════════════════════════════════════════ */

const UI = {

  // ── Signal display helper ──
  sigClass(s) { return s === 'buy' ? 'buy' : s === 'sell' ? 'sell' : s === 'watch' ? 'watch' : 'wait'; },
  sigText(s)  {
    return s === 'buy'  ? '▲ BUY' :
           s === 'sell' ? '▼ SELL' :
           s === 'watch'? '⚠ WATCH' : '⏸ WAIT';
  },
  sigColor(s) {
    return s === 'buy'  ? 'text-green' :
           s === 'sell' ? 'text-red' :
           s === 'watch'? 'text-orange' : 'text-yellow';
  },

  // ── Price format ──
  fmtPrice(p, digits) { return typeof p === 'number' ? p.toFixed(digits - 1) : p; },

  // ── Confidence bar ──
  confBar(pct, color = '#00e5ff') {
    return `<div class="conf-bar-wrap"><div class="conf-bar" style="width:${pct}%;background:${color}"></div></div>`;
  },

  // ── Vote chip ──
  voteChip(label, signal) {
    const cls = signal === 'buy' ? 'agree' : signal === 'sell' ? 'disagree' : 'neutral';
    const txt = signal === 'buy' ? '▲' : signal === 'sell' ? '▼' : signal === 'watch' ? '⚠' : '—';
    const col = signal === 'buy' ? 'text-green' : signal === 'sell' ? 'text-red' : 'text-gray';
    return `<div class="vote-chip ${cls}">
      <span class="v-name">${label}</span>
      <span class="v-val ${col}">${txt}</span>
    </div>`;
  },

  // ═══════════════════════════════════════════════════════
  //  PIXEL-ART HUMAN HEAD GENERATOR (Phase 20)
  //  Builds a crisp SVG pixel portrait from a small spec.
  //  No emoji — every character is a drawn 12×12 pixel face.
  // ═══════════════════════════════════════════════════════
  _shade(hex, amt = -28) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const cl = v => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },

  // spec: { skin, hair, eye, style, acc, accColor, mouth }
  //   style : short | long | bun | spiky | bald | flat
  //   acc   : none | glasses | visor | headband | tie | crown | robot | headset
  pixelFace(spec = {}, size = 32) {
    const skin   = spec.skin   || '#e9b48c';
    const skinSh = this._shade(skin, -30);
    const hair   = spec.hair   || '#3a2a1a';
    const hairHi = this._shade(hair, 28);
    const eye    = spec.eye    || '#20222e';
    const acc    = spec.acc    || 'none';
    const accCol = spec.accColor || '#222';
    const style  = spec.style  || 'short';
    const P = [];
    const R = (x, y, w, h, c) => P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);

    // ── ROBOT head (Claude / Dev-bot) ──
    if (acc === 'robot') {
      R(3, 5, 2, 1, accCol);            // antenna pole
      R(3, 4, 2, 1, this._shade(accCol, 60));
      R(2, 6, 8, 6, this._shade(skin, 10)); // metal face
      R(2, 6, 8, 1, hairHi);            // top highlight
      R(3, 8, 2, 2, eye); R(7, 8, 2, 2, eye); // LED eyes
      R(3, 8, 1, 1, '#7fffd4'); R(7, 8, 1, 1, '#7fffd4');
      R(4, 11, 4, 1, this._shade(skin, -20)); // mouth grille
      return this._wrapSVG(P, size);
    }

    // ── HAIR back layer (long) ──
    if (style === 'long') { R(2, 5, 1, 6, hair); R(9, 5, 1, 6, hair); }

    // ── FACE ──
    R(3, 3, 6, 7, skin);
    R(2, 6, 1, 2, skin); R(9, 6, 1, 2, skin); // ears
    R(3, 9, 6, 1, skinSh);                     // jaw shadow
    R(5, 10, 2, 2, skinSh);                    // neck

    // ── EYES ──
    R(4, 6, 1, 1, eye); R(7, 6, 1, 1, eye);

    // ── MOUTH / expression ──
    const m = spec.mouth || 'smile';
    if (m === 'smile') { R(5, 8, 2, 1, skinSh); R(4, 7, 1, 1, skinSh); R(7, 7, 1, 1, skinSh); }
    else if (m === 'flat') { R(5, 8, 2, 1, skinSh); }
    else if (m === 'open') { R(5, 8, 2, 2, this._shade(skin, -55)); }

    // ── HAIR top ──
    if (style !== 'bald') {
      R(3, 2, 6, 2, hair);          // cap
      R(3, 2, 6, 1, hairHi);        // shine
      R(2, 3, 1, 3, hair); R(9, 3, 1, 3, hair); // sideburns
      if (style === 'spiky') { R(3, 1, 1, 1, hair); R(5, 1, 1, 1, hair); R(7, 1, 1, 1, hair); R(8, 1, 1, 1, hair); }
      if (style === 'bun')   { R(5, 0, 2, 2, hair); R(5, 0, 2, 1, hairHi); }
      if (style === 'long')  { R(2, 5, 1, 5, hair); R(9, 5, 1, 5, hair); R(3, 9, 1, 1, hair); R(8, 9, 1, 1, hair); }
    } else {
      R(3, 3, 6, 1, hairHi); // bald top sheen
    }

    // ── ACCESSORIES ──
    if (acc === 'glasses') {
      R(3, 6, 3, 1, accCol); R(6, 6, 3, 1, accCol);
      R(4, 6, 1, 1, '#9fe'); R(7, 6, 1, 1, '#9fe');
      R(4, 6, 1, 1, eye); R(7, 6, 1, 1, eye);
    } else if (acc === 'headband') {
      R(2, 4, 8, 1, accCol); R(8, 4, 2, 1, accCol);
      R(9, 4, 1, 3, this._shade(accCol, -20)); // knot tail
    } else if (acc === 'visor') {
      R(2, 5, 8, 1, accCol);
      R(3, 6, 6, 1, this._shade(accCol, 50)); // tinted visor
    } else if (acc === 'headset') {
      R(2, 4, 8, 1, accCol);
      R(1, 6, 1, 2, accCol); R(10, 6, 1, 2, accCol); // ear cups
      R(1, 8, 3, 1, accCol); // mic boom
    } else if (acc === 'crown') {
      R(3, 1, 6, 1, '#ffd700'); R(3, 0, 1, 1, '#ffd700'); R(6, 0, 1, 1, '#ffd700'); R(8, 0, 1, 1, '#ffd700');
    } else if (acc === 'tie') {
      R(5, 10, 2, 1, '#fff'); R(5, 11, 2, 1, accCol); R(6, 10, 0.5, 2, this._shade(accCol, 40));
    }
    return this._wrapSVG(P, size);
  },
  _wrapSVG(parts, size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges" style="display:block;image-rendering:pixelated">${parts.join('')}</svg>`;
  },

  // ── Per-agent profile: pixel-face spec + job title + accent color ──
  _agentProfile(name) {
    const t = (name || '').toUpperCase();
    const S = (skin, hair, style, acc, accColor, eye) => ({ skin, hair, style, acc, accColor, eye });
    const profiles = {
      'SMC':        { title: 'Structure Chief',  bg: '#ff00ff', short: 'SMC', face: S('#e9b48c','#2a2a3a','short','glasses','#ff00ff') },
      'SMC ANALYST':{ title: 'Structure Chief',  bg: '#ff00ff', short: 'SMC', face: S('#e9b48c','#2a2a3a','short','glasses','#ff00ff') },
      'ELLIOTT':    { title: 'Wave Master',      bg: '#00ffff', short: 'EW',  face: S('#e3c9a0','#cfe7ff','long','none','#00ffff') },
      'ELLIOTT WAVE':{title: 'Wave Master',      bg: '#00ffff', short: 'EW',  face: S('#e3c9a0','#cfe7ff','long','none','#00ffff') },
      'FIBONACCI':  { title: 'Geometry Sensei',  bg: '#ffd700', short: 'FIB', face: S('#d6a273','#4a3010','bald','glasses','#ffd700') },
      'FIB':        { title: 'Geometry Sensei',  bg: '#ffd700', short: 'FIB', face: S('#d6a273','#4a3010','bald','glasses','#ffd700') },
      'RSI':        { title: 'Momentum Runner',  bg: '#ff8c00', short: 'RSI', face: S('#e9b48c','#1f1f1f','spiky','headband','#ff8c00') },
      'RSI / VALUE':{ title: 'Momentum Runner',  bg: '#ff8c00', short: 'RSI', face: S('#e9b48c','#1f1f1f','spiky','headband','#ff8c00') },
      'MACD':       { title: 'Trend Pilot',      bg: '#7fff00', short: 'MCD', face: S('#e9b48c','#3a2a1a','short','headset','#7fff00') },
      'BOLLINGER':  { title: 'Volatility Diver', bg: '#1e90ff', short: 'BB',  face: S('#e3c9a0','#1e90ff','spiky','visor','#1e90ff') },
      'PIVOT':      { title: 'S/R Architect',    bg: '#a0522d', short: 'PVT', face: S('#cd9b6a','#5a3a1a','short','none','#a0522d') },
      'PATTERN':    { title: 'Candle Reader',    bg: '#ff6347', short: 'PTN', face: S('#e9b48c','#7a1f1f','short','none','#ff6347') },
      'DIVERGENCE': { title: 'Reversal Hunter',  bg: '#9370db', short: 'DIV', face: S('#e9b48c','#3a2a4a','short','glasses','#9370db') },
      'MULTI-TF':   { title: 'Time Sage',        bg: '#20b2aa', short: 'MTF', face: S('#e3c9a0','#c0c0c0','long','none','#20b2aa') },
      'ICHIMOKU':   { title: 'Cloud Samurai',    bg: '#dc143c', short: 'ICH', face: S('#e9b48c','#101015','bun','headband','#dc143c') },
      'DXY':        { title: 'USD Banker',       bg: '#228b22', short: 'DXY', face: S('#e9b48c','#2a2a2a','short','tie','#228b22') },
      'DXY (USD)':  { title: 'USD Banker',       bg: '#228b22', short: 'DXY', face: S('#e9b48c','#2a2a2a','short','tie','#228b22') },
      'UT-BOT':     { title: 'Trend Sniper',     bg: '#00ced1', short: 'UT',  face: S('#e9b48c','#1f1f1f','short','visor','#00ced1') },
      'ORDER BLOCK':{ title: 'Zone Mason',       bg: '#8b4513', short: 'OB',  face: S('#cd9b6a','#3a2410','short','none','#8b4513') },
      'LIQ SWEEP':  { title: 'Liquidity Hunter', bg: '#1e90ff', short: 'SWP', face: S('#e9b48c','#103a5a','short','headband','#1e90ff') },
      'BREAKOUT':   { title: 'Breakout Pilot',   bg: '#ff4500', short: 'BRK', face: S('#e9b48c','#3a2a1a','spiky','headset','#ff4500') },
      'FAIR VALUE GAP':{ title: 'Gap Filler',    bg: '#4169e1', short: 'FVG', face: S('#e3c9a0','#4169e1','short','glasses','#4169e1') },
      'FVG':        { title: 'Gap Filler',       bg: '#4169e1', short: 'FVG', face: S('#e3c9a0','#4169e1','short','glasses','#4169e1') },
      'NEWS':       { title: 'News Anchor',      bg: '#ff1493', short: 'NWS', face: S('#e9b48c','#2a2a3a','short','tie','#ff1493') },
    };
    return profiles[t] || { title: 'Analyst', bg: '#888', short: t.slice(0,3), face: { skin:'#e9b48c', hair:'#3a2a1a', style:'short', acc:'none' } };
  },

  // ── Pixel-art ID badge avatar (now a drawn human head) ──
  _avatarBadge(name, signal) {
    const p = this._agentProfile(name);
    const sigCol = signal === 'buy' ? '#00ff41' : signal === 'sell' ? '#ff3333' : signal === 'watch' ? '#ff8c00' : '#ffe600';
    return `
      <div class="agent-avatar" style="
        display:inline-flex;align-items:center;gap:5px;
        padding:3px 6px 3px 3px;
        background:linear-gradient(135deg, ${p.bg}33 0%, ${p.bg}11 100%);
        border:1px solid ${p.bg}88;
        border-left:3px solid ${sigCol};
        border-radius:4px">
        <span style="background:#0b0f1a;border:1px solid ${p.bg}55;border-radius:3px;padding:1px;box-shadow:0 0 6px ${sigCol}55">${this.pixelFace(p.face, 24)}</span>
        <div style="display:flex;flex-direction:column;line-height:1.15">
          <span style="font-size:7px;color:${p.bg};font-weight:bold;letter-spacing:0.5px">[${p.short}]</span>
          <span style="font-size:6px;color:#9aa;font-style:italic">${p.title}</span>
        </div>
      </div>`;
  },

  // ── Analyst card (Phase 14.1: with pixel-art avatars) ──
  analystCard(icon, name, signal, metrics, extra = '') {
    const cls = this.sigClass(signal);
    return `<div class="analyst-card">
      <div class="a-header" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${this._avatarBadge(name, signal)}
        <span class="a-name">${name}</span>
        <span class="a-status ${this.sigColor(signal)}" style="margin-left:auto">${this.sigText(signal)}</span>
      </div>
      ${metrics.map(m => `
        <div class="a-metric">
          <span class="lbl">${m.l}</span>
          <span class="val ${m.c || ''}">${m.v}</span>
        </div>`).join('')}
      ${extra}
      <div class="a-signal-row ${cls}">${this.sigText(signal)}</div>
    </div>`;
  },

  // ── FVG display ──
  fvgTag(report) {
    if (!report?.fvg || report.fvg === 'No open FVG') return '';
    const bull = report.fvg.startsWith('BULL');
    return `<div class="fvg-zone ${bull ? 'bull' : 'bear'}">${report.fvg}</div>`;
  },

  // ── News analyst panel ──
  newsPanel(newsResult) {
    if (!newsResult?.report) return '';
    const r = newsResult.report;
    const events = r.events || [];
    return `<div class="news-analyst">
      <div class="news-header">📰 NEWS INTEL — <span class="${UI.sigColor(newsResult.signal)}">${UI.sigText(newsResult.signal)}</span> (${newsResult.conf}%)</div>
      ${events.length === 0
        ? `<div class="news-item" style="color:var(--gray);font-size:6px">— no events within ±6h —</div>`
        : events.map(e => {
            const isPast = e.minutesAway < 0;
            const whenCol = e.minutesAway > 0 && e.minutesAway <= 60 ? 'var(--red)'
                         : e.minutesAway > 0                          ? 'var(--yellow)'
                         : isPast                                     ? 'var(--gray)'
                                                                      : 'var(--white)';
            return `
        <div class="news-item">
          <div class="impact impact-${e.impact}"></div>
          <span class="time" style="color:${whenCol}">${e.time}</span>
          <span class="title">${e.event}</span>
          <span style="font-size:5px;color:${whenCol};margin-left:auto">${e.when || ''}</span>
          <span class="bias news-bias-${e.bias === 'bullish' || e.bias === 'hawkish' ? 'bull' : e.bias === 'bearish' || e.bias === 'dovish' ? 'bear' : 'neutral'}">
            ${e.bias === 'bullish' || e.bias === 'hawkish' ? '▲' : e.bias === 'bearish' || e.bias === 'dovish' ? '▼' : '●'}
          </span>
        </div>`;
        }).join('')}
      <div class="news-summary">${r.nearEvent} | ${r.bias} | Risk: ${r.risk?.split(' — ')[0] ?? ''}</div>
      <div style="font-size:5px;color:var(--gray);padding:2px 4px;text-align:right;font-style:italic">
        📅 Typical schedule (not live) — for real events check
        <a href="https://www.forexfactory.com/calendar" target="_blank" style="color:var(--teal)">ForexFactory</a>
      </div>
    </div>`;
  },

  // ── Head agent bar (Phase 14.1: pixel-art commander look) ──
  headAgentBar(name, signal, conf, sub = '') {
    const col = signal === 'buy' ? '#00ff41' : signal === 'sell' ? '#ff3333' : signal === 'watch' ? '#ff8c00' : '#ffe600';
    // Pick character based on team name
    const isGold = (name + '').includes('Gold');
    const isFX   = (name + '').includes('FX');
    const isCmd  = (name + '').includes('Commander');
    const face = isGold ? '🤴' : isFX ? '🦸' : isCmd ? '👑' : '🎖';
    const rank = isGold ? 'GOLD CHIEF' : isFX ? 'FX MAJOR' : isCmd ? 'COMMANDER' : 'OFFICER';
    return `<div class="head-agent">
      <div class="agent-sprite" style="
        color:${col};
        background:linear-gradient(135deg, ${col}22 0%, transparent 100%);
        border:1px solid ${col}66;
        padding:4px;
        font-size:28px;
        image-rendering:pixelated;
        text-shadow:2px 2px 0 #000, 0 0 4px ${col}">${face}</div>
      <div style="position:absolute;top:2px;left:2px;font-size:5px;color:${col};font-weight:bold;letter-spacing:1px;background:#000;padding:1px 3px">${rank}</div>
      <div class="head-info">
        <div class="name">${name}</div>
        <div class="role">Team Leader</div>
        <div class="signal signal-${this.sigClass(signal)}">${this.sigText(signal)}</div>
        ${sub ? `<div style="font-size:6px;color:var(--gray);margin-top:2px">${sub}</div>` : ''}
      </div>
      <div class="head-conf">
        <div class="conf-label">CONFIDENCE</div>
        <div class="conf-val">${conf}</div>
        <div class="conf-pct">%</div>
        ${this.confBar(conf, col)}
      </div>
    </div>`;
  },

  // ══════════════════════════════════════════════════════
  // RENDER GOLD TEAM
  // ══════════════════════════════════════════════════════
  renderGoldTeam(report) {
    const el = document.getElementById('gold-team-body');
    if (!el || !report) return;

    const { agents, head, price, cfg } = report;
    const d  = cfg.digits - 1;
    const atr = cfg.atr;

    // SMC card (optional — may be disabled)
    const smcMetrics = agents.smc ? [
      { l: 'Structure', v: agents.smc.report?.structure ?? '--', c: agents.smc.report?.structure === 'BULLISH' ? 'up' : 'dn' },
      { l: 'BOS',       v: agents.smc.report?.bos ?? '--' },
      { l: 'Order Block', v: agents.smc.report?.ob ?? '--', c: 'info' },
      { l: 'ATR',       v: agents.smc.report?.atr ?? '--' },
    ] : null;
    const smcExtra = agents.smc ? this.fvgTag(agents.smc.report) : '';

    // Elliott card (optional)
    const ewMetrics = agents.elliott ? [
      { l: 'Wave',  v: agents.elliott.report?.wave ?? '?', c: 'info' },
      { l: 'Stage', v: agents.elliott.report?.stage ?? '?' },
      { l: 'Bias',  v: agents.elliott.report?.bias ?? '?', c: agents.elliott.report?.bias === 'Bullish' ? 'up' : 'dn' },
      { l: 'RSI',   v: agents.elliott.report?.rsi ?? '?' },
    ] : null;

    // Fib card (optional)
    const fibMetrics = agents.fib ? [
      { l: 'Nearest Level', v: agents.fib.report?.nearest ?? '--' },
      { l: 'Level Price',   v: agents.fib.report?.level   ?? '--', c: 'info' },
      { l: 'Golden Zone',   v: agents.fib.report?.golden  ?? '--', c: agents.fib.report?.golden?.includes('✅') ? 'up' : '' },
      { l: 'R:R',           v: agents.fib.report?.rr      ?? '--', c: 'warn' },
    ] : null;

    // RSI card (optional)
    const rsiMetrics = agents.rsi ? [
      { l: 'RSI 14', v: agents.rsi.report?.rsi14 ?? '--' },
      { l: 'ADX',    v: agents.rsi.report?.adx   ?? '--', c: agents.rsi.report?.adx?.includes('Strong') ? 'up' : '' },
      { l: 'Divergence', v: agents.rsi.report?.div ?? '--', c: agents.rsi.report?.div?.includes('⚠️') ? 'warn' : '' },
      { l: 'Value Zone', v: agents.rsi.report?.pos ?? '--', c: 'info' },
    ] : null;

    // Optional cards (only show if agent was active)
    let extraCards = '';
    if (agents.macd) {
      extraCards += this.analystCard('📈', 'MACD', agents.macd.signal, [
        { l:'MACD',      v: agents.macd.report.macd ?? '--' },
        { l:'Signal',    v: agents.macd.report.signal ?? '--' },
        { l:'Histogram', v: agents.macd.report.histogram ?? '--', c: 'info' },
        { l:'Cross',     v: agents.macd.report.cross ?? '--', c: agents.macd.report.cross?.includes('Bull')?'up':agents.macd.report.cross?.includes('Bear')?'dn':'' },
      ]);
    }
    if (agents.bollinger) {
      extraCards += this.analystCard('🎈', 'Bollinger', agents.bollinger.signal, [
        { l:'Position',  v: agents.bollinger.report.position ?? '--', c: 'info' },
        { l:'Bandwidth', v: agents.bollinger.report.bandwidth ?? '--' },
        { l:'State',     v: agents.bollinger.report.state ?? '--', c: agents.bollinger.report.state?.includes('Squeeze')?'warn':'' },
        { l:'SMA',       v: agents.bollinger.report.sma ?? '--' },
      ]);
    }
    if (agents.pivot) {
      extraCards += this.analystCard('🏛', 'Pivot', agents.pivot.signal, [
        { l:'PP',      v: agents.pivot.report.pp ?? '--', c: 'info' },
        { l:'R1',      v: agents.pivot.report.r1 ?? '--', c: 'dn' },
        { l:'S1',      v: agents.pivot.report.s1 ?? '--', c: 'up' },
        { l:'Near',    v: agents.pivot.report.near ?? '--', c: 'warn' },
      ]);
    }
    if (agents.pattern) {
      extraCards += this.analystCard('🕯', 'Pattern', agents.pattern.signal, [
        { l:'Pattern',    v: agents.pattern.report.pattern ?? '--', c: 'info' },
        { l:'Body %',     v: agents.pattern.report.bodyPct ?? '--' },
        { l:'Upper Wick', v: agents.pattern.report.upperWick ?? '--' },
        { l:'Lower Wick', v: agents.pattern.report.lowerWick ?? '--' },
      ]);
    }
    if (agents.mtf) {
      extraCards += this.analystCard('⏰', 'Multi-TF', agents.mtf.signal, [
        { l:'1h Trend',  v: agents.mtf.report.tf1h ?? '--' },
        { l:'4h Trend',  v: agents.mtf.report.tf4h ?? '--' },
        { l:'Daily',     v: agents.mtf.report.tfDay ?? '--' },
        { l:'Alignment', v: agents.mtf.report.alignment ?? '--', c: agents.mtf.report.alignment?.includes('All')?'up':'warn' },
      ]);
    }
    if (agents.divergence) {
      extraCards += this.analystCard('🔄', 'Divergence', agents.divergence.signal, [
        { l:'RSI Now',    v: agents.divergence.report.rsiNow ?? '--' },
        { l:'MACD Hist',  v: agents.divergence.report.histNow ?? '--' },
        { l:'Strength',   v: agents.divergence.report.strength ?? '--', c: 'warn' },
        { l:'Signals',    v: agents.divergence.report.divergences ?? '--', c: 'info' },
      ]);
    }
    // Phase 14: Ichimoku panel
    if (agents.ichimoku) {
      extraCards += this.analystCard('🌥', 'Ichimoku', agents.ichimoku.signal, [
        { l:'Position', v: agents.ichimoku.report.position ?? '--', c: agents.ichimoku.report.position?.includes('Above')?'up':agents.ichimoku.report.position?.includes('Below')?'down':'warn' },
        { l:'Tenkan',   v: agents.ichimoku.report.tenkan ?? '--' },
        { l:'Kijun',    v: agents.ichimoku.report.kijun ?? '--' },
        { l:'Chikou',   v: agents.ichimoku.report.chikou ?? '--', c: agents.ichimoku.report.chikou?.includes('Bull')?'up':'down' },
      ]);
    }
    // Phase 14: DXY panel
    if (agents.dxy) {
      extraCards += this.analystCard('💵', 'DXY (USD)', agents.dxy.signal, [
        { l:'Trend',   v: agents.dxy.report.dxyTrend ?? '--', c: agents.dxy.report.dxyTrend?.includes('▲')?'down':'up' },
        { l:'Bias',    v: agents.dxy.report.pairBias ?? '--', c: 'info' },
        { l:'Source',  v: agents.dxy.report.source ?? '--' },
      ]);
    }
    // Phase 15.3: UT-Bot panel
    if (agents.utbot) {
      extraCards += this.analystCard('🎯', 'UT-Bot', agents.utbot.signal, [
        { l:'Position', v: agents.utbot.report.position ?? '--', c: agents.utbot.report.position?.includes('Above')?'up':'down' },
        { l:'Trigger',  v: agents.utbot.report.trigger ?? '--', c: agents.utbot.report.trigger?.includes('BUY')?'up':agents.utbot.report.trigger?.includes('SELL')?'down':'' },
        { l:'Trail SL', v: agents.utbot.report.trailStop ?? '--', c: 'warn' },
        { l:'ATR',      v: agents.utbot.report.atr ?? '--' },
      ]);
    }
    // Phase 19: OB / Sweep / Breakout panels
    if (agents.orderblock) {
      extraCards += this.analystCard('🧱', 'Order Block', agents.orderblock.signal, [
        { l:'Zone',   v: agents.orderblock.report.zone ?? '--', c:'info' },
        { l:'Action', v: agents.orderblock.report.action ?? '--' },
        { l:'Bull OB',v: agents.orderblock.report.bullOB ?? '--', c:'up' },
        { l:'Bear OB',v: agents.orderblock.report.bearOB ?? '--', c:'dn' },
      ]);
    }
    if (agents.sweep) {
      extraCards += this.analystCard('💧', 'Liq Sweep', agents.sweep.signal, [
        { l:'Sweep',   v: agents.sweep.report.sweep ?? '--', c: agents.sweep.signal==='buy'?'up':agents.sweep.signal==='sell'?'dn':'' },
        { l:'SwingHi', v: agents.sweep.report.swingHi ?? '--', c:'dn' },
        { l:'SwingLo', v: agents.sweep.report.swingLo ?? '--', c:'up' },
      ]);
    }
    if (agents.breakout) {
      extraCards += this.analystCard('🚀', 'Breakout', agents.breakout.signal, [
        { l:'BOS',  v: agents.breakout.report.bos ?? '--', c: agents.breakout.report.bos?.includes('↑')?'up':agents.breakout.report.bos?.includes('↓')?'dn':'' },
        { l:'Zone', v: agents.breakout.report.zone ?? '--', c:'info' },
        { l:'High', v: agents.breakout.report.hi ?? '--' },
        { l:'Low',  v: agents.breakout.report.lo ?? '--' },
      ]);
    }
    if (agents.fvg) {
      extraCards += this.analystCard('🟦', 'Fair Value Gap', agents.fvg.signal, [
        { l:'Near FVG', v: agents.fvg.report.nearFVG ?? '--', c: agents.fvg.report.nearFVG?.includes('BULL')?'up':agents.fvg.report.nearFVG?.includes('BEAR')?'dn':'info' },
        { l:'Action',   v: agents.fvg.report.action ?? '--' },
        { l:'Count',    v: agents.fvg.report.count ?? '--' },
      ]);
    }

    el.innerHTML = `
      ${this.headAgentBar('Maj.Gold — XAUUSD', head.signal, head.conf, `Price: ${price.toFixed(d)}`)}
      <div class="analyst-grid">
        ${agents.smc     ? this.analystCard('⚡', 'SMC Analyst',  agents.smc.signal,     smcMetrics, smcExtra) : ''}
        ${agents.elliott ? this.analystCard('🌊', 'Elliott Wave', agents.elliott.signal, ewMetrics) : ''}
        ${agents.fib     ? this.analystCard('📐', 'Fibonacci',    agents.fib.signal,     fibMetrics) : ''}
        ${agents.rsi     ? this.analystCard('📊', 'RSI / Value',  agents.rsi.signal,     rsiMetrics) : ''}
        ${extraCards}
      </div>
      ${agents.news ? this.newsPanel(agents.news) : ''}
    `;
  },

  // ══════════════════════════════════════════════════════
  // RENDER CURRENCY TEAM
  // ══════════════════════════════════════════════════════
  renderCurrencyTeam(report) {
    const el = document.getElementById('currency-team-body');
    if (!el || !report) return;

    const { aud, eur, news, head } = report;

    const buildAgentGrid = (teamData, sym) => {
      if (!teamData) return '';
      const { agents, cfg } = teamData;
      const d = cfg.digits - 1;

      const smcM = agents.smc ? [
        { l: 'Structure', v: agents.smc.report?.structure ?? '--', c: agents.smc.report?.structure === 'BULLISH' ? 'up' : 'dn' },
        { l: 'BOS',       v: agents.smc.report?.bos ?? '--' },
        { l: 'OB',        v: agents.smc.report?.ob  ?? '--', c: 'info' },
        { l: 'FVG',       v: agents.smc.report?.fvgCount ?? '--' },
      ] : null;
      const ewM = agents.elliott ? [
        { l: 'Wave',  v: agents.elliott.report?.wave  ?? '?' },
        { l: 'Stage', v: agents.elliott.report?.stage ?? '?' },
        { l: 'Bias',  v: agents.elliott.report?.bias  ?? '?', c: agents.elliott.report?.bias === 'Bullish' ? 'up' : 'dn' },
        { l: 'Action', v: agents.elliott.report?.action ?? '--' },
      ] : null;
      const fibM = agents.fib ? [
        { l: 'Level',   v: agents.fib.report?.nearest ?? '--', c: 'info' },
        { l: 'TP1',     v: agents.fib.report?.tp1 ?? '--', c: 'up' },
        { l: 'SL',      v: agents.fib.report?.sl  ?? '--', c: 'dn' },
        { l: 'R:R',     v: agents.fib.report?.rr  ?? '--', c: 'warn' },
      ] : null;
      const rsiM = agents.rsi ? [
        { l: 'RSI 14',  v: agents.rsi.report?.rsi14 ?? '--' },
        { l: 'ADX',     v: agents.rsi.report?.adx   ?? '--' },
        { l: 'Div',     v: agents.rsi.report?.div   ?? '--', c: agents.rsi.report?.div?.includes('⚠️') ? 'warn' : '' },
        { l: 'VP Zone', v: agents.rsi.report?.pos   ?? '--', c: 'info' },
      ] : null;
      const macdM = agents.macd ? [
        { l:'MACD',      v: agents.macd.report?.macd ?? '--' },
        { l:'Histogram', v: agents.macd.report?.histogram ?? '--' },
        { l:'Cross',     v: agents.macd.report?.cross ?? '--', c: agents.macd.report?.cross?.includes('Bull')?'up':'dn' },
        { l:'Momentum',  v: agents.macd.report?.momentum ?? '--' },
      ] : null;
      const bbM = agents.bollinger ? [
        { l:'Position', v: agents.bollinger.report?.position ?? '--', c: 'info' },
        { l:'BW',       v: agents.bollinger.report?.bandwidth ?? '--' },
        { l:'State',    v: agents.bollinger.report?.state ?? '--' },
        { l:'SMA',      v: agents.bollinger.report?.sma ?? '--' },
      ] : null;
      const ptnM = agents.pattern ? [
        { l:'Pattern',  v: agents.pattern.report?.pattern ?? '--', c: 'info' },
        { l:'Body %',   v: agents.pattern.report?.bodyPct ?? '--' },
        { l:'Up Wick',  v: agents.pattern.report?.upperWick ?? '--' },
        { l:'Lo Wick',  v: agents.pattern.report?.lowerWick ?? '--' },
      ] : null;
      // Phase 14
      const ichM = agents.ichimoku ? [
        { l:'Position', v: agents.ichimoku.report?.position ?? '--', c: agents.ichimoku.report?.position?.includes('Above')?'up':agents.ichimoku.report?.position?.includes('Below')?'dn':'warn' },
        { l:'Tenkan',   v: agents.ichimoku.report?.tenkan ?? '--' },
        { l:'Kijun',    v: agents.ichimoku.report?.kijun ?? '--' },
        { l:'Chikou',   v: agents.ichimoku.report?.chikou ?? '--', c: agents.ichimoku.report?.chikou?.includes('Bull')?'up':'dn' },
      ] : null;
      const dxyM = agents.dxy ? [
        { l:'Trend',   v: agents.dxy.report?.dxyTrend ?? '--', c: agents.dxy.report?.dxyTrend?.includes('▲')?'dn':'up' },
        { l:'Bias',    v: agents.dxy.report?.pairBias ?? '--', c: 'info' },
        { l:'Source',  v: agents.dxy.report?.source ?? '--' },
      ] : null;
      const utM = agents.utbot ? [
        { l:'Position', v: agents.utbot.report?.position ?? '--', c: agents.utbot.report?.position?.includes('Above')?'up':'dn' },
        { l:'Trigger',  v: agents.utbot.report?.trigger ?? '--', c: agents.utbot.report?.trigger?.includes('BUY')?'up':agents.utbot.report?.trigger?.includes('SELL')?'dn':'' },
        { l:'Trail SL', v: agents.utbot.report?.trailStop ?? '--', c: 'warn' },
        { l:'ATR',      v: agents.utbot.report?.atr ?? '--' },
      ] : null;
      const obM = agents.orderblock ? [
        { l:'Zone',   v: agents.orderblock.report?.zone ?? '--', c:'info' },
        { l:'Action', v: agents.orderblock.report?.action ?? '--' },
      ] : null;
      const swM = agents.sweep ? [
        { l:'Sweep', v: agents.sweep.report?.sweep ?? '--', c: agents.sweep.signal==='buy'?'up':agents.sweep.signal==='sell'?'dn':'' },
        { l:'Hi',    v: agents.sweep.report?.swingHi ?? '--', c:'dn' },
        { l:'Lo',    v: agents.sweep.report?.swingLo ?? '--', c:'up' },
      ] : null;
      const brM = agents.breakout ? [
        { l:'BOS',  v: agents.breakout.report?.bos ?? '--', c: agents.breakout.report?.bos?.includes('↑')?'up':agents.breakout.report?.bos?.includes('↓')?'dn':'' },
        { l:'Zone', v: agents.breakout.report?.zone ?? '--', c:'info' },
      ] : null;
      const fvM = agents.fvg ? [
        { l:'Near', v: agents.fvg.report?.nearFVG ?? '--', c: agents.fvg.report?.nearFVG?.includes('BULL')?'up':agents.fvg.report?.nearFVG?.includes('BEAR')?'dn':'info' },
        { l:'Count',v: agents.fvg.report?.count ?? '--' },
      ] : null;

      return `<div style="border-top:1px solid var(--border);padding:4px 0 0">
        <div style="font-size:7px;padding:4px 10px;color:var(--teal);border-bottom:1px solid var(--border)">
          ${sym} — <span class="${this.sigColor(teamData.signal)}">${this.sigText(teamData.signal)}</span>
          <span style="color:var(--gray);font-size:6px"> (${teamData.conf}%)</span>
          <span style="float:right;font-size:6px;color:var(--white)">@ ${teamData.price?.toFixed(d)}</span>
        </div>
        <div class="analyst-grid">
          ${agents.smc       ? this.analystCard('⚡', 'SMC',       agents.smc.signal,       smcM) : ''}
          ${agents.elliott   ? this.analystCard('🌊', 'Elliott',   agents.elliott.signal,   ewM)  : ''}
          ${agents.fib       ? this.analystCard('📐', 'Fib',       agents.fib.signal,       fibM) : ''}
          ${agents.rsi       ? this.analystCard('📊', 'RSI',       agents.rsi.signal,       rsiM) : ''}
          ${agents.macd      ? this.analystCard('📈', 'MACD',      agents.macd.signal,      macdM) : ''}
          ${agents.bollinger ? this.analystCard('🎈', 'Bollinger', agents.bollinger.signal, bbM)  : ''}
          ${agents.pattern   ? this.analystCard('🕯', 'Pattern',   agents.pattern.signal,   ptnM) : ''}
          ${agents.ichimoku  ? this.analystCard('🌥', 'Ichimoku',  agents.ichimoku.signal,  ichM) : ''}
          ${agents.dxy       ? this.analystCard('💵', 'DXY',       agents.dxy.signal,       dxyM) : ''}
          ${agents.utbot     ? this.analystCard('🎯', 'UT-Bot',    agents.utbot.signal,     utM) : ''}
          ${agents.orderblock? this.analystCard('🧱', 'Order Block',agents.orderblock.signal, obM) : ''}
          ${agents.sweep     ? this.analystCard('💧', 'Liq Sweep', agents.sweep.signal,     swM) : ''}
          ${agents.breakout  ? this.analystCard('🚀', 'Breakout',  agents.breakout.signal,  brM) : ''}
          ${agents.fvg       ? this.analystCard('🟦', 'FVG',       agents.fvg.signal,       fvM) : ''}
        </div>
      </div>`;
    };

    el.innerHTML = `
      ${this.headAgentBar(`Maj.FX — ${head.leadPair ?? 'FX'}`, head.signal, head.conf, `Best: ${head.leadPair ?? '--'}`)}
      ${buildAgentGrid(aud, 'AUDUSD')}
      ${buildAgentGrid(eur, 'EURUSD')}
      ${this.newsPanel(news)}
    `;
  },

  // ══════════════════════════════════════════════════════
  // RENDER COMMANDER
  // ══════════════════════════════════════════════════════
  renderCommander(report) {
    const el = document.getElementById('commander-body');
    if (!el || !report) return;

    const sigCls = this.sigClass(report.signal);
    const signalEmoji = report.signal === 'buy' ? '▲' : report.signal === 'sell' ? '▼' : report.signal === 'watch' ? '⚠' : '⏸';
    const riskPct = Math.min(95, report.conf);

    const gradeHTML = report.gradeInfo
      ? `<div style="text-align:center;margin-bottom:8px">${SignalGrade.renderGradeBadge(report.gradeInfo)}</div>`
      : '';

    const confluenceHTML = (report.gradeInfo?.confluence && typeof Confluence !== 'undefined')
      ? Confluence.render(report.gradeInfo.confluence)
      : '';

    // Adaptive Playbook display
    const playbookHTML = (report.playbook && typeof AdaptiveStrategy !== 'undefined' && (report.signal === 'buy' || report.signal === 'sell'))
      ? (() => {
          const qc = report.playbook;
          const checks = qc.checks.map(c => `<div class="row"><span class="lbl">${c.ok ? '✅' : '❌'}</span><span class="val ${c.ok ? 'up' : 'dn'}">${c.msg}</span></div>`).join('');
          const verdict = qc.pass ? '🟢 GO' : '🔴 SKIP';
          const vc = qc.pass ? 'var(--green)' : 'var(--red)';
          return `<div style="margin-top:8px;background:linear-gradient(90deg,rgba(${qc.pass?'0,255,65':'255,51,51'},0.1),transparent);border-left:3px solid ${vc};padding:6px 8px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:7px;color:${vc}">⚙ ADAPTIVE PLAYBOOK</span>
              <span style="font-size:9px;color:${vc}">${verdict}</span>
            </div>
            <div class="trade-params" style="font-size:6px">${checks}</div>
            <div style="font-size:6px;color:var(--gray);padding-top:4px">
              ${qc.market.label} · ATR ${qc.vol.ratio?.toFixed(2)}x · Pos mult: ${qc.vol.multiplier}x
            </div>
          </div>`;
        })()
      : '';

    el.innerHTML = `<div class="cmd-body">
      <!-- Signal section -->
      <div class="cmd-section">
        <div class="cmd-section-title">▶ FINAL SIGNAL</div>
        ${gradeHTML}
        <div class="cmd-final-signal ${sigCls}">
          ${signalEmoji} ${report.signal.toUpperCase()}<br>
          <span style="font-size:9px">${report.sym}</span>
        </div>
        <div class="trade-params">
          <div class="row"><span class="lbl">Entry</span><span class="val entry">${report.entry}</span></div>
          <div class="row"><span class="lbl">Stop Loss</span><span class="val sl">${report.sl}</span></div>
          <div class="row"><span class="lbl">TP 1</span><span class="val tp1">${report.tp1}</span></div>
          <div class="row"><span class="lbl">TP 2</span><span class="val tp2">${report.tp2}</span></div>
          <div class="row"><span class="lbl">R:R</span><span class="val rr">${report.rr}</span></div>
          <div class="row"><span class="lbl">Position</span><span class="val">${report.pos} of balance</span></div>
          <div class="row"><span class="lbl">Mode</span><span class="val info">${report.mode ?? 'Swing 🌊'}</span></div>
        </div>
        ${report.lotSize ? `
        <div style="margin-top:8px;background:var(--bg-dark);border-left:2px solid ${report.riskWarning ? 'var(--red)' : 'var(--gold)'};padding:6px 8px">
          <div style="font-size:7px;color:${report.riskWarning ? 'var(--red)' : 'var(--gold)'};margin-bottom:4px">💰 POSITION SIZE</div>
          <div class="trade-params" style="font-size:7px">
            <div class="row"><span class="lbl">Account</span><span class="val">$${report.accountSize} · Target ${report.targetRiskPct}%</span></div>
            <div class="row"><span class="lbl">Lot Size</span><span class="val info">${report.lotSize} lot</span></div>
            <div class="row"><span class="lbl">Actual Risk</span><span class="val ${report.actualRiskPct > report.targetRiskPct * 1.5 ? 'sl' : ''}">-$${report.riskUSD} (${report.actualRiskPct}%)</span></div>
            <div class="row"><span class="lbl">Reward (TP1)</span><span class="val tp1">+$${report.rewardUSD}</span></div>
          </div>
          ${report.riskWarning ? `<div style="margin-top:4px;font-size:6px;color:var(--red);border-top:1px solid var(--red);padding-top:4px">${report.riskWarning}</div>` : ''}
        </div>` : ''}
        ${confluenceHTML}
        ${report.topDown && typeof TopDownAnalyzer !== 'undefined' ? TopDownAnalyzer.render(report.topDown, report.signal) : ''}
        ${playbookHTML}
      </div>

      <!-- Votes section -->
      <div class="cmd-section">
        <div class="cmd-section-title">▶ ANALYST VOTES</div>
        <div class="votes-grid">
          ${Object.entries(report.votes).map(([k, v]) => this.voteChip(k, v)).join('')}
          ${this.voteChip('GOLD', report.goldSig)}
          ${this.voteChip('FX', report.currSig)}
        </div>
        <div style="margin-top:8px">
          <div class="trade-params">
            <div class="row"><span class="lbl">Gold Team</span><span class="val ${this.sigColor(report.goldSig)}">${this.sigText(report.goldSig)} (${report.goldConf}%)</span></div>
            <div class="row"><span class="lbl">FX Team</span><span class="val ${this.sigColor(report.currSig)}">${this.sigText(report.currSig)} (${report.currConf}%)</span></div>
          </div>
        </div>
      </div>

      <!-- Risk section -->
      <div class="cmd-section">
        <div class="cmd-section-title">▶ RISK ASSESSMENT</div>
        <div style="font-size:16px;text-align:center;padding:5px 0;color:var(--teal)">${report.conf}%</div>
        <div style="font-size:6px;text-align:center;color:var(--gray);margin-bottom:8px">Signal Confidence</div>
        <div class="risk-meter">
          <div class="risk-label">RISK LEVEL</div>
          <div class="risk-bar-wrap">
            <div class="risk-bar" style="width:100%"></div>
            <div class="risk-marker" style="left:${riskPct}%"></div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:6px;border-left:2px solid var(--purple);padding-left:6px;color:var(--white)">
          ${report.summary}
        </div>
        <!-- Phase 14.2: Team consensus display -->
        <div style="margin-top:6px;padding:5px;background:rgba(0,255,255,0.05);border:1px solid var(--teal);font-size:6px">
          <div style="color:var(--teal);margin-bottom:3px;font-weight:bold">👥 TEAM CONSENSUS</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:center">
            <div>
              <span style="color:var(--gray)">XAU</span><br>
              <span style="color:${(report.goldConsensus||0)>=70?'var(--green)':(report.goldConsensus||0)>=55?'var(--yellow)':'var(--red)'};font-size:9px">${report.goldConsensus ?? 0}%</span>
            </div>
            <div>
              <span style="color:var(--gray)">AUD</span><br>
              <span style="color:${(report.audConsensus||0)>=70?'var(--green)':(report.audConsensus||0)>=55?'var(--yellow)':'var(--red)'};font-size:9px">${report.audConsensus ?? 0}%</span>
            </div>
            <div>
              <span style="color:var(--gray)">EUR</span><br>
              <span style="color:${(report.eurConsensus||0)>=70?'var(--green)':(report.eurConsensus||0)>=55?'var(--yellow)':'var(--red)'};font-size:9px">${report.eurConsensus ?? 0}%</span>
            </div>
          </div>
          <div style="margin-top:4px;font-size:5px;color:var(--gray);text-align:center;font-style:italic">
            ≥70% = strong consensus · 55-69% = okay · &lt;55% = downgrade to WATCH
          </div>
        </div>
        <div style="margin-top:6px;font-size:6px;color:var(--gray)">
          ⚠️ This is AI analysis only.<br>
          Always manage your own risk.
        </div>
      </div>
    </div>`;
  },

  // ══════════════════════════════════════════════════════
  // UPDATE TICKER BAR
  // ══════════════════════════════════════════════════════
  updateTicker(prices) {
    const bar = document.getElementById('ticker-bar');
    if (!bar) return;

    const pairs = [
      { sym: 'XAU/USD', key: 'XAUUSD', digits: 3, scale: 3 },
      { sym: 'AUD/USD', key: 'AUDUSD', digits: 5, scale: 0.0005 },
      { sym: 'EUR/USD', key: 'EURUSD', digits: 5, scale: 0.0005 },
      { sym: 'BTC/USD', key: 'BTCUSD', digits: 2, scale: 60 },
      { sym: 'USD Index', key: null, digits: 3, fixed: '104.23', scale: 0.05 },
    ];

    bar.innerHTML = pairs.map(p => {
      const val = p.key ? prices[p.key] : parseFloat(p.fixed);
      if (!val) return '';
      const change  = (Math.random() - 0.49) * (p.scale || 0.0005);
      const isUp    = change >= 0;
      const changePct = (change / val * 100).toFixed(3);
      return `<div class="ticker-item">
        <span class="ticker-sym">${p.sym}</span>
        <span class="ticker-price">${val.toFixed(p.digits - 1)}</span>
        <span class="ticker-change ${isUp ? 'up' : 'dn'}">${isUp ? '+' : ''}${changePct}%</span>
      </div>`;
    }).join('');
  },

  // ══════════════════════════════════════════════════════
  // ACTIVITY LOG
  // ══════════════════════════════════════════════════════
  addLog(team, agent, message) {
    const body = document.getElementById('log-body');
    if (!body) return;

    const now = new Date();
    const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const teamClass = team === 'GOLD' ? 'log-team-gold' : team === 'FX' ? 'log-team-fx' : 'log-team-cmd';

    const entry = document.createElement('div');
    entry.className = `log-entry ${teamClass}`;
    entry.innerHTML = `
      <span class="log-time">[${ts}]</span>
      <span class="log-agent">${agent}</span>
      <span class="log-msg">${message}</span>
    `;

    body.insertBefore(entry, body.firstChild);

    // Keep only 30 entries
    while (body.children.length > 30) body.removeChild(body.lastChild);
  },

  // ══════════════════════════════════════════════════════
  // CLOCK
  // ══════════════════════════════════════════════════════
  updateClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
    el.textContent = `${now.toLocaleTimeString()} | UTC ${utc.toLocaleTimeString()}`;
  },

  // ══════════════════════════════════════════════════════
  // PRICE TAG UPDATE
  // ══════════════════════════════════════════════════════
  updatePriceTags(prices, prevPrices) {
    const tags = [
      { id: 'price-xau', key: 'XAUUSD', digits: 3 },
      { id: 'price-aud', key: 'AUDUSD', digits: 5 },
      { id: 'price-eur', key: 'EURUSD', digits: 5 },
    ];
    tags.forEach(t => {
      const el = document.getElementById(t.id);
      if (!el) return;
      const val  = prices[t.key];
      const prev = prevPrices?.[t.key] ?? val;
      const isUp = val >= prev;
      el.querySelector('.val').textContent = val.toFixed(t.digits - 1);
      el.className = `price-tag ${isUp ? '' : 'dn'}`;
    });
  },
};
if (typeof window !== 'undefined') window.UI = UI;

if (typeof module !== 'undefined') module.exports = { UI };
