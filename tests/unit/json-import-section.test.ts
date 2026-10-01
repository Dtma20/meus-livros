// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import JsonImportSection from '../../app/components/log/JsonImportSection.vue'

class ControlledReader {
  static instances: ControlledReader[] = []
  result: string | null = null
  onload: FileReader['onload'] = null
  onerror: FileReader['onerror'] = null
  aborted = false

  constructor() { ControlledReader.instances.push(this) }
  readAsText(_file: File): void {}
  abort(): void { this.aborted = true }
  finish(title: string): void {
    this.result = JSON.stringify([{ title, author: 'Autora' }])
    const event = new ProgressEvent('load')
    Object.defineProperty(event, 'target', { value: this })
    this.onload?.call(this as unknown as FileReader, event as ProgressEvent<FileReader>)
  }
  fail(): void {
    this.onerror?.call(this as unknown as FileReader, new ProgressEvent('error') as ProgressEvent<FileReader>)
  }
}

let app: App | null = null
let container: HTMLDivElement

beforeEach(() => {
  ControlledReader.instances = []
  vi.stubGlobal('FileReader', ControlledReader)
  container = document.createElement('div')
  document.body.appendChild(container)
  app = createApp(JsonImportSection)
  app.component('NuxtLink', defineComponent({ setup: (_props, { slots }) => () => h('a', { href: '/' }, slots.default?.()) }))
  app.mount(container)
})

afterEach(() => {
  app?.unmount()
  app = null
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function selectFile(name: string, type = 'application/json'): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['test'], name, { type })] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

describe('JSON import preview lifecycle', () => {
  it('does not create a feedback timer when clipboard completion follows unmount', async () => {
    vi.useFakeTimers()
    let finishCopy!: () => void
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>((resolve) => { finishCopy = resolve }))
    container.querySelector<HTMLButtonElement>('.btn-copy-template')!.click()
    app!.unmount()
    app = null
    finishCopy()
    await nextTick()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('explains clipboard failure while keeping the model available to copy manually', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'))
    container.querySelector<HTMLButtonElement>('.btn-copy-template')!.click()
    await nextTick()
    await nextTick()
    expect(container.querySelector('.copy-feedback')?.textContent).toContain('Selecione o modelo abaixo')
    expect(container.querySelector('.guide-code')?.textContent).toContain('Dom Casmurro')
  })

  it('clears the previous valid preview when a replacement file is invalid', async () => {
    await selectFile('valid.json')
    ControlledReader.instances[0]!.finish('Livro anterior')
    await nextTick()
    expect(container.querySelector('.preview-item-title')?.textContent).toBe('Livro anterior')

    await selectFile('invalid.txt', 'text/plain')
    expect(container.querySelector('.error-banner')?.textContent).toContain('.json')
    expect(container.querySelector('.preview-section')).toBeNull()
    expect(container.querySelector('.btn-import')).toBeNull()
  })

  it('ignores an older file read that completes after the replacement', async () => {
    await selectFile('old.json')
    const old = ControlledReader.instances[0]!
    await selectFile('latest.json')
    ControlledReader.instances[1]!.finish('Livro atual')
    old.finish('Livro antigo')
    await nextTick()

    expect(old.aborted).toBe(true)
    expect(container.querySelector('.preview-item-title')?.textContent).toBe('Livro atual')
  })

  it('reports a file read failure and offers no stale import action', async () => {
    await selectFile('failed.json')
    ControlledReader.instances[0]!.fail()
    await nextTick()
    expect(container.querySelector('.error-banner')?.textContent).toContain('ler o arquivo')
    expect(container.querySelector('.btn-import')).toBeNull()
  })

  it('aborts a pending read when the component is removed', async () => {
    await selectFile('pending.json')
    const reader = ControlledReader.instances[0]!
    app!.unmount()
    app = null
    expect(reader.aborted).toBe(true)
  })
})
