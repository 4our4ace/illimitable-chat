// PNG
// ===
// A PNG made by hand, for the tests that need an image: w x h of one
// grey, or (alpha) see-through black lines on nothing, every other row
// (a JPEG of it would be all black; a WebP keeps it)

import * as zlib from "node:zlib";

export function png(w: number, h: number, alpha = false): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out  = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(Bun.hash.crc32(body), 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, alpha ? 6 : 2, 0, 0, 0], 8);
  const row  = (y: number) => (alpha ? Buffer.alloc(4 * w, y % 2 === 0 ? 0 : 0xff).map((b, k) => (k % 4 === 3 ? b : 0)) : Buffer.alloc(3 * w, 0x80));
  const rows = Buffer.concat(Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), row(y)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
