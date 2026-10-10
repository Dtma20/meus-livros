import type { Transporter } from 'nodemailer'

let _transport: Transporter | null = null

export function setTransport(transport: Transporter | null): void {
  _transport = transport
}

export function getEmailFrom(): string {
  const emailFrom = process.env.EMAIL_FROM
  if (!emailFrom) {
    throw new Error('A variável de ambiente EMAIL_FROM não foi informada.')
  }
  return emailFrom
}

export async function getTransport(): Promise<Transporter> {
  if (!_transport) {
    const { createTransport } = await import('nodemailer')
    const emailFrom = getEmailFrom()
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    if (!gmailAppPassword) {
      throw new Error('A variável de ambiente GMAIL_APP_PASSWORD não foi informada.')
    }
    // The OTP request awaits the send on Vercel, so a stalled Gmail connection must fail fast into the logged-failure path.
    _transport = createTransport({
      service: 'gmail',
      auth: {
        user: emailFrom,
        pass: gmailAppPassword,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return _transport
}

export function redactEmail(email: string): string {
  const trimmed = email.trim()
  if (!trimmed) return '***'
  const at = trimmed.indexOf('@')
  const local = at === -1 ? trimmed : trimmed.slice(0, at)
  const first = local.slice(0, 1)
  return first ? `${first}***@***` : '***@***'
}
