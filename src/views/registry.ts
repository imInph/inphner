/**
 * inphner: the views. Each has a nav entry, a `g x` hotkey and a tinted icon
 * badge colour used on its cards (inphner-prompt.md §A2).
 */
import type { IconName } from '../ui/icons.ts';

export interface ViewMeta {
  id: string;
  label: string;
  /** Second key of the `g x` jump. */
  key: string;
  tint: 'blue' | 'indigo' | 'teal' | 'orange' | 'purple' | 'green' | 'graphite';
  icon: IconName;
  /** One line shown on placeholders and in the palette. */
  blurb: string;
}

export const VIEWS: ViewMeta[] = [
  { id: 'timer', label: 'Timer', key: 't', tint: 'blue', icon: 'cube', blurb: 'Scramble, timer, live stats and recent solves.' },
  { id: 'sessions', label: 'Sessions', key: 's', tint: 'indigo', icon: 'stack', blurb: 'All sessions, the full solve list, bulk edit, import and export.' },
  { id: 'stats', label: 'Stats', key: 'i', tint: 'teal', icon: 'chart', blurb: 'Trends, distribution, PB history and consistency.' },
  { id: 'trainer', label: 'Trainer', key: 'r', tint: 'orange', icon: 'target', blurb: 'Drill PLL, OLL, F2L and more, weighted toward your slowest cases.' },
  { id: 'algorithms', label: 'Algorithms', key: 'a', tint: 'purple', icon: 'book', blurb: 'Your alg sheet: your alg per case, notes and learning status.' },
  { id: 'tools', label: 'Tools', key: 'o', tint: 'green', icon: 'wrench', blurb: 'Scramble generator, cross hints, metronome and a BLD memo helper.' },
  { id: 'settings', label: 'Settings', key: ',', tint: 'graphite', icon: 'sliders', blurb: 'Appearance, timer behaviour, inspection, sounds and data.' },
];

export const DEFAULT_VIEW = 'timer';

export function viewMeta(id: string): ViewMeta | undefined {
  return VIEWS.find((v) => v.id === id);
}
