/**
 * inphner: event icons (cubing/icons SVG glyphs, filled with currentColor).
 */
import { EVENT_ICONS } from '../data/event-icons.ts';
import { eventDef } from '../events.ts';
import { icon } from './icons.ts';

export function eventIcon(eventId: string, size = 18): string {
  const def = eventDef(eventId);
  const glyph = EVENT_ICONS[def.icon];
  if (!glyph) return icon('clock', size);
  return `<svg class="ico event-ico" viewBox="${glyph.viewBox}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${glyph.body}</svg>`;
}
