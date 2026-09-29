<template>
  <div class="modal-overlay editor-overlay" @click.self="!busy && $emit('close')">
    <section class="modal-content editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <h2 id="editor-title">{{ book ? 'Editar livro' : 'Adicionar livro' }}</h2>
      <form @submit.prevent="submit">
        <fieldset :disabled="busy">
          <label>Título *<input v-model="form.title" required autofocus /></label>
          <label>Autores *<textarea v-model="authors" required rows="2" placeholder="Um autor por linha"></textarea><small>Um nome por linha para livros com mais de um autor.</small></label>
          <div class="editor-grid">
            <label v-for="field in fields" :key="field.key">{{ field.label }}
              <input v-model="form[field.key]" :type="field.type || 'text'" :min="field.min" :max="field.max" :step="field.step || 1" />
            </label>
            <label>Formato<select v-model="form.source"><option value="">Não informado</option><option>Físico</option><option>Ebook</option><option v-if="form.source && !['Físico', 'Ebook'].includes(form.source)">{{ form.source }}</option></select></label>
          </div>
          <label>Gêneros<input v-model="genres" placeholder="Ficção, Fantasia, Aventura" /><small>Separe os gêneros por vírgulas.</small></label>
        </fieldset>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="editor-actions">
          <button type="submit" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar livro' }}</button>
          <button type="button" :disabled="busy" @click="$emit('close')">Cancelar</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useBooks } from '@/stores/books'
import { getAuthorNames } from '@/utils/authors'
const props = defineProps({ book: { type: Object, default: null } })
const emit = defineEmits(['close', 'saved'])
const original = props.book?._snapshot ? JSON.parse(props.book._snapshot) : props.book || {}
const form = reactive({ ...original, source: original.source || '', read_in: original.read_in ?? new Date().getFullYear() })
const authors = ref(getAuthorNames(original.author).join('\n'))
const genres = ref((original.genre || []).join(', '))
const busy = ref(false)
const error = ref('')
const { manageBook } = useBooks()
const fields = [
  { key: 'country', label: 'País' }, { key: 'original_language', label: 'Idioma original' },
  { key: 'publisher', label: 'Editora' }, { key: 'year', label: 'Ano de publicação', type: 'number' },
  { key: 'pages', label: 'Páginas', type: 'number', min: 0 }, { key: 'read_in', label: 'Lido em', type: 'number', min: 1 },
  { key: 'rate', label: 'Nota (0,5 a 5)', type: 'number', min: 0.5, max: 5, step: 0.5 },
  { key: 'series_name', label: 'Série' }, { key: 'series_number', label: 'Volume na série' },
  { key: 'isbn', label: 'ISBN' }, { key: 'cover_url', label: 'URL da capa', type: 'url' },
]
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const data = { ...form, author: authors.value.split('\n').map(name => name.trim()).filter(Boolean), genre: genres.value.split(',').map(g => g.trim()).filter(Boolean) }
    for (const key of ['pages', 'year', 'read_in', 'rate']) data[key] = data[key] === '' || data[key] == null ? null : Number(data[key])
    await manageBook(props.book ? 'PUT' : 'POST', data, props.book)
    emit('saved')
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
</script>

<style scoped>
.editor-overlay { z-index: 1100; }
.editor { display: block; overflow-y: auto; max-width: 760px; }
.editor h2 { margin-bottom: 20px; }
fieldset { border: 0; padding: 0; min-width: 0; }
.editor label { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; color: var(--text-color); }
.editor input, .editor textarea, .editor select { width: 100%; min-width: 0; padding: 10px; background: var(--input-bg); border: 1px solid var(--border-subtle); border-radius: 5px; color: #fff; font: inherit; }
.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.editor-actions { display: flex; gap: 10px; margin-top: 16px; }
.editor button { padding: 10px 16px; background: var(--input-bg); color: #fff; border: 1px solid var(--highlight); border-radius: 6px; cursor: pointer; }
.editor button:disabled { opacity: 0.5; cursor: default; }
.editor :is(input, textarea, select, button):focus-visible { outline: 2px solid var(--highlight); outline-offset: 2px; }
@media(max-width: 600px) { .editor-grid { grid-template-columns: 1fr; } }
</style>
