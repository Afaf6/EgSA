import { useEffect, useRef } from "react";
import { createSpaceScene } from "./spaceScene";

/**
 * StaticSpaceBackground – a still version of <SpaceBackground />.
 *
 * Uses the exact same drawing engine (spaceScene.js) but renders a single frame instead of
 * running an animation loop: no requestAnimationFrame loop, no mouse/touch listeners.
 * It only redraws when the window is resized (so it stays sharp and full-screen).
 * Same <canvas> element, class names and styles as SpaceBackground, so the existing CSS
 * (including the light-theme recolouring) applies unchanged.
 */
export default function StaticSpaceBackground({ className = "", style = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // The engine asks for the next frame at the start of every frame; we only ever run one.
    let pendingFrame = null;
    const scene = createSpaceScene({
      canvas,
      ctx,
      reduceMotion,
      maxFps: 0,
      raf: (cb) => {
        pendingFrame = cb;
        return 1;
      },
      caf: () => {
        pendingFrame = null;
      },
      now: () => performance.now(),
    });

    const drawOnce = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      scene.resize(width, height, dpr);
      scene.start();
      const frame = pendingFrame;
      pendingFrame = null;
      if (frame) frame(performance.now());
      scene.stop();
    };

    drawOnce();

    // Coalesce resize bursts into one redraw per animation frame
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        drawOnce();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      scene.stop();
    };
  }, []);

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
