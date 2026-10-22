# Metrics Runbook

Operational queries and guidance for monitoring catalog coverage, search health, and user adoption.

## Context & Philosophy

- **`psql` is the interface.** There are no dashboards, external event trackers, or third-party analytics services.
- Most product metrics are already recorded directly in primary tables:
  - Account registrations: `users.created_at`
  - Reading entries: `reading_logs.created_at`
  - Active users: `reading_logs` grouped by `user_id`
- `search_misses` is the only dedicated telemetry table in the system. It logs queries that returned zero results to validate the central architectural premise: that a community-built catalog plus manual book entry is sufficient.

---

## Key Queries

Run these queries directly in `psql` against the production database.

### 1. Most-missed queries

Identifies what books or terms users searched for and failed to find.

```sql
-- Most-missed queries
SELECT query, count(*) FROM search_misses
GROUP BY query ORDER BY count(*) DESC LIMIT 30;
```

### 2. Miss rate trend by week: is the catalog filling up?

Monitors search miss volume aggregated weekly to assess catalog growth.

```sql
-- Miss rate trend by week: is the catalog filling up?
SELECT date_trunc('week', created_at) AS week, count(*)
FROM search_misses GROUP BY 1 ORDER BY 1;
```

### 3. THE metric that decides the project

Measures active engagement: friends who logged at least three books in the last 30 days.

```sql
-- THE metric that decides the project
SELECT u.handle, count(*) AS livros
FROM reading_logs l JOIN users u ON u.id = l.user_id
WHERE l.created_at > now() - interval '30 days'
GROUP BY u.handle HAVING count(*) >= 3;
```

---

## Interpreting Search Misses

When reviewing rows in `search_misses`, differentiate between two distinct root causes:

1. **The book *is* in the catalog:**
   - **Diagnosis:** This is a **search** problem (matching, plurals, inflection, partial titles, diacritics, or author-only queries).
   - **Action:** Compare the search miss against `works.search_text` and `authors.name`. Tune matching, ranking, or prefix query logic in `server/services/search.ts`.

2. **The book is *not* in the catalog:**
   - **Diagnosis:** Normal catalog absence. This is expected early in the project lifecycle and should **decay** over time as users manually add works and expand the catalog.
   - **The 3-Month Test:** If misses for absent books do not decay after ~3 months of active use, the manual-add flow has too much friction and requires dedicated UX simplification.

---

## Data & Privacy Notes

- **Stored as Typed:** Queries are stored trimmed, but not normalised (no lowercasing or unaccenting). Typos and formatting quirks are crucial signal explaining why the search did not match.
- **Short Queries Excluded:** Queries shorter than 2 characters return empty by design and are never written to `search_misses`.
- **User Privacy & Retention:** Anonymous searches record `user_id` as `NULL`. Logged-in searches associate `user_id` with `ON DELETE SET NULL` on account deletion. Queries may contain personal text; treat `search_misses` as user data in backups and retention schedules.
- **Fire-and-Forget:** Telemetry writes never block or fail search responses.
