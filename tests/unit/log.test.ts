// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import RatingInput from '../../app/components/book/RatingInput.vue'
import {
  getTodaySaoPaulo,
  isFutureDateSaoPaulo,
  logInputSchema,
  ratingSchema,
  reviewSchema,
  updateLogInputSchema,
} from '../../shared/schemas/log'

vi.hoisted(() => {
  // RatingInput reaches for Nuxt's auto-imported useId to tie its label to the
  // slider. Mounting the component outside Nuxt means providing it.
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-rating-id'
})

describe('shared/schemas/log.ts - ratingSchema', () => {
  it('accepts 0.5 and 5.0 (min and max)', () => {
    expect(ratingSchema.safeParse(0.5).success).toBe(true)
    expect(ratingSchema.safeParse(5.0).success).toBe(true)
  })

  it('accepts half-star steps (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5)', () => {
    for (const r of [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]) {
      expect(ratingSchema.safeParse(r).success).toBe(true)
    }
  })

  it('rejects 3.7 with validation error', () => {
    const result = ratingSchema.safeParse(3.7)
    expect(result.success).toBe(false)
  })

  it('rejects values out of bounds (< 0.5, > 5.0)', () => {
    expect(ratingSchema.safeParse(0).success).toBe(false)
    expect(ratingSchema.safeParse(0.2).success).toBe(false)
    expect(ratingSchema.safeParse(5.5).success).toBe(false)
    expect(ratingSchema.safeParse(6).success).toBe(false)
  })
})

describe('shared/schemas/log.ts - reviewSchema', () => {
  it('accepts plain text up to 10,000 characters', () => {
    const text = 'A'.repeat(10000)
    expect(reviewSchema.safeParse(text).success).toBe(true)
  })

  it('rejects text over 10,000 characters', () => {
    const text = 'A'.repeat(10001)
    expect(reviewSchema.safeParse(text).success).toBe(false)
  })

  it('preserves HTML tags literally without stripping or escaping in schema', () => {
    const raw = '<script>alert(1)</script>'
    const parsed = reviewSchema.parse(raw)
    expect(parsed).toBe(raw)
  })
})

describe('shared/schemas/log.ts - Timezone & Date validation', () => {
  it('a log created at 22:00 in Brazil records today Brazilian date, not tomorrow', () => {
    // At 22:00 BRT (UTC-3) on 2026-09-19:
    // UTC time is 2026-09-20 01:00:00Z.
    const lateNightBrt = new Date('2026-09-20T01:00:00Z')
    const brDate = getTodaySaoPaulo(lateNightBrt)
    expect(brDate).toBe('2026-09-19')

    // Today in BRT is 2026-09-19.
    // So 2026-09-19 is not in the future.
    expect(isFutureDateSaoPaulo('2026-09-19', lateNightBrt)).toBe(false)

    // Tomorrow (2026-09-20) is in the future relative to 22:00 BRT.
    expect(isFutureDateSaoPaulo('2026-09-20', lateNightBrt)).toBe(true)
  })

  it('accepts past dates and rejects future dates', () => {
    const now = new Date('2026-09-19T15:00:00Z') // ~12:00 in SP
    expect(isFutureDateSaoPaulo('2026-09-18', now)).toBe(false)
    expect(isFutureDateSaoPaulo('2026-09-19', now)).toBe(false)
    expect(isFutureDateSaoPaulo('2026-09-20', now)).toBe(true)
  })
})

describe('shared/schemas/log.ts - logInputSchema and updateLogInputSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('accepts log with no rating and no review (date only)', () => {
    const result = logInputSchema.safeParse({
      work_id: validUuid,
      finished_on: '2026-01-01',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rating).toBeUndefined()
      expect(result.data.review).toBeUndefined()
      expect(result.data.visibility).toBe('publico')
      expect(result.data.finished_precision).toBe('dia')
    }
  })

  it('rejects started_on > finished_on', () => {
    const result = logInputSchema.safeParse({
      work_id: validUuid,
      started_on: '2026-05-10',
      finished_on: '2026-05-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepts started_on <= finished_on', () => {
    const result = logInputSchema.safeParse({
      work_id: validUuid,
      started_on: '2026-05-01',
      finished_on: '2026-05-10',
    })
    expect(result.success).toBe(true)
  })

  it('updateLogInputSchema allows updating individual fields', () => {
    const result = updateLogInputSchema.safeParse({
      rating: 4.5,
      review: 'Excelente livro!',
      visibility: 'privado',
    })
    expect(result.success).toBe(true)
  })
})

describe('RatingInput.vue', () => {
  function mountComponent(props: Record<string, unknown> = {}) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(RatingInput, props)
    const vm = app.mount(container)

    return {
      container,
      vm,
      find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
      findAll: <E extends Element = Element>(selector: string) => Array.from(container.querySelectorAll<E>(selector)),
      unmount: () => {
        app.unmount()
        container.remove()
      },
    }
  }

  it('renders slider role with aria-valuenow and aria attributes', () => {
    const wrapper = mountComponent({ modelValue: 3.5 })
    const slider = wrapper.find('[role="slider"]')
    expect(slider).not.toBeNull()
    expect(slider?.getAttribute('aria-valuenow')).toBe('3.5')
    expect(slider?.getAttribute('aria-valuemin')).toBe('0')
    expect(slider?.getAttribute('aria-valuemax')).toBe('5')
    expect(slider?.getAttribute('aria-valuetext')).toBe('3,5 de 5 estrelas')
    wrapper.unmount()
  })

  it('renders 10 half-star clickable buttons across 5 stars', () => {
    const wrapper = mountComponent({ modelValue: null })
    const halfButtons = wrapper.findAll('.star-half')
    expect(halfButtons).toHaveLength(10)
    wrapper.unmount()
  })

  it('supports keyboard navigation via Arrow keys', async () => {
    let emittedValue: number | null = null
    const wrapper = mountComponent({
      modelValue: 3.0,
      'onUpdate:modelValue': (val: number | null) => {
        emittedValue = val
      },
    })

    const slider = wrapper.find<HTMLElement>('[role="slider"]')

    // ArrowRight increments by 0.5
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(emittedValue).toBe(3.5)

    // ArrowLeft decrements by 0.5
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()
    expect(emittedValue).toBe(2.5)

    // End sets to 5.0
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await nextTick()
    expect(emittedValue).toBe(5.0)

    // Delete clears to null
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await nextTick()
    expect(emittedValue).toBeNull()

    wrapper.unmount()
  })

  it('displays Sem nota and no Limpar button when rating is null', () => {
    const wrapper = mountComponent({ modelValue: null })
    expect(wrapper.container.textContent).toContain('Sem nota')
    expect(wrapper.find('.clear-rating-btn')).toBeNull()
    wrapper.unmount()
  })

  it('displays rating text and Limpar button when rating is set', () => {
    const wrapper = mountComponent({ modelValue: 4.5 })
    expect(wrapper.container.textContent).toContain('4,5 ★')
    expect(wrapper.find('.clear-rating-btn')).not.toBeNull()
    wrapper.unmount()
  })
})
