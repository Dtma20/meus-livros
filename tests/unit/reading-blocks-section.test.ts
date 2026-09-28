// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import ReadingBlocksSection from '../../app/components/log/ReadingBlocksSection.vue'

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
