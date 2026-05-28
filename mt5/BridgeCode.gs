/**
 * MT5 Bridge — Apps Script Web App (Phase 12.4)
 *
 * Endpoints:
 *   POST /                            ← EA pushes status + prices
 *        body: {type:'cmd', secret, cmd, ...} from web → enqueue command
 *   GET  /?action=status              → Latest status JSON
 *   GET  /?action=prices              → Latest prices
 *   GET  /?action=command&since=N     → Next pending command after id N (for EA)
 *   GET  /?action=history             → Last 100 status snapshots
 *   GET  /?action=clear               → Wipe stored data
 *
 * Setup:
 * 1. https://script.google.com → New project
 * 2. Paste as Code.gs
 * 3. Deploy → New deployment → Web app (Execute: Me, Access: Anyone)
 * 4. Copy /exec URL → paste into EA WebhookURL + web Settings → Bot Bridge URL
 * 5. MT5 → Tools → Options → Expert Advisors → Allow WebRequest + add:
 *      https://script.google.com
 *      https://script.googleusercontent.com
 */

const SECRET = 'twr-secret';  // Must match EA's WebhookSecret

// ─── POST: Receive status from EA OR command from web ────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) {
      return json({ ok: false, error: 'Invalid secret' });
    }

    const props = PropertiesService.getScriptProperties();

    // ── Phase 12.6: EA → Web trade record (for AI training) ──
    if (data.type === 'trade') {
      let trades;
      try { trades = JSON.parse(props.getProperty('LIVE_TRADES') || '[]'); }
      catch (e) { trades = []; }
      // Phase 18: dedupe — skip if this posId already recorded
      if (data.posId && trades.some(function(t){ return String(t.posId) === String(data.posId); })) {
        return json({ ok: true, msg: 'duplicate skipped', count: trades.length });
      }
      trades.unshift({
        sym:       data.sym,
        side:      data.side,
        entry:     data.entry,
        exit:      data.exit,
        profit:    data.profit,
        rMult:     data.rMult,
        outcome:   data.outcome,
        rsiAtEntry:    data.rsiAtEntry,
        bbPosAtEntry:  data.bbPosAtEntry,
        sessionAtEntry: data.sessionAtEntry,
        openTime:  data.openTime,
        closeTime: data.closeTime,
        posId:     data.posId,
      });
      if (trades.length > 500) trades.length = 500;   // keep last 500
      props.setProperty('LIVE_TRADES', JSON.stringify(trades));
      return json({ ok: true, msg: 'trade recorded', count: trades.length });
    }

    // ── Phase 12.4 + 12.9 + 13: Web → EA command enqueue ──
    if (data.type === 'cmd') {
      const base = ['close_all', 'pause', 'resume', 'reset_pnl'];
      const c = String(data.cmd || '');
      const isToggle = /^sym_[1-3]_(on|off)$/.test(c);            // Phase 12.9 per-symbol
      const isAISig  = /^ai_(buy|sell)_[A-Za-z0-9]+$/.test(c);    // Phase 13 AI signals
      if (!base.includes(c) && !isToggle && !isAISig) {
        return json({ ok: false, error: 'Unknown cmd: ' + c });
      }
      const lastId = parseInt(props.getProperty('LAST_CMD_ID') || '0', 10);
      const newId  = lastId + 1;
      const cmd = { id: newId, cmd: data.cmd, ts: Date.now() };
      props.setProperty('LAST_CMD',    JSON.stringify(cmd));
      props.setProperty('LAST_CMD_ID', String(newId));
      return json({ ok: true, msg: 'Command queued', id: newId });
    }

    // ── Phase 26: store / clear Google Gemini API key (server-side only) ──
    if (data.type === 'set_ai_key') {
      if (data.clear) { props.deleteProperty('GEMINI_KEY'); return json({ ok: true, msg: 'AI key cleared' }); }
      if (typeof data.key === 'string' && data.key.length > 10) {
        props.setProperty('GEMINI_KEY', data.key);
        if (data.model) props.setProperty('GEMINI_MODEL', data.model);
        return json({ ok: true, msg: 'AI key stored' });
      }
      return json({ ok: false, error: 'bad key' });
    }

    // ── EA → status push ──
    data.receivedAt = Date.now();
    props.setProperty('LATEST_STATUS', JSON.stringify(data));

    // Phase 12.3: store prices separately
    if (data.prices && typeof data.prices === 'object') {
      const pricesPayload = {
        prices:     data.prices,
        ts:         data.ts,
        receivedAt: data.receivedAt,
        symbols:    data.symbols || [],
      };
      props.setProperty('LATEST_PRICES', JSON.stringify(pricesPayload));
    }

    // Append to history (last 100 records)
    let history;
    try { history = JSON.parse(props.getProperty('HISTORY') || '[]'); }
    catch (e) { history = []; }
    history.unshift({
      ts:       data.ts,
      balance:  data.balance,
      equity:   data.equity,
      pnl:      data.todayPnL,
      wins:     data.todayWins,
      losses:   data.todayLosses,
      posCount: (data.positions || []).length,
    });
    if (history.length > 100) history.length = 100;
    props.setProperty('HISTORY', JSON.stringify(history));

    return json({ ok: true, msg: 'received' });
  } catch (err) {
    return json({ ok: false, error: err.toString() });
  }
}

