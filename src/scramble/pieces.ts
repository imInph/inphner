/**
 * inphner: which 3x3 piece each sticker of nxn's face grids belongs to. PURE.
 * Row by row per face, as faceGrids() returns them; null is the centre. Shared
 * by the Tools solvers (tools/cube.ts builds its sticker map from it) and the
 * scramble preview, which dims the pieces a practice step doesn't care about.
 */
import type { Face } from './nxn.ts';

export const PIECE_LAYOUT: Record<Face, (string | null)[]> = {
  U: ['UBL', 'UB', 'URB', 'UL', null, 'UR', 'ULF', 'UF', 'UFR'],
  F: ['ULF', 'UF', 'UFR', 'FL', null, 'FR', 'DFL', 'DF', 'DRF'],
  R: ['UFR', 'UR', 'URB', 'FR', null, 'BR', 'DRF', 'DR', 'DBR'],
  B: ['URB', 'UB', 'UBL', 'BR', null, 'BL', 'DBR', 'DB', 'DLB'],
  L: ['UBL', 'UL', 'ULF', 'BL', null, 'FL', 'DLB', 'DL', 'DFL'],
  D: ['DFL', 'DF', 'DRF', 'DL', null, 'DR', 'DLB', 'DB', 'DBR'],
};
