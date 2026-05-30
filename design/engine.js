/* =====================================================================
   engine.js — scene orchestration: agents, walking, fx, click, HUD
   ===================================================================== */
(function () {
  const cv = document.getElementById("scene");
  const ctx = cv.getContext("2d");
  const W = window.ROOM.W, H = window.ROOM.H;
  cv.width = W; cv.height = H;
  ctx.imageSmoothingEnabled = false;

  // offscreen static background
  const bg = document.createElement("canvas");
  bg.width = W; bg.height = H;
  const bgx = bg.getContext("2d");
  bgx.imageSmoothingEnabled = false;
  window.renderRoom(bgx);

  // tunables (driven by Tweaks)
  window.CFG = { speed: 1, showLabels: true, simulate: true, fxDust: true };

  /* ---------- build agents from data ------------------------------ */
  const DESKS = window.ROOM.DESKS.slice();
  const SOFAS = window.ROOM.SOFAS.slice();
  const WAITS = window.ROOM.WAITS.slice();
  let di = 0, si = 0, wi = 0;

  function spotFor(status) {
    const zone = window.STATUS[status].zone;
    if (zone === "desk") return DESKS[di++ % DESKS.length];
    if (zone === "sofa") return SOFAS[si++ % SOFAS.length];
    return WAITS[wi++ % WAITS.length];
  }

  const agents = window.AGENTS.map((data) => {
    const role = window.ROLES[data.role];
    const spot = spotFor(data.status);
    return {
      data,
      pal: { skin: data.skin, hair: role.hair, shirt: role.shirt },
      x: spot.x, y: spot.y,
      homeX: spot.x, homeY: spot.y,
      tx: spot.x, ty: spot.y,
      facing: 0, frame: 0, animT: Math.random() * 1000,
      walking: false, strollT: 2000 + Math.random() * 6000,
      typeT: Math.random() * 1000,
    };
  });

  /* ---------- helpers --------------------------------------------- */
  function reassignSpot(ag) {
    const spot = spotFor(ag.data.status);
    ag.homeX = spot.x; ag.homeY = spot.y;
    ag.tx = spot.x; ag.ty = spot.y;
  }

  function randomFloorPoint() {
    return { x: 120 + Math.random() * 400, y: 300 + Math.random() * 70 };
  }

  /* ---------- update ---------------------------------------------- */
  let selected = null;

  function update(dt, t) {
    for (const ag of agents) {
      const st = ag.data.status;
      // movement toward target
      const dx = ag.tx - ag.x, dy = ag.ty - ag.y;
      const dist = Math.hypot(dx, dy);
      const spd = 0.45 * window.CFG.speed * dt / 16;
      if (dist > 1.2) {
        ag.walking = true;
        ag.x += (dx / dist) * Math.min(spd, dist);
        ag.y += (dy / dist) * Math.min(spd, dist);
        ag.facing = dx > 0.3 ? 1 : dx < -0.3 ? -1 : 0;
        ag.animT += dt;
        if (ag.animT > 150) { ag.frame ^= 1; ag.animT = 0; }
      } else {
        ag.walking = false;
        ag.x = ag.tx; ag.y = ag.ty;
        // typing micro-animation for working/error
        if (st === "working" || st === "error") {
          ag.typeT += dt;
          if (ag.typeT > 260) { ag.frame ^= 1; ag.typeT = 0; }
        } else {
          ag.frame = 0;
        }
      }

      // idle agents occasionally stroll, then return home
      if (window.CFG.simulate && st === "idle" && !ag.walking) {
        ag.strollT -= dt;
        if (ag.strollT <= 0) {
          if (ag.x === ag.homeX && ag.y === ag.homeY) {
            const p = randomFloorPoint(); ag.tx = p.x; ag.ty = p.y;
          } else {
            ag.tx = ag.homeX; ag.ty = ag.homeY;
          }
          ag.strollT = 3000 + Math.random() * 7000;
        }
      }
    }
  }

  /* ---------- simulate status churn (liveliness) ------------------ */
  const STATUS_KEYS = ["working", "idle", "waiting", "error"];
  function churn() {
    if (!window.CFG.simulate) return;
    const ag = agents[Math.floor(Math.random() * agents.length)];
    // bias: mostly working
    const r = Math.random();
    const ns = r < 0.55 ? "working" : r < 0.78 ? "idle" : r < 0.93 ? "waiting" : "error";
    if (ns === ag.data.status) return;
    ag.data.status = ns;
    // refresh task text lightly
    if (ns === "idle") ag.data.task = "ว่าง · standby";
    if (ns === "waiting") ag.data.task = "รอคิวงานถัดไป";
    if (ns === "working" && /ว่าง|รอ|error|standby/i.test(ag.data.task))
      ag.data.task = "เริ่มงานใหม่ · กำลังประมวลผล";
    if (ns === "error") ag.data.task = "พบข้อผิดพลาด · ต้องตรวจสอบ";
    if (ns === "working") ag.data.progress = 5 + Math.floor(Math.random() * 40);
    reassignSpot(ag);
    refreshHUD();
    if (selected === ag) renderPopup(ag);
  }
  setInterval(churn, 3200);

  // working agents slowly progress
  setInterval(() => {
    for (const ag of agents) {
      if (ag.data.status === "working") {
        ag.data.progress = Math.min(100, (ag.data.progress || 0) + Math.floor(Math.random() * 4));
      }
    }
    if (selected) renderPopup(selected);
  }, 2500);

  /* ---------- render ---------------------------------------------- */
  const dust = Array.from({ length: 26 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    s: 0.2 + Math.random() * 0.5, a: 0.1 + Math.random() * 0.25,
  }));

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);

    // --- fx: server LED blink ---
    [540, 566].forEach((rx, idx) => {
      for (let r = 0; r < 7; r++) {
        if (Math.sin(t / 200 + r * 1.7 + idx * 3) > 0.4) {
          const cols = ["#3df58a", "#2de2e6", "#ffc44d", "#ff5cce"];
          ctx.fillStyle = cols[(r + idx) % 4];
          ctx.fillRect(rx - 3, window.ROOM.FLOOR_Y + 2 - 52 + r * 7 + 1, 1, 1);
        }
      }
    });
    // --- fx: holo table pulse ---
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t / 300);
    ctx.fillStyle = "#2de2e6"; ctx.beginPath();
    ctx.ellipse(320, 282, 16 + Math.sin(t / 400) * 2, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // --- fx: dust ---
    if (window.CFG.fxDust) {
      ctx.save();
      for (const d of dust) {
        d.y -= d.s * 0.5; if (d.y < window.ROOM.FLOOR_Y) { d.y = H; d.x = Math.random() * W; }
        ctx.globalAlpha = d.a;
        ctx.fillStyle = "#9fd6ff";
        ctx.fillRect(d.x | 0, d.y | 0, 1, 1);
      }
      ctx.restore();
    }

    // --- agents (y-sorted) ---
    const sorted = agents.slice().sort((a, b) => a.y - b.y);
    for (const ag of sorted) {
      window.drawShadow(ctx, ag.x, ag.y);
      if (selected === ag) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 150);
        ctx.beginPath();
        ctx.ellipse(ag.x, ag.y + 1, 8, 3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      window.drawCharacter(ctx, ag.x, ag.y, ag.pal, { frame: ag.frame, facing: ag.facing });
      // bubble above head (head top ≈ y-19)
      window.drawBubble(ctx, ag.x, ag.y - 19, ag.data.status, t);
    }
  }

  /* ---------- DOM name labels ------------------------------------- */
  const labelLayer = document.getElementById("labels");
  const labelEls = new Map();
  agents.forEach((ag) => {
    const el = document.createElement("div");
    el.className = "nametag";
    el.textContent = ag.data.name;
    labelLayer.appendChild(el);
    labelEls.set(ag, el);
  });
  function positionLabels() {
    const show = window.CFG.showLabels;
    for (const ag of agents) {
      const el = labelEls.get(ag);
      if (!show) { el.style.display = "none"; continue; }
      el.style.display = "block";
      el.style.left = (ag.x / W * 100) + "%";
      el.style.top = ((ag.y - 34) / H * 100) + "%";
      el.style.borderColor = window.STATUS[ag.data.status].color;
      el.classList.toggle("sel", selected === ag);
    }
  }

  /* ---------- click → select -------------------------------------- */
  function eventToNative(e) {
    const r = cv.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width * W;
    const cy = (e.clientY - r.top) / r.height * H;
    return { cx, cy };
  }
  function pick(cx, cy) {
    let hit = null;
    // topmost (largest y) first
    const sorted = agents.slice().sort((a, b) => b.y - a.y);
    for (const ag of sorted) {
      if (cx >= ag.x - 8 && cx <= ag.x + 8 && cy >= ag.y - 32 && cy <= ag.y + 2) { hit = ag; break; }
    }
    return hit;
  }
  cv.addEventListener("click", (e) => {
    const { cx, cy } = eventToNative(e);
    const ag = pick(cx, cy);
    if (ag) selectAgent(ag); else closePopup();
  });
  cv.addEventListener("mousemove", (e) => {
    const { cx, cy } = eventToNative(e);
    cv.style.cursor = pick(cx, cy) ? "pointer" : "default";
  });

  function selectAgent(ag) {
    selected = ag;
    renderPopup(ag);
    refreshHUD();
  }
  window.focusAgentById = (id) => {
    const ag = agents.find(a => a.data.id === id);
    if (ag) selectAgent(ag);
  };

  /* ---------- POPUP ----------------------------------------------- */
  const popup = document.getElementById("popup");
  function closePopup() { selected = null; popup.style.display = "none"; refreshHUD(); }
  document.getElementById("popup-close").addEventListener("click", closePopup);

  function renderPopup(ag) {
    const d = ag.data, role = window.ROLES[d.role], st = window.STATUS[d.status];
    popup.style.display = "block";
    // position near agent, clamp inside
    let lx = ag.x / W * 100, ty = (ag.y - 40) / H * 100;
    popup.style.left = Math.max(2, Math.min(72, lx)) + "%";
    popup.style.top = Math.max(2, Math.min(58, ty)) + "%";
    popup.style.setProperty("--accent", st.color);
    popup.querySelector(".pp-name").textContent = d.name;
    popup.querySelector(".pp-role").textContent = role.label + " · " + role.th;
    const stEl = popup.querySelector(".pp-status");
    stEl.textContent = st.en + " · " + st.label;
    stEl.style.color = st.color;
    stEl.style.borderColor = st.color;
    popup.querySelector(".pp-task").textContent = d.task || "—";
    const prog = Math.max(0, Math.min(100, d.progress ?? 0));
    popup.querySelector(".pp-bar-fill").style.width = prog + "%";
    popup.querySelector(".pp-bar-fill").style.background = st.color;
    popup.querySelector(".pp-prog-num").textContent = prog + "%";
    popup.querySelector(".pp-id").textContent = "#" + d.id.toUpperCase();
    popup.querySelector(".pp-today").textContent = (d.tasksToday ?? 0) + " งานวันนี้";
    // avatar swatch
    popup.querySelector(".pp-ava").style.background = role.shirt;
  }

  /* ---------- HUD: counts + roster -------------------------------- */
  function refreshHUD() {
    const counts = { working: 0, idle: 0, waiting: 0, error: 0 };
    agents.forEach(a => counts[a.data.status]++);
    document.getElementById("c-working").textContent = counts.working;
    document.getElementById("c-idle").textContent = counts.idle;
    document.getElementById("c-waiting").textContent = counts.waiting;
    document.getElementById("c-error").textContent = counts.error;
    document.getElementById("c-total").textContent = agents.length;

    // roster
    const roster = document.getElementById("roster");
    roster.innerHTML = "";
    const order = { error: 0, working: 1, waiting: 2, idle: 3 };
    agents.slice().sort((a, b) =>
      (order[a.data.status] - order[b.data.status]) || a.data.name.localeCompare(b.data.name)
    ).forEach(ag => {
      const d = ag.data, st = window.STATUS[d.status], role = window.ROLES[d.role];
      const row = document.createElement("button");
      row.className = "rrow" + (selected === ag ? " sel" : "");
      row.innerHTML = `
        <span class="rdot" style="background:${st.color};box-shadow:0 0 6px ${st.color}"></span>
        <span class="rname">${d.name}</span>
        <span class="rrole" style="color:${role.shirt}">${role.label}</span>
        <span class="rst" style="color:${st.color}">${st.label}</span>`;
      row.addEventListener("click", () => selectAgent(ag));
      roster.appendChild(row);
    });
  }

  /* ---------- clock ----------------------------------------------- */
  function tickClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    document.getElementById("clock").textContent = `${hh}:${mm}:${ss}`;
  }
  setInterval(tickClock, 1000); tickClock();

  /* ---------- main loop ------------------------------------------- */
  let last = performance.now();
  function loop(t) {
    try {
      const dt = Math.min(48, t - last); last = t;
      update(dt, t);
      render(t);
      positionLabels();
      if (selected && popup.style.display === "block") {
        const lx = selected.x / W * 100, ty = (selected.y - 40) / H * 100;
        popup.style.left = Math.max(2, Math.min(72, lx)) + "%";
        popup.style.top = Math.max(2, Math.min(58, ty)) + "%";
      }
    } catch (err) {
      console.error("loop error:", err);
    }
    requestAnimationFrame(loop);
  }
  refreshHUD();
  requestAnimationFrame(loop);

  // expose for tweaks
  window.SCENE = { agents, refreshHUD };
})();
