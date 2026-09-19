# Data migration

Moving 86 books, 56 reviews and 13 years of reading history out of `livros.json` and into Postgres.

**This is not a routine import.** It is the only content that exists at launch, it is irreplaceable, and it is also the best available test of the schema. If the 86 rows do not round-trip cleanly, the schema is wrong.

**Do not execute any of this yet.** [tasks/019](tasks/019-migrate-livros-json.md) implements it.

---

## 1. Source

`livros.json` — 86 records, valid UTF-8, no BOM, 105 KB.

| Field | Fill | Notes |
|---|---|---|
| `title`, `author`, `country`, `original_language`, `year`, `publisher`, `pages`, `read_in`, `source`, `genre`, `isbn` | 86/86 | |
| `rate` | 85/86 | One unrated book — legitimately null |
| `review` | 56/86 | Median 940 chars, max 2,505 |
| `cover_url` | 47/86 | |
| `series_name`, `series_number` | 23/86 | |

`livros_lidos_atualizado.csv` is **not** a source. It lags by 3 records and is deleted in the same commit ([tasks/019](tasks/019-migrate-livros-json.md)).

---

## 2. Landmines found by inspection

Each of these breaks a naive importer.

| # | Landmine | Handling |
|---|---|---|
| 1 | `year` minimum is **−500** (an ancient text) | `first_published_year` is a **signed** integer. An unsigned column or a `> 0` check fails |
| 2 | `series_number` contains `'1-2'` and `'0.1'` | Column is **text**. `numeric` fails |
| 3 | 22 of 86 ISBNs are **ISBN-10** | Normalise to ISBN-13 before insert |
| 4 | `original_language` has `'português'` (15) and `'Português'` (1) | Case-fold before mapping to ISO 639-1 |
| 5 | `read_in` is a **year**, never a date | `finished_on = make_date(read_in,1,1)`, `finished_precision = 'ano'` |
| 6 | `country` includes `'Roma Antiga'` | No ISO code. `country_code` NULL, `country_label` preserved |
| 7 | Reviews contain 178 `<br>` and no other markup | Convert to `\n`. Store plain text |
| 8 | 26 genre labels vs a 15-entry `generos.txt` | Explicit mapping table, §5 |
| 9 | Array order encodes reading order within a year | Preserve as a tiebreak, §6 |
| 10 | One book has `rate: null` | Insert NULL. Do not default to 0 — 0 is not a rating |

---

## 3. Target order

Foreign keys dictate it:

```
1. users            — one row, the owner
2. genres           — 26 seeded rows
3. authors          — ~59 rows
4. works            — 86 rows
5. work_authors     — ~86 rows
6. editions         — 86 rows
7. work_genres      — ~250 rows
8. reading_logs     — 86 rows
```

The whole thing runs in **one transaction**. Any failure rolls back completely — there is no partial-import state to reason about.

---

## 4. Field mapping

### `users` — one row

```
email            → from env (the owner's address)
handle           → from env
display_name     → from env
profile_visibility → 'publico'
```

Also inserted into `allowed_emails`, so the owner can sign in through the normal flow.

### `authors` — deduplicated by slug

```
name          ← book.author
slug          ← slugify(f_unaccent(lower(name)))
country_code  ← ISO_PAIS[book.country]   (NULL for 'Roma Antiga')
country_label ← book.country
```

Country is an **author** property. Verified: no author in the corpus appears with more than one country, so this is safe.

```
Reino Unido→GB  EUA→US  Brasil→BR  Alemanha→DE  Rússia→RU  França→FR
Portugal→PT  China→CN  Israel→IL  Áustria→AT  Noruega→NO
Colômbia→CO  Japão→JP  Roma Antiga→NULL
```

If any author string contains a comma or ` e `, it is a multi-author record: split, create both, and link with ascending `position`. **The script must assert that the resulting author count matches expectation and stop if not** — a silent mis-split corrupts the catalog.

### `works` — 86 rows

```
title                ← book.title
slug                 ← slugify(title + '-' + first author surname), suffixed on collision
original_language    ← ISO_IDIOMA[lower(book.original_language)]
first_published_year ← book.year                    ← SIGNED
series_name          ← book.series_name   (nullable)
series_number        ← book.series_number  (TEXT, nullable)
ol_work_key          ← NULL                          ← nothing is enriched during migration
created_by           ← owner id
```

