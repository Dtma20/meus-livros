import type { Transporter } from 'nodemailer'

let _transport: Transporter | null = null

/** Allows tests to provide a mock transport without hitting live SMTP. */
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

/**
 * Lazy-initialized SMTP transport (Gmail App Password).
 *
 * nodemailer is imported dynamically: a static import lands it in every
 * serverless bundle by way of services/auth.ts -> utils/session.ts, including
 * routes that never send mail, and it is evaluated on every cold start.
 */
export async function getTransport(): Promise<Transporter> {
  if (!_transport) {
    const { createTransport } = await import('nodemailer')
    const emailFrom = getEmailFrom()
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    if (!gmailAppPassword) {
      throw new Error('A variável de ambiente GMAIL_APP_PASSWORD não foi informada.')
    }
    _transport = createTransport({
      service: 'gmail',
      auth: {
        user: emailFrom,
        pass: gmailAppPassword,
      },
    })
  }
  return _transport
}
