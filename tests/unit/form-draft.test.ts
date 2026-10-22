// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { clearStoredFormDrafts, createFormDraftKey } from '../../app/composables/useFormDraft'

afterEach(() => {
  window.localStorage.clear()
})

describe('clearStoredFormDrafts', () => {
  it('removes every scoped and legacy form draft and keeps unrelated keys', () => {
    const logKey = createFormDraftKey('log', 'user-a', 'create', 'novo')
    const bookKey = createFormDraftKey('add-book', 'user-b', 'create', 'novo')
    window.localStorage.setItem(logKey!, '{"review":"privada"}')
    window.localStorage.setItem(bookKey!, '{"title":"x"}')
    window.localStorage.setItem('meus-livros:log-draft', '{"review":"antiga"}')
    window.localStorage.setItem('meus-livros:add-book-draft', '{"title":"antigo"}')
    window.localStorage.setItem('ml:character-key-shortcuts-enabled', 'false')
    window.localStorage.setItem('meus-livros:map-open', 'true')

    clearStoredFormDrafts(window.localStorage)

    expect(window.localStorage.getItem(logKey!)).toBeNull()
    expect(window.localStorage.getItem(bookKey!)).toBeNull()
    expect(window.localStorage.getItem('meus-livros:log-draft')).toBeNull()
    expect(window.localStorage.getItem('meus-livros:add-book-draft')).toBeNull()
    expect(window.localStorage.getItem('ml:character-key-shortcuts-enabled')).toBe('false')
    expect(window.localStorage.getItem('meus-livros:map-open')).toBe('true')
  })
})
