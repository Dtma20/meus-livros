// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, createApp, defineComponent, h, reactive } from 'vue'

const routeState = vi.hoisted(() => ({ current: null as null | { query: Record<string, string> } }))

// The page imports useRoute from vue-router, so the route is supplied through the module itself.
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => routeState.current,
    useRouter: () => undefined,
  }
})

// The page's own LogForm is out of scope here; the stub shows which work it was given.
vi.mock('../../app/components/log/LogForm.vue', async () => {
  const { defineComponent: define, h: create } = await import('vue')
  return {
    default: define({
      name: 'LogFormStub',
      props: { initialWork: { type: Object, default: null } },
      setup(props) {
        return () =>
          create('div', {
            class: 'log-form-stub',
            'data-work-id': props.initialWork?.id ?? '',
          }, props.initialWork?.title ?? '')
      },
    }),
  }
})

interface PendingRequest {
  url: string
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

let pending: PendingRequest[] = []
let route: { query: Record<string, string> }
let Page: Component | undefined

const globalScope = globalThis as unknown as Record<string, unknown>

vi.hoisted(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.definePageMeta = () => {}
  scope.useSeoMeta = () => {}
})

const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

// The page fetches the work when work_id changes; each request stays pending until the test answers it.
function requestWork(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    pending.push({ url, resolve, reject })
  })
}

function answer(url: string, body: unknown): void {
  const index = pending.findIndex((request) => request.url === url)
  if (index < 0) throw new Error(`no pending request for ${url}`)
  const [request] = pending.splice(index, 1)
  request?.resolve(body)
}

function fail(url: string): void {
  const index = pending.findIndex((request) => request.url === url)
  if (index < 0) throw new Error(`no pending request for ${url}`)
  const [request] = pending.splice(index, 1)
  request?.reject(new Error('network down'))
}

function workDetails(id: string, title: string) {
  return {
    id,
    slug: id,
    title,
    authors: [{ name: 'Autora', slug: 'autora' }],
    first_published_year: 1900,
    cover_url: null,
    log_count: 0,
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function mountPage() {
  if (!Page) {
    Page = (await import('../../app/pages/app/novo.vue')).default as Component
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Page)
  app.component('NuxtLink', NuxtLinkStub)
  app.mount(host)
  await flush()

  const wrapper = {
    host,
    text: () => host.textContent ?? '',
    logFormWorkId: () => host.querySelector('.log-form-stub')?.getAttribute('data-work-id') ?? null,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
  mounted.push(wrapper)
  return wrapper
}

const mounted: Array<{ unmount: () => void }> = []

describe('/app/novo work selection', () => {
  beforeEach(() => {
    pending = []
    route = reactive({ query: { work_id: 'work-a' } })
    routeState.current = route
    globalScope.$fetch = (url: string) => requestWork(url)
  })

  afterEach(() => {
    while (mounted.length > 0) {
      try {
        mounted.pop()?.unmount()
      } catch {}
    }
    document.body.innerHTML = ''
    routeState.current = null
    delete globalScope.$fetch
  })

  it('keeps the selected work when an earlier selection answers last', async () => {
    const page = await mountPage()

    route.query.work_id = 'work-b'
    await flush()
    answer('/api/works/work-b', workDetails('work-b', 'Livro B'))
    await flush()
    expect(page.logFormWorkId()).toBe('work-b')

    answer('/api/works/work-a', workDetails('work-a', 'Livro A'))
    await flush()

    expect(page.logFormWorkId()).toBe('work-b')
    expect(page.text()).toContain('Livro B')
    expect(page.text()).not.toContain('Livro A')
  })

  it('ignores an earlier selection failure after the current work loaded', async () => {
    const page = await mountPage()

    route.query.work_id = 'work-b'
    await flush()
    answer('/api/works/work-b', workDetails('work-b', 'Livro B'))
    await flush()

    fail('/api/works/work-a')
    await flush()

    expect(page.logFormWorkId()).toBe('work-b')
    expect(page.text()).not.toContain('Não foi possível carregar os detalhes deste livro.')
  })

  it('keeps the loading state until the current selection answers', async () => {
    const page = await mountPage()

    route.query.work_id = 'work-b'
    await flush()
    answer('/api/works/work-a', workDetails('work-a', 'Livro A'))
    await flush()

    expect(page.text()).toContain('Carregando dados do livro...')
    expect(page.logFormWorkId()).toBeNull()

    answer('/api/works/work-b', workDetails('work-b', 'Livro B'))
    await flush()
    expect(page.logFormWorkId()).toBe('work-b')
  })
})
