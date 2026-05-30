// ════════════════════════════════════════════════════════════════════
//  SPRITE SLICER (Phase 26.6) — crop the team sprite sheet into
//  per-character avatars, entirely in the browser (Canvas).
//
//  Sheet: assets/team-cards.png (960×1111) — a 5×4 grid of FULL-BODY
//  characters on a gray checker background. We crop each character's
//  exact bounding box (head→feet) and key out the gray so the figure
//  sits cleanly on the dark desk panel.
//  Each employee carries sprite:[col,row]  (col 0-4, row 0-3).
// ════════════════════════════════════════════════════════════════════
const SpriteSlicer = {
  SHEET: 'assets/team-cards.png?v=55',
  // grid geometry in SOURCE pixels (relative to a 960×1111 sheet).
  // Per-column X span and per-row Y span of the character bounding boxes.
  BASE_W: 960, BASE_H: 1111,
  COLX: [[97, 170], [271, 346], [444, 520], [618, 693], [793, 867]],
  ROWY: [[79, 278], [343, 547], [611, 815], [865, 1067]],
  COLS: 5, ROWS: 4, PAD: 12,
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
    const cx = this.COLX[col], ry = this.ROWY[row];
    const x0 = (cx[0] - this.PAD) * sx, x1 = (cx[1] + this.PAD) * sx;
    const y0 = (ry[0] - this.PAD) * sy, y1 = (ry[1] + this.PAD) * sy;
    const srcW = x1 - x0, srcH = y1 - y0;

    const cv = document.createElement('canvas');
    cv.width = Math.round(srcW); cv.height = Math.round(srcH);
    const ctx = cv.getContext('2d');
    ctx.drawImage(this._img, x0, y0, srcW, srcH, 0, 0, cv.width, cv.height);
    try {
      const id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), br = (r + g + b) / 3;
        // gray-checker key: flat gray (low saturation, mid brightness) → transparent
        if ((mx - mn) < 18 && br > 48 && br < 112) d[i + 3] = 0;
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
