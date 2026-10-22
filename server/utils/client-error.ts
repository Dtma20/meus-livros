
const MAX_STACK_LINES = 50

export function sanitizeClientErrorMessage(message: string): string {
  return message.replace(/[\r\n]+/g, ' ')
}

export function sanitizeClientErrorStack(stack: string): string {
  return stack
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_STACK_LINES)
    .join('\n  ')
}
