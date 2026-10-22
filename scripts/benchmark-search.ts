import 'dotenv/config'
import { performance } from 'node:perf_hooks'
import { inArray, sql } from 'drizzle-orm'
import { client, db } from '../server/db'
import * as schema from '../server/db/schema'
import * as search from '../server/services/search'
import { evaluateSearchBenchmark } from './search-benchmark-metrics'

async function runBenchmark(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não configurada no ambiente.')
    process.exit(1)
  }

  const MARKER = `bench-${Date.now()}`
  console.log(`[benchmark] Iniciando benchmark de busca com 1.500 obras (marcador: ${MARKER})...`)

  const [user] = await db
    .insert(schema.users)
    .values({
      email: `${MARKER}@bench.invalid`,
      handle: `bench_${Date.now() % 10000000}`,
      display_name: 'Benchmark User',
      profile_visibility: 'publico',
    })
    .returning({ id: schema.users.id })

  if (!user) throw new Error('Falha ao criar usuário para o benchmark.')

  const SEED_COUNT = 1500
  const BATCH = 250
  const seedIds: string[] = []

  try {
    console.log(`[benchmark] Inserindo ${SEED_COUNT} obras em lotes de ${BATCH}...`)
    for (let i = 0; i < SEED_COUNT; i += BATCH) {
      const batch = Array.from({ length: Math.min(BATCH, SEED_COUNT - i) }, (_, j) => ({
        slug: `${MARKER}-perf-${i + j}`,
        title: `Perf Work ${MARKER} ${i + j}`,
        created_by: user.id,
      }))
      const inserted = await db
        .insert(schema.works)
        .values(batch)
        .returning({ id: schema.works.id })
      seedIds.push(...inserted.map((r) => r.id))
    }
    console.log(`[benchmark] ${seedIds.length} obras inseridas com sucesso.`)

    const SAMPLES = 20
    const measure = async (run: () => Promise<unknown>): Promise<number[]> => {
      const times: number[] = []
      for (let i = 0; i < SAMPLES; i++) {
        const start = performance.now()
        await run()
        times.push(performance.now() - start)
      }
      return times.sort((a, b) => a - b)
    }

    console.log(`[benchmark] Coletando ${SAMPLES} amostras de latência...`)
    const baseline = await measure(() => db.execute(sql`select 1`))
    const searched = await measure(() => search.searchWorks('perf', null))

    const metrics = evaluateSearchBenchmark(baseline, searched)

    console.log('\n--- RESULTADOS DO BENCHMARK ---')
    console.log(`Amostras:             ${SAMPLES}`)
    console.log(`Baseline DB (p95):    ${metrics.baselineP95.toFixed(2)} ms`)
    console.log(`Busca Mínima:         ${metrics.min.toFixed(2)} ms`)
    console.log(`Busca Mediana (p50):  ${metrics.median.toFixed(2)} ms`)
    console.log(`Busca p95 Bruta:      ${metrics.searchP95.toFixed(2)} ms`)
    console.log(`Busca Máxima:         ${metrics.max.toFixed(2)} ms`)
    console.log(`Diferença dos p95:    ${metrics.overhead.toFixed(2)} ms`)
    console.log('-------------------------------\n')

    console.log(`[benchmark] SUCESSO: diferença dos p95 (${metrics.overhead.toFixed(2)}ms) abaixo de 150ms.`)
  } finally {
    console.log('[benchmark] Limpando dados do benchmark...')
    try {
      if (seedIds.length > 0) {
        await db.delete(schema.works).where(inArray(schema.works.id, seedIds))
      }
      await db.delete(schema.users).where(sql`${schema.users.id} = ${user.id}`)
    } finally {
      await client.end()
    }
    console.log('[benchmark] Limpeza concluída.')
  }
}

runBenchmark().catch((err) => {
  console.error('[benchmark] Erro durante a execução do benchmark:', err)
  process.exit(1)
})
