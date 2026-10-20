type Paint = number
type Pt = [number, number]
type Seg = { k: 'L' | 'C' | 'P'; pts: Pt[]; q?: Pt }
type Sub = { segs: Seg[]; closed: boolean }
type Bounds = { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
type Node = { tag: string; attrs: Record<string, string>; children: Node[]; text?: string }
type Ctx = { m: number[]; upright?: number[]; node?: number; form?: string; line?: boolean; hue?: Paint; series?: number; bars?: boolean; grid?: boolean; loose?: boolean; note?: boolean; rigid?: boolean; [key: string]: unknown }
type Part = { text: string; color: Paint | undefined; bold: boolean }
type TextRun = { text: string; parts: Part[]; cx: number; cy: number; w: number; vertical: boolean; tilted: boolean; loose: boolean; rigid: boolean; free: boolean; anchor: string; r: number; c: number; owner?: Shape; above?: TextRun }
type Shape = {
  kind: string; subs: Sub[]; polys: Pt[][]; box: Bounds; fill: Paint | undefined; stroke: Paint | undefined; strokeWidth: number; dashed: boolean; small: boolean; solid: boolean
  node?: number; form?: string; hidden?: boolean; grid?: boolean; axis?: boolean; point?: boolean; thin?: boolean; line?: boolean; sideways?: boolean; bars?: Bounds[]; bar?: number; rigid?: boolean; sheer?: boolean
}
export type PeleRender = (source: string, options?: Record<string, unknown>) => { svg: string; type: string; width: number }

export type PelePalette = { canvas: string; text?: string; muted?: string; line?: string; border?: string; accent?: string; critical?: string; highlight?: string; series: string[]; hues: string[] }

export type PeleSpan = { text: string; fg?: string; bg?: string; bold?: boolean; inverse?: boolean }

export type PeleArt = { type: string; rows: PeleSpan[][]; art: string; width: number }

const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8
const BG = -1, FG = -2, NONE = -3, SHADE = -10, TONE = 3
const SHADES = '▓▒░▚'
const shadeOf = (c: Paint) => SHADES[(SHADE - c) % SHADES.length]!
const toneOf = (c: Paint): Paint => (c === TONE ? FG : SHADE + TONE + 1 - c)
const MARGIN = 2
const FONT = 14
const CH = FONT * 1.5
const CW = CH / 2

const charWidth = (cp: number): number => {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2
  return 1
}

const cellWidth = (text: string): number => {
  if (/^[\x20-\x7e]*$/.test(text)) return text.length
  let w = 0
  for (const ch of text) w += charWidth(ch.codePointAt(0) ?? 0)
  return w
}

const measurer = { width: (text: string) => (cellWidth(text) + 1) * CW }

const decode = (s: string): string => !s.includes('&') ? s : s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()] ?? '')

const parseSvg = (svg: string): Node | undefined => {
  const root: Node = { tag: '#root', attrs: {}, children: [] }, stack: Node[] = [root]
  const re = /<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[^\s=>/]+="[^"]*")*)\s*(\/?)>|([^<]+)/g
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    const top = stack[stack.length - 1]!
    if (m[1]) stack.pop()
    else if (m[2]) {
      const attrs: Record<string, string> = {}, parts = m[3]!.split('"')
      for (let j = 1; j < parts.length; j += 2) attrs[parts[j - 1]!.trim().slice(0, -1)] = decode(parts[j]!)
      const node: Node = { tag: m[2], attrs, children: [] }
      top.children.push(node)
      if (!m[4]) stack.push(node)
    } else if (m[5] !== undefined) top.children.push({ tag: '#text', attrs: {}, children: [], text: decode(m[5]) })
  }
  return root.children.find(n => n.tag === 'svg')
}

const styleProps = (style: string | undefined): Record<string, string> => Object.fromEntries((style ?? '').split(';').flatMap(p => {
  const at = p.indexOf(':')
  return at < 0 ? [] : [[p.slice(0, at).trim(), p.slice(at + 1).trim()]]
}))

const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v))) || 0
const pack = (r: number, g: number, b: number): Paint => (channel(r) << 16) | (channel(g) << 8) | channel(b)

const readColor = (s: string): Paint | undefined => {
  s = s.trim().toLowerCase()
  if (s === 'none') return undefined
  if (s === 'transparent') return BG
  if (s === 'currentcolor') return FG
  const hexed = /^#([0-9a-f]{3})$/.exec(s)?.[1]!.replace(/./g, '$&$&') ?? /^#([0-9a-f]{6})/.exec(s)?.[1]
  if (hexed) return parseInt(hexed, 16)
  const rgb = /^rgba?\(([^)]*)\)$/.exec(s)?.[1]!.split(/[\s,/]+/).map(Number)
  if (rgb) return pack(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0)
  return ({ white: 0xffffff, black: 0 } as Record<string, Paint>)[s] ?? FG
}

const colors = new Map<string, Paint | undefined>()
const parseColor = (s: string | undefined): Paint | undefined => {
  if (!s) return undefined
  if (!colors.has(s)) { if (colors.size > 500) colors.clear(); colors.set(s, readColor(s)) }
  return colors.get(s)
}

const lums = new Map<Paint, number>(), lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (color: Paint) => { let l = lums.get(color); if (l === undefined) { if (lums.size > 500) lums.clear(); lums.set(color, l = 0.2126 * lin(((color >> 16) & 255) / 255) + 0.7152 * lin(((color >> 8) & 255) / 255) + 0.0722 * lin((color & 255) / 255)) } return l }

const contrast = (a: Paint, b: Paint) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

const blend = (color: Paint, alpha: number, canvas: Paint): Paint => {
  if (color < 0 || alpha >= 1) return color
  const mix = (shift: number) => ((color >> shift) & 255) * alpha + ((canvas >> shift) & 255) * (1 - alpha)
  return pack(mix(16), mix(8), mix(0))
}

const hexes = new Map<Paint, string>()
const hex = (c: Paint): string | undefined => {
  if (c < 0) return undefined
  let h = hexes.get(c)
  if (h === undefined) hexes.set(c, h = `#${c.toString(16).padStart(6, '0')}`)
  return h
}

const mul = (m: number[], n: number[]): number[] => [m[0]! * n[0]! + m[2]! * n[1]!, m[1]! * n[0]! + m[3]! * n[1]!, m[0]! * n[2]! + m[2]! * n[3]!,
  m[1]! * n[2]! + m[3]! * n[3]!, m[0]! * n[4]! + m[2]! * n[5]! + m[4]!, m[1]! * n[4]! + m[3]! * n[5]! + m[5]!]
const ID = [1, 0, 0, 1, 0, 0]

const parseTransform = (s: string | undefined): number[] => {
  let m = ID
  for (const [, fn, args] of (s ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0])
    else if (fn === 'scale') m = mul(m, [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0])
    else if (fn === 'matrix' && a.length === 6) m = mul(m, a)
    else if (fn === 'rotate') {
      const r = (a[0] ?? 0) * Math.PI / 180, rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
      m = a.length >= 3 ? mul(mul(mul(m, [1, 0, 0, 1, a[1]!, a[2]!]), rot), [1, 0, 0, 1, -a[1]!, -a[2]!]) : mul(m, rot)
    }
  }
  return m
}

const affine = (m: number[]) => (p: Pt): Pt => [m[0]! * p[0] + m[2]! * p[1] + m[4]!, m[1]! * p[0] + m[3]! * p[1] + m[5]!]

const cubicAt = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]
}

const arcPoints = (p0: Pt, rx: number, ry: number, phi: number, large: number, sweep: number, p1: Pt): Pt[] => {
  if (!rx || !ry) return [p0, p1]
  rx = Math.abs(rx); ry = Math.abs(ry)
  const r = phi * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r), dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy
  const lambda = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
  const cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2, cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI; if (sweep && dt < 0) dt += 2 * Math.PI
  const steps = Math.max(8, Math.ceil(Math.abs(dt) * 12)), pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = t1 + dt * i / steps, x = rx * Math.cos(t), y = ry * Math.sin(t)
    pts.push([cos * x - sin * y + cx, sin * x + cos * y + cy])
  }
  pts[0] = p0; pts[pts.length - 1] = p1
  return pts
}

const parsePath = (d: string): Sub[] => {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [], subs: Sub[] = []
  let sub: Sub | null = null, cur: Pt = [0, 0], start: Pt = [0, 0], cmd = 'M', prevC: Pt | null = null, prevQ: Pt | null = null, i = 0
  const isCmd = (t: string | undefined) => t !== undefined && /^[a-zA-Z]$/.test(t)
  const num = () => Number(toks[i++])
  while (i < toks.length) {
    if (isCmd(toks[i])) cmd = toks[i++]!
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase()
    const pt = (): Pt => { const x = num(), y = num(); return rel ? [cur[0] + x, cur[1] + y] : [x, y] }
    if (C === 'Z') {
      if (sub) {
        if (cur[0] !== start[0] || cur[1] !== start[1]) sub.segs.push({ k: 'L', pts: [cur, start] })
        sub.closed = true
      }
      cur = start; sub = null; prevC = prevQ = null
      while (i < toks.length && !isCmd(toks[i])) i++
      continue
    }
    if (C === 'M') { cur = start = pt(); sub = { segs: [], closed: false }; subs.push(sub); cmd = rel ? 'l' : 'L'; prevC = prevQ = null; continue }
    if (!sub) { sub = { segs: [], closed: false }; subs.push(sub); start = cur }
    let b: Pt, seg: Seg
    if (C === 'L') { b = pt(); seg = { k: 'L', pts: [cur, b] } }
    else if (C === 'H') { const x = num(); b = [rel ? cur[0] + x : x, cur[1]]; seg = { k: 'L', pts: [cur, b] } }
    else if (C === 'V') { const y = num(); b = [cur[0], rel ? cur[1] + y : y]; seg = { k: 'L', pts: [cur, b] } }
    else if (C === 'C' || C === 'S') {
      const c1: Pt = C === 'C' ? pt() : prevC ? [2 * cur[0] - prevC[0], 2 * cur[1] - prevC[1]] : cur
      const c2 = pt()
      b = pt(); seg = { k: 'C', pts: [cur, c1, c2, b] }
    } else if (C === 'Q' || C === 'T') {
      const q: Pt = C === 'Q' ? pt() : prevQ ? [2 * cur[0] - prevQ[0], 2 * cur[1] - prevQ[1]] : cur
      b = pt()
      seg = { k: 'C', pts: [cur, [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], [b[0] + 2 / 3 * (q[0] - b[0]), b[1] + 2 / 3 * (q[1] - b[1])], b], q }
    } else if (C === 'A') {
      const rx = num(), ry = num(), phi = num(), large = num(), sweep = num()
      b = pt()
      seg = { k: 'P', pts: arcPoints(cur, rx, ry, phi, large, sweep, b) }
    } else { i++; continue }
    prevC = seg.k === 'C' && !seg.q ? seg.pts[2]! : null; prevQ = seg.q ?? null
    sub.segs.push(seg); cur = b
  }
  return subs
}

const RING = Array.from({ length: 49 }, (_, i): Pt => [Math.cos(i / 48 * 2 * Math.PI), Math.sin(i / 48 * 2 * Math.PI)])
const circleSub = (cx: number, cy: number, rx: number, ry: number): Sub[] => [{ segs: [{ k: 'P', pts: RING.map((p): Pt => [cx + rx * p[0], cy + ry * p[1]]) }], closed: true }]

const polySub = (pts: Pt[], closed: boolean): Sub[] => [{
  segs: pts.slice(1).map((p, i): Seg => ({ k: 'L', pts: [pts[i]!, p] }))
    .concat(closed && pts.length > 2 ? [{ k: 'L', pts: [pts[pts.length - 1]!, pts[0]!] }] : []),
  closed,
}]

const flatten = (seg: Seg): Pt[] => {
  if (seg.k !== 'C') return seg.pts
  const p = seg.pts
  return Array.from({ length: 17 }, (_, i) => cubicAt(p[0]!, p[1]!, p[2]!, p[3]!, i / 16))
}

const polylineOf = (sub: Sub): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < sub.segs.length; i++) {
    const flat = flatten(sub.segs[i]!)
    for (let j = 0; j < flat.length; j++) {
      const p = flat[j]!, last = pts[pts.length - 1]
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
    }
  }
  return pts
}

const axisOf = (x: number, y: number, tol = 0.08): 'h' | 'v' | null => {
  const len = Math.hypot(x, y)
  return len < 1e-9 ? null : Math.abs(x) <= tol * len ? 'v' : Math.abs(y) <= tol * len ? 'h' : null
}

const elbow = (seg: Seg): Pt[] | null => {
  const pts = seg.pts, a = pts[0]!, b = pts[pts.length - 1]!
  if (seg.k === 'P') { const e = bbox([pts]); if (e.w > CW || e.h > CW) return null }
  const c1 = pts[1]!, c2 = pts[pts.length - 2]!, k = Math.abs(c1[1] - a[1]) > Math.abs(c1[0] - a[0]) ? 1 : 0, far = (a[k] + 3 * c1[k] + 3 * c2[k] + b[k]) / 8
  if (seg.k === 'C' && (c1[k] - a[k]) * (b[k] - c2[k]) < 0) return k ? [a, [a[0], far], [b[0], far], b] : [a, [far, a[1]], [far, b[1]], b]
  const t0 = axisOf(c1[0] - a[0], c1[1] - a[1]) ?? axisOf(c2[0] - a[0], c2[1] - a[1])
  const t1 = axisOf(b[0] - c2[0], b[1] - c2[1]) ?? axisOf(b[0] - c1[0], b[1] - c1[1])
  if (!t0 || !t1) return null
  if (t0 === 'v' && t1 === 'v') { const ym = (a[1] + b[1]) / 2; return [a, [a[0], ym], [b[0], ym], b] }
  if (t0 === 'h' && t1 === 'h') { const xm = (a[0] + b[0]) / 2; return [a, [xm, a[1]], [xm, b[1]], b] }
  if (t0 === 'v') return [a, [a[0], b[1]], b]
  return [a, [b[0], a[1]], b]
}

type Sampler = (y: number) => number[]

const insidePolys = (polys: Pt[][]): Sampler => {
  const e: number[] = []
  for (const pts of polys) for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (pts[i]![1] !== pts[j]![1]) e.push(pts[i]![0], pts[i]![1], pts[j]![0], pts[j]![1])
  const order = Array.from({ length: e.length / 4 }, (_, k) => k * 4).sort((a, b) => Math.min(e[a + 1]!, e[a + 3]!) - Math.min(e[b + 1]!, e[b + 3]!))
  let next = 0, last = Infinity, active: number[] = []
  return y => {
    if (y < last) { next = 0; active = [] }
    last = y
    while (next < order.length && Math.min(e[order[next]! + 1]!, e[order[next]! + 3]!) <= y) active.push(order[next++]!)
    active = active.filter(a => Math.max(e[a + 1]!, e[a + 3]!) > y)
    return active.map(a => (e[a + 2]! - e[a]!) * (y - e[a + 1]!) / (e[a + 3]! - e[a + 1]!) + e[a]!).sort((a, b) => a - b)
  }
}

