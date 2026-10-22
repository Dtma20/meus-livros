export type FlashTone = 'info' | 'error'

export interface FlashMessage {
  text: string
  tone: FlashTone
}

export function useFlash() {
  const state = useState<FlashMessage | null>('flash:message', () => null)

  function set(text: string, tone: FlashTone = 'info'): void {
    state.value = { text, tone }
  }

  function consume(): FlashMessage | null {
    const value = state.value
    state.value = null
    return value
  }

  return { state, set, consume }
}
