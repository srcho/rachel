"use client";
import { type RefObject, useEffect } from "react";

/** One owner for drawer geometry; keyboard dismissal and PWA resume reset it too. */
export function useKeyboardViewport(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el || document.visibilityState === "hidden") return;
        const viewport = window.visualViewport;
        const height = viewport?.height ?? window.innerHeight;
        const top = viewport?.offsetTop ?? 0;
        Object.assign(el.style, {
          height: `${Math.min(window.innerHeight * 0.88, height)}px`,
          bottom: `${Math.max(0, window.innerHeight - height - top)}px`,
          left: `${viewport?.offsetLeft ?? 0}px`,
          width: `${viewport?.width ?? document.documentElement.clientWidth}px`,
          right: "auto",
        });
      });
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [enabled, ref]);
}
