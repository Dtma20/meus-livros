<template>
  <div v-if="book" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content book-modal">
      <span class="close-btn" @click="$emit('close')">&times;</span>
      <div class="modal-poster">
        <img
          :src="getCover(book)"
          @error="$event.target.src = generatePlaceholderCover(book)"
        />
      </div>
      <div class="modal-details">
        <h2>{{ book.title }}</h2>
        <div v-if="collection === 'books'" class="book-actions">
          <button type="button" :disabled="saving || removing" @click="showBookEditor = true">Editar livro</button>
          <button type="button" :disabled="saving || removing" @click="confirmRemove = true">Remover livro</button>
          <div v-if="confirmRemove" class="remove-confirm" role="alert">
            <p>Remover “{{ book.title }}” da biblioteca e do arquivo JSON?</p>
            <button type="button" :disabled="removing" @click="removeBook">{{ removing ? 'Removendo…' : 'Confirmar remoção' }}</button>
            <button type="button" :disabled="removing" @click="confirmRemove = false">Cancelar</button>
          </div>
          <p v-if="removeError" role="alert">{{ removeError }}</p>
        </div>
        <div class="stars" style="font-size: 1.2rem; margin-bottom: 10px">
          {{ getStars(book.rate) }}
        </div>
        <div class="modal-meta">
          <span>{{ book.year }}</span>
          <span>{{ formatAuthors(book.author) }}</span>
          <span v-if="book.artist">Arte: {{ book.artist }}</span>
          <span v-if="book.format">{{ book.format }}</span>
          <span>{{ book.country }}</span>
          <span>{{ book.pages }} pág.</span>
          <span>Lido em: {{ book.read_in || 'Não informado' }}</span>
          <span>Editora: {{ book.publisher || 'Não informada' }}</span>

          <div v-if="book.genre && book.genre.length" style="margin-top: 8px">
            <span v-for="g in book.genre" :key="g" class="genre-tag" style="color: black">
              {{ g }}
            </span>
          </div>
        </div>
        <div class="review-box">
          <h3>Minha Resenha</h3>
          <form v-if="editing || !hasReview" class="review-editor" @submit.prevent="save">
            <label for="review-text">{{ hasReview ? 'Editar resenha' : 'Escreva sua resenha' }}</label>
            <textarea id="review-text" v-model="draft" :disabled="saving" maxlength="50000" rows="8" placeholder="O que você achou desta leitura?"></textarea>
            <small>Ao salvar, a resenha será gravada no arquivo da coleção.</small>
            <div class="review-actions">
              <button type="submit" :disabled="!draft.trim() || saving">{{ saving ? 'Salvando…' : 'Salvar resenha' }}</button>
              <button v-if="editing" type="button" :disabled="saving" @click="cancelEdit">Cancelar</button>
            </div>
          </form>
          <template v-else>
            <p v-if="localReview !== null || book.review_format === 'text'" class="review-text">{{ localReview ?? book.review }}</p>
            <p v-else class="review-text" v-html="book.review"></p>
            <button type="button" @click="startEdit">Editar resenha</button>
          </template>
          <p v-if="storageError || saveError" role="alert">{{ storageError || saveError }}</p>
          <p v-if="saved" role="status">Resenha salva no arquivo JSON.</p>
        </div>
      </div>
    </div>
    <BookEditor v-if="showBookEditor" :book="book" @close="showBookEditor = false" @saved="emit('close')" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useReviews } from '@/stores/reviews'
import { getCover, generatePlaceholderCover } from '@/utils/covers'
import { getStars } from '@/utils/helpers'
import { formatAuthors } from '@/utils/authors'
import BookEditor from '@/components/BookEditor.vue'
import { useBooks } from '@/stores/books'

const props = defineProps({
  book: { type: Object, default: null },
  collection: { type: String, default: 'books' },
})

const { readReview, saveReview } = useReviews()
const { manageBook } = useBooks()
const showBookEditor = ref(false)
const confirmRemove = ref(false)
const removing = ref(false)
const removeError = ref('')
async function removeBook() {
  if (removing.value) return
  removing.value = true
  removeError.value = ''
  try { await manageBook('DELETE', null, props.book); emit('close') }
  catch (error) { removeError.value = error.message }
  finally { removing.value = false }
}
const localReview = ref(null)
const draft = ref('')
const editing = ref(false)
const saved = ref(false)
const saving = ref(false)
const storageError = ref('')
const saveError = ref('')
const hasReview = computed(() => !!(localReview.value ?? props.book?.review)?.trim())
function reviewText() {
  if (localReview.value !== null) return localReview.value
  if (props.book?.review_format === 'text') return props.book.review || ''
  const html = (props.book?.review || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n')
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
}
watch(() => [props.book, props.collection], () => {
  localReview.value = null
  showBookEditor.value = confirmRemove.value = false
  removeError.value = ''
  draft.value = ''
  editing.value = saved.value = false
  storageError.value = saveError.value = ''
  if (!props.book) return
  try { localReview.value = readReview(props.book, props.collection) }
  catch { /* Sem acesso às resenhas antigas do navegador; usa a versão do JSON. */ }
}, { immediate: true })
function startEdit() {
  draft.value = reviewText()
  editing.value = true
  saved.value = false
  saveError.value = ''
}
function cancelEdit() {
  editing.value = false
  draft.value = ''
  saveError.value = ''
}
async function save() {
  if (!draft.value.trim() || saving.value) return
  const target = props.book
  const text = draft.value.trim()
  saving.value = true
  try {
    const review = await saveReview(target, props.collection, text)
    if (props.book !== target) return
    localReview.value = review
    editing.value = false
    saved.value = true
    saveError.value = ''
  } catch (error) {
    if (props.book === target) saveError.value = `${error.message} Seu texto permanece no campo.`
  } finally { saving.value = false }
}

const emit = defineEmits(['close'])
</script>

<style scoped>
.book-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.book-actions button { padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--input-bg); color: #fff; font: inherit; cursor: pointer; }
.book-actions button:focus-visible { outline: 2px solid var(--highlight); outline-offset: 2px; }
.book-actions button:disabled { opacity: 0.5; cursor: default; }
.remove-confirm { width: 100%; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 6px; }
.review-editor { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.review-editor textarea { width: 100%; min-height: 180px; resize: vertical; padding: 12px; background: var(--input-bg); color: #fff; border: 1px solid var(--border-subtle); border-radius: 6px; font: inherit; }
.review-editor small { color: var(--text-color); }
.review-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.review-box button { padding: 8px 12px; margin-top: 8px; border: 1px solid var(--highlight); border-radius: 6px; background: var(--input-bg); color: #fff; font: inherit; cursor: pointer; }
.review-box button:disabled { opacity: 0.5; cursor: default; }
.review-box :is(button, textarea):focus-visible { outline: 2px solid var(--highlight); outline-offset: 2px; }
.review-text { white-space: pre-wrap; }
.book-modal {
  max-width: 1100px;
  max-height: 92vh;
  padding: 40px;
  gap: 40px;
  overflow-y: auto;
}

.book-modal .modal-poster {
  width: 300px;
}

.book-modal .modal-details {
  min-width: 0;
  overflow: visible;
  overflow-wrap: anywhere;
}

.book-modal .modal-details h2 {
  padding-right: 20px;
}

.book-modal .review-box {
  max-height: none;
  overflow: visible;
}

@media (max-width: 800px) {
  .book-modal {
    flex-direction: column;
    padding: 24px;
    gap: 24px;
  }

  .book-modal .modal-poster {
    width: 180px;
    max-width: 100%;
    margin: 0 auto;
  }
}
</style>
