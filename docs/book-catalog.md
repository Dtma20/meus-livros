# Book catalog strategy

The most measurement-driven document in this set. The discovery phase assumed Open Library could be the catalog; measurement against the real corpus shows it cannot.

---

## 1. What was measured

Run 2026-09-18 against `livros.json`. Sample: **30 books whose publisher is a Brazilian imprint** — Companhia das Letras, Rocco, Intrínseca, Aleph, Antofágica, Principis, Record, L&PM Pocket, Martin Claret. This is the population the product actually serves.

### Lookup by ISBN — `https://openlibrary.org/isbn/{isbn13}.json`

| Result | Count |
|---|---|
| **Edition record exists** | **12 / 30 — 40%** |
| Cover exists (`?default=false`) | 17 / 30 — 57% |

Field coverage *among the 12 that exist*: title 12/12, publishers 12/12, publish_date 12/12, linked work 12/12, languages 11/12, number_of_pages 10/12, cover 9/12. **When a record exists it is good. It usually does not exist.**

The 18 misses are not obscure books:

```
Harry Potter (Rocco)        5 of 7 missing
Percy Jackson (Intrínseca)  4 of 5 missing
Companhia das Letras        4 missing  (Pais e Filhos, Capitães de areia,
                                        Breve romance de sonho, Sobre fotografia)
Martin Claret               2 missing  (Histórias da meia-noite, Pollyanna)
Also: A Arte da Guerra (Principis), Sapiens (L&PM), 1984 (Antofágica)
```

### Search by title + author — `https://openlibrary.org/search.json`

| Result | Count |
|---|---|
| Returns ≥ 1 result | ~22 / 30 |
| Top result carries `cover_i` | 22 / 22 |
| Top result lists `por` among languages | 21 / 22 |

Confirmed zero-result cases include *Harry Potter e a câmara secreta*, *Harry Potter e o cálice de fogo*, *Histórias da meia-noite* (Machado de Assis — a canonical Brazilian work), *Breve romance de sonho* and *Pollyanna e Pollyanna moça*.

### Latency — the decisive number

| | |
|---|---|
| Minimum | 2.5 s |
| Average | **8.4 s** |
| Maximum observed | 21 s |
| Hard connection timeouts | 2 of 8 retried queries |

**An 8.4-second average makes Open Library unusable in a synchronous search box.** No amount of UI polish hides an eight-second wait on the first action a new user takes.

### The cover gotcha, confirmed

`https://covers.openlibrary.org/b/isbn/{unknown}-L.jpg` returns **HTTP 200 with a 43-byte blank GIF**. With `?default=false` it returns `404`. Without the parameter, an `<img onerror>` fallback never fires and a missing cover renders as an invisible image.

---

## 2. What follows architecturally

> **The catalog is the community's own `works`/`editions` tables. Manual entry is a primary path. Open Library is optional, explicitly invoked, non-blocking enrichment.**

Three consequences:

1. **Search is local and instant.** `ILIKE` over `works.search_text`, ~1,500 rows, sub-millisecond. Open Library is never in this path.
2. **Manual add is a first-class flow, not an error recovery.** It will be used roughly 60% of the time for Brazilian editions. It gets real design attention, a good form, and the prominent position in the zero-result state.
3. **The network effect does the work.** A book added by one friend is immediately searchable by the other 29. At 30 readers × ~50 books, the local catalog passes ~1,000 works within weeks and local search starts winning outright.

The 86 migrated books seed this from day one — the first friend to sign up searches a catalog that already has content.

---

## 3. Authority per field

| Field | Authority | Note |
|---|---|---|
| `works.title` | **Local** | What the user typed or confirmed. Never overwritten |
| `works.first_published_year` | Local, OL-suggested | |
| `works.original_language` | Local, OL-suggested | |
| `works.ol_work_key` | OL | The only field OL owns outright; the join key for later enrichment |
| `editions.isbn13` | Local | Normalised on write |
| `editions.publisher` / `page_count` | Local, OL-suggested | OL's Brazilian publisher data is absent 60% of the time |
| `editions.cover_url` | Local | An absolute URL, whatever its origin |
| `editions.ol_cover_id` | OL | Preferred over ISBN-keyed cover URLs — see §5 |
| genres | **Local only** | OL `subjects` are a free-text mess in English. Never imported |

**Nothing from Open Library ever silently overwrites a local value.** Enrichment proposes; the user disposes. A user who typed a title and then pressed "buscar online" sees a diff, not a replacement.

---

## 4. Persisted vs fetched

**Everything the product reads is persisted.** No page load calls Open Library.

| | |
|---|---|
| Persisted | Everything in `works` and `editions` |
| Fetched live | Only inside `GET /api/search/externo`, only on an explicit button press, only with a session |
| Cached | Nothing. There is nothing to cache — results are either persisted on accept or discarded |

This deletes an entire subsystem the discovery documents assumed: no catalog mirror, no sync job, no cache invalidation, no staleness policy.

---

## 5. Covers

Resolution order, in `BookCover.vue`:

1. `editions.cover_url` if set
2. `https://covers.openlibrary.org/b/id/{ol_cover_id}-M.jpg` if `ol_cover_id` is set
3. `https://covers.openlibrary.org/b/isbn/{isbn13}-L.jpg?default=false` if `isbn13` is set
4. A locally generated placeholder — **an inline SVG data URI with the title's initials**

**Prefer `ol_cover_id` over ISBN.** Open Library rate-limits cover lookups by identifiers *other than* CoverID and OLID. Search results already carry `cover_i`, so store it at insert time and the rate limit stops applying.

**Always append `?default=false` to ISBN-keyed cover URLs** so a miss is a real `404` and the fallback fires.

**Never proxy covers.** Hotlink directly. Proxying puts us in the path of every image request, burns function invocations, and buys nothing — Open Library already fronts a CDN.

**Placeholder is local SVG, not `ui-avatars.com`.** The existing code (`index.html:372`) depends on a third-party service with no SLA, inside a plan whose premise is that nothing external is load-bearing. Ten lines of inline SVG removes the dependency, works offline, and works inside WhatsApp's WebView.

**`og:image` never uses `?default=false`** — a 404 leaves WhatsApp with a broken preview. Serve a static fallback image instead ([frontend.md](frontend.md) §2).

---

## 6. ISBN normalisation

22 of 86 corpus ISBNs are ISBN-10. Everything is normalised to ISBN-13 **on write**, before the uniqueness check.

```
strip hyphens and whitespace
if length 10 → drop the check digit, prefix '978', recompute the EAN-13 check digit
validate the ISBN-13 checksum
reject on failure — do not store a malformed ISBN
```

The uniqueness index is **partial** (`WHERE isbn13 IS NOT NULL`), because "no ISBN" must be a repeatable legal state rather than a collision. Most manually added books will have no ISBN, and that is fine.

---

## 7. Matching an Open Library result to a local row

In order:

1. **`ol_work_key`** — exact, when the local work already has one.
2. **ISBN-13 intersection** — normalise ours to ISBN-13, intersect with the result's `isbn` array. Note the array is often empty; this cannot be the only rule.
3. **Normalised title + overlapping author** — `f_unaccent(lower(title))` equality plus at least one shared author slug.
4. Otherwise, treat it as new.

On manual creation, run rule 3 against local works and, if it hits, return `409` with the existing work so the UI can ask *"é este?"* — but **always allow forcing creation** with `?forcar=1`. A false duplicate block dead-ends the activation path, which is worse than a duplicate row.

**Duplicates will happen.** With no merge tooling, repair is hand-written SQL. That is acceptable below roughly 50 duplicates and is a documented ceiling ([architecture.md](architecture.md) §5).

---

## 8. Failure handling

| Failure | Behaviour |
|---|---|
| Timeout (> 2 s) | `{ results: [], indisponivel: true }`, HTTP 200 |
| Non-200 | Same |
| Malformed JSON | Same; log it |
| Zero results | Normal, expected, ~60% of the time. Show manual add prominently |
| Rate limited (403) | Same as timeout. Back off for the session |

**Open Library being down must never produce an error page.** It degrades to "local search plus manual add", which is the primary path anyway.

---

## 9. Rate limits and attribution

- Cover lookups by ISBN are rate-limited; lookups by CoverID/OLID are not. §5 exists because of this.
- A descriptive `User-Agent` identifying the project and a contact address, per Open Library's guidance.
- Our own cap: 20 external lookups per user per hour.
- Open Library data is openly licensed and attribution is courteous: a line in the site footer — *"Dados bibliográficos parcialmente do Open Library"* — and a link on any book page carrying an `ol_work_key`.

---

## 10. Alternatives considered

| Option | Verdict |
|---|---|
| **Open Library as the catalog** | **Rejected on measurement.** 40% coverage, 8.4 s average latency |
| Google Books API | Likely better Brazilian coverage, but needs a key, has a daily quota, and its terms are more restrictive. **Worth measuring post-MVP** as an enrichment source alongside Open Library — recorded in [open-questions.md](open-questions.md) |
| ISBNdb | Paid. Violates the zero-cost constraint |
| Scraping a Brazilian retailer | Fragile, legally murky, and an ongoing maintenance burden |
| Bulk-importing Open Library's dumps | 20M+ records against a 0.5 GB database, to fix a problem that manual entry already solves at this scale |
| **Community catalog + manual add** | **Chosen.** Zero dependencies, zero cost, instant search, and it improves with use |

---

## 11. What to watch after launch

The `search_misses` table is the instrument. Two questions it answers:

1. **Are people failing to find books that exist locally?** → a search problem (stemming, plurals, partial titles). Fixable with better matching.
2. **Are people failing to find books that are not in the catalog yet?** → expected early, and should decay as the catalog fills. **If it does not decay after ~3 months, the manual-add flow has too much friction** and deserves real work.

If misses stay high and manual adds stay low, that is the signal that the catalog assumption was wrong — and it is the one assumption in this architecture most worth being wrong about early.
