/**
 * spaceScene.js — the SpaceBackground drawing engine, shared by the main thread and the
 * OffscreenCanvas worker. PERF: extracted unchanged from SpaceBackground.jsx so the scene can
 * be rendered in a Web Worker, off the main thread that React / tables / charts need.
 * It has no DOM / window access; the host feeds it size, pointer and visibility events.
 */

export const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

function makeStars(count, depth) {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: rand(0.4, 1.3) * (0.6 + depth * 0.7),
    a: rand(0.35, 1),
    tw: rand(0.6, 2.2),
    ph: rand(0, TAU),
    hue: Math.random() < 0.2 ? 205 : Math.random() < 0.15 ? 35 : 215,
  }));
}

function drawSatellite(ctx, x, y, angle, scale, t, glow = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // soft halo
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
  halo.addColorStop(0, `rgba(80,170,255,${0.28 * glow})`);
  halo.addColorStop(1, "rgba(80,170,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.fill();

  // solar wings
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillStyle = "#12356e";
    ctx.strokeStyle = "rgba(140,200,255,0.85)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.rect(11, -7, 30, 14);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(140,200,255,0.35)";
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(11 + i * 7.5, -7);
      ctx.lineTo(11 + i * 7.5, 7);
    }
    ctx.moveTo(11, 0);
    ctx.lineTo(41, 0);
    ctx.stroke();
    // boom
    ctx.strokeStyle = "#9fb4d6";
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(11, 0);
    ctx.stroke();
    ctx.restore();
  }

  // body (gold foil)
  const body = ctx.createLinearGradient(-7, -8, 7, 8);
  body.addColorStop(0, "#f3d58a");
  body.addColorStop(1, "#a9792a");
  ctx.fillStyle = body;
  ctx.strokeStyle = "rgba(255,240,200,0.8)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.rect(-7, -8, 14, 16);
  ctx.fill();
  ctx.stroke();

  // dish
  ctx.strokeStyle = "#dbe7ff";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, -8, 6, Math.PI, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, -13);
  ctx.stroke();

  // blinking beacon
  const on = Math.sin(t * 5) > 0.2;
  ctx.fillStyle = on ? "#ff4d5e" : "rgba(255,77,94,0.25)";
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, TAU);
  ctx.fill();

  ctx.restore();
}

