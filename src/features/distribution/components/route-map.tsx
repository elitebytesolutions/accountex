"use client";

import { useMemo } from "react";

const hash = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const prng = (seed: number) => {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const W = 800, H = 380, WH: [number, number] = [64, 318];

/**
 * Template rtMap (9I-distribution.js): a stylised beat, not real map tiles. Pins are the stops in visit order, laid
 * out deterministically from the route code; the warehouse sits bottom-left. District names are left out (no real geography).
 */
export function RouteMap({ code, name, tone, stops, warehouse, hot, onHot }: {
  code: string;
  name: string;
  tone: string;
  stops: { key: string; label: string }[];
  warehouse: string;
  hot: string | null;
  onHot: (key: string | null) => void;
}) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const { pts, d, blocks } = useMemo(() => {
    const n = stops.length, rnd = prng(hash(code));
    const pts = stops.map((_, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = 150 + t * 590 + (rnd() - 0.5) * 30;
      const y = 190 + Math.sin(t * Math.PI * 2.1 + (hash(code) % 7)) * 110 + (rnd() - 0.5) * 34;
      return [Math.round(x), Math.round(Math.max(40, Math.min(H - 40, y)))] as [number, number];
    });
    const all = [WH, ...pts];
    let d = `M${WH[0]} ${WH[1]}`;
    for (let i = 0; i < all.length - 1; i++) { // catmull-rom → bezier
      const p0 = all[Math.max(0, i - 1)]!, p1 = all[i]!, p2 = all[i + 1]!, p3 = all[Math.min(all.length - 1, i + 2)]!;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    const br = prng(99), blocks: { x: number; y: number; w: number; h: number }[] = [];
    for (let gx = 0; gx < 9; gx++) for (let gy = 0; gy < 5; gy++) if (br() > 0.28) blocks.push({ x: gx * 92 + 10 + br() * 10, y: gy * 78 + 8 + br() * 8, w: 54 + br() * 22, h: 40 + br() * 18 });
    return { pts, d, blocks };
  }, [code, stops]);
  const n = stops.length;
  const pathId = `ds-map-path-${code}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ds-mapsvg" style={{ ["--rt" as string]: tone }} role="img" aria-label={`Map of ${name}`}>
      <g className="blocks">{blocks.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={7} />)}</g>
      <path className="canal" d="M-10 120 C 180 160, 320 60, 470 130 S 700 210, 820 150" />
      <g className="roads"><path d="M0 230 H800" /><path d="M400 0 V380" /><path d="M0 40 L800 340" /><path d="M180 0 C 210 140, 160 260, 230 380" /></g>
      {n > 0 && <><path className="route-glow" d={d} /><path key={d} className="route" id={pathId} d={d} pathLength={1} /></>}
      {n > 0 && !reduce && (
        <g className="truck"><circle r={9} /><path d="M-4 -2 h5 v4 h-5z M1 -1 h2.5 l1.5 2 v1 h-4z" />
          <animateMotion dur={`${Math.max(9, n * 1.4)}s`} repeatCount="indefinite" rotate="0"><mpath href={`#${pathId}`} /></animateMotion></g>
      )}
      <g className="wh" transform={`translate(${WH[0]} ${WH[1]})`}><rect x={-17} y={-17} width={34} height={34} rx={10} /><path d="M-8 6 V-3 L0 -8 L8 -3 V6 Z M-3 6 V1 H3 V6" /><text y={34} textAnchor="middle">{warehouse}</text></g>
      {pts.map((p, i) => (
        <g key={stops[i]!.key} className={hot === stops[i]!.key ? "pin ds-ping" : "pin"} transform={`translate(${p[0]} ${p[1]})`} style={{ ["--i" as string]: i }} tabIndex={0}
          onMouseEnter={() => onHot(stops[i]!.key)} onMouseLeave={() => onHot(null)} onFocus={() => onHot(stops[i]!.key)} onBlur={() => onHot(null)}>
          <title>{stops[i]!.label}</title>
          <circle className="halo" r={17} /><circle className="dot" r={12} /><text textAnchor="middle" dy={4}>{i + 1}</text>
        </g>
      ))}
      {!n && <text className="empty" x={W / 2} y={H / 2} textAnchor="middle">Drag shops onto {code} below to plot its beat</text>}
    </svg>
  );
}
