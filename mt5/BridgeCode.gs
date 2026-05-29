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

// Phase 26: paste your Google Sheet ID here to archive every closed trade.
// Get it from the Sheet URL: docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
// Leave '' to disable (no error). First run will ask to authorize Sheets access.
const SHEET_ID = '';

// Append one closed trade as a row (creates the Trades tab + header on first use)
function appendTradeToSheet(d) {
  if (!SHEET_ID) return;
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName('Trades');
    if (!sh) {
      sh = ss.insertSheet('Trades');
      sh.appendRow(['closeTime','date','sym','side','agent','entry','exit','profit','rMult','outcome','posId']);
    }
    const dt = d.closeTime ? new Date(d.closeTime * 1000) : new Date();
    sh.appendRow([dt, Utilities.formatDate(dt, 'GMT', 'yyyy-MM-dd'),
                  d.sym, d.side, d.agent || '', d.entry, d.exit, d.profit,
                  d.rMult, d.outcome, String(d.posId)]);
  } catch (err) { /* Sheets not authorized / bad ID — silently skip */ }
}

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
        agent:         data.agent,         // Phase 26: which web agent fired it

        openTime:  data.openTime,
        closeTime: data.closeTime,
        posId:     data.posId,
      });
      if (trades.length > 500) trades.length = 500;   // keep last 500
      props.setProperty('LIVE_TRADES', JSON.stringify(trades));
      appendTradeToSheet(data);   // Phase 26: archive to Google Sheet (if SHEET_ID set)
      return json({ ok: true, msg: 'trade recorded', count: trades.length });
    }

    // ── Phase 12.4 + 12.9 + 13: Web → EA command enqueue ──
    if (data.type === 'cmd') {
      const base = ['close_all', 'pause', 'resume', 'reset_pnl', 'mode_web', 'mode_ea', 'mode_both'];
      const c = String(data.cmd || '');
      const isToggle = /^sym_[1-3]_(on|off)$/.test(c);            // Phase 12.9 per-symbol
      const isAISig  = /^ai_(buy|sell)_[A-Za-z0-9_]+$/.test(c);   // Phase 13 AI signals (+agent tag suffix)
      const isCombo  = /^combo_[A-Za-z]{6}_[a-z.]+$/.test(c);     // Phase C: per-pair combo push
      if (!base.includes(c) && !isToggle && !isAISig && !isCombo) {
        return json({ ok: false, error: 'Unknown cmd: ' + c });
      }
      const lastId = parseInt(props.getProperty('LAST_CMD_ID') || '0', 10);
      const newId  = lastId + 1;
      const cmd = { id: newId, cmd: data.cmd, ts: Date.now() };
      props.setProperty('LAST_CMD',    JSON.stringify(cmd));
      props.setProperty('LAST_CMD_ID', String(newId));
      return json({ ok: true, msg: 'Command queued', id: newId });
    }

    // ── Phase 26: store / clear AI key + provider + model (server-side) ──
    if (data.type === 'set_ai_key') {
      if (data.clear) { props.deleteProperty('GEMINI_KEY'); return json({ ok: true, msg: 'AI key cleared' }); }
      var saved = false;
      if (typeof data.key === 'string' && data.key.length > 10) { props.setProperty('GEMINI_KEY', data.key); saved = true; }
      if (data.model)    { props.setProperty('GEMINI_MODEL', data.model);    saved = true; }
      if (data.provider) { props.setProperty('AI_PROVIDER',  data.provider); saved = true; }
      if (saved) return json({ ok: true, msg: 'AI settings stored' });
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
                  provider: props.getProperty('AI_PROVIDER') || 'gemini',
                  model: props.getProperty('GEMINI_MODEL') || 'gemini-2.0-flash-lite' });
  }

  // ── Phase 26: AI proxy (provider-aware: Gemini OR Groq) — key server-side ──
  if (action === 'ai') {
    if (e.parameter.secret !== SECRET) return json({ ok: false, error: 'Invalid secret' });
    var key = props.getProperty('GEMINI_KEY');
    if (!key) return json({ ok: false, error: 'No AI key set — บันทึก key ใน Settings ก่อน' });
    var provider = props.getProperty('AI_PROVIDER') || 'gemini';
    var model    = props.getProperty('GEMINI_MODEL') ||
                   (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.0-flash-lite');
    var prompt = e.parameter.prompt || '';
    var system = e.parameter.system || '';
    if (!prompt) return json({ ok: false, error: 'empty prompt' });
    try {
      if (provider === 'groq') {
        // Groq — OpenAI-compatible chat completions
        var msgs = [];
        if (system) msgs.push({ role: 'system', content: system });
        msgs.push({ role: 'user', content: prompt });
        var gr = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'post', contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + key },
          payload: JSON.stringify({ model: model, messages: msgs, temperature: 0.7 }),
          muteHttpExceptions: true
        });
        var go = JSON.parse(gr.getContentText());
        var gt = go && go.choices && go.choices[0] && go.choices[0].message && go.choices[0].message.content;
        if (!gt) return json({ ok: false, error: (go.error && go.error.message) || 'no text from groq' });
        return json({ ok: true, text: gt, model: model, provider: 'groq' });
      }
      // default — Google Gemini
      var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      var resp = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
      );
      var out  = JSON.parse(resp.getContentText());
      var text = out && out.candidates && out.candidates[0] && out.candidates[0].content &&
                 out.candidates[0].content.parts && out.candidates[0].content.parts[0].text;
      if (!text) return json({ ok: false, error: (out.error && out.error.message) || 'no text from model' });
      return json({ ok: true, text: text, model: model, provider: 'gemini' });
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
