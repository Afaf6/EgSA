/**
 * spaceScene.worker.js — renders the SpaceBackground scene on an OffscreenCanvas inside a
 * dedicated Web Worker (PERF): the ~30–60 full-screen redraws per second no longer run on the
 * main thread, so they cannot delay React rendering, scrolling, tables or charts.
 */
import { createSpaceScene } from "./spaceScene";

let scene = null;

const rafFn = typeof self.requestAnimationFrame === "function"
  ? (cb) => self.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16);
const cafFn = typeof self.cancelAnimationFrame === "function"
  ? (id) => self.cancelAnimationFrame(id)
  : (id) => clearTimeout(id);

self.onmessage = (e) => {
  const msg = e.data || {};
  switch (msg.type) {
    case "init": {
      const ctx = msg.canvas.getContext("2d");
      if (!ctx) return;
      scene = createSpaceScene({
        canvas: msg.canvas,
        ctx,
        reduceMotion: Boolean(msg.reduceMotion),
        maxFps: msg.maxFps || 0,
        raf: rafFn,
        caf: cafFn,
        now: () => performance.now(),
      });
      scene.resize(msg.width, msg.height, msg.dpr);
      if (msg.visible === false) return;
      scene.start();
      break;
    }
    case "resize":
      scene?.resize(msg.width, msg.height, msg.dpr);
      break;
    case "move":
      scene?.pointerMove(msg.x, msg.y);
      break;
    case "leave":
      scene?.pointerLeave();
      break;
    case "down":
      scene?.pointerDown(msg.x, msg.y);
      break;
    case "visible":
      scene?.setVisible(Boolean(msg.visible));
      break;
    case "stop":
      scene?.stop();
      scene = null;
      break;
    default:
      break;
  }
};
