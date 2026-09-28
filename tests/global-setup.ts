import fs from 'node:fs'
import path from 'node:path'

const serverPath = [
  path.resolve('.vercel/output/functions/__fallback.func/index.mjs'),
  path.resolve('.vercel/output/functions/__nitro.func/index.mjs'),
].find((p) => fs.existsSync(p)) ?? path.resolve('.vercel/output/functions/__fallback.func/index.mjs')

function newestMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let newest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs)
  }
  return newest
}

export async function setup(): Promise<void> {
  const exists = fs.existsSync(serverPath)
  const built = exists ? fs.statSync(serverPath).mtimeMs : 0
  const sources = Math.max(
    newestMtime(path.resolve('app')),
    newestMtime(path.resolve('server')),
    newestMtime(path.resolve('shared')),
    fs.existsSync(path.resolve('nuxt.config.ts')) ? fs.statSync(path.resolve('nuxt.config.ts')).mtimeMs : 0,
  )

  if (exists && sources <= built) return

  throw new Error(
    [
      '',
      exists
        ? 'O bundle em .vercel/output está mais antigo que os fontes.'
        : 'O bundle em .vercel/output não existe.',
      '',
      'tests/integration/routes.test.ts sobe o servidor compilado, então ele precisa',
      'estar atualizado. Construir de dentro da suíte corrompe a resolução de módulos',
      'dos outros workers, que estão lendo .nuxt ao mesmo tempo.',
      '',
      'Rode antes:',
      '',
      '    npm run build',
      '',
    ].join('\n'),
  )
}
