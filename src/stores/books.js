import { ref, computed } from 'vue'
import { mapCountryName, getMapCountry } from '@/utils/countries'
import { getAuthorNames } from '@/utils/authors'

/**
 * Store reativa centralizada para os livros.
 * Usa o padrão composable do Vue 3 (singleton via módulo).
 */

const books = ref([])
const isLoaded = ref(false)
const loadError = ref('')

// Filtros
const filterGenre = ref('')
const filterCountry = ref('')
const filterDecade = ref('')
const filterPublisher = ref('')
const normalizePublisher = value => String(value || '').trim().toLocaleLowerCase('pt-BR')
const availablePublishers = computed(() => [...new Map(books.value.filter(book => book.publisher?.trim()).map(book => [normalizePublisher(book.publisher), book.publisher.trim()])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR')))
const sortBy = ref('read_desc')

/**
 * Carrega os livros do JSON (executa apenas uma vez).
 */
async function loadBooks() {
  if (isLoaded.value) return

  loadError.value = ''
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}livros.json`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    setBooks(data)
    isLoaded.value = true
  } catch (error) {
    console.error('Não foi possível carregar os livros:', error)
    loadError.value = 'Não foi possível carregar os livros. Atualize a página ou tente novamente mais tarde.'
  }
}

function setBooks(data) {
    books.value = data.map((book, index) => ({
      ...book,
      _snapshot: JSON.stringify(book),
      original_index: index,
      pages: book.pages || 0,
      year: book.year || 0,
      country: mapCountryName(book.country),
      decade: book.year ? Math.floor(book.year / 10) * 10 : null,
    }))
}

async function manageBook(method, book, original = null) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/books`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book, index: original?.original_index, snapshot: original?._snapshot }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data?.books)) throw new Error(data?.error || 'Não foi possível salvar. Execute o servidor do projeto e tente novamente.')
  setBooks(data.books)
  isLoaded.value = true
  loadError.value = ''
}

// --- Computed: listas de filtros disponíveis ---

const availableGenres = computed(() => {
  const allGenres = books.value.flatMap((b) => b.genre || [])
  return [...new Set(allGenres)].sort()
})

const availableCountries = computed(() => {
  const countries = new Set(books.value.map((b) => b.country).filter(Boolean))
  return [...countries].sort()
})

const availableDecades = computed(() => {
  const decades = new Set(
    books.value.map((b) => b.decade).filter((d) => d !== null)
  )
  return [...decades].sort((a, b) => b - a)
})

// --- Computed: filtros ativos ---

const hasActiveFilters = computed(
  () => filterGenre.value || filterCountry.value || filterDecade.value || filterPublisher.value
)

function resetFilters() {
  filterGenre.value = ''
  filterCountry.value = ''
  filterDecade.value = ''
  filterPublisher.value = ''
}

// --- Computed: livros filtrados e ordenados ---

const sortedBooks = computed(() => {
  let list = [...books.value]
  if (filterPublisher.value) {
    list = list.filter(book => normalizePublisher(book.publisher) === normalizePublisher(filterPublisher.value))
  }

  if (filterGenre.value) {
    list = list.filter((b) => {
      if (!b.genre || !b.genre.length) return false
      return b.genre.includes(filterGenre.value)
    })
  }
  if (filterCountry.value) {
    list = list.filter((b) => b.country === filterCountry.value || getMapCountry(b.country) === filterCountry.value)
  }
  if (filterDecade.value) {
    list = list.filter((b) => b.decade === Number(filterDecade.value))
  }

  return list.sort((a, b) => {
    if (sortBy.value === 'read_desc') {
      const diff = Number(b.read_in) - Number(a.read_in)
      return diff === 0 ? b.original_index - a.original_index : diff
    }
    if (sortBy.value === 'read_asc') {
      const diff = Number(a.read_in) - Number(b.read_in)
      return diff === 0 ? a.original_index - b.original_index : diff
    }
    if (sortBy.value === 'rating') {
      const diff = (Number(b.rate) || 0) - (Number(a.rate) || 0)
      return diff === 0 ? b.original_index - a.original_index : diff
    }
    if (sortBy.value === 'year_desc') {
      const diff = (Number(b.year) || 0) - (Number(a.year) || 0)
      return diff === 0 ? b.original_index - a.original_index : diff
    }
    if (sortBy.value === 'year_asc') {
      const diff = (Number(a.year) || 0) - (Number(b.year) || 0)
      return diff === 0 ? a.original_index - b.original_index : diff
    }
    if (sortBy.value === 'pages_desc') {
      const diff = (Number(b.pages) || 0) - (Number(a.pages) || 0)
      return diff === 0 ? b.original_index - a.original_index : diff
    }
    if (sortBy.value === 'pages_asc') {
      const diff = (Number(a.pages) || 0) - (Number(b.pages) || 0)
      return diff === 0 ? a.original_index - b.original_index : diff
    }
    if (sortBy.value === 'alpha') {
      const diff = a.title.localeCompare(b.title)
      return diff === 0 ? a.original_index - b.original_index : diff
    }
    return 0
  })
})

// --- Computed: estatísticas globais ---

const totalBooks = computed(() => books.value.length)

const uniqueAuthors = computed(
  () => authors.value.length
)

const uniqueCountries = computed(
  () => new Set(books.value.map((b) => b.country).filter(Boolean)).size
)

const totalPages = computed(() =>
  sortedBooks.value.reduce((acc, book) => acc + book.pages, 0)
)

const averagePages = computed(() => {
  if (sortedBooks.value.length === 0) return 0
  return Math.round(totalPages.value / sortedBooks.value.length)
})

const chartData = computed(() => {
  const counts = {}
  books.value.forEach((book) => {
    const c = getMapCountry(book.country)
    if (c) counts[c] = (counts[c] || 0) + 1
  })
  const data = [['Country', 'Livros']]
  for (const [country, count] of Object.entries(counts)) {
    const labels = [...new Set(books.value.filter(book => getMapCountry(book.country) === country).map(book => book.country))]
    data.push([{ v: country, f: labels.join(' / ') }, count])
  }
  return data
})

// --- Computed: dados de autores ---

const authors = computed(() => {
  const map = Object.create(null)
  books.value.forEach((book) => {
    for (const name of getAuthorNames(book.author)) {
      const key = name.toLocaleLowerCase('pt-BR')
      if (!map[key]) {
        map[key] = {
          name,
          country: book.country,
          books: [],
          totalPages: 0,
          totalRate: 0,
          ratedCount: 0,
        }
      }
      map[key].books.push(book)
      map[key].totalPages += book.pages
      if (book.rate) {
        map[key].totalRate += book.rate
        map[key].ratedCount++
      }
    }
  })

  return Object.values(map).map((a) => ({
    ...a,
    bookCount: a.books.length,
    averageRate: a.ratedCount > 0
      ? Math.round((a.totalRate / a.ratedCount) * 10) / 10
      : null,
  }))
})

/**
 * Composable que expõe a store de livros.
 */
export function useBooks() {
  return {
    // Data
    books,
    isLoaded,
    loadError,
    loadBooks,
    manageBook,

    // Filtros
    filterGenre,
    filterCountry,
    filterDecade,
    filterPublisher,
    availablePublishers,
    sortBy,
    availableGenres,
    availableCountries,
    availableDecades,
    hasActiveFilters,
    resetFilters,

    // Livros processados
    sortedBooks,

    // Estatísticas
    totalBooks,
    uniqueAuthors,
    uniqueCountries,
    totalPages,
    averagePages,
    chartData,

    // Autores
    authors,
  }
}
