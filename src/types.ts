/**
 * inphner: the data model (inphner-prompt.md §A6). Every record has a
 * client-generated UUID and updatedAt so a later sync can merge.
 */
import type { Penalty } from './timer/format.ts';

export type { Penalty };

export interface Solve {
  id: string;
  sessionId: string;
  /** Raw time, penalty NOT applied. FMC: move count × 1000. */
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  /** WCA event id where one exists ('333', '333oh', 'pyram'…). */
  event: string;
  createdAt: number;
  updatedAt: number;
  comment?: string;
  /** Cumulative ms per phase. */
  splits?: number[];
  /** Smart cube / FMC solution. */
  solution?: string;
  source?: 'timer' | 'typing' | 'stackmat' | 'smartcube' | 'import';
  /** Multi-BLD: cubes solved / attempted (timeMs is the time used). */
  multi?: { solved: number; attempted: number };
}

export interface Session {
  id: string;
  name: string;
  event: string;
  createdAt: number;
  updatedAt: number;
  order: number;
  archived?: boolean;
  goalMs?: number;
  goalStat?: 'single' | 'ao5' | 'ao12' | 'ao100';
  /** When the goal was first reached (it's then shown as done). */
  goalReachedAt?: number;
}
