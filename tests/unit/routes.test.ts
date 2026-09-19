// @vitest-environment happy-dom
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import DefaultLayout from '../../app/layouts/default.vue'
import AppLayout from '../../app/layouts/app.vue'
import ErrorPage from '../../app/error.vue'
import IndexPage from '../../app/pages/index.vue'
import ProfilePage from '../../app/pages/@[handle].vue'
import BookPage from '../../app/pages/livro/[slug].vue'
import EntryPage from '../../app/pages/entrada/[id].vue'
import LoginPage from '../../app/pages/entrar.vue'
import WelcomePage from '../../app/pages/app/bem-vindo.vue'
import NewBookPage from '../../app/pages/app/novo.vue'
import EditProfilePage from '../../app/pages/app/perfil.vue'
import EditEntryPage from '../../app/pages/app/entrada/[id]/editar.vue'
import authMiddleware from '../../app/middleware/auth'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null
  })
  globalScope.navigateTo = (to: string, options?: Record<string, unknown>) => ({
    path: to,
    ...options
  })
  globalScope.clearError = (opts?: unknown) => opts
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  }
})

const NuxtLayout = defineComponent({
  name: 'NuxtLayout',
  props: { name: { type: String, default: 'default' } },
  setup(props, { slots }) {
    if (props.name === 'default') {
      return () => h(DefaultLayout, null, slots)
    }
    return () => h('div', { class: `layout-${props.name}` }, slots.default?.())
  }
})

function mount<T extends Component>(
  component: T,
  props: Record<string, unknown> = {},
  router?: Router
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(component, props)
  app.component('NuxtLink', NuxtLink)
  app.component('NuxtLayout', NuxtLayout)
  if (router) {
    app.use(router)
  }
  const vm = app.mount(container)

  return {
    container,
    vm,
    text: () => container.textContent?.trim() ?? '',
    find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
    findAll: <E extends Element = Element>(selector: string) => Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    }
  }
}

type MiddlewareHandler = (to: { path: string; fullPath: string }) => unknown

const runAuthMiddleware = authMiddleware as unknown as MiddlewareHandler

describe('Layout: default.vue', () => {
  it('renders header with site title linking to /', () => {
    const wrapper = mount(DefaultLayout)
    const titleLink = wrapper.find('header a.site-title')
    expect(titleLink).not.toBeNull()
    expect(titleLink?.getAttribute('href')).toBe('/')
    expect(titleLink?.textContent?.trim()).toBe('Meus Livros')
    wrapper.unmount()
  })

  it('renders main container matching .container', () => {
    const wrapper = mount(DefaultLayout)
    const main = wrapper.find('main.container')
    expect(main).not.toBeNull()
    wrapper.unmount()
  })

  it('renders footer with Open Library attribution line', () => {
    const wrapper = mount(DefaultLayout)
    const footer = wrapper.find('footer.site-footer')
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain('Dados bibliográficos parcialmente do Open Library')
    wrapper.unmount()
  })

  it('renders default nav linking to /entrar', () => {
    const wrapper = mount(DefaultLayout)
    const navLink = wrapper.find('nav.site-nav a')
    expect(navLink).not.toBeNull()
    expect(navLink?.getAttribute('href')).toBe('/entrar')
    expect(navLink?.textContent?.trim()).toBe('Entrar')
    wrapper.unmount()
  })
})

describe('Layout: app.vue', () => {
  it('extends default layout and provides authenticated nav (Registrar livro / Perfil / Sair)', () => {
    const wrapper = mount(AppLayout)
    const navLinks = wrapper.findAll('nav.site-nav a')
    const linkData = navLinks.map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim()
    }))

    expect(linkData).toEqual([
      { href: '/app/novo', text: 'Registrar livro' },
      { href: '/app/perfil', text: 'Perfil' },
      { href: '/entrar', text: 'Sair' }
    ])

    expect(wrapper.text()).toContain('Dados bibliográficos parcialmente do Open Library')
    wrapper.unmount()
  })
})

describe('Error page: error.vue', () => {
  it('handles 404 with pt-BR copy and a link home', () => {
    const wrapper = mount(ErrorPage, {
      error: { statusCode: 404 }
    })
    expect(wrapper.text()).toContain('404')
    expect(wrapper.text()).toContain('Página não encontrada')
    expect(wrapper.text()).toContain('A página que você procura não existe ou foi removida.')

    const homeLink = wrapper.find('a.error-link')
    expect(homeLink).not.toBeNull()
    expect(homeLink?.getAttribute('href')).toBe('/')
    expect(homeLink?.textContent?.trim()).toBe('Voltar ao início')
    wrapper.unmount()
  })

  it('handles 500 with pt-BR copy and does not render stack trace or error internals', () => {
    const wrapper = mount(ErrorPage, {
      error: {
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        message: 'Sensitive database failure message',
        stack: 'Error: at Query.run (/server/db/secret.ts:12:34)'
      }
    })
    expect(wrapper.text()).toContain('Erro')
    expect(wrapper.text()).toContain('Ocorreu um erro no servidor')
    expect(wrapper.text()).toContain('Não foi possível processar a requisição. Tente novamente mais tarde.')
    expect(wrapper.text()).not.toContain('Sensitive database failure message')
    expect(wrapper.text()).not.toContain('/server/db/secret.ts')

    const homeLink = wrapper.find('a.error-link')
    expect(homeLink).not.toBeNull()
    expect(homeLink?.getAttribute('href')).toBe('/')
    wrapper.unmount()
  })
})