```
inglês→en  português→pt  alemão→de  russo→ru  francês→fr  chinês→zh
hebraico→he  norueguês→no  latim→la  espanhol→es  japonês→ja
```

Apply `lower()` before lookup — this is where landmine #4 resolves.

### `editions` — 86 rows, one per work

```
work_id        ← the work just created
isbn13         ← normalise_isbn(book.isbn)     ← ISBN-10 → ISBN-13
publisher      ← book.publisher
page_count     ← book.pages
published_year ← NULL     ← book.year is the WORK's first publication, not this printing's
cover_url      ← book.cover_url  (nullable)
language       ← 'pt'     ← every one of these is a Brazilian edition
```

`published_year` deliberately stays NULL. Copying `book.year` into it would assert that the Companhia das Letras printing of a 1899 novel was published in 1899, which is false and would pollute the catalog for everyone.

`language = 'pt'` is safe: all 46 publishers in the corpus are Brazilian imprints.

**If two books share a normalised ISBN-13, stop.** The partial unique index would reject it. Verified: all 86 are currently distinct.

### `reading_logs` — 86 rows

```
user_id            ← owner
work_id            ← the work
edition_id         ← the edition          ← set here, unlike the normal flow
rating             ← book.rate            ← NULL stays NULL
review             ← br_to_text(book.review)
started_on         ← NULL                 ← never recorded; do not invent it
finished_on        ← make_date(book.read_in, 1, 1)
finished_precision ← 'ano'
format             ← 'fisico' | 'ebook'   ← from book.source
visibility         ← 'publico'
created_at         ← make_date(read_in,1,1) + original_index minutes    ← §6
```

`br_to_text`:

```
replace /<br\s*\/?>\s*<br\s*\/?>/gi  → '\n\n'
replace /<br\s*\/?>/gi               → '\n'
assert no '<' remains in any review  → else stop
```

The assertion matters. It is what guarantees the "reviews are plain text" security property ([security.md](security.md) §1) actually holds for the migrated corpus, rather than being assumed.

---

## 5. Genre mapping

26 labels in the data, 15 entries in `generos.txt`, with different spellings. This table is the reconciliation. `kind` captures the two-level structure the data already has implicitly — `Ficção` (73) and `Não-Ficção` (12) are used as top-level classifiers alongside sub-genres.

| Data label | → slug | label_pt | kind |
|---|---|---|---|
| Ficção | `ficcao` | Ficção | ficcao |
| Não-Ficção | `nao-ficcao` | Não Ficção | nao_ficcao |
| Romance | `romance` | Romance | ficcao |
| Aventura | `aventura` | Aventura | ficcao |
| Fantasia | `fantasia` | Fantasia | ficcao |
| **Sci-fi** | `ficcao-cientifica` | Ficção Científica | ficcao |
| Novela | `novela` | Novela | ficcao |
| **Mistério** | `misterio` | Suspense e Mistério | ficcao |
| Distopia | `distopia` | Distopia | ficcao |
| Contos | `contos` | Contos | ficcao |
| **Terror** | `terror` | Terror | ficcao |
| História | `historia` | História | nao_ficcao |
| **Biografia** + **Autobiografia** | `biografia` | Biografia e Autobiografia | nao_ficcao |
| Política | `politica` | Política | nao_ficcao |
| Filosofia | `filosofia` | Filosofia | nao_ficcao |
| Desenvolvimento Pessoal | `desenvolvimento-pessoal` | Desenvolvimento Pessoal | nao_ficcao |
| Fábula | `fabula` | Fábula | ficcao |
| Graphic Novel | `graphic-novel` | Graphic Novel | outro |
| Matemática | `matematica` | Matemática | nao_ficcao |
| Ciência | `ciencia` | Ciência | nao_ficcao |
| Economia | `economia` | Economia | nao_ficcao |
| Ensaio | `ensaio` | Ensaios e Crônicas | nao_ficcao |
| Tecnologia | `tecnologia` | Tecnologia | nao_ficcao |
| **Teatro** | `dramaturgia` | Dramaturgia | outro |
| Comédia | `comedia` | Comédia | ficcao |
| *(unused)* | `poesia` | Poesia | outro |

