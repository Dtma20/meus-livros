import { computed, onMounted } from 'vue'

const STATE_KEY = 'keyboard-shortcut-preferences'
const STORAGE_KEY = 'ml:character-key-shortcuts-enabled'

interface KeyboardShortcutPreferenceState {
  characterKeyShortcutsEnabled: boolean
  loaded: boolean
}

export function useKeyboardShortcutPreferences() {
  const state = useState<KeyboardShortcutPreferenceState>(STATE_KEY, () => ({
    characterKeyShortcutsEnabled: true,
    loaded: false,
  }))

  function loadPreference(): void {
    if (state.value.loaded) return
    state.value.loaded = true
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'true' || saved === 'false') {
        state.value.characterKeyShortcutsEnabled = saved === 'true'
      }
    } catch {
      // The preference remains enabled when browser storage is unavailable.
    }
  }

  function setCharacterKeyShortcutsEnabled(enabled: boolean): void {
    state.value.characterKeyShortcutsEnabled = enabled
    state.value.loaded = true
    try {
      window.localStorage.setItem(STORAGE_KEY, String(enabled))
    } catch {
      // The current session still honors the setting if persistence is blocked.
    }
  }

  onMounted(loadPreference)

  return {
    characterKeyShortcutsEnabled: computed(() => state.value.characterKeyShortcutsEnabled),
    setCharacterKeyShortcutsEnabled,
  }
}