const bbox = (polys: Pt[][]): Bounds => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const pts of polys) for (let i = 0; i < pts.length; i++) {
    const x = pts[i]![0], y = pts[i]![1]
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

const warp = (features: Feature[], unit: number, cross: number, grid: number[] = [], rows = 0): ((v: number) => number) => {
  const anchors: Pt[] = [], isGrid = (f: number) => grid.some(e => Math.abs(e - f) < 1.5)
  let start: number | null = null, last = 0, prevCell = 0, spans: Pt[] = []
  for (const f of [...features].sort((a, b) => a.at - b.at)) {
    if (start !== null && f.at - last < 1.5) { spans.push([f.lo, f.hi]); f.cell = prevCell; continue }
    if (start !== null && (f.at - start < unit * 0.45 || f.above?.cell === prevCell - 1) && spans.every(([lo, hi]) => f.hi + cross <= lo || f.lo - cross >= hi)) {
      spans.push([f.lo, f.hi]); anchors.push([f.at, (prevCell + 0.5) * unit]); last = f.at; f.cell = prevCell
      continue
    }
    const gap = start === null ? 0 : Math.max(1, Math.round((f.at - last) / unit))
    const cell: number = start === null ? Math.floor(f.at / unit) : prevCell + (rows && isGrid(f.at) && isGrid(last) ? rows : gap)
    anchors.push([f.at, (cell + 0.5) * unit]); spans = [[f.lo, f.hi]]
    f.cell = prevCell = cell; start = last = f.at
  }
  const first = anchors[0], end = anchors[anchors.length - 1]
  if (!first || !end) return v => v
  let lo = 0
  return v => {
    if (v <= first[0]) return v + first[1] - first[0]
    if (v >= end[0]) return v + end[1] - end[0]
    let hi = lo + 1
    if (!(anchors[lo]![0] <= v && v < anchors[hi]![0])) for (lo = 0, hi = anchors.length - 1; hi - lo > 1;) { const mid = (lo + hi) >> 1; if (anchors[mid]![0] <= v) lo = mid; else hi = mid }
    const a = anchors[lo]!, b = anchors[hi]!
    return a[1] + (v - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
  }
}

type Feature = { at: number; lo: number; hi: number; above?: Feature; cell?: number }

const BOX: Record<'light' | 'heavy', Record<number, string>> = {
  light: { 1: '╵', 2: '╶', 4: '╷', 8: '╴', 5: '│', 10: '─', 3: '╰', 6: '╭', 12: '╮', 9: '╯', 7: '├', 11: '┴', 13: '┤', 14: '┬', 15: '┼' },
  heavy: { 1: '╹', 2: '╺', 4: '╻', 8: '╸', 5: '┃', 10: '━', 3: '┗', 6: '┏', 12: '┓', 9: '┛', 7: '┣', 11: '┻', 13: '┫', 14: '┳', 15: '╋' },
}
const HEADS: Record<string, number> = { '►': RIGHT, '▶': RIGHT, '▸': RIGHT, '◄': LEFT, '◀': LEFT, '◂': LEFT, '▼': DOWN, '▲': UP }
const SQUARE: Record<number, string> = { 3: '└', 6: '┌', 12: '┐', 9: '┘' }
const BRAILLE = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const QUADS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

class Canvas {
  cols: number; rows: number; ch: (string | null)[]
  quad: Int32Array; armColor: Int32Array; brailleColor: Int32Array; chColor: Int32Array; faint: Int32Array
  arms: Uint8Array; heavy: Uint8Array; dashed: Uint8Array; braille: Uint8Array; bold: Uint8Array; wide: Uint8Array; inked: Uint8Array; mark: Uint8Array; square: Uint8Array; smooth: Uint8Array
  edges: { sy: number; c0: number; c1: number; fill: Paint; inward: number }[] = []
  fine: Int32Array | null = null
  paper: Paint = NONE; ink: Paint = NONE; plot = false; tracing = false; clash = false

  constructor(cols: number, rows: number) {
    const n = cols * rows, bytes = () => new Uint8Array(n), paints = (k = 1) => new Int32Array(n * k).fill(NONE)
    this.cols = cols; this.rows = rows; this.ch = new Array<string | null>(n).fill(null)
    this.quad = paints(4); this.armColor = paints(); this.brailleColor = paints(); this.chColor = paints(); this.faint = paints()
    this.arms = bytes(); this.heavy = bytes(); this.dashed = bytes().fill(1); this.braille = bytes(); this.bold = bytes(); this.wide = bytes(); this.inked = bytes(); this.mark = bytes(); this.square = bytes(); this.smooth = bytes()
  }

  index(c: number, r: number): number {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows ? r * this.cols + c : -1
  }

  charAt(c: number, r: number): string | null {
    const i = this.index(c, r)
    return i < 0 ? null : this.ch[i]!
  }

  pixel(sx: number, sy: number, color: Paint) {
    const c = sx >> 1, r = sy >> 1, i = r * this.cols + c
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return
    this.quad[i * 4 + (sy & 1) * 2 + (sx & 1)] = color; this.inked[i] = 1; this.smooth[i] = 0
  }

  fillCell(c: number, r: number, color: Paint) {
    for (let i = 0; i < 4; i++) this.pixel(2 * c + (i & 1), 2 * r + (i >> 1), color)
  }

  clear(c: number, r: number) {
    const i = this.index(c, r)
    if (i < 0) return
    this.braille[i] = 0; this.ch[i] = null; this.arms[i] = 0; this.heavy[i] = 0; this.dashed[i] = 1; this.faint[i] = NONE
  }

  speck(c: number, r: number, color: Paint) {
    const i = this.index(c, r)
    if (i >= 0) { this.faint[i] = color; this.inked[i] = 1 }
  }

  arm(c: number, r: number, bits: number, color: Paint, heavy: boolean, dashed: boolean) {
    const i = this.index(c, r)
    if (i < 0 || !bits) return
    this.arms[i] = this.arms[i]! | bits; this.armColor[i] = color; this.inked[i] = 1
    if (this.tracing) this.mark[i] = this.mark[i]! | 2
    if (heavy) this.heavy[i] = 1; if (!dashed) this.dashed[i] = 0
  }

  dot(x: number, y: number, color: Paint) {
    const dx = Math.floor(x / (CW / 2)), dy = Math.floor(y / (CH / 4)), i = this.index(dx >> 1, dy >> 2)
    if (i < 0) return
    this.braille[i] = this.braille[i]! | BRAILLE[dy & 3]![dx & 1]!; this.brailleColor[i] = color; this.inked[i] = 1
  }

  put(c: number, r: number, ch: string, color: Paint | undefined, bold: boolean) {
    const i = this.index(c, r)
    if (i < 0) return
    this.ch[i] = ch; this.chColor[i] = color ?? NONE; this.bold[i] = bold ? 1 : 0; this.inked[i] = 1
  }

  markWide(c: number, r: number) {
    const i = this.index(c, r)
    if (i >= 0) { this.ch[i] = ''; this.wide[i] = 1; this.inked[i] = 1 }
  }
}

const col = (x: number) => Math.floor(x / CW)
const row = (y: number) => Math.floor(y / CH)

type LineStyle = { color: Paint; heavy: boolean; dashed: boolean }

const armsAcross = (cv: Canvas, r: number, c0: number, c1: number, style: LineStyle) => {
  const a = Math.min(c0, c1), b = Math.max(c0, c1)
  for (let c = a; c <= b; c++) cv.arm(c, r, (c > a ? LEFT : 0) | (c < b ? RIGHT : 0), style.color, style.heavy, style.dashed)
}

const armsDown = (cv: Canvas, c: number, r0: number, r1: number, style: LineStyle) => {
  const a = Math.min(r0, r1), b = Math.max(r0, r1)
  for (let r = a; r <= b; r++) cv.arm(c, r, (r > a ? UP : 0) | (r < b ? DOWN : 0), style.color, style.heavy, style.dashed)
}

const gridSegment = (cv: Canvas, [x0, y0]: Pt, [x1, y1]: Pt, style: LineStyle) => {
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
    const r = row((y0 + y1) / 2), c = col(x0)
    if (c !== col(x1) || Math.abs(x1 - x0) < 3) return armsAcross(cv, r, c, col(x1), style)
    const mid = (c + 0.5) * CW, far = Math.abs(x0 - mid) > Math.abs(x1 - mid) ? x0 : x1
    cv.arm(c, r, far < mid ? LEFT : RIGHT, style.color, style.heavy, style.dashed)
  } else {
    const c = col((x0 + x1) / 2), r = row(y0)
    if (r !== row(y1) || Math.abs(y1 - y0) < 3) return armsDown(cv, c, r, row(y1), style)
    const mid = (r + 0.5) * CH, far = Math.abs(y0 - mid) > Math.abs(y1 - mid) ? y0 : y1
    cv.arm(c, r, far < mid ? UP : DOWN, style.color, style.heavy, style.dashed)
  }
}

const baseline = (shapes: Shape[]): number | undefined => {
  let y: number | undefined, longest = CW * 4
  for (const s of shapes) if (s.axis) for (const sub of s.subs) for (const seg of sub.segs) {
    const a = seg.pts[0]!, b = seg.pts[seg.pts.length - 1]!
    if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[0] - a[0]) > longest) { longest = Math.abs(b[0] - a[0]); y = a[1] }
  }
  return y
}

const rowsPerGrid = (grid: number[], lines: Shape[]): number => {
  const top = grid[0], gap = grid.length > 1 ? grid[1]! - grid[0]! : 0
  if (top === undefined || gap <= 0) return 0
  const start = Math.max(1, Math.round(gap / CH))
  let best = start, least = Infinity
  for (let k = Math.max(2, start - 1); k <= Math.max(2, Math.floor(start * 1.5)); k++) {
    let cost = 0, count = 0
    for (const s of lines) {
      const pts = s.polys[0] ?? []
      for (let i = 0; i < pts.length; i++) {
        const at = (pts[i]![1] - top) / gap * k, off = Math.abs(at - Math.round(at))
        cost += off + (off > 0.05 && Math.round(at) % k === 0 ? 0.5 : 0)
        count++
        const prev = pts[i - 1]
        if (prev && Math.abs(prev[1] - pts[i]![1]) > 0.5 && Math.round((prev[1] - top) / gap * k) === Math.round(at)) cost += 1000
      }
    }
    cost = cost / Math.max(1, count) + k / start * 0.2
    if (cost < least) { least = cost; best = k }
  }
  return best
}

const isBox = (pts: Pt[]) => pts.length === 5 && pts.every((p, i) => i === 0 || axisOf(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1], 0.01) !== null)

const trace = (cv: Canvas, pts: Pt[], closed: boolean, style: LineStyle) => {
  const cells: Pt[] = [], last = closed ? pts.length : pts.length - 1
  for (let i = 0; i < last; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!
    const n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) / CW, (b[1] - a[1]) / CH) * 8))
    for (let k = 0; k <= n; k++) {
      const c = col(a[0] + (b[0] - a[0]) * k / n), r = row(a[1] + (b[1] - a[1]) * k / n), prev = cells[cells.length - 1]
      if (!prev || prev[0] !== c || prev[1] !== r) cells.push([c, r])
    }
  }
  if (closed && cells.length > 1 && cells[0]![0] === cells[cells.length - 1]![0] && cells[0]![1] === cells[cells.length - 1]![1]) cells.pop()
  const steps = closed ? cells.length : cells.length - 1
  for (let i = 0; i < steps; i++) {
    const [c0, r0] = cells[i]!, [c1, r1] = cells[(i + 1) % cells.length]!
    if (r0 === r1) armsAcross(cv, r0, c0, c1, style)
    else if (c0 === c1) armsDown(cv, c0, r0, r1, style)
    else { armsAcross(cv, r0, c0, c1, style); armsDown(cv, c1, r0, r1, style) }
  }
}

const steps = (cv: Canvas, pts: Pt[], sideways: boolean, bars: Bounds[], style: LineStyle) => {
  const k = sideways ? 1 : 0, along = sideways ? row : col, unit = sideways ? CH : CW
  const level = (p: Pt) => (sideways ? col(p[0]) : row(p[1]))
  const run = (at: number, a: number, b: number) => (sideways ? armsDown(cv, at, a, b, style) : armsAcross(cv, at, a, b, style))
  const rise = (at: number, a: number, b: number) => (sideways ? armsAcross(cv, at, a, b, style) : armsDown(cv, at, a, b, style))
  const end = (i: number, side: number) => {
    const p = pts[i]![k], other = pts[i === 0 ? 1 : i - 1], spacing = other ? Math.abs(other[k] - p) : unit * 6
    let cell = along(p) + side * Math.floor(spacing * 0.25 / unit)
    for (const b of bars) {
      const lo = sideways ? b.y0 : b.x0, hi = sideways ? b.y1 : b.x1
      if (hi <= p - spacing / 2 || lo >= p + spacing / 2) continue
      cell = side < 0 ? Math.min(cell, sideways ? row(lo + CH / 4) : Math.round(lo / CW)) : Math.max(cell, sideways ? row(hi - CH / 4) : Math.round(hi / CW) - 1)
    }
    return cell
  }
  const first = pts[0]!
  let at = level(first), from = end(0, -1)
  cv.arm(sideways ? at : from, sideways ? from : at, sideways ? UP : LEFT, style.color, style.heavy, style.dashed)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[i + 1]
    const to = q ? along((p[k] + q[k]) / 2) : end(i, 1)
    run(at, from, to)
    if (q) { rise(to, at, level(q)); at = level(q) }
    from = to
  }
  cv.arm(sideways ? at : from, sideways ? from : at, sideways ? DOWN : RIGHT, style.color, style.heavy, style.dashed)
}

const speckle = (cv: Canvas, [x0, y0]: Pt, [x1, y1]: Pt, color: Paint) => {
  const from = (a: number, b: number, unit: number) => Math.ceil(Math.min(a, b) / unit - 0.5), to = (a: number, b: number, unit: number) => Math.floor(Math.max(a, b) / unit - 0.5)
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) for (let c = from(x0, x1, CW), r = row((y0 + y1) / 2); c <= to(x0, x1, CW); c++) cv.speck(c, r, color)
  else for (let r = from(y0, y1, CH), c = col((x0 + x1) / 2); r <= to(y0, y1, CH); r++) cv.speck(c, r, color)
}

const brailleLine = (cv: Canvas, pts: Pt[], color: Paint, dashed: boolean) => {
  const step = CW / 4
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0], ay = pts[i - 1]![1], bx = pts[i]![0], by = pts[i]![1]
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / step))
    for (let k = 0; k <= n; k++) {
      const d = walked + len * k / n
      if (!dashed || Math.floor(d / (CW * 1.2)) % 2 === 0) cv.dot(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, color)
    }
    walked += len
  }
}

