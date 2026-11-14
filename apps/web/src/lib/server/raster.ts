import sharp from 'sharp';

/** Lossy WebP quality for photographs. Charts and diagrams stay lossless when that file is close. */
export const LOSSY_QUALITY = 88;
/** Prefer the lossless file when it is no more than this multiple of the lossy file. */
export const LOSSLESS_SLACK = 1.15;
const MAX_PIXELS = 16_000 * 16_000;

sharp.cache(false);

/** Full-resolution WebP. Text and line art stay lossless; photographs use the smaller lossy file. */
export async function encodeRaster(input: Uint8Array): Promise<Uint8Array> {
  const image = () =>
    sharp(input, { failOn: 'none', limitInputPixels: MAX_PIXELS, animated: false }).rotate();
  const lossless = await image().webp({ lossless: true, effort: 5 }).toBuffer();
  const lossy = await image()
    .webp({ quality: LOSSY_QUALITY, effort: 5, smartSubsample: true })
    .toBuffer();
  const body = lossless.length <= lossy.length * LOSSLESS_SLACK ? lossless : lossy;
  return new Uint8Array(body);
}