// ─── GET: Serve to web dashboard OR command to EA ────────
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const action = (e.parameter && e.parameter.action) || 'status';

  if (action === 'status') {
    const raw = props.getProperty('LATEST_STATUS');
    if (!raw) return json({ ok: false, msg: 'No data yet — EA not connected' });
    const data = JSON.parse(raw);
    const ageSec = (Date.now() - data.receivedAt) / 1000;
    data.ageSec = Math.round(ageSec);
    data.online = ageSec < 300;
    return json({ ok: true, status: data });
  }

  if (action === 'prices') {
    const raw = props.getProperty('LATEST_PRICES');
    if (!raw) return json({ ok: false, msg: 'No prices yet — EA not connected' });
    const data = JSON.parse(raw);
    const ageSec = (Date.now() - data.receivedAt) / 1000;
    data.ageSec = Math.round(ageSec);
    data.online = ageSec < 300;
    return json({ ok: true, prices: data.prices, ts: data.ts, ageSec: data.ageSec, online: data.online, symbols: data.symbols });
  }

  // ── Phase 12.4: EA polls for commands ──
  if (action === 'command') {
    // Optional secret check (EA passes it)
    if (e.parameter.secret && e.parameter.secret !== SECRET) {
      return json({ ok: false, error: 'Invalid secret' });
    }
    const since = parseInt(e.parameter.since || '0', 10);
    const raw = props.getProperty('LAST_CMD');
    if (!raw) return json({ ok: true, msg: 'No commands', id: 0 });
    const cmd = JSON.parse(raw);
    if (cmd.id <= since) return json({ ok: true, msg: 'No new commands', id: cmd.id });
    return json({ ok: true, cmd: cmd.cmd, id: cmd.id, ts: cmd.ts });
  }

  if (action === 'history') {
    const h = JSON.parse(props.getProperty('HISTORY') || '[]');
    return json({ ok: true, history: h });
  }

  // Phase 12.6: live trades for AI training
  if (action === 'trades') {
    const trades = JSON.parse(props.getProperty('LIVE_TRADES') || '[]');
    const since = parseInt(e.parameter.since || '0', 10);
    const filtered = since > 0 ? trades.filter(t => t.closeTime > since) : trades;
    return json({ ok: true, trades: filtered, total: trades.length });
  }

  // ── Phase 26: AI key status — never returns the key itself ──
  if (action === 'ai_status') {
    return json({ ok: true, hasKey: !!props.getProperty('GEMINI_KEY'),
                  model: props.getProperty('GEMINI_MODEL') || 'gemini-2.0-flash' });
  }

  // ── Phase 26: AI proxy → Google Gemini (key stays server-side) ──
  if (action === 'ai') {
    if (e.parameter.secret !== SECRET) return json({ ok: false, error: 'Invalid secret' });
    const key = props.getProperty('GEMINI_KEY');
    if (!key) return json({ ok: false, error: 'No AI key set — บันทึก key ใน Settings ก่อน' });
    const model  = props.getProperty('GEMINI_MODEL') || 'gemini-2.0-flash';
    const prompt = e.parameter.prompt || '';
    const system = e.parameter.system || '';
    if (!prompt) return json({ ok: false, error: 'empty prompt' });
    try {
      const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const resp = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
      );
      const out  = JSON.parse(resp.getContentText());
      const text = out && out.candidates && out.candidates[0] && out.candidates[0].content &&
                   out.candidates[0].content.parts && out.candidates[0].content.parts[0].text;
      if (!text) return json({ ok: false, error: (out.error && out.error.message) || 'no text from model' });
      return json({ ok: true, text: text, model: model });
    } catch (err) {
      return json({ ok: false, error: err.toString() });
    }
  }

  if (action === 'clear') {
    props.deleteProperty('LATEST_STATUS');
    props.deleteProperty('LATEST_PRICES');
    props.deleteProperty('LAST_CMD');
    props.deleteProperty('LAST_CMD_ID');
    props.deleteProperty('HISTORY');
    props.deleteProperty('LIVE_TRADES');
    return json({ ok: true, msg: 'Cleared' });
  }

  return json({ ok: false, msg: 'Unknown action' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
