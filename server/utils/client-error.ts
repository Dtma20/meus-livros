export function sanitizeClientErrorMessage(message: string): string {
  return message.replace(/[\r\n]+/g, ' ')
}
