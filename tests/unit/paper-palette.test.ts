import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('app/assets/css/tokens.css', 'utf8')

function color(token: string): string {
  const value = css.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim()
  if (!value) throw new Error(`Missing color: ${token}`)
  const alias = value.match(/^var\((--[\w-]+)\)$/)?.[1]
  return alias ? color(alias) : value
}

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? [...raw].map(char => char + char).join('') : raw
  const channels = [0, 2, 4].map(offset => {
    const channel = Number.parseInt(full.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

describe('Paper identity contrast', () => {
  for (const surface of ['--bg-color', '--card-bg', '--input-bg', '--surface-raised', '--surface-hover']) {
    for (const text of ['--text-strong', '--text-bright', '--text-color', '--text-muted', '--highlight', '--danger-text', '--success']) {
      it(`${text} remains readable on ${surface}`, () => {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps primary action labels readable in default and hover states', () => {
    expect(contrast('--on-highlight', '--highlight')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('--on-highlight', '--highlight-hover')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps solid destructive action labels readable', () => {
    expect(contrast('--on-danger', '--danger-solid')).toBeGreaterThanOrEqual(4.5)
  })
})
