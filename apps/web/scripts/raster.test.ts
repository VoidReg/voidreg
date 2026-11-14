import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { LOSSLESS_SLACK, LOSSY_QUALITY, encodeRaster } from '../src/lib/server/raster.ts';

test('a flat image stays lossless and keeps its pixel size', async () => {
  const input = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 240, g: 240, b: 240 } }
  })
    .png()
    .toBuffer();
  const lossless = await sharp(input).webp({ lossless: true, effort: 5 }).toBuffer();
  const output = await encodeRaster(input);
  assert.equal(Buffer.from(output.subarray(0, 4)).toString(), 'RIFF');
  assert.equal(Buffer.from(output.subarray(8, 12)).toString(), 'WEBP');
  assert.equal(Buffer.compare(output, lossless), 0);
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 180);
  assert.ok(output.length < input.length);
});

test('a photographic image uses the smaller lossy file', async () => {
  const raw = randomBytes(96 * 64 * 3);
  const input = await sharp(raw, { raw: { width: 96, height: 64, channels: 3 } })
    .png()
    .toBuffer();
  const lossy = await sharp(input)
    .webp({ quality: LOSSY_QUALITY, effort: 5, smartSubsample: true })
    .toBuffer();
  const lossless = await sharp(input).webp({ lossless: true, effort: 5 }).toBuffer();
  assert.ok(lossless.length > lossy.length * LOSSLESS_SLACK);
  const output = await encodeRaster(input);
  assert.equal(output.length, lossy.length);
});
