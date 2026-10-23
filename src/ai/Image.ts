// Image
// =====
// An image as models get it: one the user attached (Memory.image_add) or
// one a tool read (Machine.read). Decoded whole, so a broken one is found
// here and not by the vendor (which would fail the turn); turned upright
// (its EXIF orientation); scaled to fit FIT on its longest side; and
// encoded in at most IMAGE bytes where it can be: a JPEG as JPEG, any
// other kind (which may be transparent, which a JPEG would turn black)
// as WebP, lossless while that fits. A request carries at most PICS
// images (Agent.thin).

import { image_kind } from "../ui/View.ts";

// Constants
// =========

// Anthropic takes 32 MB a request, 20 images at full size: 20 of IMAGE
// bytes, in base64; FIT, the longest side it looks at
export const PICS  = 20;
export const FIT   = 1568;
export const IMAGE = 2 ** 20;

// the most pixels an image may have to be decoded: the user's (as Sharp's
// default), one a tool reads (its pixels held at once: 256 MB); a larger
// one is refused from its header, before any pixel is
export const PIXELS      = 2 ** 28;
export const READ_PIXELS = 2 ** 26;

// the largest file taken as an image (bytes)
export const LARGEST = 20 * 2 ** 20;

// each encoding tried in turn till one fits IMAGE bytes (the last taken
// anyway): a JPEG's qualities; any other's, WebP's (100: lossless)
const JPEG = [85, 70, 55];
const WEBP = [100, 85, 70];

// Types
// =====

// an image fitted: its bytes as sent and their type, the kind it was
// (image/png...), its size, the size sent
export type Fit = { bytes: Uint8Array; type: string; kind: string; w: number; h: number; sent: { w: number; h: number } };

// Image
// =====

// an image's bytes as models get them (the header says how); else why
// not, in words: no image of a kind taken, more pixels than most, or one
// that won't decode
export async function image_fit(bytes: Uint8Array, most = READ_PIXELS): Promise<Fit | string> {
  const kind = image_kind(bytes);
  if (kind === null) {
    return "not a png, jpeg, gif or webp image";
  }
  const name = kind.split("/")[1];
  const img  = new Bun.Image(bytes, { maxPixels: most });
  try {
    const { width: w, height: h } = await img.metadata();
    const k    = Math.min(1, FIT / Math.max(w, h));
    const sent = { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
    const jpeg = kind === "image/jpeg";
    img.resize(FIT, FIT, { fit: "inside", withoutEnlargement: true });
    let out: Uint8Array = new Uint8Array();
    for (const q of jpeg ? JPEG : WEBP) {
      out = await (jpeg ? img.jpeg({ quality: q }) : img.webp(q === 100 ? { lossless: true } : { quality: q })).bytes();
      if (out.length <= IMAGE) {
        break;
      }
    }
    return { bytes: out, type: jpeg ? "image/jpeg" : "image/webp", kind, w, h, sent };
  } catch (err: any) {
    return err?.code === "ERR_IMAGE_TOO_MANY_PIXELS" ? "a " + name + " of more than " + Math.round(most / 1e6) + " million pixels, too many to decode" : "a " + name + " that won't decode (cut short or broken)";
  }
}
