/**
 * inphner: when to remind someone that their solves live only in this browser.
 *
 * Pure — the caller passes the clock, the counts and what the browser said when
 * we asked it not to evict our data. Two separate answers: a quiet dot on
 * Settings whenever a backup is overdue, and the toast, which repeats far less
 * often than "overdue" stays true so it never becomes noise.
 */

const DAY = 86400000;

/** How long a backup lasts before we call it overdue. */
export const OVERDUE_DAYS = 30;
/** When the browser would not promise to keep the data, ask far sooner. */
export const OVERDUE_DAYS_UNPROTECTED = 7;
/** The toast never comes back faster than this. */
export const REPEAT_DAYS = 7;
/** Below this there isn't enough to lose to be worth interrupting anyone. */
export const MIN_SOLVES = 50;

export interface BackupState {
  now: number;
  /** 0 = never exported. */
  lastExportAt: number;
  /** 0 = never nudged. */
  lastNudgeAt: number;
  solves: number;
  /** What navigator.storage answered: false means the data may be evicted. */
  protectedStorage: boolean;
}

/** Whole days since the last backup, or null if there has never been one. */
export function daysSinceBackup(s: BackupState): number | null {
  if (!s.lastExportAt) return null;
  return Math.max(0, Math.floor((s.now - s.lastExportAt) / DAY));
}

/** Enough solves to be worth protecting, and no backup recently enough. */
export function backupOverdue(s: BackupState): boolean {
  if (s.solves < MIN_SOLVES) return false;
  if (!s.lastExportAt) return true;
  const limit = (s.protectedStorage ? OVERDUE_DAYS : OVERDUE_DAYS_UNPROTECTED) * DAY;
  return s.now - s.lastExportAt > limit;
}

/** Overdue, and we haven't said so recently. */
export function shouldNudge(s: BackupState): boolean {
  if (!backupOverdue(s)) return false;
  if (!s.lastNudgeAt) return true;
  return s.now - s.lastNudgeAt >= REPEAT_DAYS * DAY;
}

/** The toast's wording, which changes with what the browser promised. */
export function nudgeMessage(s: BackupState): string {
  const days = daysSinceBackup(s);
  const where = s.protectedStorage
    ? 'Your solves are saved in this browser only.'
    : "Your solves are saved in this browser only, and it hasn't promised to keep them.";
  return days === null
    ? `You haven't backed up yet. ${where}`
    : `Your last backup was ${days} days ago. ${where}`;
}
