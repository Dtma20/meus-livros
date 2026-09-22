// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { SearchResult } from '../../shared/schemas/search'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-log-form-id'
  globalScope.navigateTo = () => {}
})

/**
 * Draft persistence, and what happens to typed text when a save fails.
 *
 * TASK-013 singles this out: losing a 900-character review to a network blip is
 * the kind of failure that makes someone stop using a product permanently. It
 * is the most important behaviour of this form, so it is the one behaviour that
 * gets tested directly rather than inferred from the code.
 */

const DRAFT_KEY = 'meus-livros:log-draft'

const WORK: SearchResult = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'a-obra',
  title: 'A Obra',
  authors: [{ name: 'Autora', slug: 'autora' }],
  first_published_year: 1999,
  cover_url: null,
  log_count: 0,
  source: 'local',
}

let LogForm: unknown

async function mountForm(props: Record<string, unknown> = {}) {
  if (!LogForm) {
    LogForm = (await import('../../app/components/log/LogForm.vue')).default
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = createApp(LogForm as any, { mode: 'create', initialWork: WORK, ...props })
  app.mount(host)
  await nextTick()
  await nextTick()
  return {
    host,
    text: () => host.textContent ?? '',
    textarea: () => host.querySelector('textarea'),
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

/** Types into the review textarea the way a person would, so the watcher fires. */
async function typeReview(
  form: { textarea: () => HTMLTextAreaElement | null },
  text: string,
) {
  const el = form.textarea()
  if (!el) throw new Error('A textarea da resenha não foi encontrada.')
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  await nextTick()
  return el
}

describe('LogForm — draft persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async () => ({ id: 'log-1' }))
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('writes the typed review to localStorage', async () => {
    const form = await mountForm()
    await typeReview(form, 'Uma resenha que levou tempo para escrever.')

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).review).toBe('Uma resenha que levou tempo para escrever.')
    form.unmount()
  })

  it('restores the draft after a reload', async () => {
    const first = await mountForm()
    await typeReview(first, 'Metade de um parágrafo, interrompido.')
    first.unmount()

    // A reload is a fresh mount against the same storage.
    const second = await mountForm()
    expect(second.textarea()?.value).toBe('Metade de um parágrafo, interrompido.')
    second.unmount()
  })

  it('keeps the typed review in the textarea when saving fails', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async () => {
      throw new Error('network down')
    })

    const form = await mountForm()
    const typed = 'Novecentos caracteres de opinião sobre um livro.'
    await typeReview(form, typed)

    const submit = form.host.querySelector('form')
    submit?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()

    // Guard against a vacuous pass: if the request never went out, this test
    // proves nothing about what happens when it fails.
    expect(globalScope.$fetch).toHaveBeenCalledTimes(1)

    // The text survives, and so does the draft: nothing was saved, so there is
    // nothing to clear.
    expect(form.textarea()?.value).toBe(typed)
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).review).toBe(typed)
    form.unmount()
  })

  it('clears the draft only after the save is confirmed', async () => {
    const form = await mountForm()
    await typeReview(form, 'Resenha que vai ser salva.')
    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy()

    const submit = form.host.querySelector('form')
    submit?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()

    const globalScope = globalThis as unknown as Record<string, unknown>
    expect(globalScope.$fetch).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    form.unmount()
  })

  it('still works when localStorage throws', async () => {
    // Private windows and blocked site data make every accessor throw. The form
    // has to render and accept input anyway; it just cannot remember anything.
    const throwing = () => {
      throw new Error('storage disabled')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwing)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwing)

    const form = await mountForm()
    const el = await typeReview(form, 'Digitado sem armazenamento disponível.')

    expect(el.value).toBe('Digitado sem armazenamento disponível.')
    expect(form.text()).toContain('A Obra')
    form.unmount()
  })
})
