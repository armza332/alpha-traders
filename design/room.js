/* =====================================================================
   room.js — static sci-fi hall background + furniture + spot layout
   native canvas: 640 x 384
   ===================================================================== */
(function () {
  const W = 640, H = 384;
  const FLOOR_Y = 96;

  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }

  /* ---------- LAYOUT: seat spots (exported) ----------------------- */
  // desk spots — agent stands IN FRONT of desk (busy / error)
  const DESKS = [
    { dx: 80,  dy: 150 }, { dx: 192, dy: 150 }, { dx: 304, dy: 150 }, { dx: 416, dy: 150 }, { dx: 528, dy: 150 },
    { dx: 130, dy: 246 }, { dx: 242, dy: 246 }, { dx: 354, dy: 246 }, { dx: 466, dy: 246 }, { dx: 560, dy: 246 },
  ].map(d => ({ deskX: d.dx, deskY: d.dy, x: d.dx, y: d.dy + 30, facing: 0 }));

  // sofa spots — lounge (idle)
  const SOFAS = [
    { x: 70,  y: 348 }, { x: 104, y: 348 }, { x: 168, y: 348 }, { x: 202, y: 348 },
  ];

  // queue spots — waiting near portal
  const WAITS = [
    { x: 470, y: 350 }, { x: 506, y: 350 }, { x: 542, y: 350 },
  ];

  window.ROOM = { W, H, FLOOR_Y, DESKS, SOFAS, WAITS };

  /* ---------- FURNITURE ------------------------------------------- */
  function drawDesk(ctx, x, y) {
    // monitor (behind, glowing)
    px(ctx, x - 9, y - 22, 18, 12, "#0c1426");
    px(ctx, x - 8, y - 21, 16, 10, "#123a4a");
    px(ctx, x - 8, y - 21, 16, 4, "#1d6b7a");
    // scan glow lines
    px(ctx, x - 6, y - 19, 12, 1, "#2de2e6");
    px(ctx, x - 6, y - 16, 8, 1, "#2de2e6");
    px(ctx, x - 6, y - 14, 10, 1, "#1aa9b3");
    px(ctx, x - 1, y - 10, 2, 2, "#0c1426"); // stand
    // desk surface (3/4)
    px(ctx, x - 16, y - 8, 32, 6, "#33406b");
    px(ctx, x - 16, y - 8, 32, 2, "#48578c");   // top highlight
    px(ctx, x - 16, y - 2, 32, 4, "#222c4d");   // front shade
    // desk legs
    px(ctx, x - 15, y + 2, 2, 4, "#1a2138");
    px(ctx, x + 13, y + 2, 2, 4, "#1a2138");
    // keyboard
    px(ctx, x - 7, y - 7, 14, 2, "#1b2440");
  }

  function drawChair(ctx, x, y) {
    px(ctx, x - 5, y - 8, 10, 8, "#202a47");
    px(ctx, x - 5, y - 8, 10, 2, "#2c3961");
    px(ctx, x - 4, y, 2, 4, "#161d31");
    px(ctx, x + 2, y, 2, 4, "#161d31");
  }

  function drawSofa(ctx, x, y) {
    // x = left edge of a 2-seat sofa (~64 wide)
    px(ctx, x, y - 16, 70, 16, "#3a2f63");        // back
    px(ctx, x, y - 16, 70, 3, "#52428a");         // highlight
    px(ctx, x - 4, y - 14, 6, 14, "#332a57");     // arm L
    px(ctx, x + 68, y - 14, 6, 14, "#332a57");    // arm R
    px(ctx, x, y - 4, 70, 6, "#2b2350");          // seat front
    // cushion seams
    px(ctx, x + 34, y - 14, 1, 12, "#251e42");
  }

  function drawRug(ctx, x, y, w, h) {
    px(ctx, x, y, w, h, "#1a2742");
    px(ctx, x, y, w, 1, "#2de2e6");
    px(ctx, x, y + h - 1, w, 1, "#2de2e6");
    px(ctx, x, y, 1, h, "#2de2e6");
    px(ctx, x + w - 1, y, 1, h, "#2de2e6");
    px(ctx, x + 3, y + 3, w - 6, h - 6, "#142036");
  }

  function drawPlant(ctx, x, y) {
    px(ctx, x - 3, y - 3, 6, 5, "#2a3350");      // pot
    px(ctx, x - 3, y - 3, 6, 1, "#3a466b");
    px(ctx, x - 2, y - 9, 4, 6, "#1f6b46");      // foliage
    px(ctx, x - 4, y - 7, 3, 4, "#2a8a59");
    px(ctx, x + 1, y - 8, 3, 5, "#2a8a59");
    px(ctx, x - 1, y - 12, 2, 4, "#34a86d");
  }

  function drawServerRack(ctx, x, y) {
    // y = base; rack ~ 18 wide x 56 tall standing against back wall
    px(ctx, x - 9, y - 56, 18, 56, "#11182c");
    px(ctx, x - 9, y - 56, 18, 2, "#2a3354");
    for (let r = 0; r < 7; r++) {
      const ry = y - 52 + r * 7;
      px(ctx, x - 7, ry, 14, 5, "#0a0f1d");
      // blinking-style LED dots (static here; engine overlays animation)
      const cols = ["#3df58a", "#2de2e6", "#ffc44d", "#ff5cce"];
      px(ctx, x - 6, ry + 1, 1, 1, cols[r % 4]);
      px(ctx, x - 3, ry + 1, 1, 1, "#1a2238");
      px(ctx, x + 5, ry + 1, 1, 1, cols[(r + 2) % 4]);
    }
  }

  function drawHoloTable(ctx, x, y) {
    // round base
    ctx.fillStyle = "#1b2540"; ctx.beginPath();
    ctx.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#26345a"; ctx.beginPath();
    ctx.ellipse(x, y - 2, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, x - 2, y - 12, 4, 10, "#2c3a63");     // pillar
    // holo glow (engine animates a pulse over this)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#2de2e6"; ctx.beginPath();
    ctx.ellipse(x, y - 18, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#a96bff"; ctx.beginPath();
    ctx.ellipse(x, y - 24, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- BACK WALL ------------------------------------------- */
  function drawWall(ctx) {
    // wall base
    px(ctx, 0, 0, W, FLOOR_Y, "#141b30");
    px(ctx, 0, 0, W, 4, "#0e1426");
    // panel seams
    for (let x = 0; x <= W; x += 64) px(ctx, x, 0, 1, FLOOR_Y, "#1b2440");
    px(ctx, 0, FLOOR_Y - 6, W, 6, "#0d1322");   // baseboard
    px(ctx, 0, FLOOR_Y - 6, W, 1, "#2de2e6");   // neon trim
    ctx.save(); ctx.globalAlpha = 0.25;
    px(ctx, 0, FLOOR_Y - 5, W, 1, "#2de2e6"); ctx.restore();

    // ceiling light strips
    for (let x = 40; x < W; x += 120) {
      px(ctx, x, 0, 60, 3, "#3a4f8a");
      ctx.save(); ctx.globalAlpha = 0.18;
      px(ctx, x, 3, 60, 8, "#6fa0ff"); ctx.restore();
    }

    // big window to space (left)
    drawWindow(ctx, 24, 18, 150, 54);
    // big holo data screen (right)
    drawDataScreen(ctx, 360, 16, 150, 58);
    // central neon emblem
    drawEmblem(ctx, W / 2, 40);

    // server racks against wall (sides)
    drawServerRack(ctx, 540, FLOOR_Y + 2);
    drawServerRack(ctx, 566, FLOOR_Y + 2);
  }

  function drawWindow(ctx, x, y, w, h) {
    px(ctx, x - 2, y - 2, w + 4, h + 4, "#0c1326");
    px(ctx, x, y, w, h, "#060a16");
    // stars
    const star = (sx, sy, c) => px(ctx, x + sx, y + sy, 1, 1, c);
    [[12,8],[30,22],[55,14],[80,30],[110,10],[130,26],[20,40],[95,44],[140,40],[66,38]]
      .forEach((s, i) => star(s[0], s[1], i % 3 ? "#9fb4e8" : "#ffffff"));
    // planet
    ctx.fillStyle = "#3a2f63"; ctx.beginPath();
    ctx.ellipse(x + w - 34, y + h - 16, 14, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#52428a"; ctx.beginPath();
    ctx.ellipse(x + w - 38, y + h - 20, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, x + w - 50, y + h - 14, 26, 2, "#a96bff"); // ring
    // mullions
    px(ctx, x + w / 2, y, 1, h, "#16203a");
    px(ctx, x, y + h / 2, w, 1, "#16203a");
  }

  function drawDataScreen(ctx, x, y, w, h) {
    px(ctx, x - 2, y - 2, w + 4, h + 4, "#0c1326");
    px(ctx, x, y, w, h, "#0a1426");
    px(ctx, x, y, w, 6, "#15294a");
    // grid
    ctx.save(); ctx.globalAlpha = 0.4;
    for (let gx = x + 10; gx < x + w; gx += 18) px(ctx, gx, y + 8, 1, h - 12, "#1c3358");
    for (let gy = y + 14; gy < y + h; gy += 12) px(ctx, x + 4, gy, w - 8, 1, "#1c3358");
    ctx.restore();
    // line chart
    const pts = [40, 32, 36, 22, 28, 16, 24, 12];
    let prevX = x + 6, prevY = y + 12 + pts[0];
    ctx.strokeStyle = "#2de2e6"; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    pts.forEach((p, i) => { const cx = x + 6 + i * 20, cy = y + 12 + p; ctx.lineTo(cx, cy); });
    ctx.stroke();
    // bars
    px(ctx, x + 8, y + h - 16, 4, 10, "#a96bff");
    px(ctx, x + 16, y + h - 12, 4, 6, "#ff5cce");
    px(ctx, x + 24, y + h - 20, 4, 14, "#3df58a");
  }

  function drawEmblem(ctx, x, y) {
    // hexagon glow logo
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#a96bff"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 6;
      const px2 = Math.cos(a) * 18, py2 = Math.sin(a) * 18;
      i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2);
    }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = "#2de2e6";
    ctx.fillRect(-2, -8, 4, 16);
    ctx.fillRect(-8, -2, 16, 4);
    ctx.restore();
  }

  /* ---------- FLOOR ----------------------------------------------- */
  function drawFloor(ctx) {
    px(ctx, 0, FLOOR_Y, W, H - FLOOR_Y, "#12182a");
    // perspective-ish tile grid
    for (let y = FLOOR_Y; y <= H; y += 24) {
      px(ctx, 0, y, W, 1, "#19223a");
    }
    for (let x = 0; x <= W; x += 32) {
      px(ctx, x, FLOOR_Y, 1, H - FLOOR_Y, "#19223a");
    }
    // faint neon seam accents (every 4th line)
    ctx.save(); ctx.globalAlpha = 0.10;
    for (let x = 0; x <= W; x += 128) px(ctx, x, FLOOR_Y, 1, H - FLOOR_Y, "#2de2e6");
    ctx.restore();
    // subtle floor vignette toward front
    const g = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
    g.addColorStop(0, "rgba(45,226,230,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = g; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  }

  /* ---------- ZONE FLOOR DECALS ----------------------------------- */
  function drawZones(ctx) {
    // workstation zone glow strip under desks
    ctx.save(); ctx.globalAlpha = 0.06;
    px(ctx, 40, 120, 560, 150, "#2de2e6");
    ctx.restore();
    // lounge rug
    drawRug(ctx, 50, 320, 180, 46);
    // queue floor marker (right)
    ctx.save(); ctx.globalAlpha = 0.08;
    px(ctx, 452, 326, 120, 44, "#ffc44d");
    ctx.restore();
    px(ctx, 452, 326, 120, 1, "#ffc44d");
    px(ctx, 452, 369, 120, 1, "#ffc44d");
  }

  /* ---------- MAIN: render full room to a ctx --------------------- */
  function renderRoom(ctx) {
    px(ctx, 0, 0, W, H, "#0a0e1a");
    drawWall(ctx);
    drawFloor(ctx);
    drawZones(ctx);

    // lounge furniture (drawn as background; agents render on top)
    drawSofa(ctx, 58, 348);
    drawSofa(ctx, 150, 348);
    drawPlant(ctx, 240, 352);
    drawPlant(ctx, 36, 352);

    // central holo table
    drawHoloTable(ctx, 320, 300);

    // queue portal frame
    px(ctx, 506, 300, 4, 28, "#a96bff");
    px(ctx, 538, 300, 4, 28, "#a96bff");
    px(ctx, 506, 298, 36, 4, "#2de2e6");

    // desks + chairs
    DESKS.forEach(d => { drawDesk(ctx, d.deskX, d.deskY); drawChair(ctx, d.x, d.y + 4); });
  }

  window.renderRoom = renderRoom;
  window.roomFurniture = { drawHoloTable, drawServerRack };
})();