describe('robots.txt', () => {
  it('contains Disallow: /app/', () => {
    const robotsPath = path.resolve('public/robots.txt')
    expect(fs.existsSync(robotsPath)).toBe(true)
    const content = fs.readFileSync(robotsPath, 'utf8')
    expect(content).toContain('Disallow: /app/')
  })
})

describe('Auth middleware: auth.ts', () => {
  it('redirects unauthenticated users from /app/novo to /entrar?next=/app/novo with 302', () => {
    const result = runAuthMiddleware({
      path: '/app/novo',
      fullPath: '/app/novo'
    })
    expect(result).toEqual({
      path: '/entrar?next=/app/novo',
      redirectCode: 302
    })
  })

  it('redirects unauthenticated users from /app/bem-vindo to /entrar?next=/app/bem-vindo with 302', () => {
    const result = runAuthMiddleware({
      path: '/app/bem-vindo',
      fullPath: '/app/bem-vindo'
    })
    expect(result).toEqual({
      path: '/entrar?next=/app/bem-vindo',
      redirectCode: 302
    })
  })

  it('does not redirect public paths', () => {
    expect(runAuthMiddleware({ path: '/', fullPath: '/' })).toBeUndefined()
    expect(runAuthMiddleware({ path: '/@diogo', fullPath: '/@diogo' })).toBeUndefined()
    expect(runAuthMiddleware({ path: '/livro/x', fullPath: '/livro/x' })).toBeUndefined()
    expect(runAuthMiddleware({ path: '/entrada/x', fullPath: '/entrada/x' })).toBeUndefined()
    expect(runAuthMiddleware({ path: '/entrar', fullPath: '/entrar' })).toBeUndefined()
  })
})

describe('Page stubs and route parameters', () => {
  it('/@diogo resolves and exposes handle === "diogo"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/@:handle()', name: '@handle', component: ProfilePage }]
    })

    await router.push('/@diogo')
    const wrapper = mount(ProfilePage, {}, router)
    await nextTick()

    expect(router.currentRoute.value.params.handle).toBe('diogo')
    expect(wrapper.text()).toContain('Perfil de @diogo')
    expect(wrapper.text()).toContain('Handle: diogo')
    wrapper.unmount()
  })

  it('/livro/x resolves and exposes slug === "x"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/livro/:slug()', name: 'livro-slug', component: BookPage }]
    })

    await router.push('/livro/dom-casmurro')
    const wrapper = mount(BookPage, {}, router)
    await nextTick()

    expect(router.currentRoute.value.params.slug).toBe('dom-casmurro')
    expect(wrapper.text()).toContain('Livro: dom-casmurro')
    expect(wrapper.text()).toContain('Slug: dom-casmurro')
    wrapper.unmount()
  })

  it('/entrada/x resolves and exposes id === "x"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/entrada/:id()', name: 'entrada-id', component: EntryPage }]
    })

    await router.push('/entrada/42')
    const wrapper = mount(EntryPage, {}, router)
    await nextTick()

    expect(router.currentRoute.value.params.id).toBe('42')
    expect(wrapper.text()).toContain('Entrada: 42')
    expect(wrapper.text()).toContain('ID da entrada: 42')
    wrapper.unmount()
  })

  it('renders index and login pages', () => {
    const wIndex = mount(IndexPage)
    expect(wIndex.text()).toContain('Início')
    wIndex.unmount()

    const wLogin = mount(LoginPage)
    expect(wLogin.text()).toContain('Entrar')
    wLogin.unmount()
  })

  it('renders all /app/* stub pages', async () => {
    const wWelcome = mount(WelcomePage)
    expect(wWelcome.text()).toContain('Bem-vindo')
    wWelcome.unmount()

    const wNew = mount(NewBookPage)
    expect(wNew.text()).toContain('Registrar livro')
    wNew.unmount()

    const wProfile = mount(EditProfilePage)
    expect(wProfile.text()).toContain('Editar perfil')
    wProfile.unmount()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/entrada/:id()/editar', name: 'app-entrada-id-editar', component: EditEntryPage }]
    })
    await router.push('/app/entrada/99/editar')
    const wEdit = mount(EditEntryPage, {}, router)
    await nextTick()
    expect(wEdit.text()).toContain('Editar entrada: 99')
    wEdit.unmount()
  })
})
