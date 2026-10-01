import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useKeyboardShortcutPreferences } from './useKeyboardShortcutPreferences'

export const FOCUS_SEARCH_EVENT = 'ml:focus-search'

interface ShortcutOptions {
  profilePath: () => string
  openHelp: () => void
}

const CHORD_WINDOW_MS = 2500

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

const HINT_ID = 'ml-chord-hint'

function showChordHint(): void {
  if (document.getElementById(HINT_ID)) return
  const hint = document.createElement('div')
  hint.id = HINT_ID
  hint.setAttribute('role', 'status')
  hint.setAttribute('aria-live', 'polite')
  hint.style.cssText = [
    'position:fixed',
    'right:var(--space-4,16px)',
    'bottom:var(--space-4,16px)',
    'z-index:200',
    'max-width:calc(100vw - 32px)',
    'padding:var(--space-2,8px) var(--space-3,12px)',
    'background:var(--card-bg)',
    'color:var(--text-bright)',
    'border:1px solid var(--input-bg)',
    'border-radius:var(--radius-sm,6px)',
    'font-size:var(--font-size-sm,0.875rem)',
  ].join(';')
  const kbd = document.createElement('kbd')
  kbd.textContent = 'g'
  kbd.style.cssText = 'font-family:inherit;padding:0 var(--space-1,4px);border:1px solid var(--input-bg);border-radius:var(--radius-sm,6px)'
  hint.append(kbd, ' … i Início · a Atividade · m Membros · p Perfil')
  document.body.appendChild(hint)
}

function hideChordHint(): void {
  document.getElementById(HINT_ID)?.remove()
}

export function useKeyboardShortcuts(options: ShortcutOptions): void {
  const { characterKeyShortcutsEnabled } = useKeyboardShortcutPreferences()
  let chordTimer: ReturnType<typeof setTimeout> | null = null
  let awaitingChord = false

  function clearChord(): void {
    awaitingChord = false
    hideChordHint()
    if (chordTimer) clearTimeout(chordTimer)
    chordTimer = null
  }

  watch(characterKeyShortcutsEnabled, (enabled) => {
    if (!enabled) clearChord()
  }, { flush: 'sync' })

  function onKeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    if (isTypingTarget(e.target)) return
    if (document.querySelector('dialog[open]')) return
    if (!characterKeyShortcutsEnabled.value) return

    if (awaitingChord && e.key === 'Escape') {
      clearChord()
      return
    }

    if (awaitingChord) {
      const routes: Record<string, () => string> = {
        i: () => '/',
        a: () => '/atividade',
        m: () => '/membros',
        p: options.profilePath,
      }
      const dest = routes[e.key]
      clearChord()
      if (dest) {
        e.preventDefault()
        void navigateTo(dest())
        return
      }
    }

    if (e.key === 'g') {
      awaitingChord = true
      showChordHint()
      chordTimer = setTimeout(clearChord, CHORD_WINDOW_MS)
      return
    }

    if (e.key === '/') {
      e.preventDefault()
      window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))
    }
    else if (e.key === '?') {
      e.preventDefault()
      options.openHelp()
    }
    else if (e.key === 'n') {
      e.preventDefault()
      void navigateTo('/app/novo')
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    clearChord()
  })
}
