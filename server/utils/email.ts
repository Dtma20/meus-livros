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

/**
 * `d***@***` — an email address reduced to what a log may carry.
 *
 * `security.md` §"Logs redact email addresses beyond the first character and
 * never contain passwords, password hashes, OTP codes or session tokens."
 * The SMTP failure log in `services/auth.ts` wrote the whole address, which
 * put every invited member's email into whatever collects stdout on Vercel.
 * The first character plus the shape is enough to correlate a complaint with a
 * log line, which is the only reason the address was there.
 */
export function redactEmail(email: string): string {
  const trimmed = email.trim()
  if (!trimmed) return '***'
  const at = trimmed.indexOf('@')
  const local = at === -1 ? trimmed : trimmed.slice(0, at)
  const first = local.slice(0, 1)
  return first ? `${first}***@***` : '***@***'
}
