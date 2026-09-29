<template>
  <div class="diary-list">
    <section
      v-for="group in diaryGroups"
      :key="group.title"
      class="diary-group"
      :aria-labelledby="`diary-group-${group.title.toLowerCase().replace(/\s+/g, '-')}`"
    >
      <h2
        :id="`diary-group-${group.title.toLowerCase().replace(/\s+/g, '-')}`"
        class="diary-group-title"
      >
        {{ group.title }}
      </h2>

      <div
        v-for="monthBucket in group.months"
        :key="monthBucket.month || 'reading-now'"
        class="diary-month-section"
      >
        <h3
          v-if="showMonthTitle(group, monthBucket)"
          class="diary-month-title"
        >
          {{ monthBucket.month }}
        </h3>

        <div class="diary-table-wrapper">
          <table class="diary-table">
            <thead>
              <tr>
                <th scope="col" class="col-day">Dia</th>
                <th scope="col" class="col-cover"><span class="sr-only">Capa</span></th>
                <th scope="col" class="col-title">Livro</th>
                <th scope="col" class="col-author">Autor</th>
                <th scope="col" class="col-rating">Nota</th>
                <th scope="col" class="col-format">Formato</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="log in monthBucket.logs"
                :key="log.id"
                class="diary-row"
              >
                <td class="col-day">
                  <span v-if="log.finished_precision === 'dia' && getDiaryDay(log)">
                    {{ getDiaryDay(log) }}
                  </span>
                </td>
                <td class="col-cover">
                  <NuxtLink
                    :to="`/entrada/${log.id}`"
                    class="cover-link"
                    tabindex="-1"
                    aria-hidden="true"
                  >
                    <div class="diary-cover">
                      <BookCover
                        alt=""
                        :title="log.work.title"
                        :cover-url="log.work.cover_url || log.edition?.cover_url"
                        :ol-cover-id="log.edition?.ol_cover_id"
                        :isbn13="log.edition?.isbn13"
                      />
                    </div>
                  </NuxtLink>
                </td>
                <td class="col-title">
                  <NuxtLink
                    :to="`/entrada/${log.id}`"
                    class="diary-title-link"
                  >
                    {{ log.work.title }}
                  </NuxtLink>
                </td>
                <td class="col-author">
                  {{ log.work.authors.map((a) => a.name).join(', ') }}
                </td>
                <td class="col-rating">
                  <StarRating :rating="log.rating" />
                </td>
                <td class="col-format">
                  <span v-if="log.format" class="diary-format-label">
                    {{ formatBookFormat(log.format) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import type { ProfileLogItem } from '~~/shared/schemas/profile'
import { getDiaryDay, groupDiary, type DiaryGroup, type DiaryMonthBucket } from '~/utils/diary'
import { formatBookFormat } from '~/utils/entry'

const props = defineProps<{
  logs: ProfileLogItem[]
}>()

const diaryGroups = computed(() => groupDiary(props.logs))

function showMonthTitle(group: DiaryGroup, bucket: DiaryMonthBucket): boolean {
  if (!bucket.month) return false
  return bucket.monthNumber !== null || group.months.length > 1
}
</script>

<style scoped>
.diary-list {
  width: 100%;
}

.diary-group {
  margin-bottom: var(--space-8, 32px);
}

.diary-group-title {
  font-size: var(--font-size-2xl, 1.5rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 var(--space-4, 16px) 0;
  padding-bottom: var(--space-2, 8px);
  border-bottom: 2px solid var(--input-bg, #2c3440);
  line-height: var(--line-height-tight, 1.2);
}

.diary-month-section {
  margin-bottom: var(--space-6, 24px);
}

.diary-month-title {
  font-size: var(--font-size-lg, 1.125rem);
  font-weight: 600;
  color: var(--text-color, #9ab);
  margin: var(--space-4, 16px) 0 var(--space-2, 8px) 0;
  line-height: var(--line-height-tight, 1.2);
}

.diary-table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.diary-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: var(--font-size-sm, 0.875rem);
}

.diary-table thead th {
  padding: var(--space-2, 8px) var(--space-3, 12px);
  color: var(--text-color, #9ab);
  font-weight: 600;
  font-size: var(--font-size-sm, 0.875rem);
  border-bottom: 1px solid var(--input-bg, #2c3440);
}

.diary-row {
  border-bottom: 1px solid var(--input-bg, #2c3440);
  transition: background-color 0.15s ease;
}

.diary-row:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

.diary-row td {
  padding: var(--space-3, 12px);
  vertical-align: middle;
}

.col-day {
  width: 44px;
  text-align: center;
  font-weight: 600;
  color: var(--text-color, #9ab);
  white-space: nowrap;
}

.col-cover {
  width: 44px;
  padding-left: 0;
  padding-right: var(--space-2, 8px);
}

.cover-link {
  display: block;
  text-decoration: none;
}

.diary-cover {
  width: 32px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
  background-color: var(--input-bg, #2c3440);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.diary-cover :deep(img),
.diary-cover :deep(.book-cover) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.col-title {
  min-width: 180px;
}

.diary-title-link {
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  line-height: var(--line-height-snug, 1.35);
  display: inline-block;
  transition: color 0.15s ease;
}

.diary-title-link:hover {
  color: var(--highlight, #f59e0b);
}

.diary-title-link:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
  border-radius: var(--radius-sm, 4px);
}

.col-author {
  min-width: 140px;
  color: var(--text-color, #9ab);
}

.col-rating {
  width: 110px;
  white-space: nowrap;
}

.col-format {
  width: 110px;
  white-space: nowrap;
}

.diary-format-label {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@media (max-width: 600px) {
  .diary-table thead th,
  .diary-row td {
    padding: var(--space-2, 8px);
  }

  .col-day {
    width: 32px;
  }

  .col-author,
  .col-format {
    display: none;
  }
}
</style>
