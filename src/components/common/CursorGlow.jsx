import { useEffect, useRef, useCallback } from "react";

export default function CursorGlow() {
  const glowRef = useRef(null);
  const mouse = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef(null);

  const lerp = (a, b, t) => a + (b - a) * t;

  const animate = useCallback(() => {
    current.current.x = lerp(current.current.x, mouse.current.x, 0.08);
    current.current.y = lerp(current.current.y, mouse.current.y, 0.08);

    if (glowRef.current) {
      glowRef.current.style.transform = `translate(${current.current.x - 300}px, ${current.current.y - 300}px)`;
      glowRef.current.style.opacity = "1";
    }

    raf.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    // Only enable on wider screens
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    const onMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf.current);
      } else {
        raf.current = requestAnimationFrame(animate);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf.current = requestAnimationFrame(animate);

    const onChange = (e) => {
      if (!e.matches) {
        cancelAnimationFrame(raf.current);
        if (glowRef.current) glowRef.current.style.opacity = "0";
      } else {
        raf.current = requestAnimationFrame(animate);
      }
    };
    mq.addEventListener("change", onChange);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onChange);
    };
  }, [animate]);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(79, 195, 247, 0.06) 0%, rgba(79, 195, 247, 0.02) 35%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0,
        transition: "opacity 0.3s ease",
        willChange: "transform",
        mixBlendMode: "screen",
      }}
    />
  );
}
