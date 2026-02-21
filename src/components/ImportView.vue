<script setup>
import { ref } from 'vue'
import { parseBookmarks } from '../services/bookmarkParser.js'
import { addToQueue } from '../services/scrapeQueueService.js'

const emit = defineEmits(['complete'])
const status = ref('')
const loading = ref(false)

async function onFileChange(event) {
  const file = event.target.files[0]
  if (!file) return

  loading.value = true
  status.value = 'Reading file...'

  const html = await file.text()
  const items = parseBookmarks(html)

  if (items.length === 0) {
    status.value = 'No recipes found. Make sure your bookmarks contain a "Recipes" folder.'
    loading.value = false
    return
  }

  status.value = `Found ${items.length} bookmarks. Saving to queue...`
  const added = await addToQueue(items)
  status.value = `Done! Added ${added} new URLs (${items.length - added} duplicates skipped).`

  setTimeout(() => emit('complete'), 1500)
}
</script>

<template>
  <div>
    <h2>Import Bookmarks</h2>
    <p>Upload your browser bookmark export file. The app will find all URLs in the "Recipes" folder.</p>
    <input type="file" accept=".html" :disabled="loading" @change="onFileChange" />
    <p v-if="status">{{ status }}</p>
  </div>
</template>
