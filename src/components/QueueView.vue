<script setup>
import { ref, computed, onMounted } from 'vue'
import { getQueue, updateQueueItem } from '../services/scrapeQueueService.js'

const emit = defineEmits(['review-ready'])

const queue = ref([])
const scraping = ref(false)

const pending = computed(() => queue.value.filter(i => i.status === 'pending'))
const saved = computed(() => queue.value.filter(i => i.status === 'saved'))
const failed = computed(() => queue.value.filter(i => i.status === 'failed'))

onMounted(async () => {
  queue.value = await getQueue()
})

async function scrapeUrl(item) {
  const res = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: item.url }),
  })
  return res.json()
}

async function processItem(item) {
  const result = await scrapeUrl(item)

  if (!result.success) {
    await updateQueueItem(item.id, { status: 'failed', failureReason: result.failureReason })
    item.status = 'failed'
    item.failureReason = result.failureReason
    return
  }

  await updateQueueItem(item.id, { status: 'scraped' })
  item.status = 'scraped'
  emit('review-ready', { queueItem: item, recipe: result.recipe })
}

async function startScraping() {
  scraping.value = true
  for (const item of pending.value) {
    if (!scraping.value) break
    await processItem(item)
    if (item.status === 'scraped') break
    await new Promise(r => setTimeout(r, 1500))
  }
  scraping.value = false
}

function stopScraping() {
  scraping.value = false
}
</script>

<template>
  <div>
    <h2>Scrape Queue</h2>

    <div class="summary">
      <span>Pending: {{ pending.length }}</span> |
      <span>Saved: {{ saved.length }}</span> |
      <span>Failed: {{ failed.length }}</span>
    </div>

    <div class="controls">
      <button v-if="!scraping && pending.length > 0" @click="startScraping">
        Start Scraping
      </button>
      <button v-if="scraping" @click="stopScraping">Stop</button>
      <span v-if="pending.length === 0">All done!</span>
    </div>

    <ul class="queue-list">
      <li v-for="item in queue" :key="item.id" :class="item.status">
        <span class="status-badge">{{ item.status }}</span>
        <span class="title">{{ item.title }}</span>
        <span class="folder">{{ item.folder }}</span>
        <span v-if="item.failureReason" class="failure-reason">{{ item.failureReason }}</span>
        <button
          v-if="item.status === 'pending' && !scraping"
          @click="processItem(item)"
        >Scrape</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.summary { margin: 1rem 0; font-weight: bold; }
.controls { margin-bottom: 1rem; }
.queue-list { list-style: none; padding: 0; }
.queue-list li { padding: 0.5rem; border-bottom: 1px solid #eee; display: flex; gap: 1rem; align-items: center; }
.status-badge { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: #ddd; }
li.saved .status-badge { background: #c8f7c5; }
li.failed .status-badge { background: #f7c5c5; }
li.scraped .status-badge { background: #c5d9f7; }
.title { flex: 1; }
.folder { color: #888; font-size: 0.85rem; }
.failure-reason { color: #c00; font-size: 0.8rem; }
</style>
