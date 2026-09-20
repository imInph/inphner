/**
 * inphner: which way up you're meant to be holding the cube (PURE).
 *
 * A scramble is applied in the WCA orientation — white on top, green in front
 * — and our solvers always solve the **D** layer. So a hint is only usable if
 * it says how to turn the cube first: "x2" for a white cross, "z" for red, and
 * so on. The rotations aren't recalled, they're read off the simulator.
 */
import { applyScramble, faceGrids, solvedCube, type Face } from '../scramble/nxn.ts';

export const COLOUR_NAMES: Record<Face, string> = {
  U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange',
};

export const COLOUR_HEX: Record<Face, string> = {
  U: '#ffffff', D: '#ffd500', F: '#009b48', B: '#0046ad', R: '#b71234', L: '#ff5800',
};

/** Faces in the order the picker shows them. */
export const FACE_ORDER: Face[] = ['U', 'D', 'F', 'B', 'R', 'L'];

/** The rotation that brings each face's colour to the bottom. */
export const TO_BOTTOM: Record<Face, string> = {
  U: 'x2', D: '', F: "x'", B: 'x', R: 'z', L: "z'",
};

/** Turning the whole cube about the U-D axis: same bottom, different front. */
export const Y_TURNS = ['', 'y', 'y2', "y'"];

/**
 * Every orientation worth trying for a hint. The cross doesn't care which way
 * the cube faces, but EOLine's line and Roux's block do, so those get all four.
 */
export function orientations(colour: Face | 'any', withFront: boolean): string[] {
  const bottoms = colour === 'any' ? FACE_ORDER.map((f) => TO_BOTTOM[f]) : [TO_BOTTOM[colour]];
  if (!withFront) return bottoms;
  return bottoms.flatMap((bottom) => Y_TURNS.map((y) => [bottom, y].filter(Boolean).join(' ')));
}

/** The colours a rotation leaves on the bottom and the front. */
export function facing(rotation: string): { bottom: Face; front: Face } {
  const cube = solvedCube(3);
  applyScramble(cube, rotation);
  const g = faceGrids(cube);
  return { bottom: g.D[1]![1]!, front: g.F[1]![1]! };
}

/** "white on the bottom, green in front". */
export function describeOrientation(rotation: string): string {
  const { bottom, front } = facing(rotation);
  return `${COLOUR_NAMES[bottom]} on the bottom, ${COLOUR_NAMES[front]} in front`;
}
