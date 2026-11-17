import { useEffect, useRef } from "react";

/**
 * 3D Interactive Satellite & Rocket Spacecraft Canvas
 * Renders a full 3D satellite with deployable solar panels, high-gain dish,
 * rocket engine thruster plume, orbital trajectories, and starfield.
 * Zero external dependencies, pure HTML5 Canvas with hardware-accelerated 3D projection.
 */
export default function Spacecraft3DCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Mouse tracking for subtle 3D parallax tilt
    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0.25;
    let targetRotY = 0.45;
    let curRotX = 0.25;
    let curRotY = 0.45;
    let curRotZ = 0.1;

    const handleMouseMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX = nx;
      mouseY = ny;
      targetRotY = 0.45 + nx * 0.45;
      targetRotX = 0.25 + ny * 0.35;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Starfield particles
    const STAR_COUNT = 140;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: (Math.random() - 0.5) * 2200,
      y: (Math.random() - 0.5) * 1600,
      z: Math.random() * 1200 + 100,
      size: Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
    }));

    // Rocket Thruster Plasma Exhaust Particles
    const PARTICLE_COUNT = 45;
    const exhaustParticles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: 0,
      y: 0,
      z: 50 + (i / PARTICLE_COUNT) * 120,
      vx: (Math.random() - 0.5) * 2.2,
      vy: (Math.random() - 0.5) * 2.2,
      vz: Math.random() * 4 + 5,
      life: Math.random(),
      size: Math.random() * 5 + 3,
    }));

    // 3D Geometry Definition for the Satellite & Rocket Craft
    // 1. Bus Chassis vertices (Octagonal/Cuboid Main Frame)
    const B = 32;
    const BH = 44;
    const busVertices = [
      [-B, -B, -BH], [B, -B, -BH], [B, B, -BH], [-B, B, -BH], // Top face
      [-B, -B, BH],  [B, -B, BH],  [B, B, BH],  [-B, B, BH],  // Bottom face
    ];
    const busEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Top ring
      [4, 5], [5, 6], [6, 7], [7, 4], // Bottom ring
      [0, 4], [1, 5], [2, 6], [3, 7], // Pillars
    ];

    // 2. Solar Panels (Wing Arrays extending left and right)
    // Left Wing: x: -45 to -155
    const leftWing = [
      [-42, -18, -6], [-155, -18, -6], [-155, 18, -6], [-42, 18, -6],
    ];
    // Right Wing: x: 42 to 155
    const rightWing = [
      [42, -18, -6], [155, -18, -6], [155, 18, -6], [42, 18, -6],
    ];

    // 3. High Gain Parabolic Dish Antenna (Front facing -Z)
    const dishCenter = [0, 0, -BH - 24];
    const DISH_RAD = 26;
    const DISH_PTS = 14;
    const dishRim = [];
    for (let i = 0; i < DISH_PTS; i++) {
      const th = (i / DISH_PTS) * Math.PI * 2;
      dishRim.push([
        Math.cos(th) * DISH_RAD,
        Math.sin(th) * DISH_RAD,
        -BH - 24 + Math.sin(th * 2) * 2,
      ]);
    }

    // 4. Rocket Thruster Nozzle (Aft facing +Z)
    const NOZZLE_PTS = 10;
    const nozzleTop = [];
    const nozzleBottom = [];
    for (let i = 0; i < NOZZLE_PTS; i++) {
      const th = (i / NOZZLE_PTS) * Math.PI * 2;
      nozzleTop.push([Math.cos(th) * 14, Math.sin(th) * 14, BH]);
      nozzleBottom.push([Math.cos(th) * 22, Math.sin(th) * 22, BH + 24]);
    }

    // 5. Orbital Trajectory Ring Points
    const ORBIT_PTS = 64;
    const orbitRing1 = [];
    for (let i = 0; i < ORBIT_PTS; i++) {
      const th = (i / ORBIT_PTS) * Math.PI * 2;
      orbitRing1.push([
        Math.cos(th) * 260,
        Math.sin(th) * 80,
        Math.sin(th) * 220,
      ]);
    }

    const orbitRing2 = [];
    for (let i = 0; i < ORBIT_PTS; i++) {
      const th = (i / ORBIT_PTS) * Math.PI * 2;
      orbitRing2.push([
        Math.cos(th) * 320,
        Math.sin(th) * 280,
        Math.cos(th) * 70,
      ]);
    }

    // 3D Matrix Rotation Helper
    function rotatePoint(pt, rx, ry, rz) {
      let [x, y, z] = pt;

      // Rotate X
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;

      // Rotate Y
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x2 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;

      // Rotate Z
      const cosZ = Math.cos(rz);
      const sinZ = Math.sin(rz);
      const x3 = x2 * cosZ - y1 * sinZ;
      const y3 = x2 * sinZ + y1 * cosZ;

      return [x3, y3, z2];
    }

    // 3D to 2D Perspective Projection
    const FOV = 650;
    function project(pt, cx, cy, zOffset = 380) {
      const [x, y, z] = pt;
      const depth = z + zOffset;
      if (depth <= 10) return null;
      const scale = FOV / depth;
      return {
        x: x * scale + cx,
        y: y * scale + cy,
        scale,
        depth,
      };
    }

    let time = 0;

    // Main 3D Animation Loop
    function render() {
      time += 0.016;
      const isLight = document.documentElement.getAttribute("data-theme") === "light";

      // Smooth camera interpolation
      curRotX += (targetRotX - curRotX) * 0.04;
      curRotY += (targetRotY - curRotY) * 0.04;

      // Craft autonomous spin
      const craftRotY = curRotY + time * 0.22;
      const craftRotX = curRotX + Math.sin(time * 0.4) * 0.08;
      const craftRotZ = curRotZ + Math.cos(time * 0.3) * 0.06;

      ctx.clearRect(0, 0, width, height);

      // Center craft positioning (responsive: centered on mobile, right-offset on desktop)
      const isMobile = width < 992;
      const cx = isMobile ? width * 0.5 : width * 0.68;
      const cy = isMobile ? height * 0.32 : height * 0.48;

      // 1. Draw Starfield with 3D Depth
      for (let s of stars) {
        s.alpha += Math.sin(time * 5 + s.twinkleSpeed) * 0.015;
        const clampedAlpha = Math.max(0.1, Math.min(0.9, s.alpha));
        const px = (s.x / s.z) * 450 + width * 0.5;
        const py = (s.y / s.z) * 450 + height * 0.5;
        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          ctx.fillStyle = isLight
            ? `rgba(30, 41, 59, ${clampedAlpha * 0.35})`
            : `rgba(216, 240, 255, ${clampedAlpha})`;
          ctx.beginPath();
          ctx.arc(px, py, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Earth Curvature Horizon / Limb (Subtle Glowing Arc)
      const earthRadius = Math.max(width, height) * 0.95;
      const earthCenterX = width * 0.4;
      const earthCenterY = height + earthRadius - 90;

      const earthGrad = ctx.createRadialGradient(
        earthCenterX,
        earthCenterY,
        earthRadius - 120,
        earthCenterX,
        earthCenterY,
        earthRadius + 60
      );
      earthGrad.addColorStop(0, "rgba(6, 182, 212, 0.0)");
      earthGrad.addColorStop(0.7, isLight ? "rgba(2, 132, 199, 0.06)" : "rgba(6, 182, 212, 0.04)");
      earthGrad.addColorStop(0.92, isLight ? "rgba(2, 132, 199, 0.18)" : "rgba(56, 189, 248, 0.12)");
      earthGrad.addColorStop(1, isLight ? "rgba(79, 70, 229, 0.0)" : "rgba(99, 102, 241, 0.0)");

      ctx.fillStyle = earthGrad;
      ctx.beginPath();
      ctx.arc(earthCenterX, earthCenterY, earthRadius + 60, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric Line
      ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.32)" : "rgba(56, 189, 248, 0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(earthCenterX, earthCenterY, earthRadius, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // 3. Draw Orbital Trajectory Rings
      function drawOrbitRing(ringPts, color, lineWidth = 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        let started = false;
        for (let pt of ringPts) {
          const rPt = rotatePoint(pt, curRotX * 0.5, curRotY * 0.5 + time * 0.05, 0);
          const p = project(rPt, cx, cy, 420);
          if (p) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      drawOrbitRing(orbitRing1, isLight ? "rgba(2, 132, 199, 0.42)" : "rgba(6, 182, 212, 0.28)", 1.2);
      drawOrbitRing(orbitRing2, isLight ? "rgba(79, 70, 229, 0.32)" : "rgba(99, 102, 241, 0.22)", 1);

      // 4. Draw Rocket Thruster Plasma Plume Particles
      for (let p of exhaustParticles) {
        p.z += p.vz;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;

        if (p.life <= 0 || p.z > 220) {
          p.x = (Math.random() - 0.5) * 6;
          p.y = (Math.random() - 0.5) * 6;
          p.z = BH + 24;
          p.vx = (Math.random() - 0.5) * 1.8;
          p.vy = (Math.random() - 0.5) * 1.8;
          p.vz = Math.random() * 4 + 4;
          p.life = 1;
        }

        const rP = rotatePoint([p.x, p.y, p.z], craftRotX, craftRotY, craftRotZ);
        const proj = project(rP, cx, cy);
        if (proj) {
          const alpha = p.life * 0.75;
          const radius = p.size * proj.scale;
          ctx.fillStyle = p.z < BH + 60
            ? (isLight ? `rgba(2, 132, 199, ${alpha * 0.95})` : `rgba(6, 182, 212, ${alpha})`)
            : (isLight ? `rgba(234, 88, 12, ${alpha * 0.85})` : `rgba(249, 115, 22, ${alpha * 0.8})`);
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Draw Rocket Thruster Nozzle
      const projNozzleTop = nozzleTop.map((pt) => project(rotatePoint(pt, craftRotX, craftRotY, craftRotZ), cx, cy));
      const projNozzleBottom = nozzleBottom.map((pt) => project(rotatePoint(pt, craftRotX, craftRotY, craftRotZ), cx, cy));

      ctx.strokeStyle = isLight ? "rgba(217, 119, 6, 0.95)" : "rgba(245, 158, 11, 0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < NOZZLE_PTS; i++) {
        const next = (i + 1) % NOZZLE_PTS;
        const p1 = projNozzleTop[i];
        const p2 = projNozzleTop[next];
        const b1 = projNozzleBottom[i];
        const b2 = projNozzleBottom[next];
        if (p1 && p2 && b1 && b2) {
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(b1.x, b1.y);
        }
      }
      ctx.stroke();

      // 6. Draw Deployable Solar Panel Wings
      function drawWing(wingVertices, isRight) {
        const projWing = wingVertices.map((pt) =>
          project(rotatePoint(pt, craftRotX, craftRotY, craftRotZ), cx, cy)
        );
        if (projWing.some((p) => !p)) return;

        // Wing Face (Photovoltaic blue)
        ctx.fillStyle = isLight ? "rgba(30, 58, 138, 0.22)" : "rgba(14, 116, 144, 0.4)";
        ctx.beginPath();
        ctx.moveTo(projWing[0].x, projWing[0].y);
        for (let i = 1; i < projWing.length; i++) {
          ctx.lineTo(projWing[i].x, projWing[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Wing Border
        ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.92)" : "rgba(6, 182, 212, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Photovoltaic Grid Cells Lines
        const SEGS = 5;
        for (let s = 1; s < SEGS; s++) {
          const t = s / SEGS;
          const topX = wingVertices[0][0] + (wingVertices[1][0] - wingVertices[0][0]) * t;
          const topY = wingVertices[0][1] + (wingVertices[1][1] - wingVertices[0][1]) * t;
          const topZ = wingVertices[0][2];
          const botX = wingVertices[3][0] + (wingVertices[2][0] - wingVertices[3][0]) * t;
          const botY = wingVertices[3][1] + (wingVertices[2][1] - wingVertices[3][1]) * t;
          const botZ = wingVertices[3][2];

          const pTop = project(rotatePoint([topX, topY, topZ], craftRotX, craftRotY, craftRotZ), cx, cy);
          const pBot = project(rotatePoint([botX, botY, botZ], craftRotX, craftRotY, craftRotZ), cx, cy);
          if (pTop && pBot) {
            ctx.strokeStyle = isLight ? "rgba(14, 116, 144, 0.5)" : "rgba(56, 189, 248, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pTop.x, pTop.y);
            ctx.lineTo(pBot.x, pBot.y);
            ctx.stroke();
          }
        }

        // Structural Support Boom linking wing to chassis
        const boomStart = isRight ? [B, 0, 0] : [-B, 0, 0];
        const boomEnd = wingVertices[0];
        const pBS = project(rotatePoint(boomStart, craftRotX, craftRotY, craftRotZ), cx, cy);
        const pBE = projWing[0];
        if (pBS && pBE) {
          ctx.strokeStyle = isLight ? "rgba(217, 119, 6, 0.95)" : "rgba(245, 158, 11, 0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pBS.x, pBS.y);
          ctx.lineTo(pBE.x, pBE.y);
          ctx.stroke();
        }
      }

      drawWing(leftWing, false);
      drawWing(rightWing, true);

      // 7. Draw Satellite Bus Chassis (Hexagonal / Cuboid Frame)
      const projBus = busVertices.map((pt) =>
        project(rotatePoint(pt, craftRotX, craftRotY, craftRotZ), cx, cy)
      );

      // Chassis Face Fills (Aerospace Gold MLI Foil & Metallic Charcoal)
      const faces = [
        [0, 1, 2, 3], // Front
        [4, 5, 6, 7], // Aft
        [0, 1, 5, 4], // Top
        [2, 3, 7, 6], // Bottom
        [1, 2, 6, 5], // Right
        [0, 3, 7, 4], // Left
      ];

      for (let f of faces) {
        const p0 = projBus[f[0]];
        const p1 = projBus[f[1]];
        const p2 = projBus[f[2]];
        const p3 = projBus[f[3]];
        if (p0 && p1 && p2 && p3) {
          ctx.fillStyle = isLight ? "rgba(241, 245, 249, 0.94)" : "rgba(15, 23, 42, 0.65)";
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Chassis Wireframe Edges
      ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.75)" : "rgba(56, 189, 248, 0.9)";
      ctx.lineWidth = 1.8;
      for (let [i, j] of busEdges) {
        const p1 = projBus[i];
        const p2 = projBus[j];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // 8. Draw High-Gain Parabolic Dish Antenna
      const projDishRim = dishRim.map((pt) =>
        project(rotatePoint(pt, craftRotX, craftRotY, craftRotZ), cx, cy)
      );
      const projDishCenter = project(rotatePoint(dishCenter, craftRotX, craftRotY, craftRotZ), cx, cy);
      const projFeedHorn = project(
        rotatePoint([dishCenter[0], dishCenter[1], dishCenter[2] - 18], craftRotX, craftRotY, craftRotZ),
        cx,
        cy
      );

      if (projDishCenter && projFeedHorn) {
        // Dish Reflector Face
        ctx.fillStyle = isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(6, 182, 212, 0.25)";
        ctx.beginPath();
        let started = false;
        for (let p of projDishRim) {
          if (p) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.closePath();
        ctx.fill();

        // Dish Rim Ring
        ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.85)" : "rgba(6, 182, 212, 0.9)";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Parabolic Ribs radiating from center
        ctx.strokeStyle = isLight ? "rgba(14, 116, 144, 0.5)" : "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1;
        for (let p of projDishRim) {
          if (p) {
            ctx.beginPath();
            ctx.moveTo(projDishCenter.x, projDishCenter.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
        }

        // Subreflector Feed Horn Mast
        ctx.strokeStyle = isLight ? "rgba(217, 119, 6, 0.95)" : "rgba(245, 158, 11, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(projDishCenter.x, projDishCenter.y);
        ctx.lineTo(projFeedHorn.x, projFeedHorn.y);
        ctx.stroke();

        // Feed Horn Tip Beacon Dot
        ctx.fillStyle = isLight ? "#059669" : "#10b981";
        ctx.beginPath();
        ctx.arc(projFeedHorn.x, projFeedHorn.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 9. High-Tech Telemetry HUD Tags Floating with the Spacecraft
      if (projBus[1]) {
        const tagX = projBus[1].x + 35;
        const tagY = projBus[1].y - 30;

        ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.5)" : "rgba(6, 182, 212, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(projBus[1].x, projBus[1].y);
        ctx.lineTo(tagX - 8, tagY + 6);
        ctx.lineTo(tagX + 75, tagY + 6);
        ctx.stroke();

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = isLight ? "rgba(2, 132, 199, 1)" : "rgba(6, 182, 212, 0.9)";
        ctx.fillText("SAT-OPS // 540km", tagX, tagY);
        ctx.fillStyle = isLight ? "rgba(5, 150, 105, 1)" : "rgba(16, 185, 129, 0.85)";
        ctx.fillText("BEACON: ACTIVE", tagX, tagY + 16);
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
