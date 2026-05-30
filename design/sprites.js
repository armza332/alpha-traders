/* =====================================================================
   sprites.js — pixel character + status icons (canvas, native px)
   ทุกอย่างวาดที่ native resolution แล้วค่อย scale ขึ้นแบบ pixelated
   ===================================================================== */
(function () {
  // pixel-rect helper
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, w, h);
  }

  // darken a hex color
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt));
    g = Math.max(0, Math.min(255, g + amt));
    b = Math.max(0, Math.min(255, b + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  window.shade = shade;

  /* ---- CHARACTER --------------------------------------------------
     anchor = (cx, by): feet center, bottom y. drawn upward.
     pal = { skin, hair, shirt }
     opts = { frame:0|1, facing:-1|0|1, scale }
     overall footprint ~ 12 wide x 20 tall native px
  ------------------------------------------------------------------- */
  function drawCharacter(ctx, cx, by, pal, opts = {}) {
    const f = opts.frame || 0;
    const face = opts.facing || 0;
    const bob = f === 1 ? -1 : 0;           // body bob while walking
    const pants = "#2a3350";
    const shoe = "#11141f";

    const x = Math.round(cx);
    const y = Math.round(by) + bob;

    // ---- legs (walk swing) ----
    if (f === 1) {
      px(ctx, x - 3, y - 4, 2, 4, pants);   // back leg up
      px(ctx, x + 1, y - 3, 2, 3, pants);
      px(ctx, x - 3, y - 1, 3, 1, shoe);
      px(ctx, x + 1, y - 1, 3, 1, shoe);
    } else {
      px(ctx, x - 3, y - 4, 2, 4, pants);
      px(ctx, x + 1, y - 4, 2, 4, pants);
      px(ctx, x - 4, y - 1, 3, 1, shoe);
      px(ctx, x + 1, y - 1, 3, 1, shoe);
    }

    // ---- body / shirt ----
    const sx = x - 4, sy = y - 12;
    px(ctx, sx, sy, 8, 8, pal.shirt);
    px(ctx, sx, sy, 8, 2, shade(pal.shirt, 28));   // top highlight
    px(ctx, sx, sy + 6, 8, 2, shade(pal.shirt, -34)); // bottom shade
    // chest accent line (zipper)
    px(ctx, x - 1, sy + 1, 1, 6, shade(pal.shirt, 40));

    // ---- arms ----
    px(ctx, sx - 2, sy + 1, 2, 6, pal.shirt);
    px(ctx, sx + 8, sy + 1, 2, 6, pal.shirt);
    px(ctx, sx - 2, sy + 7, 2, 1, pal.skin);  // hands
    px(ctx, sx + 8, sy + 7, 2, 1, pal.skin);

    // ---- head ----
    const hx = x - 3, hy = y - 19;
    px(ctx, hx, hy, 6, 6, pal.skin);
    px(ctx, hx, hy, 6, 1, shade(pal.skin, 24));
    // neck
    px(ctx, x - 1, hy + 6, 2, 1, shade(pal.skin, -20));
    // eyes (visor-style, follow facing)
    const ex = hx + 1 + (face > 0 ? 1 : face < 0 ? 0 : 0) + 0;
    px(ctx, hx + 1 + (face), hy + 3, 1, 2, "#10131c");
    px(ctx, hx + 4 + (face), hy + 3, 1, 2, "#10131c");

    // ---- hair / cap ----
    px(ctx, hx - 1, hy - 1, 8, 3, pal.hair);
    px(ctx, hx - 1, hy + 1, 1, 3, pal.hair);
    px(ctx, hx + 6, hy + 1, 1, 3, pal.hair);
    px(ctx, hx, hy - 1, 6, 1, shade(pal.hair, 30));
  }
  window.drawCharacter = drawCharacter;

  /* ---- shadow under feet ---- */
  function drawShadow(ctx, cx, by) {
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(by) + 1, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  window.drawShadow = drawShadow;

  /* ---- ICONS (tiny pixel, ~9px box) ------------------------------- */
  // drawn centered at (x,y)
  function drawIcon(ctx, type, x, y, color) {
    const c = color || "#0b0f1a";
    const o = (dx, dy, w, h) => px(ctx, x + dx, y + dy, w, h, c);
    switch (type) {
      case "gear": // settings cog
        o(-1, -4, 2, 1); o(-1, 3, 2, 1); o(-4, -1, 1, 2); o(3, -1, 1, 2);
        o(-3, -3, 1, 1); o(2, -3, 1, 1); o(-3, 2, 1, 1); o(2, 2, 1, 1);
        o(-2, -2, 4, 4); px(ctx, x - 1 + 0, y - 1, 1, 1, "#0b0f1a"); // hub hole drawn dark below
        break;
      case "zzz": // sleeping
        o(0, -3, 3, 1); o(1, -2, 1, 1); o(-1, -1, 1, 1); o(-2, 0, 3, 1);
        o(2, 1, 2, 1); o(3, 2, 1, 1); o(1, 3, 1, 1); o(0, 4, 3, 1);
        break;
      case "hour": // hourglass
        o(-3, -4, 6, 1); o(-3, 3, 6, 1);
        o(-2, -3, 1, 1); o(2, -3, 1, 1); o(-1, -2, 3, 1); o(0, -1, 1, 1);
        o(0, 0, 1, 1); o(-1, 1, 3, 1); o(-2, 2, 1, 1); o(2, 2, 1, 1);
        break;
      case "bang": // exclamation
        o(-1, -4, 2, 5); o(-1, 2, 2, 2);
        break;
      case "code": // < >
        o(-3, -1, 1, 1); o(-4, 0, 1, 1); o(-3, 1, 1, 1);
        o(2, -1, 1, 1); o(3, 0, 1, 1); o(2, 1, 1, 1);
        break;
      case "search": // magnifier
        o(-3, -3, 4, 1); o(-3, 1, 4, 1); o(-4, -2, 1, 3); o(1, -2, 1, 3);
        o(2, 2, 1, 1); o(3, 3, 1, 1);
        break;
      case "pen": // pen nib
        o(2, -4, 2, 2); o(0, -2, 2, 2); o(-2, 0, 2, 2); o(-3, 2, 1, 1); o(-4, 3, 1, 1);
        break;
      case "chart": // bars
        o(-3, 1, 1, 2); o(-1, -1, 1, 4); o(1, -3, 1, 6); o(3, 0, 1, 3);
        break;
      case "brush": // brush
        o(2, -4, 2, 2); o(0, -2, 2, 2); o(-2, 0, 2, 2); o(-3, 2, 2, 2);
        break;
    }
  }
  window.drawIcon = drawIcon;

  /* ---- STATUS BUBBLE above head ----------------------------------- */
  // (cx, topY) where topY = y of character's head top
  function drawBubble(ctx, cx, topY, status, t) {
    const S = window.STATUS[status];
    const bx = Math.round(cx) - 7;
    const by = Math.round(topY) - 14;
    const w = 14, h = 12;
    // float animation
    const fy = Math.round(Math.sin(t / 360 + cx) * 1.2);

    const yy = by + fy;
    // bubble body
    px(ctx, bx, yy, w, h, "#0d1322");
    px(ctx, bx + 1, yy + 1, w - 2, h - 2, "#16203a");
    // neon border
    ctx.fillStyle = S.color;
    ctx.fillRect(bx, yy, w, 1);
    ctx.fillRect(bx, yy + h - 1, w, 1);
    ctx.fillRect(bx, yy, 1, h);
    ctx.fillRect(bx + w - 1, yy, 1, h);
    // tail
    px(ctx, cx - 1, yy + h, 2, 2, S.color);
    // icon
    drawIcon(ctx, S.icon, cx, yy + 6, S.color);

    // glow / pulse for working+error
    if (S.glow) {
      const pulse = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t / 240));
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = S.color;
      ctx.fillRect(bx - 1, yy - 1, w + 2, 1);
      ctx.fillRect(bx - 1, yy + h, w + 2, 1);
      ctx.restore();
    }
  }
  window.drawBubble = drawBubble;
})();
