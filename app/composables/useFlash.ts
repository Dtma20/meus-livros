export type FlashTone = 'info' | 'error'

export interface FlashMessage {
  text: string
  tone: FlashTone
}

/**
 * Mensagem de uma só exibição que sobrevive a uma navegação do lado do
 * cliente: a página define (`set`) antes de navegar e o layout logado lê e
 * apaga (`consume`) ao montar ou quando ela muda. `useState` mantém o valor
 * isolado por requisição no SSR.
 */
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
