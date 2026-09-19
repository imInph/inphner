import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppearance, serializeAppearance, cssUrl, safeWallpaperUrl, parseTheme, greetingFor, DEFAULT_APPEARANCE,
} from './appearance.ts';

test('parseAppearance: null, garbage and non-objects give the defaults', () => {
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('{not json'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('[1,2]'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('"aurora"'), DEFAULT_APPEARANCE);
});

test('parseAppearance: valid fields are kept, invalid ones fall back one by one', () => {
  const a = parseAppearance(JSON.stringify({ accent: 'teal', wallpaper: 'neon', transparency: 'reduced', logo: 'rainbow' }));
  assert.deepEqual(a, { accent: 'teal', wallpaper: 'aurora', transparency: 'reduced', logo: 'accent', url: '' });
});

test('parseAppearance: reads inphub\'s stored shape (image as a CSS url())', () => {
  const inphub = JSON.stringify({
    accent: 'green', wallpaper: 'custom', transparency: 'full', logo: 'wallpaper',
    image: 'url("https://example.com/wp.jpg")',
  });
  assert.deepEqual(parseAppearance(inphub), {
    accent: 'green', wallpaper: 'custom', transparency: 'full', logo: 'wallpaper', url: 'https://example.com/wp.jpg',
  });
});

test('wallpaper URLs: only http(s) survive', () => {
  assert.equal(safeWallpaperUrl('javascript:alert(1)'), '');
  assert.equal(safeWallpaperUrl('data:image/png;base64,AAAA'), '');
  assert.equal(safeWallpaperUrl('/local.jpg'), '');
  assert.equal(safeWallpaperUrl('  https://x.io/a.png  '), 'https://x.io/a.png');
  assert.equal(parseAppearance(JSON.stringify({ url: 'javascript:alert(1)' })).url, '');
});

test('cssUrl: quotes, backslashes, parens and spaces cannot break out of url()', () => {
  assert.equal(cssUrl('https://x.io/a"b\\c(d) e.png'), 'url("https://x.io/a%22b%5Cc%28d%29%20e.png")');
});

test('serializeAppearance round-trips through parseAppearance', () => {
  const a = { accent: 'pink', wallpaper: 'custom', transparency: 'reduced', logo: 'accent', url: 'https://x.io/w.jpg' } as const;
  assert.deepEqual(parseAppearance(serializeAppearance(a)), a);
  assert.equal(JSON.parse(serializeAppearance(a)).image, 'url("https://x.io/w.jpg")');
});

test('parseTheme defaults to dark', () => {
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('dark'), 'dark');
  assert.equal(parseTheme(null), 'dark');
  assert.equal(parseTheme('sepia'), 'dark');
});

test('greetingFor uses the spec\'s boundaries', () => {
  assert.equal(greetingFor(0), 'Late night');
  assert.equal(greetingFor(4), 'Late night');
  assert.equal(greetingFor(5), 'Good morning');
  assert.equal(greetingFor(11), 'Good morning');
  assert.equal(greetingFor(12), 'Good afternoon');
  assert.equal(greetingFor(17), 'Good afternoon');
  assert.equal(greetingFor(18), 'Good evening');
  assert.equal(greetingFor(23), 'Good evening');
});
