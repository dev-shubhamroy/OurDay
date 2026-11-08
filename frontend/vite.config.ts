import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'

/** After the build: stamp the service worker with a build id and the list of emitted assets to precache. */
function ourdaySw(): Plugin {
  let outDir = 'dist'
  return {
    name: 'ourday-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const assets = readdirSync(join(outDir, 'assets')).filter((f) => !f.endsWith('.map') && !/-(cyrillic|greek|vietnamese)/.test(f)).map((f) => `/assets/${f}`)
      const extra = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-192.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png']
      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const build = String(Array.from(html + assets.join()).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0)
      const p = join(outDir, 'sw.js')
      writeFileSync(p, `self.__PRECACHE__ = ${JSON.stringify([...assets, ...extra])};\n` + readFileSync(p, 'utf8').replace("const BUILD = '__BUILD__'", `const BUILD = '${build}'`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ourdaySw()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
