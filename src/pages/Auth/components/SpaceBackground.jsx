import { useEffect, useRef } from "react";
import { createSpaceScene } from "./spaceScene";

/**
 * SpaceBackground – interactive orbital scene (pure Canvas 2D, no dependencies).
 *
 *  - 3-layer starfield + nebula that drift with the mouse (parallax depth)
 *  - Earth limb with atmosphere glow at the bottom
 *  - Two satellites orbiting on tilted elliptical paths
 *  - A "hero" satellite that chases the cursor with a glowing trail,
 *    and opens a dashed data link to the nearest orbiting satellite
 *  - Click / tap sends a radar ping, shooting stars cross the sky now and then
 *
 * Drop-in replacement for <Spacecraft3DCanvas />:   <SpaceBackground />
 * Respects prefers-reduced-motion, pauses when the tab is hidden, handles HiDPI + resize.
 */

// PERF: when the browser supports OffscreenCanvas, the scene is drawn inside a Web Worker
// (spaceScene.worker.js) so its continuous full-screen redraws never block the main thread.
// Otherwise (older browsers, tests) it falls back to drawing on the main thread exactly as before.
//
// canvas element -> { host, killTimer }. A canvas can only be transferred to a worker once, so
// the worker is kept alive across React StrictMode's dev-only mount -> unmount -> mount cycle
// and only terminated if the component is really unmounted.
const offscreenHosts = new WeakMap();

function canUseOffscreenWorker(canvas) {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof canvas.transferControlToOffscreen === "function"
  );
}

function createWorkerHost(canvas, init) {
  let worker;
  try {
    worker = new Worker(new URL("./spaceScene.worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  let offscreen;
  try {
    offscreen = canvas.transferControlToOffscreen();
  } catch {
    worker.terminate();
    return null;
  }
  worker.postMessage({ type: "init", canvas: offscreen, ...init }, [offscreen]);
  return {
    resize: (size) => worker.postMessage({ type: "resize", ...size }),
    move: (x, y) => worker.postMessage({ type: "move", x, y }),
    leave: () => worker.postMessage({ type: "leave" }),
    down: (x, y) => worker.postMessage({ type: "down", x, y }),
    visible: (visible) => worker.postMessage({ type: "visible", visible }),
    dispose: () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
    },
  };
}

export default function SpaceBackground({ className = "", style = {}, maxFps = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const measure = () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const applyCssSize = ({ width, height }) => {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    let host = null;
    let isWorkerHost = false;

    const existing = offscreenHosts.get(canvas);
    if (existing) {
      // StrictMode remount of the same <canvas>: keep using the worker it was transferred to
      clearTimeout(existing.killTimer);
      existing.killTimer = null;
      host = existing.host;
      isWorkerHost = true;
      const size = measure();
      applyCssSize(size);
      host.resize(size);
      host.visible(!document.hidden);
    } else if (canUseOffscreenWorker(canvas)) {
      const size = measure();
      applyCssSize(size);
      host = createWorkerHost(canvas, { ...size, reduceMotion, maxFps, visible: !document.hidden });
      if (host) {
        isWorkerHost = true;
        offscreenHosts.set(canvas, { host, killTimer: null });
      }
    }

    if (!host) {
      // Main-thread fallback (original behaviour)
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      const scene = createSpaceScene({
        canvas,
        ctx,
        reduceMotion,
        maxFps,
        raf: (cb) => requestAnimationFrame(cb),
        caf: (id) => cancelAnimationFrame(id),
        now: () => performance.now(),
      });
      host = {
        resize: (size) => scene.resize(size.width, size.height, size.dpr),
        move: scene.pointerMove,
        leave: scene.pointerLeave,
        down: scene.pointerDown,
        visible: scene.setVisible,
        dispose: scene.stop,
      };
      const size = measure();
      applyCssSize(size);
      host.resize(size);
      scene.start();
    }

    const onResize = () => {
      const size = measure();
      applyCssSize(size);
      host.resize(size);
    };
    const onMove = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      if (!pt) return;
      host.move(pt.clientX, pt.clientY);
    };
    const onLeave = () => {
      host.leave();
    };
    const onDown = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      if (!pt) return;
      host.down(pt.clientX, pt.clientY);
    };
    const onVisibility = () => {
      host.visible(!document.hidden);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchstart", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    window.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchstart", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (isWorkerHost) {
        const entry = offscreenHosts.get(canvas);
        if (entry) {
          // Deferred so a StrictMode remount can pick the worker up again
          entry.killTimer = setTimeout(() => {
            offscreenHosts.delete(canvas);
            entry.host.dispose();
          }, 0);
        }
      } else {
        host.dispose();
      }
    };
  }, [maxFps]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