const fillArea = (cv: Canvas, sample: Sampler, box: Bounds, color: Paint, smooth = false, sheer = false) => {
  const touched: number[] = []
  if (smooth) {
    const fine = cv.fine ??= new Int32Array(cv.cols * cv.rows * 16)
    for (let fy = Math.max(0, Math.floor(box.y0 / (CH / 8))), fy1 = Math.min(Math.ceil(box.y1 / (CH / 8)), cv.rows * 8 - 1); fy <= fy1; fy++) {
      const xs = sample((fy + 0.5) * CH / 8), at = (fy >> 3) * cv.cols
      for (let fx = Math.max(0, Math.floor(box.x0 / (CW / 2))), fx1 = Math.min(Math.ceil(box.x1 / (CW / 2)), cv.cols * 2 - 1), k = 0; fx <= fx1; fx++) {
        while (k < xs.length && xs[k]! <= (fx + 0.5) * CW / 2) k++
        if ((xs.length - k) % 2 === 0) continue
        const i = at + (fx >> 1)
        if (cv.smooth[i] !== 2) {
          if (!cv.smooth[i]) for (let k = 0; k < 16; k += 2) { fine[i * 16 + k] = cv.quad[i * 4 + ((k >> 3) << 1)]!; fine[i * 16 + k + 1] = cv.quad[i * 4 + ((k >> 3) << 1) + 1]! }
          cv.smooth[i] = 2
          touched.push(i)
        }
        fine[i * 16 + (fy & 7) * 2 + (fx & 1)] = color
      }
    }
  }
  const sx0 = Math.max(0, Math.floor(box.x0 / (CW / 2))), sx1 = Math.ceil(box.x1 / (CW / 2))
  const sy0 = Math.max(0, Math.floor(box.y0 / (CH / 2))), sy1 = Math.ceil(box.y1 / (CH / 2))
  const c0 = Math.max(0, col(box.x0)), c1 = col(box.x1), r0 = Math.max(0, row(box.y0)), r1 = row(box.y1)
  const ax0 = Math.min(sx0, 2 * c0), ax1 = Math.max(sx1, 2 * c1 + 1), ay0 = Math.min(sy0, 2 * r0), ay1 = Math.max(sy1, 2 * r1 + 1)
  const w = ax1 - ax0 + 1
  if (w <= 0 || ay1 < ay0) return
  const mask = new Uint8Array(w * (ay1 - ay0 + 1))
  for (let sy = ay0; sy <= ay1; sy++) {
    const xs = sample((sy + 0.5) * CH / 2)
    for (let sx = ax0, k = 0; sx <= ax1; sx++) { while (k < xs.length && xs[k]! <= (sx + 0.5) * CW / 2) k++; if ((xs.length - k) % 2) { mask[(sy - ay0) * w + sx - ax0] = 1; if (sy >= sy0 && sy <= sy1 && sx >= sx0 && sx <= sx1) cv.pixel(sx, sy, color) } }
  }
  for (const i of touched) { cv.smooth[i] = 1; cv.inked[i] = 1 }
  if (!sheer) for (let r = r0; r <= r1; r++) for (let c = c0, m = (2 * r - ay0) * w + 2 * c0 - ax0; c <= c1; c++, m += 2) if (mask[m]! + mask[m + 1]! + mask[m + w]! + mask[m + w + 1]! >= 2) cv.clear(c, r)
}

const clean = (pts: Pt[]): Pt[] => {
  const out = pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 0.01)
  const first = out[0], last = out[out.length - 1]
  if (out.length > 2 && first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) out.pop()
  return out
}

const beside = (cv: Canvas, c: number, r: number): number => {
  const i = cv.index(c, r), m = cv.arms[i] ?? 0, s = (m & (LEFT | RIGHT)) === RIGHT ? 1 : (m & (LEFT | RIGHT)) === LEFT ? -1 : 0, wall = (c: number) => ((cv.arms[cv.index(c, r)] ?? 0) & (UP | DOWN)) === (UP | DOWN)
  if (s && wall(c)) { cv.arms[i] = m & ~(LEFT | RIGHT); return c + s }
  if (s && cv.arms[cv.index(c - s, r)] === 0 && cv.charAt(c - s, r) === null && wall(c - 2 * s)) { cv.arms[i] = m | LEFT | RIGHT; return c - s }
  return c
}

const markerGlyph = (cv: Canvas, s: Shape, filled: boolean, color: Paint): boolean => {
  const box = s.box, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2
  const pts = clean(s.polys[0] ?? [])
  const diamond = pts.length === 4 && pts.every(([x, y]) => Math.abs(x - cx) < box.w * 0.2 || Math.abs(y - cy) < box.h * 0.2)
  if (diamond ? box.w > CW * 4 || box.h > CH * 2 : box.w > CW * 2.2 || box.h > CH * 1.1) return false
  if (s.kind === 'circle') {
    const c = col(cx), r = row(cy), was = cv.charAt(c, r)
    cv.put(c, r, was === (filled ? '○' : '●') ? '◉' : filled ? '●' : '○', color, false)
    return true
  }
  if (!s.subs.some(sub => sub.closed) && !filled) {
    const parts = s.polys.map(clean)
    if (!parts.every(p => p.length === 2 || p.length === 3)) return false
    const bars = new Map<number, boolean>()
    for (const p of parts) {
      if (p.length === 2) {
        const [a, b] = p as [Pt, Pt]
        const across = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), slant = !axisOf(b[0] - a[0], b[1] - a[1], 0.3)
        const c = col((a[0] + b[0]) / 2), r = row((a[1] + b[1]) / 2), first = bars.get(cv.index(c, r))
        if (first === undefined) { bars.set(cv.index(c, r), across); cv.put(slant ? beside(cv, c, r) : c, r, slant ? '╳' : '┼', color, false) }
        else if (first === across && !slant) cv.put(c, r, across ? '╪' : '╫', color, false)
      } else {
        const [a, apex, b] = p as [Pt, Pt, Pt]
        const dx = (a[0] + b[0]) / 2 - apex[0], dy = (a[1] + b[1]) / 2 - apex[1]
        const at: Pt = bars.has(cv.index(col(apex[0]), row(apex[1]))) ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : apex
        cv.put(col(at[0]), row(at[1]), Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '<' : '>') : (dy > 0 ? 'Λ' : 'V'), color, false)
      }
    }
    return true
  }
  if (pts.length === 3) {
    const side = (i: number) => Math.hypot(pts[(i + 1) % 3]![0] - pts[(i + 2) % 3]![0], pts[(i + 1) % 3]![1] - pts[(i + 2) % 3]![1])
    const sides = [side(0), side(1), side(2)]
    const sum = sides[0]! + sides[1]! + sides[2]!, odd = sides.map(x => Math.abs(x - (sum - x) / 2))
    const t = odd.indexOf(Math.max(...odd))
    const tip = pts[t]!, u = pts[(t + 1) % 3]!, v = pts[(t + 2) % 3]!
    const base: Pt = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2]
    const dx = tip[0] - base[0], dy = tip[1] - base[1]
    const glyph = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (filled ? '►' : '▷') : (filled ? '◄' : '◁')) : (dy > 0 ? (filled ? '▼' : '▽') : (filled ? '▲' : '△'))
    cv.put(col(base[0]), row(base[1]), glyph, color, false)
    return true
  }
  if (pts.length === 4) {
    cv.put(col(cx), row(cy), diamond ? (filled ? '◆' : '◇') : (filled ? '■' : '□'), color, false)
    return true
  }
  return false
}

const rotated = (svg: string) => svg.includes('rotate(90)') || svg.includes('rotate(-90)')

const unstack = (t: TextRun): TextRun[] => {
  const words = t.text.split(' '), width = Math.max(Math.min(t.w, 8), ...words.map(cellWidth)), lines: string[] = []
  for (const word of words) {
    const last = lines.length - 1
    if (last >= 0 && cellWidth(lines[last]!) + 1 + cellWidth(word) <= width) lines[last] += ' ' + word
    else lines.push(word)
  }
  const top = Math.round(t.cy / CH - lines.length / 2), part = t.parts[0]!
  return lines.map((text, i) => {
    const w = cellWidth(text), c = t.c - width + 1 + Math.floor((width - w) / 2)
    return { ...t, text, parts: [{ ...part, text }], w, vertical: false, r: top + i, c, cx: (c + w / 2) * CW, cy: (top + i + 0.5) * CH }
  })
}

const textsIn = ({ box, thin }: Shape, texts: TextRun[]) => texts.filter(t => !t.vertical && t.cx > box.x0 && t.cx < box.x1 && (thin ? t.cy >= box.y0 && t.cy <= box.y1 : t.cy > box.y0 && t.cy < box.y1))

const drawPatch = (cv: Canvas, s: Shape, inside: TextRun[]) => {
  const { x0, y0, x1, y1 } = s.box, mid = row((y0 + y1) / 2)
  let s0 = s.thin ? 2 * mid : Math.ceil(2 * y0 / CH - 0.5), s1 = s.thin ? 2 * mid + 1 : Math.floor(2 * y1 / CH - 0.5), c0 = Math.floor(x0 / CW + 0.52), c1 = Math.ceil(x1 / CW - 0.52) - 1
  for (const t of inside) { s0 = Math.min(s0, 2 * t.r); s1 = Math.max(s1, 2 * t.r + 1); c0 = Math.min(c0, t.c); c1 = Math.max(c1, t.c + t.w - 1) }
  const centered = inside.length > 0 && inside.every(t => t.anchor === 'middle' && Math.abs(t.cx - (x0 + x1) / 2) <= CW)
  if (centered && s.fill === BG) {
    const widest = inside.reduce((a, t) => (t.w > a.w ? t : a)), pad = Math.max(1, Math.floor((c1 - c0 + 1 - widest.w) / 2)), frame = widest.owner?.box
    c0 = Math.max(widest.c - pad, frame ? col(frame.x0) + 1 : -Infinity); c1 = Math.min(widest.c + widest.w - 1 + pad, frame ? col(frame.x1) - 1 : Infinity)
  } else if (centered && inside.length === 1) {
    const only = inside[0]!, left = c1 - c0 + 1 - only.w, wide = x0 - c0 * CW > (c1 + 1) * CW - x1
    if (s.thin && !cv.plot && left % 2) { if (left === 1) { if (wide) c1++; else c0-- } else if (wide) c0++; else c1-- }
    only.c = c0 + Math.floor((c1 - c0 + 1 - only.w) / 2)
  }
  for (let sy = Math.max(s0, 0); sy <= Math.min(s1, 2 * cv.rows - 1); sy++) for (let c = Math.max(c0, 0), i = (sy >> 1) * cv.cols + c; c <= Math.min(c1, cv.cols - 1); c++, i++) { cv.quad[i * 4 + (sy & 1) * 2] = cv.quad[i * 4 + (sy & 1) * 2 + 1] = s.fill!; cv.inked[i] = 1; cv.smooth[i] = 0 }
  if (!s.sheer) for (let r = Math.ceil(s0 / 2); 2 * r + 1 <= s1; r++) for (let c = c0; c <= c1; c++) cv.clear(c, r)
  const full = Math.floor((s1 + 1) / 2) > Math.ceil(s0 / 2)
  if (!s.thin && full && s0 % 2) cv.edges.push({ sy: s0, c0, c1, fill: s.fill!, inward: 1 })
  if (!s.thin && full && s1 % 2 === 0) cv.edges.push({ sy: s1, c0, c1, fill: s.fill!, inward: -1 })
}

const trimEdges = (cv: Canvas) => {
  const through = (c: number, r: number) => (cv.arms[cv.index(c, r)]! & (UP | DOWN)) === (UP | DOWN)
  for (const e of cv.edges) {
    const r = e.sy >> 1
    let crossed = false
    for (let c = e.c0; c <= e.c1 && !crossed; c++) crossed = through(c, r) && through(c, r + e.inward)
    if (crossed) for (let c = e.c0; c <= e.c1; c++) for (let x = 0; x < 2; x++) {
      const q = cv.index(c, r) * 4 + (e.sy & 1) * 2 + x
      if (q >= 0 && cv.quad[q] === e.fill) cv.quad[q] = NONE
    }
  }
}

const seal = (cv: Canvas, c0: number, r0: number, c1: number, r1: number) => {
  const drop = (c: number, r: number, bits: number, nc: number, nr: number, back: number) => {
    const i = cv.index(c, r), j = cv.index(nc, nr)
    if (i >= 0 && (j < 0 || (cv.arms[j]! & back) === 0)) cv.arms[i] = cv.arms[i]! & ~bits
  }
  for (let c = c0 + 1; c < c1; c++) { drop(c, r0, DOWN, c, r0 + 1, UP); drop(c, r1, UP, c, r1 - 1, DOWN) }
  for (let r = r0 + 1; r < r1; r++) { drop(c0, r, RIGHT, c0 + 1, r, LEFT); drop(c1, r, LEFT, c1 - 1, r, RIGHT) }
}

const REACH: Record<number, readonly [number, number, number]> = { [LEFT]: [RIGHT, 1, 0], [RIGHT]: [LEFT, -1, 0], [UP]: [DOWN, 0, 1], [DOWN]: [UP, 0, -1] }

const reach = (cv: Canvas) => {
  const fill = (i: number) => { const q = i < 0 ? NONE : cv.quad[i * 4]!; return (q >= 0 || q === FG) && cv.quad[i * 4 + 1] === q && cv.quad[i * 4 + 2] === q && cv.quad[i * 4 + 3] === q ? q : NONE }
  const solid = (c: number, r: number) => { const i = cv.index(c, r); return fill(i) !== NONE && !cv.arms[i] }
  const empty = (c: number, r: number) => { const i = cv.index(c, r); return i >= 0 && !cv.inked[i] }
  const side = (j: number, p: number, straight: number) => (fill(j) === p ? (cv.arms[j] ? 0 : 1) : cv.arms[j] === straight ? 2 : 0)
  const flank = (j: number, p: number) => j >= 0 && (cv.quad[j * 4] === p || cv.quad[j * 4 + 1] === p || cv.quad[j * 4 + 2] === p || cv.quad[j * 4 + 3] === p)
  for (const arms of [LEFT, RIGHT, LEFT | RIGHT, UP, DOWN, UP | DOWN]) {
    const across = (arms & (UP | DOWN)) === 0, straight = across ? LEFT | RIGHT : UP | DOWN
    for (let i = cv.arms.indexOf(arms); i >= 0; i = cv.arms.indexOf(arms, i + 1)) {
      const p = fill(i)
      if (p === NONE || cv.ch[i] !== null) continue
      const c = i % cv.cols, r = (i - c) / cv.cols
      const a = side(across ? cv.index(c - 1, r) : cv.index(c, r - 1), p, straight), b = side(across ? cv.index(c + 1, r) : cv.index(c, r + 1), p, straight)
      if (a * b === 2 && (across ? flank(cv.index(c, r - 1), p) || flank(cv.index(c, r + 1), p) : flank(cv.index(c - 1, r), p) || flank(cv.index(c + 1, r), p))) cv.arms[i] = 0
    }
  }
  for (const from of [LEFT, RIGHT, UP, DOWN]) for (let i = cv.arms.indexOf(from); i >= 0; i = cv.arms.indexOf(from, i + 1)) {
    if (cv.ch[i] !== null) continue
    const [to, dc, dr] = REACH[from]!, c = i % cv.cols, r = (i - c) / cv.cols, k = cv.index(c + dc, r + dr), cross = dc ? UP | DOWN : LEFT | RIGHT
    if (k >= 0 && cv.ch[k] === null && cv.arms[k] === cross) { cv.arms[i] = from | to; cv.arms[k] = cross | from; continue }
    if (dc && empty(c + dc, r) && /[\p{L}\p{N}]/u.test(cv.ch[cv.index(c + 2 * dc, r)] ?? '')) { cv.arms[i] = from | to; continue }
    const bridge = !solid(c + dc, r + dr) && empty(c + dc, r + dr) && (solid(c + 2 * dc, r + 2 * dr) || (dr ? '╱╲▁▔' : '╱╲▏▕').includes(cv.ch[cv.index(c + 2 * dc, r + 2 * dr)] || ' '))
    if (!bridge && !solid(c + dc, r + dr)) continue
    const line = (at: number, bits: number) => cv.arm(at % cv.cols, Math.floor(at / cv.cols), bits, cv.armColor[i]!, cv.heavy[i] === 1, cv.dashed[i] === 1)
    line(i, to)
    if (bridge) line(i + dr * cv.cols + dc, from | to)
  }
  const heads: number[] = []
  for (const h in HEADS) for (let i = cv.ch.indexOf(h); i >= 0; i = cv.ch.indexOf(h, i + 1)) heads.push(i)
  for (const i of heads.sort((a, b) => a - b)) {
    const to = HEADS[cv.ch[i]!]!, from = REACH[to]![0], step = from ? REACH[from]![2] * cv.cols + REACH[from]![1] : 0
    if (!from || !(cv.arms[i]! & ~to)) continue
    let end = i
    for (let n = i + step; cv.ch[n] === null && cv.arms[n]! & from && !(cv.arms[n]! & ~(from | to)); n = cv.arms[n]! & to ? n + step : -1) end = n
    if (end === i) continue
    cv.ch[end] = cv.ch[i]!; cv.chColor[end] = cv.chColor[i]!; cv.ch[i] = null
    cv.arm(i % cv.cols, Math.floor(i / cv.cols), to, cv.armColor[i + step]!, cv.heavy[i + step] === 1, cv.dashed[i + step] === 1)
  }
}