export function createSpaceScene({ canvas, ctx, reduceMotion = false, maxFps = 0, raf: rafFn, caf: cafFn, now: nowFn }) {
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = nowFn();
    let time = 0;
    // Optional frame-rate cap. 0 = uncapped (original behaviour).
    const minFrameMs = maxFps > 0 ? 1000 / maxFps : 0;
    last -= minFrameMs; // draw the very first frame immediately

    const layers = [makeStars(90, 0), makeStars(60, 1), makeStars(34, 2)];
    const PARALLAX = [10, 24, 46]; // px of travel per layer

    // pointer state: p = raw target (px), n = smoothed normalized (-1..1)
    const p = { x: 0, y: 0, moved: 0, active: false };
    const n = { x: 0, y: 0 };

    // cursor-chasing satellite
    const hero = { x: 0, y: 0, vx: 0, vy: 0, angle: -0.3, trail: [] };

    const orbiters = [
      { t: -1.2, speed: 0.16, rx: 0.6, ry: 0.2, tilt: -0.18, size: 0.9, cy: 0.8 },
      { t: -2.0, speed: -0.11, rx: 0.85, ry: 0.26, tilt: 0.12, size: 0.7, cy: 0.8 },
    ];
    const orbitPos = orbiters.map(() => ({ x: 0, y: 0, a: 0, k: 1 }));

    let shooters = [];
    let nextShooter = rand(1.5, 4);
    let pings = [];

    const resize = (width, height, ratio) => {
      dpr = ratio;
      w = width;
      h = height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!hero.x && !hero.y) {
        hero.x = w * 0.5;
        hero.y = h * 0.4;
        p.x = hero.x;
        p.y = hero.y;
      }
    };

    const pointerMove = (x, y) => {
      p.x = x;
      p.y = y;
      p.moved = nowFn();
      p.active = true;
    };
    const pointerLeave = () => {
      p.active = false;
    };
    const pointerDown = (x, y) => {
      pings.push({ x, y, age: 0 });
      if (pings.length > 6) pings.shift();
    };

    const earthGeometry = () => {
      const R = Math.max(w * 0.9, h * 1.1);
      return { cx: w * 0.5 - n.x * 14, cy: h + R * 0.78 - n.y * 8, R };
    };

    const orbitPoint = (o, cx, cy, ang) => {
      const rx = o.rx * w;
      const ry = o.ry * h;
      const ex = Math.cos(ang) * rx;
      const ey = Math.sin(ang) * ry;
      const x = cx + ex * Math.cos(o.tilt) - ey * Math.sin(o.tilt);
      const y = cy * o.cy + ex * Math.sin(o.tilt) + ey * Math.cos(o.tilt);
      return { x, y };
    };

    const render = (now) => {
      raf = rafFn(render);
      // small tolerance so a 30 fps cap still lands on every 2nd frame of a 60 Hz display
      if (minFrameMs && now - last < minFrameMs - 2) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;

      // idle: wander on a Lissajous path so the scene never looks frozen (also on touch devices)
      if (!p.active || now - p.moved > 3500) {
        p.x = w * (0.5 + 0.28 * Math.sin(time * 0.35));
        p.y = h * (0.38 + 0.18 * Math.sin(time * 0.52 + 1));
      }
      n.x = lerp(n.x, (p.x / w) * 2 - 1, 1 - Math.exp(-dt * 3));
      n.y = lerp(n.y, (p.y / h) * 2 - 1, 1 - Math.exp(-dt * 3));

      ctx.clearRect(0, 0, w, h);

      // --- background gradient ---
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#030712");
      bg.addColorStop(0.6, "#06112a");
      bg.addColorStop(1, "#0a1d44");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // --- nebula glows (drift opposite to the mouse) ---
      const neb = [
        { x: 0.2, y: 0.25, r: 0.5, c: "70,90,255", a: 0.16, k: 18 },
        { x: 0.82, y: 0.35, r: 0.42, c: "170,70,255", a: 0.11, k: 28 },
        { x: 0.55, y: 0.85, r: 0.5, c: "20,160,255", a: 0.1, k: 12 },
      ];
      for (const b of neb) {
        const bx = b.x * w - n.x * b.k;
        const by = b.y * h - n.y * b.k;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.r * Math.max(w, h));
        g.addColorStop(0, `rgba(${b.c},${b.a})`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // --- starfield with parallax ---
      layers.forEach((stars, li) => {
        const ox = -n.x * PARALLAX[li];
        const oy = -n.y * PARALLAX[li];
        for (const s of stars) {
          const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(time * s.tw + s.ph);
          const x = (((s.x * w + ox) % w) + w) % w;
          const y = (((s.y * h + oy) % h) + h) % h;
          ctx.fillStyle = `hsla(${s.hue},80%,88%,${s.a * tw})`;
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, TAU);
          ctx.fill();
        }
      });

      // --- shooting stars ---
      if (!reduceMotion) {
        nextShooter -= dt;
        if (nextShooter <= 0) {
          nextShooter = rand(3, 7);
          const fromLeft = Math.random() < 0.5;
          shooters.push({
            x: fromLeft ? rand(0, w * 0.5) : rand(w * 0.5, w),
            y: rand(0, h * 0.35),
            vx: (fromLeft ? 1 : -1) * rand(520, 760),
            vy: rand(160, 280),
            life: 0,
          });
        }
        shooters = shooters.filter((s) => s.life < 1.1);
        for (const s of shooters) {
          s.life += dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const fade = 1 - s.life / 1.1;
          const len = 0.12;
          const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len);
          g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
          g.addColorStop(1, "rgba(120,180,255,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len);
          ctx.stroke();
        }
      }

      // --- Earth ---
      const E = earthGeometry();
      const atm = ctx.createRadialGradient(E.cx, E.cy, E.R * 0.97, E.cx, E.cy, E.R * 1.07);
      atm.addColorStop(0, "rgba(90,180,255,0.55)");
      atm.addColorStop(0.35, "rgba(60,130,255,0.18)");
      atm.addColorStop(1, "rgba(60,130,255,0)");
      ctx.fillStyle = atm;
      ctx.beginPath();
      ctx.arc(E.cx, E.cy, E.R * 1.07, 0, TAU);
      ctx.fill();

      const earth = ctx.createRadialGradient(E.cx, E.cy - E.R * 0.2, E.R * 0.55, E.cx, E.cy, E.R);
      earth.addColorStop(0, "#04122b");
      earth.addColorStop(0.85, "#07204a");
      earth.addColorStop(1, "#1a5fb4");
      ctx.fillStyle = earth;
      ctx.beginPath();
      ctx.arc(E.cx, E.cy, E.R, 0, TAU);
      ctx.fill();

      // rim light
      ctx.strokeStyle = "rgba(140,210,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(E.cx, E.cy, E.R, 0, TAU);
      ctx.stroke();

      // city lights, rotating slowly along the limb
      ctx.save();
      ctx.beginPath();
      ctx.arc(E.cx, E.cy, E.R - 2, 0, TAU);
      ctx.clip();
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI / 2 + ((i * 0.137 + time * 0.01) % 1 - 0.5) * 0.9;
        const d = E.R - 6 - ((i * 53) % 70);
        const x = E.cx + Math.cos(a) * d;
        const y = E.cy + Math.sin(a) * d;
        const tw = 0.5 + 0.5 * Math.sin(time * 1.4 + i);
        ctx.fillStyle = `rgba(255,214,130,${0.25 + 0.5 * tw})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.restore();

      // --- orbits + orbiting satellites ---
      orbiters.forEach((o, i) => {
        if (!reduceMotion) o.t += o.speed * dt;
        ctx.strokeStyle = "rgba(120,180,255,0.16)";
        ctx.setLineDash([3, 7]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let s = 0; s <= 90; s++) {
          const pt = orbitPoint(o, E.cx, h * 1.0, (s / 90) * TAU);
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        const pos = orbitPoint(o, E.cx, h * 1.0, o.t);
        const ahead = orbitPoint(o, E.cx, h * 1.0, o.t + 0.02 * Math.sign(o.speed));
        orbitPos[i] = {
          x: pos.x,
          y: pos.y,
          a: Math.atan2(ahead.y - pos.y, ahead.x - pos.x),
          k: o.size * (0.75 + 0.25 * Math.sin(o.t)),
        };
      });

      // --- hero satellite: spring toward cursor ---
      const tx = p.x + 38;
      const ty = p.y + 30;
      const k = 38; // stiffness
      const c = 9; // damping
      hero.vx += ((tx - hero.x) * k - hero.vx * c) * dt;
      hero.vy += ((ty - hero.y) * k - hero.vy * c) * dt;
      hero.x += hero.vx * dt;
      hero.y += hero.vy * dt;
      const speed = Math.hypot(hero.vx, hero.vy);
      const targetAngle = Math.atan2(hero.vy, hero.vx) * 0.25 + Math.sin(time * 0.8) * 0.08;
      hero.angle = lerp(hero.angle, speed > 6 ? targetAngle : hero.angle, 1 - Math.exp(-dt * 4));

      hero.trail.push({ x: hero.x, y: hero.y });
      if (hero.trail.length > 26) hero.trail.shift();

      // trail
      for (let i = 1; i < hero.trail.length; i++) {
        const f = i / hero.trail.length;
        ctx.strokeStyle = `rgba(110,190,255,${0.5 * f * Math.min(1, speed / 120 + 0.25)})`;
        ctx.lineWidth = 3.2 * f;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hero.trail[i - 1].x, hero.trail[i - 1].y);
        ctx.lineTo(hero.trail[i].x, hero.trail[i].y);
        ctx.stroke();
      }

      // data link: hero -> nearest orbiting satellite
      let nearest = null;
      let nd = Infinity;
      for (const o of orbitPos) {
        const d = Math.hypot(o.x - hero.x, o.y - hero.y);
        if (d < nd) {
          nd = d;
          nearest = o;
        }
      }
      if (nearest && nd < Math.min(w, 900) * 0.7) {
        const strength = 1 - nd / (Math.min(w, 900) * 0.7);
        ctx.strokeStyle = `rgba(90,220,200,${0.15 + 0.5 * strength})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -time * 40;
        ctx.beginPath();
        ctx.moveTo(hero.x, hero.y);
        ctx.lineTo(nearest.x, nearest.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // data packet
        const f = (time * 0.7) % 1;
        ctx.fillStyle = "rgba(160,255,235,0.95)";
        ctx.beginPath();
        ctx.arc(lerp(hero.x, nearest.x, f), lerp(hero.y, nearest.y, f), 2.2, 0, TAU);
        ctx.fill();
      }

      // orbit satellites drawn above the link
      orbitPos.forEach((o) => drawSatellite(ctx, o.x, o.y, o.a, 0.55 * o.k, time, 0.7));

      // hero on top
      drawSatellite(ctx, hero.x, hero.y, hero.angle, 0.95, time, 1.2);

      // --- pings ---
      pings = pings.filter((pg) => pg.age < 1.4);
      for (const pg of pings) {
        pg.age += dt;
        const f = pg.age / 1.4;
        ctx.strokeStyle = `rgba(110,210,255,${0.7 * (1 - f)})`;
        ctx.lineWidth = 2 * (1 - f) + 0.5;
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, 8 + f * 110, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(110,210,255,${0.35 * (1 - f)})`;
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, 4 + f * 60, 0, TAU);
        ctx.stroke();
      }

      // soft vignette so UI cards stay readable
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8);
      vg.addColorStop(0, "rgba(3,7,18,0)");
      vg.addColorStop(1, "rgba(3,7,18,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };

    const start = () => {
      if (raf) return;
      last = nowFn() - minFrameMs;
      raf = rafFn(render);
    };
    const stop = () => {
      if (raf) cafFn(raf);
      raf = 0;
    };
    // Matches the original visibility handling: pause while hidden, resume with a fresh clock.
    const setVisible = (visible) => {
      if (!visible) {
        stop();
      } else if (!raf) {
        last = nowFn();
        raf = rafFn(render);
      }
    };

    return { resize, pointerMove, pointerLeave, pointerDown, start, stop, setVisible };
}
