// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import DiscussionThread from '../../app/components/comments/DiscussionThread.vue'

const fetchMock = vi.fn()
const session = ref<{ user: { id: string } | null }>({ user: { id: 'member' } })
const mounted: (() => void)[] = []
const comment = { id: 'c1', log_id: 'log1', block_id: null, body: '<script>texto</script>', created_at: '2026-10-01T12:00:00Z', user: { handle: 'leitor', display_name: 'Leitor' }, can_delete: true }

function mount(props: { logId: string; blockId?: string; initiallyOpen?: boolean } = { logId: 'log1' }) {
  const currentProps = ref(props)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: () => h(DiscussionThread, currentProps.value) })
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (p, { slots }) => () => h('a', { href: p.to }, slots.default?.()) }))
  app.mount(container)
  mounted.push(() => { app.unmount(); container.remove() })
  return { container, currentProps }
}
async function flush() { for (let i = 0; i < 5; i++) await nextTick() }
function button(container: Element, label: string) {
  const found = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function write(container: Element, value: string) {
  const textarea = container.querySelector('textarea')!
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}
async function submit(container: Element) {
  container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ comments: [], nextCursor: null })
  session.value = { user: { id: 'member' } }
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useState', () => session)
})
afterEach(() => { mounted.splice(0).forEach((dispose) => dispose()); vi.unstubAllGlobals() })

describe('DiscussionThread', () => {
  it('loads only when expanded and scopes requests to the selected reading block', async () => {
    const { container } = mount({ logId: 'log1', blockId: 'block1' })
    expect(fetchMock).not.toHaveBeenCalled()
    button(container, 'Comentários').click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/logs/log1/comments', expect.objectContaining({ query: expect.objectContaining({ block_id: 'block1' }) }))
    expect(container.textContent).toContain('Nenhum comentário ainda.')
  })
  it('renders comment content as escaped text and fetches the next page', async () => {
    fetchMock.mockResolvedValueOnce({ comments: [comment], nextCursor: 'next' }).mockResolvedValueOnce({ comments: [{ ...comment, id: 'c2', body: 'Outro' }], nextCursor: null })
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    expect(container.textContent).toContain('<script>texto</script>')
    expect(container.querySelector('script')).toBeNull()
    button(container, 'Carregar mais comentários').click()
    await flush()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/logs/log1/comments', expect.objectContaining({ query: expect.objectContaining({ cursor: 'next' }) }))
    expect(container.textContent).toContain('Outro')
  })
  it('keeps the draft after a failed submit and clears it after a successful retry', async () => {
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    await write(container, ' Minha resposta ')
    fetchMock.mockRejectedValueOnce({ data: { message: 'Falha de conexão.' } })
    await submit(container)
    expect(container.querySelector('textarea')!.value).toBe(' Minha resposta ')
    expect(container.textContent).toContain('Falha de conexão.')
    fetchMock.mockResolvedValueOnce({ ...comment, body: 'Minha resposta' })
    await submit(container)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/logs/log1/comments', expect.objectContaining({ method: 'POST', body: { body: 'Minha resposta', block_id: null } }))
    expect(container.querySelector('textarea')!.value).toBe('')
    expect(container.textContent).toContain('Minha resposta')
  })
  it('preserves microsecond ordering across pages and a newly submitted comment', async () => {
    const earlier = { ...comment, id: 'c9', body: 'Primeiro', created_at: '2026-10-01T12:00:00.123001Z' }
    const later = { ...comment, id: 'c1', body: 'Segundo', created_at: '2026-10-01T12:00:00.123999Z' }
    const newest = { ...comment, id: 'c3', body: 'Terceiro', created_at: '2026-10-01T12:01:00.000001Z' }
    fetchMock.mockResolvedValueOnce({ comments: [earlier], nextCursor: 'next' }).mockResolvedValueOnce(newest).mockResolvedValueOnce({ comments: [later, newest], nextCursor: null })
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    await write(container, 'Terceiro')
    await submit(container)
    button(container, 'Carregar mais comentários').click()
    await flush()
    expect(Array.from(container.querySelectorAll('.discussion-body'), (element) => element.textContent)).toEqual(['Primeiro', 'Segundo', 'Terceiro'])
  })
  it('rejects blank or oversized comments without sending a mutation', async () => {
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    await write(container, '   ')
    await submit(container)
    await write(container, 'x'.repeat(2001))
    await submit(container)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('2.000')
  })
  it('asks before deletion and removes the comment only after server confirmation', async () => {
    fetchMock.mockResolvedValueOnce({ comments: [comment], nextCursor: null }).mockResolvedValueOnce({ ok: true })
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    button(container, 'Excluir').click()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    button(container, 'Excluir comentário').click()
    await flush()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/logs/log1/comments/c1', expect.objectContaining({ method: 'DELETE' }))
    expect(container.textContent).not.toContain('<script>texto</script>')
  })
  it('offers login instead of a form to anonymous readers', async () => {
    session.value = { user: null }
    const { container } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('a[href="/entrar"]')).not.toBeNull()
  })
  it('discards an old response when the thread target changes', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const { container, currentProps } = mount({ logId: 'log1', initiallyOpen: true })
    await flush()
    currentProps.value = { logId: 'log2', initiallyOpen: true }
    await flush()
    resolve({ comments: [comment], nextCursor: null })
    await flush()
    expect(container.textContent).not.toContain('<script>texto</script>')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/logs/log2/comments', expect.anything())
  })
})
