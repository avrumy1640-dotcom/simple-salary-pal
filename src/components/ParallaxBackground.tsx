import { useEffect } from "react";

/**
 * Fixed-position 3D parallax background with floating orbs and a grid plane
 * that tilts and drifts as the user scrolls. Sits behind all app content.
 */
export function ParallaxBackground() {
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const p = Math.min(1, y / max);
        document.documentElement.style.setProperty("--scroll-y", String(y));
        document.documentElement.style.setProperty("--scroll-p", String(p));
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="parallax-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="parallax-plane" />
      <div className="parallax-orb parallax-orb-1" />
      <div className="parallax-orb parallax-orb-2" />
      <div className="parallax-orb parallax-orb-3" />
      <div className="parallax-glow" />
    </div>
  );
}