const isSlim = (s: Shape) => s.box.w < CW * 1.5 && s.box.h >= CH * 1.5 && s.polys.length === 1 && s.subs[0]?.closed === true && isBox(s.polys[0]!)

const isCard = (s: Shape) => !s.thin && s.stroke !== undefined && s.stroke !== BG && s.polys.length === 1 && s.subs[0]?.closed === true && isBox(s.polys[0]!)

const drawCard = (cv: Canvas, s: Shape, texts: TextRun[]) => {
  const { x0, y0, x1, y1 } = s.box
  let r0 = row(y0), r1 = row(y1), c0 = col(x0), c1 = col(x1)
  const inside = texts.filter(t => t.owner === s)
  for (const t of inside) if (t.anchor === 'start' && t.c < c0 + 2 && t.cx - t.w * CW / 2 - x0 >= CW / 2) t.c = c0 + 2
  for (const t of inside) {
    const over = t.c + t.w + 1 - c1, pad = t.anchor === 'start' ? 1 : 0
    if (over > 0 && t.c - over >= c0 + 2) t.c -= over
    r0 = Math.min(r0, t.r - 1); r1 = Math.max(r1, t.r + 1)
    c0 = Math.min(c0, t.c - 1 - pad); c1 = Math.max(c1, t.c + t.w + pad)
  }
  const centered = inside.filter(t => t.anchor === 'middle' && Math.abs(t.cx - (x0 + x1) / 2) <= CW), post = (c: number) => { for (let r = r0 + 1; r < r1; r++) if (cv.arms[cv.index(c, r)]! & (UP | DOWN)) return true; return false }
  if (centered.some(t => c1 - c0 - 1 - t.w === 1)) { cv.clash ||= post(c0 - 2) && post(c1 + 2); if (post(c0 - 2) === post(c1 + 2) ? x0 - c0 * CW > (c1 + 1) * CW - x1 : post(c0 - 2)) c1++; else c0-- }
  for (const t of centered) t.c = c0 + 1 + Math.floor((c1 - c0 - 1 - t.w) / 2)
  if (s.fill !== undefined && !s.sheer) for (let r = r0 + 1; r < r1; r++) for (let c = c0 + 1; c < c1; c++) cv.clear(c, r)
  if (s.solid && s.fill === s.stroke) {
    for (let sy = 2 * r0 + 1; sy <= 2 * r1; sy++) for (let sx = 2 * c0 + 1; sx <= 2 * c1; sx++) cv.pixel(sx, sy, s.fill!)
    return
  }
  if (s.solid) for (let r = r0 + 1; r < r1; r++) for (let c = c0 + 1; c < c1; c++) cv.fillCell(c, r, s.fill!)
  const style = { color: s.stroke!, heavy: s.strokeWidth >= 2.5, dashed: s.dashed }
  seal(cv, c0, r0, c1, r1)
  armsAcross(cv, r0, c0, c1, style); armsAcross(cv, r1, c0, c1, style)
  armsDown(cv, c0, r0, r1, style); armsDown(cv, c1, r0, r1, style)
}

const FORMS = new Set(['rect', 'fr-rect', 'rounded', 'stadium', 'cyl', 'circle', 'dbl-circ', 'diam', 'hex', 'odd', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'cloud', 'bang'])

const SLANTED = new Set(['circle', 'diam', 'hex', 'odd', 'lean-r', 'lean-l', 'trap-b', 'trap-t'])

const isOutline = (s: Shape) => s.form !== undefined && FORMS.has(s.form) && s.subs[0]?.closed === true && s.stroke !== undefined && s.stroke !== BG && !s.hidden

const drawNode = (cv: Canvas, s: Shape, texts: TextRun[]) => {
  const form = s.form!
  const { x0, y0, x1, y1 } = s.box
  const pointy = form === 'diam' || form === 'circle', inset = pointy && row(y1 - CH / 2) - row(y0 + CH / 2) >= 2 ? CH / 2 : 0
  let r0 = row(y0 + inset), r1 = row(y1 - inset), c0 = col(x0), c1 = col(x1)
  const inside = texts.filter(t => t.owner === s)
  for (const t of inside) { r0 = Math.min(r0, t.r - 1); r1 = Math.max(r1, t.r + 1) }
  const m = r1 - r0 - 1, slanted = SLANTED.has(form)
  const v = (k: number) => Math.floor(Math.abs(k - m / 2)), arc = Math.max(1, Math.round(m * 0.3))
  const o = (k: number) => Math.max(0, arc - k, k - (m - arc))
  const bound = (k: number): Pt =>
    !slanted ? [0, 0] : form === 'diam' ? [v(k), v(k)] : form === 'circle' ? [o(k), o(k)] : form === 'hex' ? (k === 0 || k === m ? [1, 1] : [0, 0]) : form === 'odd' ? [Math.min(k, m - k), 0]
      : form === 'lean-r' ? [m - k, k] : form === 'lean-l' ? [k, m - k] : form === 'trap-b' ? [m - k, m - k] : [k, k]
  const tips = m === 1 && (form === 'diam' || form === 'hex' || form === 'circle' || form === 'odd')
  const lead = (r: number) => { if (tips) return 0; const a = bound(r - r0 - 1)[0], b = bound(r - r0)[0]; return Math.min(a, b) }
  const trail = (r: number) => { if (tips) return 0; const a = bound(r - r0 - 1)[1], b = bound(r - r0)[1]; return a === b ? a : Math.max(a, b) - 1 }
  for (const t of inside) { c0 = Math.min(c0, t.c - 1 - lead(t.r)); c1 = Math.max(c1, t.c + t.w + trail(t.r)) }
  const L = (r: number) => c0 + lead(r), R = (r: number) => c1 - trail(r)
  const centered = inside.filter(t => t.anchor === 'middle' && Math.abs(t.cx - (x0 + x1) / 2) <= CW)
  if (centered.some(t => R(t.r) - L(t.r) - 1 - t.w === 1)) { if (x0 - c0 * CW > (c1 + 1) * CW - x1) c1++; else c0-- }
  for (const t of centered) t.c = L(t.r) + 1 + Math.floor((R(t.r) - L(t.r) - 1 - t.w) / 2)
  if (s.fill !== undefined) for (let r = r0 + 1; r < r1; r++) for (let c = L(r) + 1; c < R(r); c++) cv.clear(c, r)
  const color = s.stroke!, heavy = s.strokeWidth >= 2.5 || form === 'bang', dashed = s.dashed
  const tip = (c: number, r: number) => { const ch = cv.charAt(c, r); return !!ch && ch in HEADS }
  const arm = (c: number, r: number, bits: number) => { if (!tip(c, r)) cv.arm(c, r, bits, color, heavy, dashed) }
  const glyph = (c: number, r: number, ch: string) => { if (!tip(c, r)) cv.put(c, r, ch, color, false) }
  const touched = (r: number) => {
    const a = cv.index(L(r) - 1, r), b = cv.index(R(r) + 1, r)
    return (a >= 0 && (cv.arms[a]! & RIGHT) !== 0) || (b >= 0 && (cv.arms[b]! & LEFT) !== 0) || tip(L(r) - 1, r) || tip(R(r) + 1, r)
  }
  if (form === 'dbl-circ') {
    for (let c = c0 + 1; c < c1; c++) { glyph(c, r0, '═'); glyph(c, r1, '═') }
    for (let r = r0 + 1; r < r1; r++) { glyph(c0, r, '║'); glyph(c1, r, '║') }
    glyph(c0, r0, '╔'); glyph(c1, r0, '╗'); glyph(c0, r1, '╚'); glyph(c1, r1, '╝')
    return
  }
  if (slanted) {
    for (let r = r0 + 1; r < r1; r++) {
      const [la, ra] = bound(r - r0 - 1), [lb, rb] = bound(r - r0)
      const left = tips ? (form === 'odd' ? '>' : form === 'circle' ? '(' : '<') : lb < la ? '╱' : lb > la ? '╲' : '▏'
      const right = tips ? (form === 'odd' ? '▕' : form === 'circle' ? ')' : '>') : rb < ra ? '╲' : rb > ra ? '╱' : '▕'
      glyph(L(r), r, left); glyph(R(r), r, right)
    }
    const run = (r: number, from: number, to: number, ch: string) => {
      for (let c = from; c <= to; c++) {
        const i = cv.index(c, r)
        if (i >= 0 && (cv.arms[i]! & (UP | DOWN)) !== 0) arm(c, r, UP | DOWN)
        else glyph(c, r, ch)
      }
    }
    const edge = (k: number): [number, number] => (tips ? (form === 'odd' ? [c0, c1] : [c0 + 1, c1 - 1]) : [c0 + bound(k)[0], c1 - bound(k)[1]])
    run(r0, ...edge(0), '▁')
    run(r1, ...edge(m), '▔')
    return
  }
  seal(cv, c0, r0, c1, r1)
  for (let c = c0 + 1; c < c1; c++) { arm(c, r0, LEFT | RIGHT); arm(c, r1, LEFT | RIGHT) }
  arm(c0, r0, RIGHT | DOWN); arm(c1, r0, LEFT | DOWN); arm(c0, r1, RIGHT | UP); arm(c1, r1, LEFT | UP)
  if (form === 'rect' || form === 'fr-rect') for (const [c, r] of [[c0, r0], [c1, r0], [c0, r1], [c1, r1]] as Pt[]) { const i = cv.index(c, r); if (i >= 0) cv.square[i] = 1 }
  for (let r = r0 + 1; r < r1; r++) {
    if (form === 'stadium' && r1 - r0 === 2) { glyph(c0, r, '('); glyph(c1, r, ')') }
    else { arm(c0, r, UP | DOWN); arm(c1, r, UP | DOWN) }
  }
  if (form !== 'cyl') return
  if (r1 - r0 >= 3 && !inside.some(t => t.r === r0 + 1) && !touched(r0 + 1)) armsAcross(cv, r0 + 1, c0, c1, { color, heavy, dashed })
  else for (let c = c0; c <= c1; c++) { cv.clear(c, r0); glyph(c, r0, c === c0 ? '╒' : c === c1 ? '╕' : '═') }
}

const ribbon = (s: Shape, rects: Bounds[]): Pt[] | null => {
  const segs = s.subs.length === 1 && s.subs[0]!.closed ? s.subs[0]!.segs : []
  if (segs.length !== 4 || segs[0]!.k !== 'C' || segs[1]!.k !== 'L' || segs[2]!.k !== 'C' || segs[3]!.k !== 'L') return null
  const span = (seg: Seg) => Math.abs(seg.pts[1]![1] - seg.pts[0]![1])
  if (Math.max(span(segs[1]!), span(segs[3]!)) >= CH * 0.75) return null
  const top = flatten(segs[0]!), bottom = flatten(segs[2]!).reverse(), thread = top.map((p, i): Pt => [(p[0] + bottom[i]![0]) / 2, (p[1] + bottom[i]![1]) / 2]), n = thread.length, inset = (y: number, b: Bounds) => Math.min(Math.max(y, b.y0 + CH / 4), b.y1 - CH / 4)
  for (const [p, q] of [[thread[0]!, thread[1]!], [thread[n - 1]!, thread[n - 2]!]] as [Pt, Pt][]) for (const b of rects) if ((Math.abs(b.x0 - p[0]) < 1 || Math.abs(b.x1 - p[0]) < 1) && p[1] >= b.y0 && p[1] <= b.y1 && b.h >= CH / 2 && row(q[1]) === row(inset(p[1], b))) p[1] = inset(p[1], b)
  return thread
}

