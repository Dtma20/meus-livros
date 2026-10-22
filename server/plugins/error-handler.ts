import { logger } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const requestId = (event?.context?.requestId as string) || undefined
    const method = event?.method
    const path = event?.path

    logger.error('[nitro] Erro global não tratado no ciclo de vida do servidor', {
      module: 'nitro',
      source: 'server_api',
      requestId,
      http: method && path ? { method, path } : undefined,
      error,
    })
  })
})
