/**
 * inphner: the virtual cube's 3D view. Plain CSS 3D: one div per sticker,
 * each placed by a matrix3d built from the sticker simulator (scramble/nxn.ts),
 * so it works for 2x2 to 7x7 with no WebGL and no extra download.
 *
 * It copies csTimer's virtual cube (src/js/twisty/twisty.js + twistynnn.js):
 * camera straight in front, 45° above (vrcOri "6,12"), 2√2 cube edges from the
 * centre, aimed 0.075 edges below it, 30° field of view; stickers 1.8 of every
 * 2 units with a thin black edge, double-sided, and no plastic body, so the
 * far side shows through the gaps. Colours are csTimer's defaults.
 *
 * The state changes the moment a key is pressed (that is what solved-detection
 * and timing read); the animation only shows it. A new turn during an
 * animation finishes the old one at once, so fast typing never queues up.
 */
import { applyScramble, FACE_AXIS, solvedCube, turnLayers, type CubeState } from '../scramble/nxn.ts';
import type { Face } from '../scramble/nxn.ts';
import type { LayerMove } from '../timer/virtual.ts';

type Vec = [number, number, number];

/** Pixels per simulator unit (a sticker is 2 units). The scene is scaled to fit. */
const UNIT = 20;
const TURN_MS = 110;

/** csTimer's default cube colours (its "colcube" setting). */
const COLOURS: Record<Face, string> = { U: '#fff', R: '#f00', F: '#0d0', D: '#ff0', L: '#fa0', B: '#00f' };
/** csTimer's camera: distance (in cube edges), vertical field of view, elevation, aim offset. */
const CAMERA_DIST = 2 * Math.SQRT2;
const FOV = (30 * Math.PI) / 180;
const ELEVATION = 45;
const AIM_BELOW = 0.075;

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
      d.style.setProperty('--c', COLOURS[s.color]);
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
    // At the camera's distance the square view spans 2·d·tan(fov/2) cube edges.
    // csTimer's view runs the near top edge right to the frame's border (or a
    // hair past it), so the picture is shrunk to fit; the camera, and so the
    // look, stays exactly csTimer's.
    const edge = (0.88 * side) / (2 * CAMERA_DIST * Math.tan(FOV / 2));
    const scale = edge / (2 * this.n * UNIT);
    const cube = this.scene.parentElement!;
    cube.style.perspective = `${(CAMERA_DIST * edge).toFixed(1)}px`;
    this.scene.style.transform = `scale(${scale.toFixed(4)}) rotateX(-${ELEVATION}deg) `
      + `translateY(${(-AIM_BELOW * 2 * this.n * UNIT).toFixed(2)}px)`;
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
