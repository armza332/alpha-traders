// ════════════════════════════════════════════════════════════════════
//  AI BRIDGE (Phase 26) — talk to Google Gemini via the Apps Script
//  bridge, so the API key NEVER lives in the browser.
//    • saveKey()  → POST no-cors (fire-and-forget) then confirm via status
//    • status()   → GET, returns { hasKey, model } (never the key itself)
//    • ask()      → GET ?action=ai (response is readable cross-origin)
// ════════════════════════════════════════════════════════════════════
const AIBridge = {
  SECRET: 'twr-secret',
  url() { return (typeof Settings !== 'undefined') ? Settings.get('botBridgeURL', '').trim() : ''; },

  async status() {
    const u = this.url();
    if (!u) return { ok: false, hasKey: false, error: 'no bridge url' };
    try { const r = await fetch(u + '?action=ai_status&t=' + Date.now()); return await r.json(); }
    catch (e) { return { ok: false, hasKey: false, error: String(e) }; }
  },

  // model options per provider (UI dropdown)
  _MODELS: {
    gemini: ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    groq:   ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'],
  },

  // Store the key on the server. no-cors → can't read reply, so we poll status.
  async saveKey(key, model, provider) {
    const u = this.url();
    if (!u) return { ok: false, error: 'ยังไม่ได้ตั้ง Bot Bridge URL' };
    try {
      await fetch(u, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'set_ai_key', secret: this.SECRET, key: key,
                               model: model || 'gemini-2.0-flash-lite', provider: provider || 'gemini' })
      });
    } catch (e) { return { ok: false, error: String(e) }; }
    await new Promise(r => setTimeout(r, 1000));   // let the server persist
    return await this.status();
  },

  async clearKey() {
    const u = this.url(); if (!u) return { ok: false };
    try {
      await fetch(u, { method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'set_ai_key', secret: this.SECRET, clear: true }) });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 800));
    return await this.status();
  },

  // Ask Gemini. prompt + optional system. Returns { ok, text } or { ok:false, error }.
  async ask(prompt, system) {
    const u = this.url();
    if (!u) return { ok: false, error: 'ยังไม่ได้ตั้ง Bot Bridge URL' };
    let q = u + '?action=ai&secret=' + this.SECRET + '&prompt=' + encodeURIComponent(prompt || '');
    if (system) q += '&system=' + encodeURIComponent(system);
    q += '&t=' + Date.now();
    if (q.length > 7000) return { ok: false, error: 'prompt ยาวเกินไปสำหรับช่องทาง GET (ลดขนาด)' };
    try { const r = await fetch(q); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  },

  // ── Settings UI helpers (called from buttons in index.html) ──
  // repopulate the model dropdown when provider changes
  _uiProviderChange() {
    const p   = document.getElementById('s-aiprovider')?.value || 'gemini';
    const sel = document.getElementById('s-aimodel'); if (!sel) return;
    sel.innerHTML = (this._MODELS[p] || []).map(m => `<option value="${m}">${m}</option>`).join('');
    const hint = document.getElementById('ai-key-hint');
    if (hint) hint.innerHTML = (p === 'groq')
      ? '<b style="color:var(--teal)">📘 หา key ฟรี:</b> <a href="https://console.groq.com/keys" target="_blank" style="color:var(--teal)">console.groq.com/keys</a> → Create API Key'
      : '<b style="color:var(--teal)">📘 หา key:</b> <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--teal)">aistudio.google.com/app/apikey</a>';
  },

  async _uiSave() {
    const inp = document.getElementById('s-aikey');
    const sel = document.getElementById('s-aimodel');
    const pv  = document.getElementById('s-aiprovider');
    const st  = document.getElementById('ai-key-status');
    if (!inp) return;
    const key      = inp.value.trim();
    const model    = sel ? sel.value : 'llama-3.3-70b-versatile';
    const provider = pv ? pv.value : 'gemini';
    if (key.length < 10) { if (st) st.innerHTML = '<span style="color:var(--red)">❌ key สั้นเกินไป</span>'; return; }
    if (st) st.innerHTML = '⏳ กำลังบันทึกขึ้นเซิร์ฟเวอร์...';
    const res = await this.saveKey(key, model, provider);
    inp.value = '';   // never keep the key in the field/DOM
    if (st) st.innerHTML = res.hasKey
      ? `<span style="color:var(--green)">✅ เก็บแล้ว · ${res.provider || provider} · ${res.model || model}</span>`
      : `<span style="color:var(--red)">❌ ไม่สำเร็จ: ${res.error || 'ตรวจ Bridge URL + re-deploy Apps Script'}</span>`;
  },
  async _uiTest() {
    const st = document.getElementById('ai-key-status');
    if (st) st.innerHTML = '⏳ ทดสอบเรียก Gemini...';
    const res = await this.ask('ตอบกลับสั้นๆ ว่า "เชื่อมต่อ Gemini สำเร็จ" เป็นภาษาไทย');
    if (st) st.innerHTML = res.ok
      ? `<span style="color:var(--green)">✅ ${(res.text || '').slice(0, 80)}</span>`
      : `<span style="color:var(--red)">❌ ${res.error || 'failed'}</span>`;
  },
  async _uiStatus() {
    const st = document.getElementById('ai-key-status'); if (!st) return;
    const s = await this.status();
    st.innerHTML = s.hasKey
      ? `<span style="color:var(--green)">🟢 มี key บนเซิร์ฟเวอร์ · ${s.provider || 'gemini'} · ${s.model}</span>`
      : `<span style="color:var(--gray)">⚪ ยังไม่มี key — ใส่แล้วกดบันทึก</span>`;
  },
};
if (typeof window !== 'undefined') window.AIBridge = AIBridge;
