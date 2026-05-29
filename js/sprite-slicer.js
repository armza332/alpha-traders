// ════════════════════════════════════════════════════════════════════
//  SPRITE SLICER (Phase 26.5) — crop the team-card roster sheet into
//  per-character avatars, entirely in the browser (Canvas).
//
//  Sheet: assets/team-cards.png (960×1111) — a 5×4 grid of character
//  cards (portrait on top, name band below). We crop ONLY the character
//  region of each card (skip the name band + frame) and key out the
//  gray gutter so the figure sits cleanly on the dark desk panel.
//  Each employee carries sprite:[col,row]  (col 0-4, row 0-3).
// ════════════════════════════════════════════════════════════════════
const SpriteSlicer = {
  SHEET: 'assets/team-cards.png?v=54',
  // grid geometry in SOURCE pixels (relative to a 960×1111 sheet)
  BASE_W: 960, BASE_H: 1111,
  XE: [18, 203, 388, 573, 758, 943],   // 5 columns → 6 vertical edges
  YE: [80, 328, 593, 851, 1080],       // 4 rows    → 5 horizontal edges
  COLS: 5, ROWS: 4,
  INSET_X: 14, TOP_PAD: 10, CHAR_FRAC: 0.62,  // crop just the character (skip name band)
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

  // crop card (col,row) → transparent dataURL (cached)
  crop(col, row) {
    col = Math.max(0, Math.min(this.COLS - 1, col | 0));
    row = Math.max(0, Math.min(this.ROWS - 1, row | 0));
    const key = col + '_' + row;
    if (this._cache[key]) return this._cache[key];
    if (!this._ready || !this._img) return null;

    const W = this._img.naturalWidth, H = this._img.naturalHeight;
    const sx = W / this.BASE_W, sy = H / this.BASE_H;   // scale if served size differs
    const x0 = (this.XE[col]     + this.INSET_X) * sx;
    const x1 = (this.XE[col + 1] - this.INSET_X) * sx;
    const rTop = this.YE[row], rh = this.YE[row + 1] - this.YE[row];
    const y0 = (rTop + this.TOP_PAD) * sy;
    const y1 = (rTop + Math.round(rh * this.CHAR_FRAC)) * sy;
    const srcW = x1 - x0, srcH = y1 - y0;

    const cv = document.createElement('canvas');
    cv.width = Math.round(srcW); cv.height = Math.round(srcH);
    const ctx = cv.getContext('2d');
    ctx.drawImage(this._img, x0, y0, srcW, srcH, 0, 0, cv.width, cv.height);
    try {
      const id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        // gray-gutter key: flat gray ~73 (low saturation, mid brightness) → transparent
        if ((mx - mn) < 16 && r > 56 && r < 100) d[i + 3] = 0;
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