const drawShape = (cv: Canvas, s: Shape, texts: TextRun[], rects: Bounds[] = []) => {
  const { kind, subs, polys, box, fill, stroke, strokeWidth } = s
  if (s.grid) {
    if (stroke !== undefined) for (const pts of polys) for (let i = 1; i < pts.length; i++) speckle(cv, pts[i - 1]!, pts[i]!, stroke)
    return
  }
  if (s.line && kind === 'circle') return
  if (s.form === 'cyl' && !subs[0]?.closed) return
  if (isOutline(s)) return drawNode(cv, s, texts)
  const filled = fill !== undefined && (subs.some(sub => sub.closed) || kind === 'path')
  if (filled || stroke !== undefined) {
    const markerColor = filled && s.solid ? fill : stroke
    if (markerColor !== undefined && markerColor !== BG && markerGlyph(cv, s, filled && s.solid, markerColor)) return
  }
  const stroked = stroke !== undefined && stroke !== BG
  const box4 = polys.length === 1 && subs[0]?.closed === true && isBox(polys[0]!)
  if (stroked && isSlim(s)) return armsDown(cv, col((box.x0 + box.x1) / 2), row(box.y0), row(box.y1), { color: stroke, heavy: true, dashed: false })
  if (isCard(s)) return drawCard(cv, s, texts)
  if ((!stroked || s.thin) && filled && (box4 || s.thin)) {
    const inside = textsIn(s, texts)
    if (inside.length) return drawPatch(cv, s, inside)
    const c0 = Math.round(box.x0 / CW), c1 = Math.max(c0 + 1, Math.round(box.x1 / CW)), mid = row((box.y0 + box.y1) / 2)
    const y0 = s.thin ? mid * CH : box.y0, y1 = s.thin ? (mid + 1) * CH - 0.01 : box.y1
    const snapped = { x0: c0 * CW, x1: c1 * CW - 0.01, y0, y1, w: (c1 - c0) * CW, h: y1 - y0 }
    if (s.bar !== undefined) for (let r = row(y0); r <= row(y1); r++) for (let c = c0; c < c1; c++) { const i = cv.index(c, r); if (i >= 0) cv.mark[i] = cv.mark[i]! | 1 }
    return fillArea(cv, y => (y >= y0 && y <= y1 ? [snapped.x0, snapped.x1] : []), snapped, fill, !s.thin && s.bar === undefined, s.sheer)
  }
  const thread = filled && !stroked ? ribbon(s, rects) : null
  if (thread) return trace(cv, thread, false, { color: fill!, heavy: false, dashed: false })
  if (filled && !stroked) fillArea(cv, insidePolys(polys), box, fill, true, s.sheer)
  if (!stroked) return
  const style = { color: stroke, heavy: strokeWidth >= 2.5, dashed: s.dashed }
  if (s.hidden) return
  if (s.line && kind === 'path' && polys.length === 1 && !subs[0]!.closed) {
    cv.tracing = true; steps(cv, polys[0]!, !!s.sideways, s.bars ?? [], style); cv.tracing = false
    return
  }
  if (s.node !== undefined || s.line) {
    subs.forEach((sub, i) => polys[i] && trace(cv, polys[i]!, sub.closed, style))
    return
  }
  for (const sub of subs) for (const seg of sub.segs) {
    const p0 = seg.pts[0]!, p1 = seg.pts[seg.pts.length - 1]!
    const e = seg.k !== 'L' ? elbow(seg) : null
    if (seg.k === 'L' && axisOf(p1[0] - p0[0], p1[1] - p0[1], 0.02)) gridSegment(cv, p0, p1, style)
    else if (e) for (let i = 1; i < e.length; i++) gridSegment(cv, e[i - 1]!, e[i]!, style)
    else brailleLine(cv, flatten(seg), stroke, s.dashed)
  }
}

