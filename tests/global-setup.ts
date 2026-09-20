import fs from 'node:fs'
import path from 'node:path'

/**
 * Refuses to run the suite against a stale production bundle.
 *
 * `tests/integration/routes.test.ts` spawns the built Nitro server, so it needs
 * `.vercel/output` to match the current sources. It used to build one itself
 * from `beforeAll`, which runs inside a worker while the other workers are
 * importing components and resolving modules against the same `.nuxt`
 * directory the build is rewriting. That produced a run failing two or three
 * tests with `Could not resolve ...` or `does not provide an export named 'g'`,
 * which then passed on a second attempt with nothing changed — six times in one
 * evening, and the kind of flake that teaches people to re-run instead of read.
 *
 * Building here instead does not work: Vitest starts, this hook builds, and
 * then the run ends having executed no tests at all and exited 0. A suite that
 * reports success without running is far worse than one that is flaky, so this
 * hook only ever checks and complains.
 */

const serverPath = path.resolve('.vercel/output/functions/__fallback.func/index.mjs')

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
