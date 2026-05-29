// ════════════════════════════════════════════════════════════════════
//  SPRITE SLICER (Phase 26.3) — crop the green-screen sprite sheet into
//  transparent per-character avatars, entirely in the browser (Canvas).
//  No external image tools needed; chroma-keys the green background out.
//
//  Sheet: assets/sprites.png (1376×768) — title strip on top, then a
//  COLS×ROWS grid of characters. Each employee carries sprite:[col,row].
// ════════════════════════════════════════════════════════════════════
const SpriteSlicer = {
  SHEET: 'assets/sprites.png?v=40',
  COLS: 11, ROWS: 3, TITLE_H: 70,   // px of the title strip to skip
  _img: null, _ready: false, _cache: {},

  load(cb) {
    if (this._ready) { cb && cb(); return; }
    if (this._img) return;                 // already loading
    const img = new Image();
    img.onload  = () => { this._img = img; this._ready = true; cb && cb(); };
    img.onerror = () => { this._img = null; };
    img.src = this.SHEET;
    this._img = img;
  },

  // crop cell (col,row) → transparent dataURL (cached)
  crop(col, row) {
    const key = col + '_' + row;
    if (this._cache[key]) return this._cache[key];
    if (!this._ready || !this._img) return null;
    const W = this._img.naturalWidth, H = this._img.naturalHeight;
    const cellW = W / this.COLS;
    const bodyH = (H - this.TITLE_H) / this.ROWS;
    // inset sides so neighbouring characters don't bleed in; keep full height
    // (top→bottom) so the whole figure shows and heads/legs aren't clipped
    const insetX = cellW * 0.16, insetTop = 0, insetBot = 0;
    const srcX = col * cellW + insetX;
    const srcY = this.TITLE_H + row * bodyH + insetTop;
    const srcW = cellW - insetX * 2;
    const srcH = bodyH - insetTop - insetBot;

    const cv = document.createElement('canvas');
    cv.width = Math.round(srcW); cv.height = Math.round(srcH);
    const ctx = cv.getContext('2d');
    ctx.drawImage(this._img, srcX, srcY, srcW, srcH, 0, 0, cv.width, cv.height);
    try {
      const id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        // green-screen key: strong green, weak red/blue → transparent
        if (g > 90 && r < g * 0.75 && b < g * 0.75) d[i + 3] = 0;
      }
      ctx.putImageData(id, 0, 0);
      const url = cv.toDataURL('image/png');
      this._cache[key] = url;
      return url;
    } catch (e) { return null; }   // tainted canvas (cross-origin) — skip
  },

  // fill every <img class="twr-ava" data-sc data-sr> that has no src yet
  fillAvatars() {
    if (!this._ready) { this.load(() => this.fillAvatars()); return; }
    document.querySelectorAll('img.twr-ava[data-sc]').forEach(el => {
      if (el.dataset.done) return;
      const url = this.crop(parseInt(el.dataset.sc, 10), parseInt(el.dataset.sr, 10));
      if (url) { el.src = url; el.dataset.done = '1'; }
    });
  },
};
if (typeof window !== 'undefined') window.SpriteSlicer = SpriteSlicer;
document.addEventListener('DOMContentLoaded', () => {
  SpriteSlicer.load(() => SpriteSlicer.fillAvatars());
  setInterval(() => SpriteSlicer.fillAvatars(), 1500);   // cheap (cached) — covers re-renders
});
