/**
 * TRADING WAR ROOM — Google Apps Script Backend
 *
 * 3 หน้าที่หลัก:
 *   1. doGet()         — serve หน้าเว็บ HTML
 *   2. sendTelegram()  — relay สัญญาณไป Telegram (กัน CORS, ซ่อน token)
 *   3. logSignal()     — บันทึก signal log ลง Google Sheet
 *
 * วิธี deploy: ดู README.md ใน folder นี้
 */

// ═══════════════════ CONFIG ═══════════════════
// เก็บใน PropertiesService (ไม่ hardcode ใน code)
// ตั้งครั้งแรกผ่าน setupConfig() แล้วลบทิ้งได้
function setupConfig() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'TELEGRAM_BOT_TOKEN': 'PUT_YOUR_BOT_TOKEN_HERE',
    'TELEGRAM_CHAT_ID':   'PUT_YOUR_CHAT_ID_HERE',
    'LOG_SHEET_ID':       '',  // optional: Google Sheet ID for logging
    'PRICE_API_KEY':      'PUT_YOUR_TWELVEDATA_KEY_HERE',  // signup: twelvedata.com
  });
  Logger.log('Config saved');
}

// ═══════════════════ REAL PRICE FEED (Twelve Data) ═══════════════════
// Called from browser via google.script.run.fetchRealPrices()
function fetchRealPrices() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('PRICE_API_KEY');
  if (!apiKey || apiKey.indexOf('PUT_') === 0) return null;

  // Cache 60s to respect rate limit
  const cache = CacheService.getScriptCache();
  const cached = cache.get('PRICES');
  if (cached) return JSON.parse(cached);

  try {
    const url = `https://api.twelvedata.com/price?symbol=XAU/USD,AUD/USD,EUR/USD&apikey=${encodeURIComponent(apiKey)}`;
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(r.getContentText());
    const px = {
      XAUUSD: parseFloat(data['XAU/USD'] && data['XAU/USD'].price),
      AUDUSD: parseFloat(data['AUD/USD'] && data['AUD/USD'].price),
      EURUSD: parseFloat(data['EUR/USD'] && data['EUR/USD'].price),
    };
    if (!isFinite(px.XAUUSD) || !isFinite(px.AUDUSD) || !isFinite(px.EURUSD)) return null;
    cache.put('PRICES', JSON.stringify(px), 60);
    return px;
  } catch (e) {
    return null;
  }
}

// ═══════════════════ HISTORY FETCH (Twelve Data /time_series) ═══════════════════
function fetchHistory(symbol, interval, size) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('PRICE_API_KEY');
  if (!apiKey || apiKey.indexOf('PUT_') === 0) return null;

  const cache = CacheService.getScriptCache();
  const cacheKey = `HIST_${symbol}_${interval}_${size}`;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const tdSym = symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2');
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval || '5min'}&outputsize=${size || 200}&apikey=${encodeURIComponent(apiKey)}`;
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(r.getContentText());
    if (!data.values || data.status === 'error') return null;
    const candles = data.values.reverse().map(v => ({
      open:   parseFloat(v.open),
      high:   parseFloat(v.high),
      low:    parseFloat(v.low),
      close:  parseFloat(v.close),
      volume: parseFloat(v.volume) || 1000,
      ts:     new Date(v.datetime).getTime(),
    })).filter(c => isFinite(c.close));
    // Cache for 5 minutes
    cache.put(cacheKey, JSON.stringify(candles), 300);
    return candles;
  } catch (e) {
    return null;
  }
}

// ═══════════════════ MAIN: SERVE WEBPAGE ═══════════════════
// MULTI-FILE pattern (Apps Script standard):
//   Index.html contains <?!= include('Market'); ?> etc.
//   include() loads each .html as raw text (no template processing),
//   so JS strings/template-literals stay intact.
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Trading War Room — AI Agent System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include helper — used inside <?!= include('Name'); ?> in Index.html
// createHtmlOutputFromFile returns content untouched (no scriptlet processing),
// which is what we need for JS files that contain `${...}`, `<`, etc.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ═══════════════════ TELEGRAM RELAY ═══════════════════
// Browser side calls google.script.run.sendTelegram(message)
function sendTelegram(message) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');

  if (!token || !chatId || token.indexOf('PUT_') === 0) {
    return { ok: false, error: 'Telegram not configured. Run setupConfig() first.' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  };

  try {
    const r = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const data = JSON.parse(r.getContentText());
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

// ═══════════════════ LOG SIGNAL TO SHEET ═══════════════════
function logSignal(payload) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!sheetId) return { ok: false, error: 'No sheet configured' };

  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Signals') ||
                  SpreadsheetApp.openById(sheetId).insertSheet('Signals');

    // Init headers if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp','Grade','Signal','Symbol','Entry','SL','TP1','TP2','RR','Confidence','Consensus']);
    }

    sheet.appendRow([
      new Date(),
      payload.grade,
      payload.signal,
      payload.symbol,
      payload.entry,
      payload.sl,
      payload.tp1,
      payload.tp2,
      payload.rr,
      payload.conf,
      payload.consensus,
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

// ═══════════════════ TIME-BASED CRON (Optional) ═══════════════════
// ตั้ง trigger ทุก 5 นาที — ส่ง heartbeat ไป Telegram
function cronHeartbeat() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('HEARTBEAT_ENABLED') !== 'true') return;
  sendTelegram(`🟢 Trading War Room heartbeat — ${new Date().toLocaleString()}`);
}

// Helper: install heartbeat trigger
function installHeartbeatTrigger() {
  ScriptApp.newTrigger('cronHeartbeat').timeBased().everyMinutes(15).create();
  Logger.log('Heartbeat trigger installed (every 15 min)');
}

// ═══════════════════ WEBHOOK FOR TRADINGVIEW (Advanced) ═══════════════════
// TradingView indicator alert → webhook URL → doPost() here
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Format: { "symbol": "XAUUSD", "signal": "buy", "entry": "4571", ... }
    const msg = `📡 <b>TV Alert: ${data.signal.toUpperCase()} ${data.symbol}</b>\n` +
                `Entry: <code>${data.entry}</code>\n` +
                `Time: ${new Date().toLocaleString()}`;

    sendTelegram(msg);
    logSignal({
      grade: 'TV',
      signal: data.signal,
      symbol: data.symbol,
      entry: data.entry,
      sl: data.sl || '',
      tp1: data.tp1 || '',
      tp2: '',
      rr: '',
      conf: '',
      consensus: '',
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
