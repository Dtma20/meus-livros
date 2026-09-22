/**
 * Relatos de erro do cliente são texto arbitrário vindo do navegador, e o
 * formato legível do logger os imprime crus. Nenhum deles pode carregar uma
 * quebra de linha capaz de forjar uma entrada de log nova.
 */

const MAX_STACK_LINES = 50

export function sanitizeClientErrorMessage(message: string): string {
  return message.replace(/[\r\n]+/g, ' ')
}

/**
 * Diferente da mensagem, o stack só é legível com as quebras de linha
 * preservadas. Em vez de achatá-lo, indenta cada linha: uma entrada de log
 * real sempre começa na coluna zero, então uma linha forjada não se passa
 * por uma. `\r` sozinho também volta o cursor para a coluna zero, por isso
 * a divisão cobre os dois caracteres.
 */
export function sanitizeClientErrorStack(stack: string): string {
  return stack
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_STACK_LINES)
    .join('\n  ')
}
