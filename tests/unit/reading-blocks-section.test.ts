import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import ReadingBlocksSection from '../../app/components/log/ReadingBlocksSection.vue'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useState = (_key: string, init?: () => unknown) => ({ value: init ? init() : null })
})

const mounted: Array<{ app: App; container: HTMLElement }> = []

function mount(props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(ReadingBlocksSection, props)
  app.mount(container)
  mounted.push({ app, container })
  return container
}

function buttonsMatching(container: HTMLElement, text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes(text))
}

const finishedProgress = {
  pages_read: 224,
  current_page: 224,
  total_pages: 224,
  percentage: 100,
  is_complete: true,
}

afterEach(() => {
  while (mounted.length) {
    const entry = mounted.pop()
    entry?.app.unmount()
    entry?.container.remove()
  }
})

describe('ReadingBlocksSection', () => {
  it('shows only the one-line summary to a visitor on a finished log without blocks', () => {
    const container = mount({
      logId: 'log-1',
      initialBlocks: [],
      initialProgress: finishedProgress,
      isOwner: false,
      editionPageCount: 224,
      isFinished: true,
    })

    expect(container.textContent?.trim()).toBe('Lido por completo · 224 págs.')
    expect(container.querySelector('.finished-summary')).not.toBeNull()
    expect(container.querySelector('section')).toBeNull()
    expect(container.querySelector('h2')).toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.textContent).not.toContain('Registrar')
    expect(container.textContent).not.toContain('Nenhum trecho')
  })

  it('falls back to the edition page count when progress has no total', () => {
    const container = mount({
      logId: 'log-1',
      initialProgress: { ...finishedProgress, total_pages: null, percentage: null },
      isOwner: false,
      editionPageCount: 310,
      isFinished: true,
    })

    expect(container.textContent?.trim()).toBe('Lido por completo · 310 págs.')
  })

  it('renders nothing for a visitor when the page count is unknown', () => {
    const container = mount({
      logId: 'log-1',
      initialProgress: { ...finishedProgress, total_pages: null, percentage: null },
      isOwner: false,
      editionPageCount: null,
      isFinished: true,
    })

    expect(container.textContent?.trim()).toBe('')
    expect(container.querySelector('section')).toBeNull()
    expect(container.querySelector('p')).toBeNull()
  })

  it('keeps the full section and the Registrar actions for the owner', () => {
    const container = mount({
      logId: 'log-1',
      initialBlocks: [],
      initialProgress: finishedProgress,
      isOwner: true,
      editionPageCount: 224,
      isFinished: true,
    })

    expect(container.querySelector('section.reading-blocks-container')).not.toBeNull()
    expect(container.querySelector('.finished-summary')).toBeNull()
    expect(buttonsMatching(container, 'Registrar').length).toBeGreaterThan(0)
  })

  it('keeps the progress section for a visitor while the log is not finished', () => {
    const container = mount({
      logId: 'log-1',
      initialBlocks: [],
      initialProgress: { ...finishedProgress, pages_read: 0, current_page: 0, percentage: 0, is_complete: false },
      isOwner: false,
      editionPageCount: 224,
      isFinished: false,
    })

    expect(container.querySelector('section.reading-blocks-container')).not.toBeNull()
    expect(container.querySelector('.finished-summary')).toBeNull()
    expect(buttonsMatching(container, 'Registrar')).toHaveLength(0)
  })

  it('keeps the blocks list for a visitor on a finished log with blocks', () => {
    const container = mount({
      logId: 'log-1',
      initialBlocks: [
        { id: 'b1', start_page: 1, end_page: 20, comment: 'Começo lento.', read_at: '2026-09-01' },
      ],
      initialProgress: finishedProgress,
      isOwner: false,
      editionPageCount: 224,
      isFinished: true,
    })

    expect(container.querySelector('section.reading-blocks-container')).not.toBeNull()
    expect(container.querySelector('.finished-summary')).toBeNull()
    expect(container.textContent).toContain('Começo lento.')
  })
})

const inProgress = {
  pages_read: 20,
  current_page: 20,
  total_pages: 336,
  percentage: 6,
  is_complete: false,
}

const BLOCK = { id: 'b1', start_page: 1, end_page: 20, comment: 'Começo lento.', read_at: '2026-09-01' }

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

