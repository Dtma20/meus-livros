import type {
  allowed_emails,
  authors,
  bookFormatEnum,
  datePrecisionEnum,
  editions,
  genreKindEnum,
  genres,
  reading_logs,
  search_misses,
  users,
  visibilityEnum,
  work_authors,
  work_genres,
  works,
} from './schema'

// Enums
export type Visibility = (typeof visibilityEnum.enumValues)[number]
export type DatePrecision = (typeof datePrecisionEnum.enumValues)[number]
export type BookFormat = (typeof bookFormatEnum.enumValues)[number]
export type GenreKind = (typeof genreKindEnum.enumValues)[number]

// Tables
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type AllowedEmail = typeof allowed_emails.$inferSelect
export type NewAllowedEmail = typeof allowed_emails.$inferInsert

export type Author = typeof authors.$inferSelect
export type NewAuthor = typeof authors.$inferInsert

export type Work = typeof works.$inferSelect
export type NewWork = typeof works.$inferInsert

export type WorkAuthor = typeof work_authors.$inferSelect
export type NewWorkAuthor = typeof work_authors.$inferInsert

export type Edition = typeof editions.$inferSelect
export type NewEdition = typeof editions.$inferInsert

export type Genre = typeof genres.$inferSelect
export type NewGenre = typeof genres.$inferInsert

export type WorkGenre = typeof work_genres.$inferSelect
export type NewWorkGenre = typeof work_genres.$inferInsert

export type ReadingLog = typeof reading_logs.$inferSelect
export type NewReadingLog = typeof reading_logs.$inferInsert

export type SearchMiss = typeof search_misses.$inferSelect
export type NewSearchMiss = typeof search_misses.$inferInsert
