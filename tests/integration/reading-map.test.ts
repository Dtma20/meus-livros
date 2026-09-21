import { inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useBookFilters } from '../../app/composables/useBookFilters'
import { aggregateReadingMapData } from '../../app/utils/reading-map'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t025-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-025 — Reading map integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  let profilesService: typeof import('../../server/services/profiles')
  let catalogService: typeof import('../../server/services/catalog')

  const createdUserIds: string[] = []
  const createdEmails: string[] = []
  const createdWorkIds: string[] = []
  const createdEditionIds: string[] = []
  const createdAuthorIds: string[] = []

  let ownerId: string
  let ownerHandle: string

  let brWorkTitle: string
  let jpWorkTitle: string
  let ancientRomeWorkTitle: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
    profilesService = await import('../../server/services/profiles')
    catalogService = await import('../../server/services/catalog')

    // 1. Create a user with a public profile
    const email = `${MARKER}@example.com`
    ownerHandle = `mapuser_${Date.now() % 10000000}`
    createdEmails.push(email)

    const [user] = await db
      .insert(schema.users)
      .values({
        email,
        handle: ownerHandle,
        display_name: 'Usuário do Mapa',
        bio: 'Bio para testes do mapa de leitura',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    ownerId = user!.id
    createdUserIds.push(ownerId)

    // 2. Create Work 1: Brazil (public log)
    brWorkTitle = `${MARKER} Dom Casmurro`
    const brWork = await catalogService.createWork(
      {
        title: brWorkTitle,
        authors: [
          {
            name: `${MARKER} Machado de Assis`,
            country_code: 'BR',
            country_label: 'Brasil',
          },
        ],
        genre_ids: [],
        edition: {
          publisher: 'Editora Nacional',
          page_count: 256,
        },
      },
      ownerId,
      { skipRateLimit: true },
    )
    createdWorkIds.push(brWork.id)
    if (brWork.edition?.id) createdEditionIds.push(brWork.edition.id)
    const brAuthors = await db
      .select({ author_id: schema.work_authors.author_id })
      .from(schema.work_authors)
      .where(sql`${schema.work_authors.work_id} = ${brWork.id}`)
    for (const a of brAuthors) createdAuthorIds.push(a.author_id)

    await db.insert(schema.reading_logs).values({
      user_id: ownerId,
      work_id: brWork.id,
      edition_id: brWork.edition?.id ?? null,
      rating: '4.5',
      review: 'Excelente clássico brasileiro.',
      finished_on: '2024-01-10',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })

    // 3. Create Work 2: Japan (private log)
    jpWorkTitle = `${MARKER} Norwegian Wood`
    const jpWork = await catalogService.createWork(
      {
        title: jpWorkTitle,
        authors: [
          {
            name: `${MARKER} Haruki Murakami`,
            country_code: 'JP',
            country_label: 'Japão',
          },
        ],
        genre_ids: [],
        edition: {
          publisher: 'Editora Alfaguara',
          page_count: 360,
        },
      },
      ownerId,
      { skipRateLimit: true },
    )
    createdWorkIds.push(jpWork.id)
    if (jpWork.edition?.id) createdEditionIds.push(jpWork.edition.id)
    const jpAuthors = await db
      .select({ author_id: schema.work_authors.author_id })
      .from(schema.work_authors)
      .where(sql`${schema.work_authors.work_id} = ${jpWork.id}`)
    for (const a of jpAuthors) createdAuthorIds.push(a.author_id)

    await db.insert(schema.reading_logs).values({
      user_id: ownerId,
      work_id: jpWork.id,
      edition_id: jpWork.edition?.id ?? null,
      rating: '5.0',
      review: 'Leitura privada japonesa.',
      finished_on: '2024-02-15',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'privado', // Private log!
    })

    // 4. Create Work 3: Ancient Rome (country_code is null, country_label is 'Roma Antiga', public log)
    ancientRomeWorkTitle = `${MARKER} Meditações`
    const romeWork = await catalogService.createWork(
      {
        title: ancientRomeWorkTitle,
        authors: [
          {
            name: `${MARKER} Marco Aurélio`,
            country_code: null,
            country_label: 'Roma Antiga',
          },
        ],
        genre_ids: [],
        edition: {
          publisher: 'Editora Clássica',
          page_count: 200,
        },
      },
      ownerId,
      { skipRateLimit: true },
    )
    createdWorkIds.push(romeWork.id)
    if (romeWork.edition?.id) createdEditionIds.push(romeWork.edition.id)
    const romeAuthors = await db
      .select({ author_id: schema.work_authors.author_id })
      .from(schema.work_authors)
      .where(sql`${schema.work_authors.work_id} = ${romeWork.id}`)
    for (const a of romeAuthors) createdAuthorIds.push(a.author_id)

    await db.insert(schema.reading_logs).values({
      user_id: ownerId,
      work_id: romeWork.id,
      edition_id: romeWork.edition?.id ?? null,
      rating: '4.0',
      review: 'Filosofia estoica antiga.',
      finished_on: '2024-03-01',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })
  }, 30000)

  afterAll(async () => {
    // 1. Delete reading logs
    if (createdUserIds.length > 0) {
      await db
        .delete(schema.reading_logs)
        .where(inArray(schema.reading_logs.user_id, createdUserIds))
    }

    // 2. Delete works and relations
    if (createdWorkIds.length > 0) {
      await db
        .delete(schema.reading_logs)
        .where(inArray(schema.reading_logs.work_id, createdWorkIds))
      await db
        .delete(schema.work_authors)
        .where(inArray(schema.work_authors.work_id, createdWorkIds))
      await db
        .delete(schema.work_genres)
        .where(inArray(schema.work_genres.work_id, createdWorkIds))
      await db
        .delete(schema.editions)
        .where(inArray(schema.editions.work_id, createdWorkIds))
      await db
        .delete(schema.works)
        .where(inArray(schema.works.id, createdWorkIds))
    }

    // 3. Delete authors
    if (createdAuthorIds.length > 0) {
      await db
        .delete(schema.authors)
        .where(inArray(schema.authors.id, createdAuthorIds))
    }

    // 4. Delete users
    if (createdUserIds.length > 0) {
      await db
        .delete(schema.users)
        .where(inArray(schema.users.id, createdUserIds))
    }
  }, 30000)

  it('map reflects only visible logs: private entry country does not appear to a stranger (Requirement 3)', async () => {
    // Stranger view (viewer === null)
    const strangerView = await profilesService.getProfileByHandle(ownerHandle, null)
    expect(strangerView.logs).toHaveLength(2) // 1 BR public, 1 Roma Antiga public

    const strangerMapData = aggregateReadingMapData(strangerView.logs)

    // Brazil is public, so it appears
    expect(strangerMapData.countryCounts['BR']).toBe(1)
    // Japan is private, MUST NOT leak to stranger
    expect(strangerMapData.countryCounts['JP']).toBeUndefined()
    expect(strangerMapData.countryCounts).not.toHaveProperty('JP')

    // Owner view (viewer === { id: ownerId })
    const ownerView = await profilesService.getProfileByHandle(ownerHandle, { id: ownerId })
    expect(ownerView.logs).toHaveLength(3) // All 3 logs visible to owner

    const ownerMapData = aggregateReadingMapData(ownerView.logs)
    expect(ownerMapData.countryCounts['BR']).toBe(1)
    expect(ownerMapData.countryCounts['JP']).toBe(1) // Japan appears for owner
  }, 20000)

  it('author with no ISO code (Roma Antiga) is excluded from the map but counted in the stat (Requirement 5)', async () => {
    const strangerView = await profilesService.getProfileByHandle(ownerHandle, null)
    const mapData = aggregateReadingMapData(strangerView.logs)

    // Excluded from map country counts
    expect(mapData.countryCounts).not.toHaveProperty('null')
    expect(mapData.totalMappedCountries).toBe(1) // Only 'BR' is mapped

    // Listed in unmapped countries for the note
    expect(mapData.unmappedCountries).toContain('Roma Antiga')

    // But counted in global uniqueCountries stat (Brasil + Roma Antiga = 2)
    expect(strangerView.stats.uniqueCountries).toBe(2)
  }, 20000)

  it('clicking/filtering a country filters the grid and is clearable (Requirement 4)', async () => {
    const strangerView = await profilesService.getProfileByHandle(ownerHandle, null)
    const logsRef = ref(strangerView.logs)

    const { filterCountry, sortedBooks } = useBookFilters(logsRef)

    // Initial state: all 2 visible books displayed
    expect(sortedBooks.value).toHaveLength(2)

    // Filter by 'Brasil' (as emitted when clicking BR on ReadingMap)
    filterCountry.value = 'Brasil'
    expect(sortedBooks.value).toHaveLength(1)
    expect(sortedBooks.value[0]!.work.title).toBe(brWorkTitle)

    // Clear filter (as emitted when clicking Brasil again or clicking Limpar)
    filterCountry.value = ''
    expect(sortedBooks.value).toHaveLength(2)
  }, 20000)
})
