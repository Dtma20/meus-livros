import { relations, sql } from 'drizzle-orm'
import {
  bigserial,
  char,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Hand-written in migration (TASK-004):
// - Extensions: citext, unaccent
// - Function: f_unaccent(text)
// - Generated column: works.search_text GENERATED ALWAYS AS (f_unaccent(lower(title))) STORED
// - Index: works_search_idx ON works (search_text text_pattern_ops)

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

// Enums
export const visibilityEnum = pgEnum('visibility', ['publico', 'privado'])
export const datePrecisionEnum = pgEnum('date_precision', ['dia', 'mes', 'ano'])
export const bookFormatEnum = pgEnum('book_format', ['fisico', 'ebook', 'audio'])
export const genreKindEnum = pgEnum('genre_kind', ['ficcao', 'nao_ficcao', 'outro'])

// 1. users
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    handle: citext('handle').notNull().unique(),
    display_name: text('display_name').notNull(),
    bio: text('bio'),
    profile_visibility: visibilityEnum('profile_visibility').notNull().default('publico'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('handle_format', sql`${table.handle} ~ '^[a-z0-9_]{3,20}$'`),
  ],
)

// 2. allowed_emails
export const allowed_emails = pgTable('allowed_emails', {
  email: citext('email').primaryKey(),
  invited_by: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  note: text('note'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// 3. authors
export const authors = pgTable('authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: citext('slug').notNull().unique(),
  country_code: char('country_code', { length: 2 }),
  country_label: text('country_label'),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// 4. works
export const works = pgTable('works', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: citext('slug').notNull().unique(),
  title: text('title').notNull(),
  original_language: char('original_language', { length: 2 }),
  // SIGNED integer: real corpus contains -500. No unsigned type, no > 0 check.
  first_published_year: integer('first_published_year'),
  series_name: text('series_name'),
  // TEXT: real values include '1-2' and '0.1'. Never numeric.
  series_number: text('series_number'),
  ol_work_key: text('ol_work_key').unique(),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  // search_text: hand-written in migration (TASK-004)
  // works_search_idx: hand-written in migration (TASK-004)
})

// 5. work_authors
export const work_authors = pgTable(
  'work_authors',
  {
    work_id: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    author_id: uuid('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.work_id, table.author_id] }),
    index('work_authors_author_idx').on(table.author_id),
  ],
)

// 6. editions
export const editions = pgTable(
  'editions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    work_id: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    isbn13: char('isbn13', { length: 13 }),
    publisher: text('publisher'),
    page_count: integer('page_count'),
    published_year: integer('published_year'),
    language: char('language', { length: 2 }),
    cover_url: text('cover_url'),
    ol_cover_id: integer('ol_cover_id'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('page_count_positive', sql`${table.page_count} IS NULL OR ${table.page_count} > 0`),
    // PARTIAL unique: "no ISBN" must be a repeatable legal state, not a collision.
    uniqueIndex('editions_isbn13_key').on(table.isbn13).where(sql`${table.isbn13} IS NOT NULL`),
    index('editions_work_idx').on(table.work_id),
  ],
)

// 7. genres
export const genres = pgTable('genres', {
  id: smallint('id').primaryKey(),
  slug: citext('slug').notNull().unique(),
  label_pt: text('label_pt').notNull(),
  kind: genreKindEnum('kind').notNull(),
})

// 8. work_genres
export const work_genres = pgTable(
  'work_genres',
  {
    work_id: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    genre_id: smallint('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.work_id, table.genre_id] }),
  ],
)

// 9. reading_logs
// Deliberately NO unique(user_id, work_id): that constraint is what breaks re-reads.
export const reading_logs = pgTable(
  'reading_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    work_id: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'restrict' }),
    edition_id: uuid('edition_id').references(() => editions.id, { onDelete: 'set null' }),
    rating: numeric('rating', { precision: 2, scale: 1 }),
    review: text('review'), // PLAIN TEXT. Never HTML.
    started_on: date('started_on'),
    finished_on: date('finished_on'),
    finished_precision: datePrecisionEnum('finished_precision').notNull().default('dia'),
    format: bookFormatEnum('format'),
    visibility: visibilityEnum('visibility').notNull().default('publico'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'rating_half_star',
      sql`${table.rating} IS NULL OR (${table.rating} >= 0.5 AND ${table.rating} <= 5.0 AND (${table.rating} * 2) = trunc(${table.rating} * 2))`,
    ),
    check(
      'dates_ordered',
      sql`${table.started_on} IS NULL OR ${table.finished_on} IS NULL OR ${table.started_on} <= ${table.finished_on}`,
    ),
    index('reading_logs_user_idx').on(table.user_id, table.finished_on.desc().nullsLast()),
    index('reading_logs_work_idx').on(table.work_id),
    index('reading_logs_public_idx').on(table.created_at.desc()).where(sql`${table.visibility} = 'publico'`),
  ],
)

// 10. search_misses
export const search_misses = pgTable('search_misses', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  query: text('query').notNull(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  reading_logs: many(reading_logs),
  allowed_emails: many(allowed_emails),
  authored_works: many(works),
  authored_authors: many(authors),
  authored_editions: many(editions),
  search_misses: many(search_misses),
}))

export const allowedEmailsRelations = relations(allowed_emails, ({ one }) => ({
  inviter: one(users, {
    fields: [allowed_emails.invited_by],
    references: [users.id],
  }),
}))

export const authorsRelations = relations(authors, ({ one, many }) => ({
  creator: one(users, {
    fields: [authors.created_by],
    references: [users.id],
  }),
  work_authors: many(work_authors),
}))

export const worksRelations = relations(works, ({ one, many }) => ({
  creator: one(users, {
    fields: [works.created_by],
    references: [users.id],
  }),
  work_authors: many(work_authors),
  work_genres: many(work_genres),
  editions: many(editions),
  reading_logs: many(reading_logs),
}))

export const workAuthorsRelations = relations(work_authors, ({ one }) => ({
  work: one(works, {
    fields: [work_authors.work_id],
    references: [works.id],
  }),
  author: one(authors, {
    fields: [work_authors.author_id],
    references: [authors.id],
  }),
}))

export const editionsRelations = relations(editions, ({ one, many }) => ({
  work: one(works, {
    fields: [editions.work_id],
    references: [works.id],
  }),
  creator: one(users, {
    fields: [editions.created_by],
    references: [users.id],
  }),
  reading_logs: many(reading_logs),
}))

export const genresRelations = relations(genres, ({ many }) => ({
  work_genres: many(work_genres),
}))

export const workGenresRelations = relations(work_genres, ({ one }) => ({
  work: one(works, {
    fields: [work_genres.work_id],
    references: [works.id],
  }),
  genre: one(genres, {
    fields: [work_genres.genre_id],
    references: [genres.id],
  }),
}))

export const readingLogsRelations = relations(reading_logs, ({ one }) => ({
  user: one(users, {
    fields: [reading_logs.user_id],
    references: [users.id],
  }),
  work: one(works, {
    fields: [reading_logs.work_id],
    references: [works.id],
  }),
  edition: one(editions, {
    fields: [reading_logs.edition_id],
    references: [editions.id],
  }),
}))

export const searchMissesRelations = relations(search_misses, ({ one }) => ({
  user: one(users, {
    fields: [search_misses.user_id],
    references: [users.id],
  }),
}))

export * from './types'
