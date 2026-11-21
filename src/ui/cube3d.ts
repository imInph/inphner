/**
 * inphner: the virtual cube's 3D view. Plain CSS 3D: one div per sticker,
 * each placed by a matrix3d built from the sticker simulator (scramble/nxn.ts),
 * so it works for 2x2 to 7x7 with no WebGL and no extra download.
 *
 * The state changes the moment a key is pressed (that is what solved-detection
 * and timing read); the animation only shows it. A new turn during an
 * animation finishes the old one at once, so fast typing never queues up.
 */
import { applyScramble, FACE_AXIS, solvedCube, turnLayers, type CubeState } from '../scramble/nxn.ts';
import { STICKER } from '../scramble/net.ts';
import type { LayerMove } from '../timer/virtual.ts';

type Vec = [number, number, number];

/** Pixels per simulator unit (a sticker is 2 units). The scene is scaled to fit. */
const UNIT = 20;
const TURN_MS = 110;

function rotate(v: Vec, axis: number, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [z * s + x * c, y, z * c - x * s];
  return [x * c - y * s, x * s + y * c, z];
}

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Simulator space is y-up; CSS is y-down. */
function matrix(p: Vec, n: Vec): string {
  const u: Vec = Math.abs(n[1]) < 0.5 ? [0, 1, 0] : [1, 0, 0];
  const v = cross(n, u);
  const col = (w: Vec) => `${w[0].toFixed(4)},${(-w[1]).toFixed(4)},${w[2].toFixed(4)},0`;
  return `matrix3d(${col(u)},${col(v)},${col(n)},${(p[0] * UNIT).toFixed(2)},${(-p[1] * UNIT).toFixed(2)},${(p[2] * UNIT).toFixed(2)},1)`;
}

export class Cube3D {
  state: CubeState;
  private scene: HTMLElement;
  private els: HTMLElement[] = [];
  private anim: { moved: number[]; axis: number; angle: number; t0: number } | null = null;
  private frame = 0;
  private resize: ResizeObserver;
  private host: HTMLElement;

  constructor(host: HTMLElement, n: number) {
    this.host = host;
    this.state = solvedCube(n);
    host.innerHTML = '<div class="vcube" aria-hidden="true"><div class="vcube-scene"></div></div>';
    this.scene = host.querySelector('.vcube-scene')!;
    this.build();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
  }

  get n(): number { return this.state.n; }

  /** Solved, then the scramble applied with no animation. False if it doesn't parse. */
  reset(scramble = ''): boolean {
    this.finish();
    const next = solvedCube(this.n);
    const ok = !scramble || applyScramble(next, scramble);
    this.state = ok ? next : solvedCube(this.n);
    this.build();
    return ok;
  }

  turn(m: LayerMove): void {
    this.finish();
    const moved = turnLayers(this.state, m.face, m.from, m.to, m.dir);
    const [axis, sign] = FACE_AXIS[m.face];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      for (const i of moved) this.place(i);
      return;
    }
    // Clockwise seen from the face is -90° about its outward normal (nxn.ts).
    this.anim = { moved, axis, angle: (-sign * m.dir * Math.PI) / 2, t0: performance.now() };
    this.step();
  }

  destroy(): void {
    this.finish();
    this.resize.disconnect();
  }

  private build(): void {
    this.scene.textContent = '';
    this.els = this.state.stickers.map((s) => {
      const d = document.createElement('div');
      d.className = 'vcube-sticker';
      d.style.setProperty('--c', STICKER[s.color]);
      this.scene.append(d);
      return d;
    });
    this.state.stickers.forEach((_, i) => this.place(i));
    this.fit();
  }

  private place(i: number, axis = 0, angle = 0): void {
    const s = this.state.stickers[i]!;
    const p = angle ? rotate(s.p as Vec, axis, angle) : (s.p as Vec);
    const n = angle ? rotate(s.n as Vec, axis, angle) : (s.n as Vec);
    this.els[i]!.style.transform = matrix(p, n);
  }

  private fit(): void {
    const box = this.host.getBoundingClientRect();
    const side = Math.min(box.width, box.height);
    if (!side) return;
    // The cube's corner-to-corner width on screen is about 1.6 × its edge.
    const scale = side / (1.65 * 2 * this.n * UNIT);
    this.scene.style.setProperty('--vc-scale', scale.toFixed(4));
  }

  private step = (): void => {
    this.frame = 0;
    const a = this.anim;
    if (!a) return;
    const t = Math.min(1, (performance.now() - a.t0) / TURN_MS);
    const ease = 1 - (1 - t) * (1 - t);
    const angle = -a.angle * (1 - ease);
    for (const i of a.moved) this.place(i, a.axis, angle);
    if (t < 1) this.frame = requestAnimationFrame(this.step);
    else this.anim = null;
  };

  /** Jump the running animation to its end. */
  private finish(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.anim) for (const i of this.anim.moved) this.place(i);
    this.anim = null;
  }
}