const INHERITED = new Set(['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'text-anchor', 'fill-opacity', 'stroke-opacity', 'opacity'])

const textOf = (node: Node): string => node.children.map(ch => (ch.tag === '#text' ? ch.text ?? '' : ch.tag === 'tspan' ? textOf(ch) : '')).join('')

const themeVars = (palette: PelePalette): Record<string, string> => {
  const vars: Record<string, string> = {
    '--pele-bg': 'transparent',
    '--pele-fg': palette.text ?? 'currentColor',
    '--pele-muted': palette.muted ?? palette.text ?? 'currentColor',
    '--pele-line': palette.line ?? 'currentColor',
    '--pele-border': palette.border ?? palette.line ?? 'currentColor',
    '--pele-accent': palette.accent ?? palette.line ?? 'currentColor',
    '--pele-critical': palette.critical ?? palette.accent ?? 'currentColor',
    '--pele-surface': '#000001',
    '--pele-surface-alt': '#000002',
  }
  const n = palette.series.length, canvas = parseColor(palette.canvas)
  for (let i = 0; i < 8; i++) {
    const base = palette.series[i % Math.max(1, n)], color = parseColor(base)
    vars[`--pele-series-${i + 1}`] = !n ? hex(TONE + i)! : i < n || color === undefined || color < 0 || canvas === undefined || canvas < 0 ? base ?? 'currentColor' : hex(blend(color, 0.55, canvas))!
  }
  return vars
}

const draw = (svg: string, palette: PelePalette, stack = false, limit = Infinity, tight = false): Canvas | null => {
  const root = parseSvg(svg)
  if (!root) return null
  const local = styleProps(root.attrs.style)
  const vars = themeVars(palette)
  const canvasColor = parseColor(palette.canvas), lineColor = parseColor(palette.line)
  const canvasRgb = canvasColor !== undefined && canvasColor >= 0 ? canvasColor : 0x1e1e2e
  const surface = lineColor !== undefined && lineColor >= 0 ? blend(lineColor, 0.12, canvasRgb) : BG
  const lookup = (value: unknown, depth = 0): string | undefined => {
    if (value == null || depth > 12) return undefined
    const text = String(value).trim(), m = text.startsWith('var(') ? /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/.exec(text) : null
    if (!m) return text
    if (m[1]! in vars) return vars[m[1]!]
    if (m[1]! in local) return lookup(local[m[1]!], depth + 1)
    return lookup(m[2], depth + 1)
  }
  const resolved = new Map<unknown, string | undefined>(), resolve = (value: unknown) => { if (!resolved.has(value)) resolved.set(value, lookup(value)); return resolved.get(value) }
  const paints = new Map<string, Paint | undefined>()
  const paint = (value: unknown, alpha: number): Paint | undefined => {
    if (value == null) return undefined
    const key = `${alpha}|${value}`
    if (paints.has(key)) return paints.get(key)
    const c = parseColor(resolve(value))
    const p = c === undefined ? undefined : blend(c === 1 || c === 2 ? surface : !palette.series.length && c >= TONE && c < TONE + 8 ? toneOf(c) : c, alpha, canvasRgb)
    paints.set(key, p)
    return p
  }
  const border = paint('var(--_b)', 1), ink = paint('var(--_fg)', 1)
  const mutedColor = parseColor(palette.muted)
  const faint = mutedColor !== undefined && mutedColor >= 0 ? blend(mutedColor, 0.6, canvasRgb) : FG
  const hues = palette.hues.map(h => parseColor(h)).filter((h): h is Paint => h !== undefined && h >= 0)
  const nodes = new Map<string, Paint>()
  const hueOf = (id: string): Paint | undefined => {
    if (!hues.length) return undefined
    if (!nodes.has(id)) nodes.set(id, hues[nodes.size % hues.length]!)
    return nodes.get(id)
  }

  const box = (root.attrs.viewBox ?? `0 0 ${root.attrs.width} ${root.attrs.height}`).split(/[\s,]+/).map(Number)
  const vw = box[2] ?? 0, vh = box[3] ?? 0
  const shapes: Shape[] = [], texts: TextRun[] = []
  let series = 0, nodeCount = 0
  const lastLine = new Map<number, TextRun>()

  const textRuns = (node: Node, ctx: Ctx): TextRun[] => {
    const fontSize = Number(ctx['font-size'] ?? FONT) || FONT
    const look = (fill: string | undefined, weight: string | undefined) => {
      let color = paint(fill ?? ctx.fill ?? 'var(--_fg)', Number(ctx.opacity ?? 1) * Number(ctx['fill-opacity'] ?? 1))
      if (ctx.hue !== undefined && color === ink) color = ctx.hue
      const w = resolve(weight ?? ctx['font-weight'])
      return { color: color === BG ? (palette.text ? canvasRgb : FG) : color, bold: w === 'bold' || Number(w) >= 600 }
    }
    const lines: { x: number; y: number; parts: Part[] }[] = []
    let line = { x: Number(node.attrs.x ?? 0), y: Number(node.attrs.y ?? 0), parts: [] as Part[] }
    for (const ch of node.children) {
      if (ch.tag === '#text') { if (ch.text) line.parts.push({ text: ch.text, ...look(undefined, undefined) }) }
      else if (ch.tag === 'tspan') {
        if (ch.attrs.x !== undefined || ch.attrs.y !== undefined) {
          if (line.parts.length) lines.push(line)
          line = { x: Number(ch.attrs.x ?? line.x), y: Number(ch.attrs.y ?? line.y), parts: [] }
        }
        const text = textOf(ch)
        if (text) line.parts.push({ text, ...look(ch.attrs.fill, ch.attrs['font-weight']) })
      }
    }
    if (line.parts.length) lines.push(line)
    const angle = Math.atan2(ctx.m[1]!, ctx.m[0]!) * 180 / Math.PI
    const vertical = Math.abs(Math.abs(angle) - 90) < 1
    const tilted = !vertical && Math.abs(Math.sin(angle * Math.PI / 180)) > 0.02
    const m = tilted ? ctx.upright ?? ctx.m : ctx.m
    const loose = !!ctx.loose || /\bpele-section-label\b/.test(node.attrs.class ?? '')
    const runs: TextRun[] = [], prior = ctx.node === undefined ? undefined : lastLine.get(ctx.node)
    const follows = (cx: number, cy: number, w: number) => !!prior && Math.abs(cy - prior.cy - fontSize * 1.5) < 1 && Math.min(Math.abs(cx - prior.cx), Math.abs(cx - w * CW / 2 - prior.cx + prior.w * CW / 2)) < 1
    for (const l of lines) {
      const parts = l.parts.map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ') })).filter(p => p.text)
      const head = parts[0], tail = parts[parts.length - 1]
      if (head) head.text = head.text.trimStart()
      if (tail) tail.text = tail.text.trimEnd()
      const text = parts.map(p => p.text).join('')
      if (!text.trim()) continue
      const w = cellWidth(text)
      const anchor = String(ctx['text-anchor'] ?? 'start')
      const shift = anchor === 'middle' ? w * CW / 2 : anchor === 'end' ? w * CW : 0
      const [cx, cy] = affine(m)([l.x - shift + w * CW / 2, l.y - fontSize * 0.35])
      runs.push({ text, parts, cx, cy, w, vertical, tilted, loose, rigid: !!ctx.rigid, free: !!ctx.free, anchor, r: 0, c: 0, above: runs[runs.length - 1] ?? (follows(cx, cy, w) ? prior : undefined) })
    }
    if (ctx.node !== undefined && runs.length) lastLine.set(ctx.node, runs[runs.length - 1]!)
    return runs
  }

  const walk = (node: Node, ctx: Ctx) => {
    if (node.tag === '#text' || node.tag === 'title' || node.tag === 'defs' || node.tag === 'style') return
    const a = node.attrs
    let next = ctx
    const own = () => (next === ctx ? (next = { ...ctx }) : next)
    if (a.transform) {
      const m = own().m = mul(ctx.m, parseTransform(a.transform))
      if (Math.abs(m[1]!) < 1e-6 && Math.abs(m[2]!) < 1e-6) next.upright = m
    }
    for (const k in a) if (INHERITED.has(k)) own()[k] = a[k]
    if (node.tag === 'g' && a.class) {
      if (/\bpele-node\b/.test(a.class)) {
        own().node = nodeCount++
        next.form = /\bpele-shape-([\w-]+)/.exec(a.class)?.[1]
        if (a['data-id']) next.hue = hueOf(a['data-id'])
      }
      if (/\bpele-series\b/.test(a.class)) { own().series = series++; next.bars = /\bpele-bars\b/.test(a.class); next.line = /\bpele-line\b/.test(a.class) }
      if (/\bpele-grid\b/.test(a.class)) own().grid = true
      if (/\bpele-slice-labels\b/.test(a.class)) own().loose = true
      if (/\bpele-point-labels\b/.test(a.class)) own().free = true
      if (/\bpele-slice(s|-labels)\b/.test(a.class)) own().rigid = true
      if (/\bpele-note(?![\w-])/.test(a.class)) own().note = true
    }
    if (node.tag === 'g' || node.tag === 'svg' || node.tag === 'a') { for (let j = 0; j < node.children.length; j++) walk(node.children[j]!, next); return }
    if (node.tag === 'text') { if (resolve(next.fill) !== 'none') texts.push(...textRuns(node, next)); return }

    const n = (k: string) => Number(a[k] ?? 0)
    let subs: Sub[]
    const kind = node.tag
    if (kind === 'rect') {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height')
      if (!w || !h) return
      subs = polySub([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true)
    } else if (kind === 'circle') { if (n('r') < 2) return; subs = circleSub(n('cx'), n('cy'), n('r'), n('r')) }
    else if (kind === 'ellipse') subs = circleSub(n('cx'), n('cy'), n('rx'), n('ry'))
    else if (kind === 'line') subs = polySub([[n('x1'), n('y1')], [n('x2'), n('y2')]], false)
    else if (kind === 'polygon' || kind === 'polyline') {
      const nums = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
      const pts: Pt[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!])
      subs = polySub(pts, kind === 'polygon')
    } else if (kind === 'path') subs = parsePath(a.d ?? '')
    else return

    const m = next.m
    for (const sub of subs) for (const seg of sub.segs) seg.pts = seg.pts.map(affine(m))
    let polys = subs.map(polylineOf).filter(p => p.length > 1)
    if (!polys.length) return
    if (next.note) {
      if (!subs.some(sub => sub.closed)) return
      const b = bbox(polys)
      subs = polySub([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], true)
      polys = subs.map(polylineOf)
    }
    const opacity = Number(next.opacity ?? 1), alpha = opacity * Number(next['fill-opacity'] ?? 1), dash = next['stroke-dasharray']
    const grid = /\bpele-grid\b/.test(a.class ?? '') || (!!next.grid && !!dash && dash !== 'none')
    let stroke = grid ? faint : paint(next.stroke, opacity * Number(next['stroke-opacity'] ?? 1))
    if (next.hue !== undefined && stroke === border) stroke = next.hue
    shapes.push({
      kind, subs, polys, box: bbox(polys), fill: paint(next.fill ?? '#000', alpha), stroke, strokeWidth: Number(next['stroke-width'] ?? 1), dashed: !!dash && dash !== 'none' && dash !== '0',
      small: false, solid: false, node: next.node, form: next.form, grid, axis: /\bpele-axis\b/.test(a.class ?? ''), point: /\bpele-point\b/.test(a.class ?? ''),
      line: next.line, bar: next.bars && kind === 'rect' ? next.series : undefined, rigid: next.rigid, sheer: alpha < 1,
    })
  }

  const gutter = stack || !rotated(svg) ? 0 : 10, origin = [1, 0, 0, 1, (MARGIN + gutter) * CW, MARGIN * CH]
  walk(root, { m: origin, upright: origin, fill: root.attrs.fill })
  const spill = texts.reduce((most, t) => (t.vertical ? most : Math.max(most, t.w * CW / 2 - t.cx)), 0)
  if (spill > 0) {
    shapes.length = texts.length = series = nodeCount = 0
    lastLine.clear()
    origin[4] = origin[4]! + spill
    walk(root, { m: origin, upright: origin, fill: root.attrs.fill })
  }
  const right = texts.reduce((most, t) => (t.vertical ? most : Math.max(most, t.cx + t.w * CW / 2)), 0)

  const bars = shapes.filter(s => s.bar !== undefined)
  const top = Math.min(...bars.map(b => b.box.y0))
  const highlight = parseColor(palette.highlight), muted = parseColor(palette.muted)
  if (series === 1 && bars.length > 1 && highlight !== undefined && highlight >= 0 && muted !== undefined && muted >= 0) for (const b of bars) b.fill = b.box.y0 - top < 0.5 ? highlight : muted

  for (const s of shapes) {
    if (s.node === undefined || s.subs.some(sub => sub.closed)) continue
    const card = shapes.find(o => o.node === s.node && o.subs[0]?.closed === true && isBox(o.polys[0] ?? []))
    if (!card) continue
    const flat = (sub: Sub) => {
      const seg = sub.segs[0]!, [a, b] = seg.pts as [Pt, Pt], { x0, x1, y0, y1 } = card.box
      return sub.segs.length === 1 && seg.k === 'L' && Math.abs(a[1] - b[1]) < 0.5 && a[1] > y0 && a[1] < y1 && Math.abs(Math.min(a[0], b[0]) - x0) < 1 && Math.abs(Math.max(a[0], b[0]) - x1) < 1
    }
    const ys = s.subs.filter(flat).map(sub => sub.segs[0]!.pts[0]![1])
    const empty = (y: number) => {
      const below = Math.min(card.box.y1, ...ys.filter(o => o > y + 0.5))
      return !texts.some(t => t.cy > y && t.cy < below && t.cx > card.box.x0 && t.cx < card.box.x1)
    }
    const kept = s.subs.filter(sub => !flat(sub) || !empty(sub.segs[0]!.pts[0]![1]))
    if (kept.length === s.subs.length) continue
    s.subs = kept
    s.polys = kept.map(polylineOf).filter(p => p.length > 1)
    if (!s.polys.length) s.hidden = true
    else s.box = bbox(s.polys)
  }
  const lineOf = new Map<TextRun, Feature>(), featuresX: Feature[] = []
  const featuresY = texts.filter(t => !t.vertical && !t.loose).map(t => { const f: Feature = { at: t.cy, lo: t.cx - t.w * CW / 2, hi: t.cx + t.w * CW / 2, above: t.above && lineOf.get(t.above) }; lineOf.set(t, f); return f })
  const plain = [paint('var(--_s)', 1), paint('var(--_a)', 1), BG]
  for (const s of shapes) {
    const box4 = s.polys.length === 1 && s.subs[0]?.closed === true && isBox(s.polys[0]!), bare = s.stroke === undefined || s.stroke === BG
    s.small = s.box.w <= CW * 2.2 && s.box.h <= CH * 1.1
    if (s.point) featuresY.push({ at: (s.box.y0 + s.box.y1) / 2, lo: s.box.x0, hi: s.box.x1 })
    if (s.small && s.node !== undefined) for (const at of s.kind === 'path' ? [s.box.y0, s.box.y1] : [(s.box.y0 + s.box.y1) / 2]) featuresY.push({ at, lo: s.box.x0, hi: s.box.x1 })
    s.thin = !s.small && s.bar === undefined && s.box.h < CH * 1.5 && (box4 || s.subs.length === 1 && s.subs[0]!.closed && s.box.h < CH && s.subs[0]!.segs.every(seg => seg.k === 'L'))
    if (bare && box4 && !s.small && !s.thin && s.bar === undefined && s.fill !== undefined && !plain.includes(s.fill) && textsIn(s, texts).length) {
      featuresY.push({ at: s.box.y0, lo: s.box.x0, hi: s.box.x1 }, { at: s.box.y1, lo: s.box.x0, hi: s.box.x1 })
    }
    if ((s.form === 'cloud' || s.form === 'bang') && !s.small) featuresY.push({ at: s.box.y0, lo: s.box.x0, hi: s.box.x1 }, { at: s.box.y1, lo: s.box.x0, hi: s.box.x1 })
    if (s.small || s.thin || s.line || bare || isSlim(s)) continue
    for (const sub of s.subs) {
      sub.segs = sub.segs.flatMap((seg): Seg[] => {
        const e = seg.k !== 'L' ? elbow(seg) : null
        return e ? e.slice(1).map((p, i): Seg => ({ k: 'L', pts: [e[i]!, p] })) : [seg]
      })
      for (const seg of sub.segs) {
        if (seg.k !== 'L') continue
        const p0 = seg.pts[0]!, p1 = seg.pts[1]!
        const axis = axisOf(p1[0] - p0[0], p1[1] - p0[1], 0.02)
        if (axis === 'h') featuresY.push({ at: (p0[1] + p1[1]) / 2, lo: Math.min(p0[0], p1[0]), hi: Math.max(p0[0], p1[0]) })
        if (axis === 'v') featuresX.push({ at: (p0[0] + p1[0]) / 2, lo: Math.min(p0[1], p1[1]), hi: Math.max(p0[1], p1[1]) })
      }
    }
  }
  const gridSegs = shapes.filter(s => s.grid).flatMap(s => s.subs.flatMap(sub => sub.segs.filter(seg => seg.k === 'L')))
  const sideways = gridSegs.some(seg => axisOf(seg.pts[1]![0] - seg.pts[0]![0], seg.pts[1]![1] - seg.pts[0]![1], 0.02) === 'v')
  const lines = shapes.filter(s => s.line)
  for (const s of lines) s.sideways = sideways
  const gridY = lines.length && !sideways ? [...new Set(gridSegs.map(seg => seg.pts[0]![1]))].sort((a, b) => a - b) : []
  const bx = warp(featuresX, CW, CH), base = warp(featuresY, CH, CW, gridY, rowsPerGrid(gridY, lines)), drops: Pt[] = [], room = new Map<number, number>()
  const lifelines = /\bpele-sequence\b/.test(root.attrs.class ?? ''), nest = lifelines || tight ? [] : shapes.filter(s => isCard(s) || isOutline(s))
  const inside = (b: Bounds, a: Bounds) => b.x0 > a.x0 && b.x1 < a.x1 && b.y0 > a.y0 && b.y1 < a.y1, widen = (at: number, k: number) => room.set(at, Math.max(k, room.get(at) ?? 0))
  for (const { box: a, node } of nest) for (const { box: b } of nest.filter(n => (n.node === undefined || n.node !== node) && inside(n.box, a))) {
    const busy = (c: number) => nest.some(({ box: o }) => o !== a && !inside(o, a) && !inside(a, o) && o.y0 < a.y1 && o.y1 > a.y0 && col(bx(o.x0)) <= c && col(bx(o.x1)) >= c - 1)
    const left = 2 - col(bx(b.x0)) + col(bx(a.x0)), right = 2 - col(bx(a.x1)) + col(bx(b.x1))
    if (left > 0 && bx(b.x0) - CW / 2 > bx(a.x0) && busy(col(bx(a.x0)) - left)) widen(a.x0 + 1, left)
    if (right > 0 && bx(b.x1) + CW / 2 < bx(a.x1) && busy(col(bx(a.x1)) + right + 1)) widen(a.x1, right)
  }
  const posts = lifelines ? shapes.flatMap(s => (!s.subs[0]?.closed && s.box.w < 1 && s.box.h > CH) || (isCard(s) && !isSlim(s)) ? [...new Set([s.box.x0, s.box.x1])].map(x => ({ x, s, c: col(bx(x)) })) : []) : [], column = new Map<number, typeof posts>()
  for (const p of posts) column.set(p.c, [...(column.get(p.c) ?? []), p])
  for (const a of posts) for (const b of column.get(a.c + 1) ?? []) if (a.s !== b.s && a.s.box.y0 < b.s.box.y1 && a.s.box.y1 > b.s.box.y0) widen((a.x + b.x) / 2, 1)
  const stops = [...featuresY, ...texts.filter(t => t.loose && !t.vertical).map(t => ({ at: t.cy, lo: t.cx - t.w * CW / 2, hi: t.cx + t.w * CW / 2 }))]
  for (const t of texts) {
    if (!t.loose || !t.above || texts.some(o => o.above === t)) continue
    const last = (o: TextRun): number => Math.max(row(base(o.cy)), o.above ? last(o.above) + 1 : 0), end = last(t)
    const next = Math.min(...stops.filter(f => f.at > t.cy && Math.abs(f.lo + f.hi - 2 * t.cx) < f.hi - f.lo + (t.w + 6) * CW).map(f => f.at))
    if (end >= row(base(next))) drops.push([Math.min(next, ...shapes.map(s => s.box.y0).filter(y => y > t.cy && y <= next)), end - row(base(next)) + 1])
  }
  const spread = (f: (v: number) => number, at: Pt[], unit: number) => (at.length ? (v: number) => { let n = 0; for (let i = 0; i < at.length; i++) if (v >= at[i]![0]) n += at[i]![1]; return f(v) + unit * n } : f), wx = spread(bx, [...room], CW), wy = spread(base, drops, CH)
  const rigid = shapes.filter(s => s.rigid).flatMap(s => s.polys), whole = rigid.length ? bbox(rigid) : undefined
  const pin = whole && whole.h > 0 ? (() => {
    const cx = (whole.x0 + whole.x1) / 2, cy = (whole.y0 + whole.y1) / 2, k = (wy(whole.y1) - wy(whole.y0)) / whole.h, x = wx(cx), y = wy(cy)
    return (p: Pt): Pt => [x + (p[0] - cx) * k, y + (p[1] - cy) * k]
  })() : undefined
  for (const s of shapes) {
    const cx = (s.box.x0 + s.box.x1) / 2, cy = (s.box.y0 + s.box.y1) / 2, dx = wx(cx) - cx, dy = wy(cy) - cy
    const move = s.rigid && pin ? pin : s.small ? (p: Pt): Pt => [p[0] + dx, p[1] + dy] : (p: Pt): Pt => [wx(p[0]), wy(p[1])]
    for (const sub of s.subs) for (const seg of sub.segs) seg.pts = seg.pts.map(move)
    s.polys = s.subs.map(polylineOf).filter(p => p.length > 1); s.box = bbox(s.polys)
  }
  for (const s of lines) s.bars = bars.map(b => b.box)
  const floor = lines.length && !bars.length && !sideways ? baseline(shapes) : undefined
  const lower = (y: number) => floor !== undefined && y > floor + 0.5
  if (floor !== undefined) for (const s of shapes) {
    for (const sub of s.subs) for (const seg of sub.segs) {
      const a = seg.pts[0]!, b = seg.pts[seg.pts.length - 1]!, tick = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) < CW * 2
      seg.pts = seg.pts.map(p => (lower(p[1]) || (s.axis && !tick && Math.abs(p[1] - floor) <= 0.5) ? [p[0], p[1] + CH] : p))
    }
    s.polys = s.subs.map(polylineOf).filter(p => p.length > 1); s.box = bbox(s.polys)
  }
  const flush = (t: TextRun, o: TextRun) => Math.abs(t.cx - t.w * CW / 2 - o.cx + o.w * CW / 2) < 1, left = new Set<TextRun>()
  for (const t of texts) if (t.above && t.anchor === 'middle' && (Math.abs(t.cx - t.above.cx) >= 1 || left.has(t.above)) && flush(t, t.above)) for (let o: TextRun | undefined = t; o && flush(o, t); o = o.above) left.add(o)
  for (const t of texts) {
    const half = t.vertical || t.tilted || t.anchor === 'middle' ? 0 : t.anchor === 'end' ? -t.w * CW / 2 : t.w * CW / 2
    if (t.rigid && pin) [t.cx, t.cy] = pin([t.cx, t.cy])
    else { t.cx = wx(t.cx - half) + half; t.cy = wy(t.cy) }
    if (lower(t.cy)) t.cy += CH
    t.r = t.vertical ? Math.max(0, row(t.cy) - Math.floor(t.w / 2)) : row(t.cy)
    if (t.above && !t.vertical && !t.above.vertical && t.r <= t.above.r) t.r = t.above.r + 1
    t.c = t.vertical ? col(t.cx) : Math.round((t.cx - t.w * CW / 2) / CW)
    if (t.above && left.has(t) && left.has(t.above)) t.c = Math.max(t.c, t.above.c)
  }
  for (const t of [...texts].reverse()) if (left.has(t)) { if (t.above && left.has(t.above)) t.above.c = t.c; t.anchor = 'start' }
  const edges = [...shapes.filter(isCard).flatMap(s => [col(s.box.x0), col(s.box.x1)]), ...texts.filter(t => !t.vertical).flatMap(t => [t.c, t.c + t.w - 1])], extent = Math.max(...edges) - Math.min(...edges)
  if (extent >= limit) return null
  const placed = texts.filter(t => !t.vertical && !t.tilted)
  for (const t of texts) {
    if (!t.tilted) continue
    for (let k = 0; k < 4 && placed.some(o => o.r === t.r && t.c <= o.c + o.w && o.c <= t.c + t.w); k++) t.r++
    placed.push(t)
  }
  const blocks = stack ? [] : texts.filter(t => t.vertical && !t.above?.vertical).map(head => {
    const group = [head]
    for (const o of texts) if (o.vertical && o.above === group[group.length - 1]) group.push(o)
    const text = group.map(g => g.text).join(' '), lines = unstack({ ...head, text, w: cellWidth(text), c: Math.max(...group.map(g => g.c)) })
    for (const g of group.slice(1)) texts.splice(texts.indexOf(g), 1)
    texts.splice(texts.indexOf(head), 1, ...lines)
    return lines
  })

  for (const t of texts) if (t.vertical) t.r = Math.max(t.r, ...texts.filter(o => !o.vertical && o.cy < t.cy && o.c <= t.c + 1 && o.c + o.w >= t.c).map(o => o.r + 1))
  const cv = new Canvas(Math.ceil(wx(Math.max(vw + spill + (2 * MARGIN + gutter) * CW, right + MARGIN * CW)) / CW) + 1, Math.max(Math.ceil(wy(vh + 2 * MARGIN * CH) / CH) + (floor === undefined ? 1 : 2), ...texts.map(t => (t.vertical ? t.r + t.w + 1 : 0))))
  cv.plot = series > 0 || /\bpele-gantt\b/.test(root.attrs.class ?? '')
  if (palette.text && canvasColor !== undefined && canvasColor >= 0) cv.paper = canvasColor
  if (ink !== undefined && ink >= 0) cv.ink = ink
  for (const s of shapes) {
    if (lifelines && s.thin && s.fill === BG && shapes.some(o => (o.fill ?? BG) >= 0 && !o.thin && o.box.x0 <= s.box.x0 && o.box.x1 >= s.box.x1 && o.box.y0 <= s.box.y0 && o.box.y1 >= s.box.y1)) s.fill = undefined
    if (s.fill !== undefined && s.fill <= SHADE && s.polys.length === 1 && isBox(s.polys[0]!) && textsIn(s, texts).length) s.fill = FG
    if (s.thin && s.stroke !== undefined && (s.stroke >= 0 || s.stroke === FG) && (s.fill === undefined || plain.includes(s.fill))) s.fill = s.stroke !== FG ? blend(s.stroke, 0.25, canvasRgb) : !cv.plot && textsIn(s, texts).length ? FG : SHADE - SHADES.indexOf('░')
    s.solid = s.fill !== undefined && s.fill !== BG && !plain.includes(s.fill)
  }
  for (const outer of shapes) {
    if (outer.node === undefined || !outer.subs[0]?.closed) continue
    for (const inner of shapes) {
      const a = outer.box, b = inner.box
      if (inner !== outer && inner.node === outer.node && inner.subs[0]?.closed && b.x0 > a.x0 && b.x1 < a.x1 && b.y0 > a.y0 && b.y1 < a.y1 &&
        b.x0 - a.x0 < CW * 1.5 && a.x1 - b.x1 < CW * 1.5 && b.y0 - a.y0 < CH * 1.5 && a.y1 - b.y1 < CH * 1.5) inner.hidden = true
    }
  }
  const cards = shapes.filter(s => isCard(s) || isOutline(s)), area = (b: Bounds) => b.w * b.h
  for (const t of texts) {
    if (t.vertical || t.free) continue
    for (const s of cards) {
      const b = s.box
      if (t.cx > b.x0 && t.cx < b.x1 && t.cy > b.y0 && t.cy < b.y1 && t.c >= col(b.x0) - 1 && t.c + t.w <= col(b.x1) + 2 && (!t.owner || area(b) < area(t.owner.box))) t.owner = s
    }
  }
  for (const s of lifelines || tight ? [] : cards) for (const n of cards) {
    const a = s.box, b = n.box
    if (n === s || b.x0 <= a.x0 || b.x1 >= a.x1 || b.y0 <= a.y0 || b.y1 >= a.y1) continue
    if (col(b.x1) + 1 >= col(a.x1) && b.x1 + CW / 2 < a.x1) s.box = { ...a, x1: (col(b.x1) + 2) * CW }
    if (col(b.x0) - 1 <= col(a.x0) && b.x0 - CW / 2 > a.x0) s.box = { ...s.box, x0: (col(b.x0) - 2) * CW }
  }
  const rects = shapes.filter(s => s.kind === 'rect' && s.fill !== undefined).map(s => s.box)
  for (const s of shapes) if (!s.line) drawShape(cv, s, texts, rects)
  for (const s of lines) drawShape(cv, s, texts)
  trimEdges(cv)
  for (const block of blocks) {
    const busy = () => block.some(t => {
      for (let c = t.c - 1; c <= t.c + t.w; c++) { const i = cv.index(c, t.r); if (i < 0 || cv.inked[i]) return true }
      return texts.some(o => !block.includes(o) && o.r === t.r && o.c <= t.c + t.w && o.c + o.w >= t.c)
    })
    for (let k = 0; k < gutter && busy() && block.every(t => t.c > 0); k++) for (const t of block) t.c--
  }
  const wall = (c: number, r: number, facing: number) => { const i = cv.index(c, r); return i >= 0 && (cv.arms[i]! & (UP | DOWN)) !== 0 && (cv.arms[i]! & facing) === 0 }
  const onCanvas = (c: number, r: number) => { const i = cv.index(c, r); return i >= 0 && [0, 1, 2, 3].every(k => cv.quad[i * 4 + k] === NONE || cv.quad[i * 4 + k] === BG) }
  const cut = (c: number, r: number) => { const a = cv.index(c, r - 1), b = cv.index(c, r + 1); return a >= 0 && b >= 0 && (cv.arms[a]! & DOWN) !== 0 && (cv.arms[b]! & UP) !== 0 }
  const inks = new Int8Array(cv.cols * cv.rows), shows = (i: number, c: number, r: number) => { const look = cv.inked[i] ? lookOf(cv, i) : BLANK; return look.ch !== ' ' || look.bg !== NONE ? 2 : cut(c, r) ? 3 : 1 }
  const seen = (c: number, r: number) => { const i = cv.index(c, r); return i >= 0 && (inks[i] ||= shows(i, c, r)) >= 2 }
  let byRow: Map<number, TextRun[]> | undefined
  const toRow = (t: TextRun, r: number) => { t.r = r; byRow = undefined }, rowOf = (r: number) => (byRow ??= texts.reduce((m, o) => (o.vertical ? m : m.set(o.r, [...(m.get(o.r) ?? []), o])), new Map<number, TextRun[]>())).get(r) ?? []
  const other = (t: TextRun, x: number, r = t.r, to = x) => { const g = team.get(t), same = rowOf(r); for (let j = 0; j < same.length; j++) { const o = same[j]!; if (o.c <= to && x < o.c + o.w && team.get(o) !== g) return true } return false }
  const bump = (c: number, r: number, facing: number) => { const i = cv.index(c, r); return seen(c, r) && (cv.ch[i] !== null || !cv.arms[i] || wall(c, r, facing)) }
  const hard = (t: TextRun, c: number, facing: number) => { const i = cv.index(c, t.r); return other(t, c) || i >= 0 && cv.ch[i] !== null || wall(c, t.r, facing) }
  const coverable = (t: TextRun, c: number) => { const i = cv.index(c, t.r); return i >= 0 && cv.ch[i] === null && (cv.arms[i]! & (UP | DOWN)) === 0 && !other(t, c) }
  const flat = (t: TextRun, x: number, r = t.r) => { const i = cv.index(x, r), q = cv.quad[cv.index(t.c, t.r) * 4]!, f = t.owner?.fill ?? (lifelines && q >= 0 && plain.includes(q) ? q : undefined); return f !== undefined && cv.ch[i] === null && !cv.arms[i] && !cv.braille[i] && cv.quad[i * 4] === f && cv.quad[i * 4 + 3] === f }
  const clear = (t: TextRun, c: number, r = t.r) => { if (other(t, c - 1, r, c + t.w)) return false; for (let x = c - 1; x <= c + t.w; x++) if (cv.index(x, r) < 0 || seen(x, r) && !flat(t, x, r)) return false; return true }
  let span: [number, number] | undefined
  const within = (c: number, w: number) => {
    if (!span) {
      span = [cv.cols, 0]
      for (let a = cv.inked.indexOf(1); a >= 0; a = cv.inked.indexOf(1, a - a % cv.cols + cv.cols)) { const r0 = a - a % cv.cols; span[0] = Math.min(span[0], a - r0); span[1] = Math.max(span[1], cv.inked.lastIndexOf(1, r0 + cv.cols - 1) - r0) }
      for (const o of texts) if (!o.vertical) { span[0] = Math.min(span[0], o.c); span[1] = Math.max(span[1], o.c + o.w - 1) }
    }
    return c >= span[0] && c + w - 1 <= span[1]
  }
  const crossed = (t: TextRun) => { for (let x = t.c; x < t.c + t.w; x++) if (wall(x, t.r, LEFT | RIGHT) || lifelines && cut(x, t.r)) return true; return false }
  const covered = (t: TextRun) => { for (let x = t.c; x < t.c + t.w; x++) if (cv.ch[cv.index(x, t.r)]) return true; return other(t, t.c, t.r, t.c + t.w - 1) }
  const team = new Map<TextRun, TextRun[]>()
  for (const t of texts) if (!t.vertical) { const g = t.above && team.get(t.above); if (g) g.push(t); team.set(t, g || [t]) }
  const free = (o: TextRun, r: number) => { const q = cv.index(o.c, o.r) * 4; if (other(o, o.c - 1, r, o.c + o.w)) return false; for (let x = o.c - 1; x <= o.c + o.w; x++) { const i = cv.index(x, r); if (i < 0 || cv.ch[i] !== null || cv.arms[i] || cv.braille[i] || cv.quad[i * 4] !== cv.quad[q] || cv.quad[i * 4 + 3] !== cv.quad[q + 3]) return false } return true }
  for (const t of texts) {
    const g = team.get(t), n = (g?.length ?? 0) - 1, end = g ? g[n]!.r : 0, at = (o: TextRun) => lineOf.get(o)?.at ?? NaN, q = cv.quad[cv.index(t.c, t.r) * 4], top = t.anchor === 'middle' ? Math.round((t.r + end - n) / 2) : t.r
    if (g?.[0] !== t || end - t.r <= n || t.tilted || !(at(g[n]!) - at(t) < CH * (n + 0.5)) || g.some(o => o.owner !== t.owner) || !t.owner && (q === NONE || q === BG)) continue
    const fit = [top, t.r, top + 1].find(r => r + n <= end && g.every((o, i) => free(o, r + i)))
    if (fit !== undefined) g.forEach((o, i) => toRow(o, fit + i))
  }
  const upright = texts.filter(t => t.vertical)
  if (upright.some(a => upright.some(b => a !== b && Math.abs(a.c - b.c) <= 2 && a.r < b.r + b.w && b.r < a.r + a.w))) cv.clash = true
  for (const t of texts) {
    if (t.vertical) {
      let near = false, room = true
      for (let r = t.r; r < t.r + t.w; r++) { near ||= bump(t.c + 1, r, LEFT); const i = cv.index(t.c - 1, r); room &&= i >= 0 && !cv.inked[i] }
      if (near && room) t.c--
      continue
    }
    for (let x = t.c; x < t.c + t.w; x++) if (cv.ch[cv.index(x, t.r)]) { toRow(t, t.r + 1); if (!clear(t, t.c)) toRow(t, t.r - 1); break }
    const g = team.get(t)!
    const stuck = (o: TextRun) => bump(o.c + o.w, o.r, LEFT) && !flat(o, o.c + o.w) || bump(o.c - 1, o.r, RIGHT) && !flat(o, o.c - 1) || crossed(o) || covered(o) || other(o, o.c - 1) || other(o, o.c + o.w)
    if (t !== g[g.length - 1] || !g.some(stuck)) continue
    const fits = (d: number) => g.every(o => within(o.c + d, o.w) && (!o.owner || o.c + d > col(o.owner.box.x0) + 1 && o.c + d + o.w < col(o.owner.box.x1)) && clear(o, o.c + d)), most = Math.min(g[0]!.owner?.fill !== undefined ? cv.cols : Math.max(...g.map(o => o.w)) / 2 + 1, ...g.map(o => (o.owner ? Math.max(o.c - col(o.owner.box.x0) - 2, col(o.owner.box.x1) - o.w - 1 - o.c) : Infinity)))
    let d = 0
    for (let k = 1; k <= most && !d; k++) d = fits(-k) ? -k : fits(k) ? k : 0
    const left = g.some(o => hard(o, o.c - 1, RIGHT)), right = g.some(o => hard(o, o.c + o.w, LEFT))
    const nudge = d ? 0 : right && !left && g.every(o => coverable(o, o.c - 1) && !hard(o, o.c - 2, RIGHT) && within(o.c - 1, o.w)) ? -1
      : left && !right && g.every(o => coverable(o, o.c + o.w) && !hard(o, o.c + o.w + 1, LEFT) && within(o.c + 1, o.w)) ? 1 : 0
    const lift = d || nudge || !g.some(o => covered(o) || other(o, o.c - 1) || other(o, o.c + o.w)) ? 0 : [-1, 1].find(k => g.every(o => clear(o, o.c, o.r + k))) ?? 0
    for (const o of g) {
      const from = o.c, framed = lifelines && o.owner !== undefined && o.owner.fill === undefined && onCanvas(o.c, o.r)
      const step = d || nudge || g.length < 2 || !stuck(o) ? 0 : [-1, 1].find(k => clear(o, o.c + k)) ?? 0
      o.c += d + nudge + step; if (lift) toRow(o, o.r + lift)
      for (let x = from - 1; x <= from + o.w && (d || step); x++) {
        if ((x >= o.c && x < o.c + o.w) || !cut(x, o.r)) continue
        const above = cv.index(x, o.r - 1)
        cv.arm(x, o.r, UP | DOWN, cv.armColor[above]!, cv.heavy[above] === 1, false)
        cv.dashed[cv.index(x, o.r)] = cv.dashed[above]!; inks.fill(0)
      }
      const tab = framed && (crossed(o) || bump(o.c - 1, o.r, RIGHT) || bump(o.c + o.w, o.r, LEFT)) ? shapes.find(s => s.thin && s.solid && Math.abs(s.box.x0 - o.owner!.box.x0) < 1 && Math.abs(s.box.y0 - o.owner!.box.y0) < 1) : undefined
      const bare = () => { for (let x = o.c; x < o.c + o.w; x++) if (!onCanvas(x, o.r)) return false; return true }
      const backdrop = tab ? tab.fill! : (lifelines && crossed(o) || wall(o.c - 1, o.r, RIGHT) || wall(o.c + o.w, o.r, LEFT)) && bare() ? (surface === BG ? FG : surface) : undefined
      const open = (x: number) => !seen(x, o.r) || cut(x, o.r), joined = tab && open(o.c - 2) && cv.quad[cv.index(o.c - 3, o.r) * 4] === tab.fill ? 1 : 0
      if (backdrop !== undefined && !tab && (other(o, o.c - 2) || other(o, o.c + o.w + 1))) cv.clash = true
      if (backdrop !== undefined) for (let x = o.c - 1 - joined; x <= o.c + o.w; x++) if (cv.ch[cv.index(x, o.r)] === null && (x >= o.c && x < o.c + o.w || open(x) || wall(x, o.r, LEFT | RIGHT))) { cv.clear(x, o.r); cv.fillCell(x, o.r, backdrop); inks.fill(0) }
    }
  }

  if (texts.some(t => texts.some(o => (t.above && o.r > t.above.r && o.r < t.r && o.c < t.c + t.w && t.c < o.c + o.w || !t.vertical && o.r === t.r && o.c === t.c + t.w) && !o.vertical && team.get(o) !== team.get(t)))) cv.clash = true
  if (cards.some(s => { const c0 = col(s.box.x0), c1 = col(s.box.x1), r0 = row(s.box.y0), r1 = row(s.box.y1); return c1 - c0 > 2 && isCard(s) && texts.some(t => t.r > r0 && t.r < r1 && (c0 >= t.c && c0 < t.c + t.w || c1 >= t.c && c1 < t.c + t.w) && !t.vertical && !t.free && s !== t.owner) })) cv.clash = true
  const taken = new Uint8Array(cv.cols * cv.rows)
  const bare = (i: number) => { const m = majority([0, 1, 2, 3].map(k => (cv.quad[i * 4 + k] === BG ? NONE : cv.quad[i * 4 + k]!))); return m === NONE || m <= SHADE }
  const halo = (x: number, r: number, toward: number, end: number) => {
    const i = cv.index(x, r)
    if (i < 0 || cv.ch[i] !== null) return
    if (cv.arms[i] === (LEFT | RIGHT) || cv.arms[i] === toward || cv.armColor[i] === cv.quad[i * 4]) cv.arms[i] = 0
    if (!cv.arms[i] && !cv.braille[i] && cv.inked[i] && bare(cv.index(end, r)) && lookOf(cv, i).ch !== ' ') { cv.quad.fill(NONE, i * 4, i * 4 + 4); cv.smooth[i] = 0 }
  }
  for (const t of texts) {
    let c = t.c, r = t.r
    for (const p of t.parts) {
      for (const ch of p.text) {
        const w = charWidth(ch.codePointAt(0) ?? 0), i = cv.index(c, r)
        if (!w) continue
        if (i >= 0 && ch !== ' ') { if (taken[i] || cv.ch[i] !== null) cv.clash = true; taken[i] = 1 }
        cv.put(c, r, ch, p.color, p.bold)
        if (t.vertical) { r++; continue }
        if (w === 2) cv.markWide(c + 1, r)
        c += w
      }
    }
    if (t.owner || t.vertical) continue
    halo(t.c - 1, t.r, RIGHT, t.c)
    halo(t.c + t.w, t.r, LEFT, t.c + t.w - 1)
  }
  reach(cv)
  return cv
}

const majority = (quad: Paint[]): Paint => {
  let best = NONE, most = 0
  for (let i = 0; i < 4; i++) {
    const c = quad[i]!
    if (quad.indexOf(c) < i) continue
    let n = 0
    for (let j = i; j < 4; j++) if (quad[j] === c) n++
    if (n > most || (n === most && c !== NONE)) { best = c; most = n }
  }
  return best
}

type Look = { ch: string; fg: Paint; bg: Paint; bold: boolean; inverse?: boolean }

const BLANK: Look = { ch: ' ', fg: NONE, bg: NONE, bold: false }
const WIDE: Look = { ch: '', fg: NONE, bg: NONE, bold: false }
const solid = (fg: Paint): Look => (fg === NONE ? BLANK : { ch: fg <= SHADE ? shadeOf(fg) : '█', fg: fg <= SHADE ? FG : fg, bg: NONE, bold: false })

const halfLook = (quad: Paint[]): Look => {
  let mask = 0, color = NONE
  for (let j = 0; j < 4; j++) if (quad[j] !== NONE) { mask |= 1 << j; color = quad[j]! }
  return mask ? { ch: QUADS[mask]!, fg: color, bg: NONE, bold: false } : BLANK
}

const readable = (cv: Canvas, fg: Paint, bg: Paint): Paint => {
  if (fg < 0 || bg < 0 || contrast(fg, bg) >= 3) return fg
  let best = fg
  for (const c of [cv.ink, cv.paper]) if (c >= 0 && contrast(c, bg) > contrast(best, bg)) best = c
  const end = luminance(best) > luminance(bg) ? 0xffffff : 0
  for (const [from, to] of [[fg, best], [best, end]] as const) for (let t = 0.25; t <= 1; t += 0.25) { const c = blend(to, t, from); if (contrast(c, bg) >= 3) return c }
  return end
}

const FIT = new Int32Array(18)

const smoothLook = (cv: Canvas, i: number): Look | null => {
  const f = cv.fine!, base = i * 16, first = f[base]!
  let k = 1
  while (k < 16 && f[base + k] === first) k++
  if (k === 16) return first === BG || first === NONE ? BLANK : first >= 0 ? solid(first) : null
  const sample = (cell: number, n: number) => { const c = cell >= 0 && cell < cv.smooth.length && cv.smooth[cell] ? f[cell * 16 + n]! : NONE; return c === BG ? NONE : c }
  const px: Paint[] = [], seen: Paint[] = []
  for (let n = 0; n < 16; n++) {
    let c = f[base + n]!
    if (c === BG) c = NONE
    if (c === NONE) { const up = n < 2 ? sample(i - cv.cols, n + 14) : sample(i, n - 2); if (up !== NONE && up === (n > 13 ? sample(i + cv.cols, n - 14) : sample(i, n + 2))) c = up }
    px.push(c)
    if (!seen.includes(c)) seen.push(c)
  }
  if (seen.length > 3 || seen.some(c => c < 0 && c !== NONE)) return null
  if (seen.length === 1) return solid(seen[0]!)
  let best = 3, a = NONE, b = NONE, sum = 0
  const run = (j: number) => { let s = 0; while (px[s * 2 + j] === px[0]) s++; let k = s; while (k < 8 && px[k * 2 + j] === px[14]) k++; return k === 8 ? s : -9 }
  const sl = px[0] !== px[14] && px[1] === px[0] && px[15] === px[14] ? run(0) : -9, sr = sl >= 0 ? run(1) : -9
  if (sr >= 0 && Math.abs(sl - sr) <= 3) { best = 0; a = px[0]!; b = px[14]!; sum = sl + sr }
  if (best) for (const top of seen) for (const bottom of seen) {
    if (top === bottom) continue
    for (let j = 0; j < 2; j++) {
      let n = 0
      for (let m = 0; m < 8; m++) if (px[m * 2 + j] !== bottom) n++
      FIT[j * 9] = n
      for (let m = 0; m < 8; m++) FIT[j * 9 + m + 1] = n += (px[m * 2 + j] !== top ? 1 : 0) - (px[m * 2 + j] !== bottom ? 1 : 0)
    }
    for (let sl = 0; sl <= 8; sl++) for (let sr = sl > 3 ? sl - 3 : 0; FIT[sl]! < best && sr <= sl + 3 && sr <= 8; sr++) {
      const miss = FIT[sl]! + FIT[9 + sr]!
      if (miss < best) { best = miss; a = top; b = bottom; sum = sl + sr }
    }
  }
  if (best === 3) return null
  const s = sum % 2 === 0 ? sum / 2 : a === NONE ? (sum + 1) / 2 : b === NONE ? (sum - 1) / 2 : Math.round(sum / 2)
  const fill = s === 0 ? b : s === 8 ? a : undefined
  if (fill !== undefined) return solid(fill)
  const ch = '▁▂▃▄▅▆▇'[7 - s]!
  return b === NONE ? { ch, fg: a, bg: NONE, bold: false, inverse: true } : { ch, fg: b, bg: a, bold: false }
}

const lookOf = (cv: Canvas, i: number): Look => {
  if (cv.wide[i]) return WIDE
  const q = cv.quad, k = i * 4, a = q[k] === BG ? NONE : q[k]!, b = q[k + 1] === BG ? NONE : q[k + 1]!, c = q[k + 2] === BG ? NONE : q[k + 2]!, d = q[k + 3] === BG ? NONE : q[k + 3]!
  const ch = cv.ch[i]!, arms = cv.arms[i]!, braille = cv.braille[i]!, flat = a === b && b === c && c === d
  if (cv.smooth[i] && ch === null && !arms && !braille) { const look = smoothLook(cv, i); if (look) return look }
  if (ch === null && !arms && !braille && (a <= SHADE || b <= SHADE || c <= SHADE || d <= SHADE)) return solid(majority([a, b, c, d]))
  if (ch === null && !arms && !braille && flat && (a === NONE || cv.faint[i] !== NONE)) return cv.faint[i] !== NONE ? { ch: '·', fg: cv.faint[i]!, bg: a, bold: false } : BLANK
  let bg = flat ? a : majority([a, b, c, d])
  if (ch !== null) {
    const fg = cv.chColor[i]!, mark = ch === '■' && fg <= SHADE ? shadeOf(fg) : ch
    if (bg === FG) return { ch: mark, fg: NONE, bg: NONE, bold: cv.bold[i] === 1, inverse: true }
    return { ch: mark, fg: readable(cv, fg, bg), bg: bg <= SHADE ? NONE : bg, bold: cv.bold[i] === 1 }
  }
  const stub = arms === UP || arms === DOWN || arms === LEFT || arms === RIGHT
  if (arms && !(stub && braille)) {
    let box = (cv.square[i] && !cv.heavy[i] ? SQUARE[arms] : undefined) ?? BOX[cv.heavy[i] ? 'heavy' : 'light'][arms] ?? ' '
    if (cv.dashed[i] && arms === 5) box = '┆'
    if (cv.dashed[i] && arms === 10) box = '┄'
    let fg = cv.armColor[i]!
    if (cv.plot && !flat && cv.mark[i] === 1) return halfLook([a, b, c, d])
    if (!flat && (a === bg ? 1 : 0) + (b === bg ? 1 : 0) + (c === bg ? 1 : 0) + (d === bg ? 1 : 0) < 3) bg = NONE
    if (fg === bg && !cv.plot) return solid(bg)
    if (cv.plot && bg >= 0 && fg >= 0 && cv.paper >= 0 && contrast(fg, bg) < 3 && contrast(cv.paper, bg) > contrast(fg, bg)) fg = cv.paper
    return { ch: box, fg, bg, bold: false }
  }
  if (braille) return { ch: String.fromCharCode(0x2800 + braille), fg: cv.brailleColor[i]!, bg, bold: false }
  const mask = (a !== bg ? 1 : 0) | (b !== bg ? 2 : 0) | (c !== bg ? 4 : 0) | (d !== bg ? 8 : 0), other = a !== bg ? a : b !== bg ? b : c !== bg ? c : d !== bg ? d : NONE
  if (!mask) return solid(bg)
  if (bg === NONE) return { ch: QUADS[mask]!, fg: other, bg: NONE, bold: false }
  return other !== NONE ? { ch: QUADS[mask]!, fg: other, bg, bold: false } : { ch: QUADS[15 - mask]!, fg: bg, bg: NONE, bold: false }
}

const toArt = (cv: Canvas, type: string, limit = Infinity): PeleArt => {
  const looks = new Array<Look>(cv.cols * cv.rows).fill(BLANK)
  let minC = cv.cols, maxC = -1, minR = cv.rows, maxR = -1
  for (let i = cv.inked.indexOf(1); i >= 0; i = cv.inked.indexOf(1, i + 1)) {
    const look = looks[i] = lookOf(cv, i)
    if (look.ch === ' ' && look.bg === NONE) continue
    const c = i % cv.cols
    if (c < minC) minC = c
    if (c > maxC) maxC = c
    if (minR > maxR) minR = (i - c) / cv.cols
    maxR = (i - c) / cv.cols
  }
  if (maxC - minC >= limit) return { type, rows: [], art: '', width: maxC - minC + 1 }
  const rows: PeleSpan[][] = [], lines: string[] = []
  let width = 0
  const close = (spans: PeleSpan[], text: string, fg: Paint, bg: Paint, bold: boolean, inverse: boolean) => {
    const span: PeleSpan = { text }
    if (fg >= 0) span.fg = hex(fg)
    if (bg >= 0) span.bg = hex(bg)
    if (bold) span.bold = true
    if (inverse) span.inverse = true
    spans.push(span)
  }
  for (let r = minR; r <= maxR; r++) {
    const spans: PeleSpan[] = [], at = r * cv.cols
    let end = maxC, lineWidth = 0
    while (end >= minC && looks[at + end]!.ch === ' ' && looks[at + end]!.bg === NONE) end--
    let text = '', line = '', fg = NONE, bg = NONE, bold = false, inverse = false
    for (let c = minC; c <= end; c++) {
      if (looks[at + c] === BLANK && c > minC && fg === NONE && bg === NONE && !bold && !inverse) { text += ' '; line += ' '; lineWidth++; continue }
      const look = looks[at + c]!, ink = look.ch !== ' ' && look.ch !== ''
      const f = ink && look.fg >= 0 ? look.fg : NONE, b = look.bg >= 0 ? look.bg : NONE, strong = look.bold && ink, inv = look.inverse === true
      if (c > minC && f === fg && b === bg && strong === bold && inv === inverse) text += look.ch
      else {
        if (c > minC) close(spans, text, fg, bg, bold, inverse)
        text = look.ch; fg = f; bg = b; bold = strong; inverse = inv
      }
      if (look.ch) { line += look.ch; lineWidth += look.ch < 'ᄀ' || look.ch >= '\u2010' && look.ch < '\u2e80' ? 1 : charWidth(look.ch.codePointAt(0)!) }
    }
    if (end >= minC) close(spans, text, fg, bg, bold, inverse)
    rows.push(spans)
    lines.push(line)
    if (lineWidth > width) width = lineWidth
  }
  return { type, rows, art: lines.join('\n'), width }
}

export type PeleTheme = Partial<Record<'accent' | 'heading' | 'emphasis' | 'link' | 'path' | 'number' | 'quote' | 'codeFlag' | 'codeString' | 'codeComment' | 'codeText' | 'diagram' | 'diagramText', string>>

export const pelePalette = (theme: PeleTheme, canvas: string): PelePalette => {
  const series = [...new Set([theme.link, theme.number, theme.heading, theme.emphasis, theme.path, theme.codeFlag, theme.accent, theme.codeString].filter((c): c is string => !!c))]
  return { canvas, text: theme.diagramText ?? theme.codeText, muted: theme.quote ?? theme.codeComment, line: theme.diagram, border: theme.diagram, accent: theme.accent, critical: theme.codeFlag, highlight: theme.emphasis ?? theme.accent, series, hues: series }
}

const GAP = 40, SEQUENCE: { wrap?: boolean; sequence: { actorMargin: number; width?: number } }[] = [{ sequence: { actorMargin: GAP } }, { sequence: { actorMargin: 2 * CW } }, ...[12, 9, 6].map(w => ({ wrap: true, sequence: { actorMargin: 2 * CW, width: w * CW } })), { wrap: true, sequence: { actorMargin: CW, width: 6 * CW } }]

export const drawPele = (render: PeleRender, source: string, palette: PelePalette, columns: number): PeleArt | null => {
  try {
    const layout = (options: Record<string, unknown>) => render(source, { measurer, fontSize: FONT, padding: 0, ...options })
    const paint = (result: { svg: string; type: string }, limit?: number, tight = false) => {
      const cv = draw(result.svg, palette, false, limit, tight)
      if (!cv || cv.clash && !rotated(result.svg)) return null
      const art = toArt(cv, result.type, rotated(result.svg) ? Infinity : columns)
      if (art.width > columns && rotated(result.svg)) {
        const stacked = draw(result.svg, palette, true, Infinity, tight)
        if (stacked && !stacked.clash) return toArt(stacked, result.type)
      }
      return cv.clash ? null : art
    }
    const seen = new Map<string, PeleArt | null>(), picture = (result: { svg: string; type: string }, limit?: number) => (seen.has(result.svg) ? seen.get(result.svg) : seen.set(result.svg, paint(result, limit)).get(result.svg))
    let cells = Math.max(20, columns), wide = 0, fitAt = 0, fit: PeleArt | null = null, last = '', stuck = 0, leapt = false, probed = false, near: { svg: string; type: string } | null = null, over = 5
    const squeeze = () => { const art = near && paint(near, undefined, true); return art && art.width <= columns ? art : null }
    if (/^\s*sequenceDiagram\b/m.test(source)) {
      let natural = 0, actors = 0
      for (const config of SEQUENCE) {
        const { actorMargin, width = 0 } = config.sequence, room = (columns + 3) * CW
        if (Math.max((actors - 1) * (width + actorMargin), config === SEQUENCE[1] ? natural - (actors - 1) * (GAP - actorMargin) : 0) > room) continue
        const next = layout({ config })
        if (!actors) { natural = next.width; actors = next.svg.split('class="pele-lifeline"').length - 1 }
        const art = next.width <= room ? picture(next, columns) : null
        if (art?.rows.length && art.width <= columns) return art
      }
      return null
    }
    for (let tries = 0; tries < 6; tries++) {
      const result = layout({ maxWidth: cells * CW, directionBreakpoint: tries ? Infinity : undefined }), same = result.svg === last, probe: boolean = !fit && !probed && cells > 20 && result.width > cells * CW
      const pinned = probe && layout({ maxWidth: 20 * CW, directionBreakpoint: Infinity }).svg === result.svg, art = picture(result, pinned && !rotated(result.svg) ? columns + over : undefined)
      probed ||= probe; last = result.svg
      if (!art?.width) return fit ?? squeeze()
      if (art.width <= columns) { fit = art; fitAt = cells } else { wide = cells; if (art.width - columns < over) [near, over] = [result, art.width - columns] }
      if (fit && (!leapt || wide - fitAt <= 1)) return fit
      if (pinned && !fit) return squeeze()
      stuck = same ? stuck + 1 : 0
      leapt ||= stuck > 1
      const next = fit ? (fitAt + wide) >> 1 : Math.max(20, cells - Math.max(art.width - columns, stuck > 1 ? Math.ceil((cells - 20) / 2) : 0))
      if (next === cells) return fit ?? squeeze()
      cells = next
    }
    return fit ?? squeeze()
  } catch {
    return null
  }
}
