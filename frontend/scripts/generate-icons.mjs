// Renders the OurDay robot mark to PNG icons with no external dependencies (SDF + supersampling + zlib).
// Run: node scripts/generate-icons.mjs   (outputs to public/icons)
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const C = { top: hex('#1a2a42'), bot: hex('#080d18'), face: hex('#0b1220'), cyan: hex('#27c8ff') }

const sdRound = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const over = (dst, src, a) => dst.map((v, i) => v + (src[i] - v) * a)

/** Design space is the 64x64 favicon. `scale` shrinks the glyph (maskable safe zone); `full` fills the whole square. */
function render(size, { full, scale }) {
  const SS = 3
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0], alpha = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((x + (sx + 0.5) / SS) / size) * 64, v = ((y + (sy + 0.5) / SS) / size) * 64
      const bgIn = full ? 1 : sdRound(u, v, 32, 32, 32, 32, 18) < 0 ? 1 : 0
      if (!bgIn) continue
      let col = mix(C.top, C.bot, Math.min(1, Math.max(0, (u + v) / 128)))
      const gu = 32 + (u - 32) / scale, gv = 32 + (v - 32) / scale
      const face = sdRound(gu, gv, 32, 33, 20, 13, 12)
      if (face < 0) col = C.face
      if (Math.abs(face + 1) < 1) col = over(col, C.cyan, 0.5)
      for (const ex of [24.5, 39.5]) if (sdRound(gu, gv, ex, 33.5, 3.5, 4.5, 3.5) < 0) col = C.cyan
      acc = acc.map((a, i) => a + col[i]); alpha++
    }
    const o = (y * size + x) * 4
    if (alpha) { buf[o] = acc[0] / alpha; buf[o + 1] = acc[1] / alpha; buf[o + 2] = acc[2] / alpha; buf[o + 3] = Math.round((alpha / (SS * SS)) * 255) }
  }
  return buf
}

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
const jobs = [
  ['icon-192.png', 192, { full: false, scale: 1 }],
  ['icon-512.png', 512, { full: false, scale: 1 }],
  // Maskable: full-bleed background, glyph inside the central 80% safe zone.
  ['maskable-192.png', 192, { full: true, scale: 0.8 }],
  ['maskable-512.png', 512, { full: true, scale: 0.8 }],
  ['apple-touch-icon.png', 180, { full: true, scale: 0.86 }],
  ['favicon-32.png', 32, { full: false, scale: 1 }],
  ['shortcut-96.png', 96, { full: false, scale: 1 }],
]
for (const [name, size, opt] of jobs) writeFileSync(new URL(name, out), png(size, render(size, opt)))
console.log('wrote', jobs.length, 'icons')
