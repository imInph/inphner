/**
 * inphner: what the command palette offers. Built fresh every time it opens,
 * so the labels always say what pressing the row will actually do ("Turn
 * inspection off for 3x3", "Switch to OH practice").
 */
import { EVENTS, eventDef } from '../events.ts';
import { inspectionFor, prefs, setPrefs } from '../prefs.ts';
import { go } from '../router.ts';
import { warm } from '../scramble/generator.ts';
import {
  createSession, currentSession, orderedSessions, sessionSummaries, setCurrentSession,
} from '../store.ts';
import { currentTheme, toggleTheme } from '../theme.ts';
import type { PaletteItem } from '../ui/palette.ts';
import { eventIcon } from '../ui/event-icon.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';
import { openExport, openImport } from './data-io.ts';
import { VIEWS } from './registry.ts';
import { newSessionDialog } from './session-picker.ts';
import { showShortcuts } from './shortcuts.ts';

const ALG_SETS: [string, string][] = [['pll', 'PLL'], ['oll', 'OLL'], ['f2l', 'F2L'], ['custom', 'Custom']];

/** Switch to this event: its most recent session, or a new one if it has none. */
async function useEvent(event: string): Promise<void> {
  const existing = orderedSessions().find((s) => s.event === event);
  if (existing) await setCurrentSession(existing.id);
  else await createSession({ name: 'Main', event });
  warm(currentSession().event);
}

export async function paletteItems(): Promise<PaletteItem[]> {
  const items: PaletteItem[] = [];
  const session = currentSession();
  const p = prefs();
  const def = eventDef(session.event);
  const inspecting = inspectionFor(p, session.event);

  items.push(
    {
      id: 'cmd:new-session', section: 'Commands', label: 'New session…',
      keywords: 'create add', icon: icon('plus', 18), run: () => newSessionDialog(),
    },
    {
      id: 'cmd:inspection', section: 'Commands',
      label: `Turn inspection ${inspecting ? 'off' : 'on'} for ${def.short}`,
      sub: 'WCA 15 seconds, with the +2 and DNF windows',
      keywords: 'toggle wca 15 seconds penalty',
      icon: icon('clock', 18),
      run: () => {
        setPrefs({ inspection: { ...prefs().inspection, [session.event]: !inspecting } });
        toast(`Inspection ${inspecting ? 'off' : 'on'} for ${def.short}.`);
      },
    },
    {
      id: 'cmd:theme', section: 'Commands',
      label: `Switch to the ${currentTheme() === 'dark' ? 'light' : 'dark'} theme`,
      keywords: 'toggle appearance colour color', icon: icon('theme', 18), run: toggleTheme,
    },
    {
      id: 'cmd:export', section: 'Commands', label: 'Export solves…',
      sub: 'csTimer, CSV or a full backup', keywords: 'download save backup cstimer csv',
      icon: icon('archive', 18), run: openExport,
    },
    {
      id: 'cmd:import', section: 'Commands', label: 'Import solves…',
      sub: 'csTimer export, CSV or an inphner backup', keywords: 'upload restore cstimer csv',
      icon: icon('stack', 18), run: () => { void openImport(); },
    },
    {
      id: 'cmd:shortcuts', section: 'Commands', label: 'Keyboard shortcuts',
      hint: '?', keywords: 'keys help', icon: icon('keyboard', 18), run: showShortcuts,
    },
  );

  for (const v of VIEWS) {
    items.push({
      id: `go:${v.id}`, section: 'Go to', label: `Go to ${v.label}`, sub: v.blurb,
      keywords: v.blurb, hint: `g ${v.key}`, icon: icon(v.icon, 18), run: () => go(v.id),
    });
  }

  for (const [set, label] of ALG_SETS) {
    items.push({
      id: `alg:${set}`, section: 'Algorithms', label: `Alg sheet: ${label}`,
      sub: 'Your alg, notes and learning status', keywords: 'algorithms sheet cases',
      icon: icon('book', 18), run: () => go('algorithms', { set }),
    });
  }

  for (const { session: s, count } of await sessionSummaries()) {
    const on = s.id === session.id;
    items.push({
      id: `session:${s.id}`, section: 'Sessions', label: on ? s.name : `Switch to ${s.name}`,
      sub: `${eventDef(s.event).name} · ${count} ${count === 1 ? 'solve' : 'solves'}`,
      hint: on ? 'current' : '', keywords: eventDef(s.event).short, icon: eventIcon(s.event, 18),
      current: on,
      run: () => { if (!on) void setCurrentSession(s.id).then(() => warm(currentSession().event)); },
    });
  }

  for (const e of EVENTS) {
    const existing = orderedSessions().find((s) => s.event === e.id);
    items.push({
      id: `event:${e.id}`, section: 'Events', label: `Switch to ${e.name}`,
      sub: existing ? existing.name : 'Starts a new session for it',
      hint: e.short, keywords: `${e.short} ${e.group}`, icon: eventIcon(e.id, 18),
      current: e.id === session.event,
      run: () => { void useEvent(e.id); },
    });
  }

  return items;
}
