import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMac } from './smartcube.ts';

test('normalizeMac accepts the usual spellings and refuses anything else', () => {
  for (const input of ['AB:CD:EF:12:34:56', 'ab-cd-ef-12-34-56', 'abcdef123456', ' AB CD EF 12 34 56 ']) {
    assert.equal(normalizeMac(input), 'AB:CD:EF:12:34:56');
  }
  for (const input of ['', 'AB:CD:EF:12:34', 'AB:CD:EF:12:34:5G', 'AB:CD:EF:12:34:56:78']) {
    assert.equal(normalizeMac(input), null);
  }
});
