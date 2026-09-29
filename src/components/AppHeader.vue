<template>
  <header>
    <div class="header-heading">
      <h1>Minha Biblioteca</h1>
      <button type="button" class="add-book" @click="$emit('add-book')">+ Adicionar livro</button>
    </div>
    <div class="stats">
      <div class="stat-box">
        <span>{{ totalBooks }}</span>
        <small>Livros</small>
      </div>
      <div class="stat-box" :title="`Livros lidos em ${currentYear}`">
        <span>{{ booksReadThisYear }}</span>
        <small>Em {{ currentYear }}</small>
      </div>
      <div class="stat-box">
        <span>{{ uniqueAuthors }}</span>
        <small>Autores</small>
      </div>
      <div class="stat-box interactive" @click="$emit('open-map')" title="Ver Mapa Mundi">
        <span>{{ uniqueCountries }}</span>
        <small>Países</small>
      </div>
    </div>
    <nav class="nav-links">
      <router-link to="/">📚 Biblioteca</router-link>
      <router-link to="/quadrinhos">💬 Quadrinhos</router-link>
      <router-link to="/autores">✍️ Autores</router-link>
      <router-link to="/series">📚 Séries</router-link>
      <router-link to="/estatisticas">📊 Estatísticas</router-link>
    </nav>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useBooks } from '@/stores/books'

const { books, totalBooks, uniqueAuthors, uniqueCountries } = useBooks()
const currentYear = new Date().getFullYear()
const booksReadThisYear = computed(() =>
  books.value.filter(book => Number(book.read_in) === currentYear).length
)

defineEmits(['open-map', 'add-book'])
</script>

<style scoped>
.header-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.add-book { padding: 10px 16px; background: var(--input-bg); color: #fff; border: 1px solid var(--highlight); border-radius: 6px; font: inherit; cursor: pointer; }
.add-book:focus-visible { outline: 2px solid var(--highlight); outline-offset: 3px; }
.nav-links { flex-wrap: wrap; }
@media (max-width: 400px) {
  .stats { gap: 16px; }
}
</style>
