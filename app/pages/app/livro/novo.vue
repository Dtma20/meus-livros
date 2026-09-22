<template>
  <div class="add-book-page-container">
    <div class="add-book-page-card">
      <AddBookForm
        :initial-title="initialTitle"
        :return-to="returnTo"
        :auto-lookup="autoLookup"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AddBookForm from '~/components/search/AddBookForm.vue'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useSeoMeta({
  title: 'Adicionar livro ao catálogo',
})

const route = useRoute()
const router = useRouter()

const autoLookup = ref(route.query.online === 'true')

onMounted(() => {
  if (autoLookup.value) {
    const query = { ...route.query }
    delete query.online
    router.replace({ query })
  }
})

const initialTitle = computed(() => {
  const q = route.query.q ?? route.query.title ?? ''
  return typeof q === 'string' ? q : ''
})

const returnTo = computed(() => {
  const ret = route.query.ret
  return typeof ret === 'string' ? ret : '/app/novo'
})
</script>

<style scoped>
.add-book-page-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--space-4) 0;
  width: 100%;
}

.add-book-page-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  width: 100%;
  max-width: 620px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

@media (max-width: 640px) {
  .add-book-page-card {
    padding: var(--space-4);
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
