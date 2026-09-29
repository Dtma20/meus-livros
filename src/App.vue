<template>
  <div class="container">
    <AppHeader @open-map="showMapModal = true" @add-book="showBookEditor = true" />
    <BookEditor v-if="showBookEditor" @close="showBookEditor = false" @saved="bookAdded" />
    <router-view />
    <MapModal :visible="showMapModal" @close="showMapModal = false" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BookEditor from '@/components/BookEditor.vue'
import { useBooks } from '@/stores/books'
import AppHeader from '@/components/AppHeader.vue'
import MapModal from '@/components/MapModal.vue'

const { loadBooks, resetFilters, sortBy } = useBooks()
const router = useRouter()
const showBookEditor = ref(false)
function bookAdded() {
  showBookEditor.value = false
  resetFilters()
  sortBy.value = 'read_desc'
  router.push('/')
}
const showMapModal = ref(false)

onMounted(() => {
  loadBooks()
})
</script>
