import { reactive } from 'vue'
import { getAuthorNames } from '../utils/authors.js'

const savedReviews = reactive({})
const prefix = 'minha-biblioteca:review:v1:'
export function reviewKey(book, collection = 'books') {
  return prefix + JSON.stringify([collection, book.isbn || null, book.title,
    getAuthorNames(book.author).sort(), book.publisher || null, book.year || null])
}

export function useReviews() {
  function readReview(book, collection) {
    const key = reviewKey(book, collection)
    if (Object.hasOwn(savedReviews, key)) return savedReviews[key]
    const stored = localStorage.getItem(key)
    if (stored !== null) savedReviews[key] = stored
    return stored
  }
  async function saveReview(book, collection, text) {
    const key = reviewKey(book, collection)
    const response = await fetch(`${import.meta.env.BASE_URL}api/reviews`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, index: book.original_index, title: book.title,
        isbn: book.isbn || null, previousReview: book.review || null, text }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || typeof data?.review !== 'string') {
      throw new Error(data?.error || 'A gravação no JSON exige o servidor do projeto em execução. Seu texto não foi salvo.')
    }
    book.review = data.review
    book.review_format = 'text'
    if (book._snapshot) book._snapshot = JSON.stringify({ ...JSON.parse(book._snapshot), review: data.review, review_format: 'text' })
    savedReviews[key] = data.review
    try { localStorage.removeItem(key) } catch { /* A gravação no arquivo já foi concluída. */ }
    return data.review
  }
  return { readReview, saveReview }
}
