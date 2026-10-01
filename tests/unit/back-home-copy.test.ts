import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, Suspense } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import EntryPage from '../../app/pages/entrada/[id].vue'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useId = () => 'test-route-id'
  globalScope.setPageLayout = () => {}
  globalScope.useAsyncData = (_key: string, _fn: unknown) => ({
    data: { value: null },
    pending: { value: false },
    error: { value: null },
  })
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null
  })
  globalScope.navigateTo = (to: string, options?: Record<string, unknown>) => ({
    path: to,
    ...options
  })
  globalScope.clearError = (opts?: unknown) => opts
  globalScope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  globalScope.useRequestFetch = () => (globalThis as unknown as Record<string, unknown>).$fetch
  globalScope.useRequestURL = () => new URL('http://localhost:3000/entrada/test')
  globalScope.useSeoMeta = () => {}
  globalScope.useHead = () => {}
  globalScope.createError = (err: unknown) => err
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  }
})

function mount(component: Component, router: Router) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component) })
  })
  app.component('NuxtLink', NuxtLink)
  app.use(router)
  app.mount(container)

  return {
    text: () => container.textContent ?? '',
    links: () => Array.from(container.querySelectorAll<HTMLAnchorElement>('a')),
    unmount: () => {
      app.unmount()
      container.remove()
    }
  }
}

async function mountAt(component: Component, routePath: string, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routePath, component }]
  })
  await router.push(path)
  const wrapper = mount(component, router)
  await nextTick()
  return wrapper
}

describe('back-to-home copy', () => {
  it('entry permalink not-found state links to / with "Ir para o início" in the EmptyState button', async () => {
    const wrapper = await mountAt(EntryPage, '/entrada/:id()', '/entrada/nao-existe')

    expect(wrapper.text()).toContain('Entrada não encontrada')
    expect(wrapper.text()).not.toContain('Voltar para o início')

    const home = wrapper.links().find((a) => a.textContent?.trim() === 'Ir para o início')
    expect(home).toBeDefined()
    expect(home?.getAttribute('href')).toBe('/')
    expect(home?.classList.contains('empty-btn')).toBe(true)
    wrapper.unmount()
  })

  it('edit page not-found state uses "Ir para o início" in its back-link', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/app/entrada/[id]/editar.vue'), 'utf-8')
    expect(source).toContain('<NuxtLink to="/" class="back-link">← Ir para o início</NuxtLink>')
    expect(source).not.toContain('Voltar para o início')
  })
})
