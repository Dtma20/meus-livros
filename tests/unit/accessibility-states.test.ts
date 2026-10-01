// @vitest-environment happy-dom
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
  type Ref,
} from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import AddBookForm from '../../app/components/search/AddBookForm.vue'
import LogForm from '../../app/components/log/LogForm.vue'
import AppLayout from '../../app/layouts/app.vue'
import DefaultLayout from '../../app/layouts/default.vue'

const WCAG_21_A_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const state = new Map<string, Ref<unknown>>()
const globals = globalThis as unknown as Record<string, unknown>
let activeRouter: Router | null = null
let generatedId = 0
const cleanupApps: Array<() => void> = []

function useNuxtState<T>(key: string, init?: () => T): Ref<T> {
  const existing = state.get(key)
  if (existing) return existing as Ref<T>
  const value = ref<unknown>(init ? init() : null)
  state.set(key, value)
  return value as Ref<T>
}

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: [String, Object], default: '#' } },
  setup(props, { attrs, slots }) {
    return () => h('a', {
      ...attrs,
      href: typeof props.to === 'string' ? props.to : '#',
    }, slots.default?.())
  },
})

const NuxtLayout = defineComponent({
  name: 'NuxtLayout',
  setup(_props, { slots }) {
    return () => h(DefaultLayout, null, slots)
  },
})

function installNuxtGlobals(): void {
  globals.useState = useNuxtState
  globals.useId = () => `a11y-${generatedId++}`
  globals.navigateTo = vi.fn(async () => undefined)
  globals.$fetch = vi.fn(async () => ({ works: [], editions: [] }))
  globals.useRoute = () => activeRouter?.currentRoute.value ?? { path: '/', fullPath: '/' }
  globals.useRouter = () => activeRouter
}

function mountComponent(component: Component, props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(component, props)
  app.component('NuxtLink', NuxtLink)
  app.component('NuxtLayout', NuxtLayout)
  app.mount(host)
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    app.unmount()
    host.remove()
  }
  cleanupApps.push(unmount)
  return { host, unmount }
}

async function createTestRouter(): Promise<Router> {
  const EmptyRoute = defineComponent({ render: () => h('div') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: EmptyRoute }, { path: '/app/novo', component: EmptyRoute }],
  })
  await router.push('/')
  await router.isReady()
  activeRouter = router
  return router
}

async function createRouterForComponent(
  component: Component,
  props: Record<string, unknown>,
): Promise<Router> {
  const routePath = '/app/novo'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: routePath, component, props }],
  })
  await router.push(routePath)
  await router.isReady()
  activeRouter = router
  return router
}

async function flushVue(): Promise<void> {
  for (let index = 0; index < 4; index++) await nextTick()
}

async function expectNoWcag21Violations(root: Element, scenario: string): Promise<void> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: WCAG_21_A_AA_TAGS },
    // happy-dom cannot provide reliable rendered color contrast.
    rules: { 'color-contrast': { enabled: false } },
  })
  const diagnostics = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }))

  expect(diagnostics, `${scenario}\n${JSON.stringify(diagnostics, null, 2)}`).toEqual([])
}

async function mountAuthenticatedLayout() {
  const router = await createTestRouter()
  state.set('auth:session', ref({ user: { handle: 'leitor-teste' }, hasProfile: true, fetched: true }))
  state.set('keyboard-shortcut-preferences', ref({ characterKeyShortcutsEnabled: true, loaded: true }))
  state.set('flash:message', ref(null))
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(AppLayout, null, {
      default: () => h('section', { 'aria-labelledby': 'fixture-heading' }, [
        h('h1', { id: 'fixture-heading' }, 'Biblioteca autenticada'),
        h('p', 'Conteúdo de teste da área protegida.'),
      ]),
    }),
  })
  app.use(router)
  app.component('NuxtLink', NuxtLink)
  app.component('NuxtLayout', NuxtLayout)
  app.mount(host)
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    app.unmount()
    host.remove()
  }
  cleanupApps.push(unmount)
  await flushVue()

  return {
    host,
    unmount,
  }
}

beforeEach(() => {
  state.clear()
  localStorage.clear()
  generatedId = 0
  installNuxtGlobals()
})

afterEach(() => {
  for (const unmount of cleanupApps.splice(0)) unmount()
  document.body.replaceChildren()
  localStorage.clear()
  activeRouter = null
})

