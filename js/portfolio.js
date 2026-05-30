// ════════════════════════════════════════════════════════════════════
//  PORTFOLIO SELECTOR (Phase 26) — choose which pairs to "grow"
//  Big on/off cards on the main dashboard, wired to the existing
//  enableXAU / enableAUD / enableEUR settings so a toggle takes effect
//  everywhere instantly (signals, trading, alerts, team analysis).
// ════════════════════════════════════════════════════════════════════
const TWRPortfolio = {
  PAIRS: [
    { sym: 'XAUUSD', key: 'enableXAU', emoji: '🥇', name: 'GOLD',   desc: 'XAU/USD', dp: 2 },
    { sym: 'AUDUSD', key: 'enableAUD', emoji: '🇦🇺', name: 'AUSSIE', desc: 'AUD/USD', dp: 4 },
    { sym: 'EURUSD', key: 'enableEUR', emoji: '🇪🇺', name: 'EURO',   desc: 'EUR/USD', dp: 4 },
    { sym: 'BTCUSD', key: 'enableBTC', emoji: '₿',  name: 'BITCOIN',desc: 'BTC/USD · 24/7', dp: 1 },
  ],

  render() {
    const box = document.getElementById('portfolio-cards');
    if (!box || typeof Settings === 'undefined') return;
    const onCount = this.PAIRS.filter(p => Settings.get(p.key, true)).length;

    box.innerHTML = this.PAIRS.map(p => {
      const on  = Settings.get(p.key, true);
      const px  = (typeof TradingWarRoom !== 'undefined') ? TradingWarRoom?.market?.prices?.[p.sym] : null;
      const pxT = (typeof px === 'number') ? px.toFixed(p.dp) : '—';
      return `<div onclick="TWRPortfolio.toggle('${p.key}')" title="คลิกเพื่อเปิด/ปิด"
          style="cursor:pointer;flex:1;min-width:120px;border:2px solid ${on ? 'var(--green)' : 'var(--gray)'};
                 border-radius:8px;padding:9px;transition:.15s;
                 background:${on ? 'rgba(0,255,128,.08)' : 'rgba(128,128,128,.05)'};opacity:${on ? 1 : .45}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px">${p.emoji} <b>${p.name}</b></span>
          <span style="font-size:8px;font-weight:bold;color:${on ? 'var(--green)' : 'var(--gray)'}">${on ? '🟢 ON' : '⚪ OFF'}</span>
        </div>
        <div style="font-size:6px;color:var(--gray);margin-top:4px">${p.desc} · <span style="color:var(--teal)">${pxT}</span></div>
      </div>`;
    }).join('') +
    `<div style="flex:0 0 100%;font-size:6px;color:var(--gray);text-align:right;margin-top:2px">
        กำลังปั้น ${onCount}/${this.PAIRS.length} พอร์ต · ${onCount === 0 ? '⚠️ ปิดหมด = ไม่เทรดเลย' : 'คลิกการ์ดเพื่อสลับ'}</div>`;
  },

  toggle(key) {
    if (typeof Settings === 'undefined') return;
    Settings.set(key, !Settings.get(key, true));
    // keep the Settings-modal checkbox in sync (so both views agree)
    const cb = document.getElementById('s-' + key);
    if (cb) cb.checked = Settings.get(key, true);
    this.render();
    // apply immediately
    if (typeof TradingWarRoom !== 'undefined' && TradingWarRoom.fullUpdate) {
      try { TradingWarRoom.fullUpdate(); } catch (e) {}
    }
    if (typeof UI !== 'undefined') {
      const p = this.PAIRS.find(x => x.key === key);
      UI.addLog?.('CMD', 'Portfolio', `${p ? p.emoji + ' ' + p.name : key} → ${Settings.get(key, true) ? '🟢 เปิดปั้น' : '⚪ พัก'}`);
    }
  },
};
if (typeof window !== 'undefined') window.TWRPortfolio = TWRPortfolio;
// self-init: render on boot + refresh prices every few seconds
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => TWRPortfolio.render(), 300);
  setInterval(() => TWRPortfolio.render(), 3000);
});
