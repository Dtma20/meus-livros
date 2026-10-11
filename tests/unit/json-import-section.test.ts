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
    this.finishItems([{ title, author: 'Autora' }])
  }
  finishItems(items: unknown[]): void {
    this.result = JSON.stringify(items)
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
  it('explains rejected items with their original positions', async () => {
    await selectFile('books.json')
    ControlledReader.instances[0]!.finishItems([
      { title: 'Livro 1', author: 'Autora 1' },
      { author: 'Autora sem título' },
      { title: 'Livro 3', author: 'Autora 3' },
    ])
    await nextTick()

    const rejectedItems = container.querySelector('.rejected-items')
    expect(rejectedItems?.textContent).toContain('1 itens ser\u00e3o ignorados:')
    expect(rejectedItems?.textContent).toContain('Item 2: Sem t\u00edtulo')
    expect(container.querySelectorAll('.preview-item')).toHaveLength(2)
  })

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

  it('disables import and displays the limit message when file exceeds 1000 books', async () => {
    await selectFile('exceeds-limit.json')
    const items = Array.from({ length: 1001 }, (_, i) => ({
      title: `Livro ${i + 1}`,
      author: 'Autora',
    }))
    ControlledReader.instances[0]!.finishItems(items)
    await nextTick()

    expect(container.querySelector('.error-banner')?.textContent).toContain(
      'O arquivo tem 1001 livros; o limite é 1000 por importação.',
    )
    expect(container.querySelector('.preview-section')).toBeNull()
    expect(container.querySelector('.btn-import')).toBeNull()
  })

  it('does not count an item with an empty title as valid', async () => {
    await selectFile('books.json')
    ControlledReader.instances[0]!.finishItems([
      { title: '', author: 'Autora' },
      { title: '   ', author: 'Autora 2' },
      { title: 'Livro Válido', author: 'Autora Válida' },
    ])
    await nextTick()

    expect(container.querySelector('.preview-title')?.textContent).toContain('1 livro encontrado')
    expect(container.querySelectorAll('.preview-item')).toHaveLength(1)
    expect(container.querySelector('.preview-item-title')?.textContent).toBe('Livro Válido')
  })
})

async function loadPreviewAndSubmit(): Promise<void> {
  await selectFile('ok.json')
  ControlledReader.instances[0]!.finish('Livro de teste')
  await nextTick()
  container.querySelector<HTMLButtonElement>('.btn-import')!.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('JSON import request and feedback', () => {
  it('sends the import with a 60 second timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ success: true, imported: 1, skipped: 0, errors: [] })
    vi.stubGlobal('$fetch', fetchMock)

    await loadPreviewAndSubmit()

    expect(fetchMock).toHaveBeenCalledWith('/api/library/import', expect.objectContaining({ timeout: 60_000 }))
  })

  it('shows the server message and the field details of a rejected import', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(Object.assign(new Error('Bad Request'), {
      data: {
        error: 'validacao',
        message: 'Formato do arquivo JSON inválido.',
        details: [{ path: ['books', 0, 'title'], message: 'O título é obrigatório.' }],
      },
    })))

    await loadPreviewAndSubmit()

    expect(container.querySelector('.error-banner')?.textContent).toContain('Formato do arquivo JSON inválido.')
    expect(container.querySelector('.issue-list-error')?.textContent).toContain('books.0.title: O título é obrigatório.')
  })

  it('lists the per-item errors and warnings of a successful import', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      success: true,
      imported: 1,
      skipped: 1,
      errors: ['Livro #2 ("Outro"): não foi possível importar. Motivo: data de leitura "15/03/2024" fora do padrão.'],
    }))

    await loadPreviewAndSubmit()

    expect(container.querySelector('.success-card')).not.toBeNull()
    const items = container.querySelectorAll('.import-issues .issue-list li')
    expect(items).toHaveLength(1)
    expect(items[0]?.textContent).toContain('Livro #2')
    expect(items[0]?.textContent).toContain('15/03/2024')
  })
})

describe('JSON import timeout', () => {
  const TIMEOUT_MESSAGE = 'A importação pode ter sido concluída mesmo assim. Confira sua biblioteca antes de enviar de novo.'

  // Shape ofetch gives a request that hit its own timeout: a FetchError whose cause is the TimeoutError.
  function timeoutError(): Error {
    const cause = Object.assign(new Error('[TimeoutError]: The operation was aborted due to timeout'), { name: 'TimeoutError' })
    return Object.assign(
      new Error('[POST] "/api/library/import": <no response> [TimeoutError]: The operation was aborted due to timeout'),
      { name: 'FetchError', cause },
    )
  }

  it('says the import may have been saved and keeps the import button disabled', async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError())
    vi.stubGlobal('$fetch', fetchMock)

    await loadPreviewAndSubmit()

    expect(container.querySelector('.error-banner')?.textContent).toContain(TIMEOUT_MESSAGE)
    expect(container.querySelector<HTMLButtonElement>('.btn-import')?.disabled).toBe(true)
    expect(container.querySelector('.btn-resend')).not.toBeNull()
  })

  it('sends the import again only from the explicit "Enviar mesmo assim" button', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ success: true, imported: 1, skipped: 0, errors: [] })
    vi.stubGlobal('$fetch', fetchMock)

    await loadPreviewAndSubmit()
    container.querySelector<HTMLButtonElement>('.btn-import')!.click()
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    container.querySelector<HTMLButtonElement>('.btn-resend')!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.success-card')).not.toBeNull()
  })

  it('enables the import again only after a different file is chosen', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(timeoutError()))
    await loadPreviewAndSubmit()

    await selectFile('novo.json')
    ControlledReader.instances[1]!.finish('Livro novo')
    await nextTick()

    expect(container.querySelector('.error-banner')).toBeNull()
    expect(container.querySelector('.btn-resend')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.btn-import')?.disabled).toBe(false)
  })
})