describe('accessible rendered interface states', () => {
  it('scans the authenticated app layout with its navigation and live region', async () => {
    const wrapper = await mountAuthenticatedLayout()

    expect(wrapper.host.querySelector('main#conteudo-principal')).not.toBeNull()
    expect(wrapper.host.querySelector('nav[aria-label="Navegação inferior"]')).not.toBeNull()
    await expectNoWcag21Violations(wrapper.host, 'Authenticated app layout')

    wrapper.unmount()
  })

  it('scans the real shortcuts dialog after the authenticated navigation opens it', async () => {
    const wrapper = await mountAuthenticatedLayout()
    const openButton = wrapper.host.querySelector<HTMLButtonElement>('.nav-shortcuts')
    if (!openButton) throw new Error('Authenticated shortcuts button not found')

    openButton.click()
    await flushVue()
    const dialog = wrapper.host.querySelector<HTMLDialogElement>('dialog.shortcuts-dialog')
    expect(dialog?.open).toBe(true)
    await expectNoWcag21Violations(wrapper.host, 'Shortcuts dialog open')

    wrapper.unmount()
  })

  it('scans LogForm with a validation error and the new-edition form open', async () => {
    const work = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'a-obra',
      title: 'A Obra',
      authors: [{ name: 'Autora', slug: 'autora' }],
      first_published_year: 1999,
      cover_url: null,
      log_count: 0,
    }
    const router = await createRouterForComponent(LogForm, {
      mode: 'create',
      initialWork: work,
    })
    state.set('auth:session', ref({ user: { id: 'a11y-test-user' } }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(RouterView) })
    app.use(router)
    app.component('NuxtLink', NuxtLink)
    app.mount(host)
    const unmount = () => {
      app.unmount()
      host.remove()
    }
    cleanupApps.push(unmount)
    await flushVue()

    const finishedOn = host.querySelector<HTMLInputElement>('#log-finished-on')
    const form = host.querySelector<HTMLFormElement>('form.log-form')
    if (!finishedOn || !form) throw new Error('LogForm fields not found')
    finishedOn.value = ''
    finishedOn.dispatchEvent(new Event('input', { bubbles: true }))
    finishedOn.dispatchEvent(new Event('change', { bubbles: true }))
    await flushVue()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushVue()

    const finishedOnError = host.querySelector('#log-finished-on-error')
    expect(finishedOnError?.textContent ?? host.textContent).toContain('data de término')
    const invalidFinishedOn = host.querySelector<HTMLInputElement>('#log-finished-on')
    expect(invalidFinishedOn?.getAttribute('aria-describedby'), host.innerHTML)
      .toContain('log-finished-on-error')
    await expectNoWcag21Violations(host, 'Log form with inline validation error')

    const editionToggle = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Li outra edição'))
    if (!editionToggle) throw new Error('Edition picker control not found')
    editionToggle.click()
    await flushVue()
    const newEditionToggle = host.querySelector<HTMLButtonElement>('.new-edition-toggle')
    if (!newEditionToggle) throw new Error('New edition control not found')
    newEditionToggle.click()
    await flushVue()

    const pages = host.querySelector<HTMLInputElement>('#log-new-edition-pages')
    const createEdition = host.querySelector<HTMLButtonElement>('.edition-create-btn')
    if (!pages || !createEdition) throw new Error('New edition fields not found')
    pages.value = '-1'
    pages.dispatchEvent(new Event('input', { bubbles: true }))
    await flushVue()
    createEdition.click()
    await flushVue()

    expect(pages.getAttribute('aria-invalid')).toBe('true')
    expect(pages.getAttribute('aria-describedby')).toBe('log-new-edition-pages-error')
    await expectNoWcag21Violations(host, 'Log form with new-edition validation error')
    unmount()
  })

  it('scans the real author autocomplete with a loaded suggestion', async () => {
    globals.$fetch = vi.fn(async () => ({
      works: [{
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'obra-da-autora',
        title: 'Obra da Autora',
        authors: [{ name: 'Maria Autora', slug: 'maria-autora' }],
        first_published_year: null,
        cover_url: null,
        log_count: 0,
      }],
    }))
    state.set('auth:session', ref({ user: { id: 'a11y-test-user' } }))
    const wrapper = mountComponent(AddBookForm, { initialTitle: 'Livro de teste' })
    const authorInput = wrapper.host.querySelector<HTMLInputElement>('#author-input')
    if (!authorInput) throw new Error('Author autocomplete input not found')

    authorInput.focus()
    authorInput.value = 'Ma'
    authorInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await flushVue()

    expect(wrapper.host.querySelector('[role="combobox"]')).not.toBeNull()
    expect(wrapper.host.querySelector('[role="listbox"] [role="option"]')?.textContent)
      .toContain('Maria Autora')
    await expectNoWcag21Violations(wrapper.host, 'Author autocomplete suggestions open')

    wrapper.unmount()
  })
})
