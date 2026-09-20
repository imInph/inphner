import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SOLVES, OVERDUE_DAYS, OVERDUE_DAYS_UNPROTECTED, REPEAT_DAYS,
  backupOverdue, daysSinceBackup, nudgeMessage, shouldNudge, type BackupState,
} from './backup-nudge.ts';

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 31);
const daysAgo = (d: number): number => NOW - d * DAY;

const state = (patch: Partial<BackupState> = {}): BackupState => ({
  now: NOW,
  lastExportAt: 0,
  lastNudgeAt: 0,
  solves: 500,
  protectedStorage: true,
  ...patch,
});

test('too few solves is never worth interrupting anyone over', () => {
  assert.equal(backupOverdue(state({ solves: MIN_SOLVES - 1 })), false);
  assert.equal(backupOverdue(state({ solves: MIN_SOLVES })), true);
  assert.equal(shouldNudge(state({ solves: MIN_SOLVES - 1 })), false);
});

test('never having backed up is overdue once there is something to lose', () => {
  assert.equal(backupOverdue(state({ lastExportAt: 0 })), true);
  assert.equal(daysSinceBackup(state({ lastExportAt: 0 })), null);
});

test('a protected browser gets the full 30 days', () => {
  assert.equal(backupOverdue(state({ lastExportAt: daysAgo(OVERDUE_DAYS) })), false);
  assert.equal(backupOverdue(state({ lastExportAt: daysAgo(OVERDUE_DAYS + 1) })), true);
});

test('a browser that would not promise is asked again after a week', () => {
  const s = { lastExportAt: daysAgo(OVERDUE_DAYS_UNPROTECTED + 1), protectedStorage: false };
  assert.equal(backupOverdue(state(s)), true);
  // The same gap is still fine when the data is protected.
  assert.equal(backupOverdue(state({ ...s, protectedStorage: true })), false);
});

test('the toast repeats at most weekly, however overdue it stays', () => {
  const overdue = { lastExportAt: daysAgo(90) };
  assert.equal(shouldNudge(state({ ...overdue, lastNudgeAt: 0 })), true);
  assert.equal(shouldNudge(state({ ...overdue, lastNudgeAt: daysAgo(REPEAT_DAYS - 1) })), false);
  assert.equal(shouldNudge(state({ ...overdue, lastNudgeAt: daysAgo(REPEAT_DAYS) })), true);
});

test('backing up silences both the dot and the toast', () => {
  const fresh = state({ lastExportAt: daysAgo(1), lastNudgeAt: daysAgo(30) });
  assert.equal(backupOverdue(fresh), false);
  assert.equal(shouldNudge(fresh), false);
});

test('a clock that has gone backwards never reports negative days', () => {
  assert.equal(daysSinceBackup(state({ lastExportAt: NOW + 5 * DAY })), 0);
});

test('the wording says how long it has been, and what the browser promised', () => {
  assert.match(nudgeMessage(state({ lastExportAt: 0 })), /haven't backed up yet/);
  assert.match(nudgeMessage(state({ lastExportAt: daysAgo(42) })), /42 days ago/);
  assert.doesNotMatch(nudgeMessage(state({ protectedStorage: true })), /promised/);
  assert.match(nudgeMessage(state({ protectedStorage: false })), /hasn't promised to keep them/);
});