function setNumber(container: HTMLElement, id: string, value: string): void {
  const el = container.querySelector<HTMLInputElement>(`#${id}`)
  if (!el) throw new Error(`Campo ${id} não encontrado.`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ReadingBlocksSection - block form validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows one error per field, marks them invalid and focuses the first', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const container = mount({
      logId: 'log-1',
      initialBlocks: [],
      initialProgress: { ...inProgress, pages_read: 0, current_page: 0, percentage: 0 },
      isOwner: true,
      editionPageCount: 336,
    })
    buttonsMatching(container, 'Registrar trecho lido')[0]?.click()
    await flush()

    setNumber(container, 'block-start-page', '0')
    setNumber(container, 'block-end-page', '400')
    const note = container.querySelector<HTMLTextAreaElement>('#block-comment')
    if (!note) throw new Error('Campo de anotação não encontrado.')
    note.value = 'a'.repeat(5001)
    note.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()

    const start = container.querySelector('#block-start-page')
    const end = container.querySelector('#block-end-page')
    expect(start?.getAttribute('aria-invalid')).toBe('true')
    expect(start?.getAttribute('aria-describedby')).toBe('block-start-page-error')
    expect(end?.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('#block-end-page-error')?.textContent).toBe('Página final: o livro tem 336 páginas.')
    expect(note.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('#block-comment-error')?.textContent).toContain('limite é 5.000')
    expect(document.activeElement).toBe(start)
    expect(note.value).toHaveLength(5001)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ReadingBlocksSection - delete with undo', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function mountOwnerWithBlock() {
    return mount({
      logId: 'log-1',
      initialBlocks: [BLOCK],
      initialProgress: inProgress,
      isOwner: true,
      editionPageCount: 336,
    })
  }

  it('removes the block at once, offers Desfazer and never asks window.confirm', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', confirmMock)
    const container = mountOwnerWithBlock()

    buttonsMatching(container, 'Excluir')[0]?.click()
    await flush()

    expect(container.textContent).not.toContain('Começo lento.')
    const undo = buttonsMatching(container, 'Desfazer')[0]
    expect(undo).toBeDefined()
    expect(document.activeElement).toBe(undo)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Trecho removido. Desfazer em 6 segundos.')
    expect(confirmMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    undo?.click()
    await flush()
    vi.advanceTimersByTime(7000)
    await flush()

    expect(container.textContent).toContain('Começo lento.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the DELETE only when the countdown ends', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = mountOwnerWithBlock()

    buttonsMatching(container, 'Excluir')[0]?.click()
    await flush()
    vi.advanceTimersByTime(5000)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe('/api/logs/log-1/blocks/b1')
    expect(buttonsMatching(container, 'Desfazer')).toHaveLength(0)
  })

  it('restores the block and shows the error when the DELETE fails', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Falhou.' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = mountOwnerWithBlock()

    buttonsMatching(container, 'Excluir')[0]?.click()
    await flush()
    vi.advanceTimersByTime(6000)
    await vi.runAllTimersAsync()
    await flush()

    expect(container.textContent).toContain('Começo lento.')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('O trecho voltou para a lista.')
  })

  it('sends the DELETE right away when the section unmounts during the countdown', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    mountOwnerWithBlock()
    const entry = mounted[mounted.length - 1]

    const container = entry?.container as HTMLElement
    buttonsMatching(container, 'Excluir')[0]?.click()
    await flush()
    entry?.app.unmount()
    mounted.pop()
    container.remove()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('restores the block when a pagehide DELETE fails and the page returns from the back-forward cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Falhou.' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = mountOwnerWithBlock()

    buttonsMatching(container, 'Excluir')[0]?.click()
    await flush()
    window.dispatchEvent(new Event('pagehide'))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1]).toMatchObject({ keepalive: true })
    expect(container.textContent).not.toContain('Começo lento.')

    const pageshow = new Event('pageshow')
    Object.defineProperty(pageshow, 'persisted', { value: true })
    window.dispatchEvent(pageshow)
    await flush()

    expect(container.textContent).toContain('Começo lento.')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('O trecho voltou para a lista.')
  })

  it('restores overlapping optimistic deletes in source order without clearing the newer undo', async () => {
    vi.useFakeTimers()
    let rejectFirst: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { rejectFirst = resolve }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = mount({
      logId: 'log-1',
      initialBlocks: [
        BLOCK,
        { id: 'b2', start_page: 21, end_page: 40, comment: 'Continuação.', read_at: '2026-09-02' },
      ],
      initialProgress: inProgress,
      isOwner: true,
      editionPageCount: 336,
    })

    container.querySelector<HTMLElement>('[data-block-id="b1"] .btn-icon-delete')?.click()
    await flush()
    container.querySelector<HTMLElement>('[data-block-id="b2"] .btn-icon-delete')?.click()
    await flush()
    expect(buttonsMatching(container, 'Desfazer')).toHaveLength(1)

    rejectFirst?.(new Response(JSON.stringify({ message: 'Falhou a primeira exclusão.' }), { status: 500 }))
    await flush()
    expect(buttonsMatching(container, 'Desfazer')).toHaveLength(1)

    buttonsMatching(container, 'Desfazer')[0]?.click()
    await flush()
    const order = Array.from(container.querySelectorAll<HTMLElement>('.block-card')).map(card => card.dataset.blockId)
    expect(order).toEqual(['b1', 'b2'])
    expect(document.activeElement).toBe(container.querySelector('[data-block-id="b2"] .btn-icon-delete'))
  })

  it('keeps active form fields when the parent refreshes the block snapshot', async () => {
    const container = mount({
      logId: 'log-1',
      initialBlocks: [BLOCK],
      initialProgress: inProgress,
      isOwner: true,
      editionPageCount: 336,
    })
    buttonsMatching(container, 'Registrar trecho lido')[0]?.click()
    await flush()
    const comment = container.querySelector<HTMLTextAreaElement>('#block-comment')
    if (!comment) throw new Error('Campo de anotação não encontrado.')
    comment.value = 'Meu rascunho local.'
    comment.dispatchEvent(new Event('input', { bubbles: true }))

    expect(comment.value).toBe('Meu rascunho local.')
    expect(container.textContent).toContain('Começo lento.')
  })
})