**Biografia and Autobiografia merge** — 3 books each, and the distinction is not one anyone filters on.

**`generos.txt` is regenerated from this table** so the file and the database agree. An unmapped label must **stop the migration**, not be silently dropped — that is exactly how the drift happened in the first place.

---

## 6. Preserving reading order

`livros.json` array order encodes reading order *within* a year — the existing app relies on it as `original_index`, the tiebreak for every sort (`index.html:279-320`). Losing it would scramble 13 years of sequence.

Since `read_in` is year-only, ordering within a year cannot be reconstructed from the data. Preserve it in `created_at`:

```
created_at = make_date(read_in, 1, 1) + (original_index * interval '1 minute')
```

Monotonic, stable, and it makes `ORDER BY finished_on DESC, created_at DESC` reproduce the existing app's ordering exactly.

---

## 7. Validation

The script **stops on any failure**. These are assertions, not warnings.

**Pre-flight**
- [ ] `livros.json` parses; exactly 86 records
- [ ] Every `genre` value appears in the §5 mapping
- [ ] Every `country` appears in the ISO map or is `Roma Antiga`
- [ ] Every `original_language`, case-folded, appears in the ISO map
- [ ] Every `isbn` normalises to a valid ISBN-13; all 86 distinct
- [ ] Every `rate` is null or in {0.5, 1.0, …, 5.0}
- [ ] Target tables are empty

**Post-insert, same transaction**
- [ ] `works` = 86, `editions` = 86, `reading_logs` = 86
- [ ] `authors` = the asserted count (59, or 61 if multi-author splits occur)
- [ ] `work_genres` = the sum of genre-array lengths
- [ ] Logs with a non-null review = **56**
- [ ] Logs with a non-null rating = **85**
- [ ] `SELECT count(*) FROM reading_logs WHERE review LIKE '%<%'` = **0**
- [ ] `min(first_published_year)` = **−500**
- [ ] Every `reading_logs.edition_id` is non-null and belongs to its `work_id`
- [ ] `sum(page_count)` matches the sum of `pages` in the JSON

**Spot checks by hand**
- [ ] *O retorno do rei* — series `O Senhor dos Anéis` #3, read 2026, review reads correctly with paragraph breaks
- [ ] The Pollyanna omnibus keeps `series_number = '1-2'`
- [ ] The Robots prequel keeps `series_number = '0.1'`
- [ ] The −500 work exists with a negative year
- [ ] The unrated book has `rating IS NULL`, not `0`

---

## 8. Rollback

One transaction, so a failure rolls back automatically.

If a problem is found *after* commit:

```sql
BEGIN;
DELETE FROM reading_logs WHERE user_id = :owner;
DELETE FROM work_genres WHERE work_id IN (SELECT id FROM works WHERE created_by = :owner);
DELETE FROM work_authors WHERE work_id IN (SELECT id FROM works WHERE created_by = :owner);
DELETE FROM editions    WHERE created_by = :owner;
DELETE FROM works       WHERE created_by = :owner;
DELETE FROM authors     WHERE created_by = :owner;
COMMIT;
```

This is only safe **before other users have logged anything**, because `works.id` is referenced by their logs and `ON DELETE RESTRICT` will (correctly) block it. Run the migration and verify it before inviting anyone — that ordering is itself the rollback plan.

`livros.json` stays in the repository, unchanged, as the permanent source of truth for re-running. It is deleted only after the app has been live and verified for a month.

---

## 9. Legacy file disposition

| File | When | Action |
|---|---|---|
| `livros_lidos_atualizado.csv` | [tasks/019](tasks/019-migrate-livros-json.md) | **Delete.** Already 3 records stale; the dual-source drift documented in discovery |
| `generos.txt` | [tasks/019](tasks/019-migrate-livros-json.md) | Regenerate from the §5 table, keep as human-readable documentation |
| `index.html`, `styles.css` | [tasks/001](tasks/001-scaffold-nuxt-project.md) | Move to `legacy/`, keep runnable until parity |
| `livros.json` | after one month live | Keep in `legacy/` as the migration source of record |
| `legacy/` | after parity + one month | Delete in one commit, referenced from the changelog |
