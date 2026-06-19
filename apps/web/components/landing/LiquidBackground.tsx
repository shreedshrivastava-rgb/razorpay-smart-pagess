"use client";

import { useEffect, useRef } from "react";

// Razorpay-blue fluid palette (r, g, b)
const PALETTE: [number, number, number][] = [
  [51, 149, 255],   // razorpay blue
  [96, 165, 250],   // blue-400
  [147, 197, 253],  // blue-300
  [59, 130, 246],   // blue-500
  [125, 211, 252],  // sky-300
];

interface Blob {
  bx: number; by: number;        // base position (0..1)
  x: number; y: number;          // current drawn position (px)
  r: number;                     // radius (px, set on resize)
  rBase: number;                 // radius as fraction of min(w,h)
  color: [number, number, number];
  alpha: number;
  sx: number; sy: number;        // drift speed
  px: number; py: number;        // drift phase
  pull: number;                  // how strongly it's attracted to the cursor (0..1)
}

interface Ripple { x: number; y: number; r: number; max: number; alpha: number; }

const BLOBS: Omit<Blob, "x" | "y" | "r">[] = [
  { bx: 0.30, by: 0.30, rBase: 0.42, color: PALETTE[0], alpha: 0.40, sx: 0.13, sy: 0.10, px: 0.0, py: 1.2, pull: 0.55 },
  { bx: 0.66, by: 0.32, rBase: 0.46, color: PALETTE[1], alpha: 0.38, sx: 0.11, sy: 0.14, px: 2.1, py: 0.4, pull: 0.45 },
  { bx: 0.48, by: 0.62, rBase: 0.55, color: PALETTE[2], alpha: 0.42, sx: 0.09, sy: 0.12, px: 4.0, py: 2.7, pull: 0.70 },
  { bx: 0.22, by: 0.66, rBase: 0.40, color: PALETTE[3], alpha: 0.34, sx: 0.14, sy: 0.09, px: 1.0, py: 3.5, pull: 0.35 },
  { bx: 0.78, by: 0.64, rBase: 0.44, color: PALETTE[4], alpha: 0.36, sx: 0.10, sy: 0.13, px: 3.2, py: 5.0, pull: 0.40 },
];

export function LiquidBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Render at half resolution — the heavy blur hides it and it's far cheaper.
    const SCALE = 0.5;
    let w = 0, h = 0;
    const blobs: Blob[] = BLOBS.map((b) => ({ ...b, x: 0, y: 0, r: 0 }));
    const ripples: Ripple[] = [];

    // Pointer state, in canvas px. Target = raw pointer; current eases toward it.
    const pointer = { tx: 0, ty: 0, x: 0, y: 0, active: false, lastX: 0, lastY: 0 };

    function resize() {
      const rect = parent!.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * SCALE));
      h = Math.max(1, Math.round(rect.height * SCALE));
      canvas!.width = w;
      canvas!.height = h;
      const min = Math.min(w, h);
      for (const b of blobs) {
        b.r = b.rBase * min;
        b.x = b.bx * w;
        b.y = b.by * h;
      }
      if (!pointer.active) { pointer.x = pointer.tx = w * 0.5; pointer.y = pointer.ty = h * 0.4; }
    }

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * w;
      const ny = ((e.clientY - rect.top) / rect.height) * h;
      // Only react while the cursor is over the hero area.
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      pointer.active = inside;
      if (!inside) return;
      pointer.tx = nx;
      pointer.ty = ny;
      // Spawn a ripple when the cursor travels far enough.
      const dx = nx - pointer.lastX, dy = ny - pointer.lastY;
      if (!reduce && dx * dx + dy * dy > (w * 0.012) ** 2 && ripples.length < 14) {
        ripples.push({ x: nx, y: ny, r: w * 0.01, max: w * 0.16, alpha: 0.5 });
        pointer.lastX = nx; pointer.lastY = ny;
      }
    }

    function drawBlob(x: number, y: number, r: number, color: [number, number, number], alpha: number) {
      const [cr, cg, cb] = color;
      const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
      g.addColorStop(0.6, `rgba(${cr},${cg},${cb},${alpha * 0.35})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    let raf = 0;
    let t = 0;
    function frame() {
      t += reduce ? 0 : 0.006;
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "source-over";

      // Ease the cursor position for a smooth, fluid trail.
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      const min = Math.min(w, h);
      for (const b of blobs) {
        // Organic drift around the base position.
        const driftX = Math.sin(t * b.sx * 6 + b.px) * min * 0.07;
        const driftY = Math.cos(t * b.sy * 6 + b.py) * min * 0.07;
        let targetX = b.bx * w + driftX;
        let targetY = b.by * h + driftY;
        // Flow toward the cursor when active.
        if (pointer.active) {
          targetX += (pointer.x - targetX) * b.pull;
          targetY += (pointer.y - targetY) * b.pull;
        }
        b.x += (targetX - b.x) * 0.06;
        b.y += (targetY - b.y) * 0.06;
        const pulse = 1 + Math.sin(t * 4 + b.px) * 0.06;
        drawBlob(b.x, b.y, b.r * pulse, b.color, b.alpha);
      }

      // Bright droplet that hugs the cursor.
      if (pointer.active) {
        drawBlob(pointer.x, pointer.y, min * 0.22, PALETTE[0], 0.30);
      }

      // Ripples expanding outward like water disturbance.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += (rp.max - rp.r) * 0.06;
        rp.alpha *= 0.94;
        if (rp.alpha < 0.02) { ripples.splice(i, 1); continue; }
        drawBlob(rp.x, rp.y, rp.r, PALETTE[2], rp.alpha * 0.4);
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`absolute inset-0 h-full w-full ${className}`}
      style={{ filter: "blur(44px) saturate(1.15)" }}
    />
  );
}
