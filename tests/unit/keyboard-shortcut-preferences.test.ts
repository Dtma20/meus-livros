// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import ShortcutsDialog from '../../app/components/ui/ShortcutsDialog.vue'
import { FOCUS_SEARCH_EVENT, useKeyboardShortcuts } from '../../app/composables/useKeyboardShortcuts'

const STORAGE_KEY = 'ml:character-key-shortcuts-enabled'
const state = new Map<string, Ref<unknown>>()
const globals = globalThis as unknown as Record<string, unknown>
const openHelp = vi.fn()
const navigateTo = vi.fn()

function installNuxtState(): void {
  globals.useState = (key: string, init?: () => unknown): Ref<unknown> => {
    const existing = state.get(key)
    if (existing) return existing
    const value = ref(init ? init() : undefined)
    state.set(key, value)
    return value
  }
  globals.navigateTo = navigateTo
}

function mountShortcutSurface(withKeyboardHandler = false) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(defineComponent({
    setup() {
      if (withKeyboardHandler) {
        useKeyboardShortcuts({ profilePath: () => '/@diogo', openHelp })
      }
      const shortcutsRef = ref<{ open: () => void } | null>(null)
      return () => h('div', [
        h('button', {
          type: 'button',
          'data-testid': 'open-shortcuts',
          onClick: () => shortcutsRef.value?.open(),
        }, 'Atalhos de teclado'),
        h(ShortcutsDialog, { ref: shortcutsRef }),
      ])
    },
  }))
  app.mount(container)
  return {
    container,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

beforeEach(() => {
  state.clear()
  localStorage.clear()
  openHelp.mockClear()
  navigateTo.mockClear()
  installNuxtState()
})

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
})

describe('keyboard shortcut preference', () => {
  it('disables isolated keys and character-key sequences', async () => {
    localStorage.setItem(STORAGE_KEY, 'false')
    const wrapper = mountShortcutSurface(true)
    await nextTick()

    const letterShortcut = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })
    window.dispatchEvent(letterShortcut)
    const helpShortcut = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    window.dispatchEvent(helpShortcut)
    expect(navigateTo).not.toHaveBeenCalled()
    expect(openHelp).not.toHaveBeenCalled()
    expect(letterShortcut.defaultPrevented).toBe(false)
    expect(helpShortcut.defaultPrevented).toBe(false)
    const focusSearch = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, focusSearch)
    const searchShortcut = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    window.dispatchEvent(searchShortcut)
    expect(focusSearch).not.toHaveBeenCalled()
    expect(searchShortcut.defaultPrevented).toBe(false)
    window.removeEventListener(FOCUS_SEARCH_EVENT, focusSearch)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true }))
    expect(navigateTo).not.toHaveBeenCalled()
    expect(document.getElementById('ml-chord-hint')).toBeNull()
    wrapper.unmount()
  })

  it('cancels a started sequence immediately when the preference is turned off', async () => {
    const wrapper = mountShortcutSurface(true)
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
    expect(document.getElementById('ml-chord-hint')).not.toBeNull()

    const checkbox = wrapper.container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) throw new Error('character-key shortcut preference checkbox not found')
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    expect(document.getElementById('ml-chord-hint')).toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true }))
    expect(navigateTo).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('persists the accessible preference and leaves the dialog button available when disabled', async () => {
    const first = mountShortcutSurface()
    await nextTick()
    const openButton = first.container.querySelector<HTMLButtonElement>('[data-testid="open-shortcuts"]')
    if (!openButton) throw new Error('shortcuts dialog button not found')
    openButton.click()
    const dialog = first.container.querySelector<HTMLDialogElement>('dialog')
    expect(dialog?.open).toBe(true)

    const checkbox = first.container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) throw new Error('single-key shortcut preference checkbox not found')

    expect(first.container.querySelector('label')?.textContent).toContain('Desativar atalhos sem modificadores')
    expect(checkbox.checked).toBe(false)
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
    expect(first.container.textContent).toContain('Atalhos sem modificadores estão desativados')

    dialog?.close()
    await nextTick()
    openButton.click()
    expect(dialog?.open).toBe(true)
    first.unmount()

    state.clear()
    const second = mountShortcutSurface()
    await nextTick()
    const restoredCheckbox = second.container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(restoredCheckbox?.checked).toBe(true)
    second.unmount()
  })
})
