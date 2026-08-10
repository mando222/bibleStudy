import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// Read a PNG's dimensions from its IHDR chunk (8-byte signature, then width/height big-endian).
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!b.subarray(0, 8).equals(sig)) throw new Error('not a PNG')
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

describe('app icon asset', () => {
  it('build/icon.png exists', () => {
    expect(existsSync('build/icon.png')).toBe(true)
  })

  it('is a square PNG at least 512×512 (electron-builder needs this to generate .icns/.ico)', () => {
    const { width, height } = pngSize('build/icon.png')
    expect(width).toBe(height)
    expect(width).toBeGreaterThanOrEqual(512)
  })
})
