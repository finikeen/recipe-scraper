<script setup>
import { ref, computed, onMounted } from "vue";
import { getQueue, updateQueueItem } from "../services/scrapeQueueService.js";

const emit = defineEmits(["review-ready"]);

const queue = ref([]);
const scraping = ref(false);
const activeTab = ref("pending");

const pending = computed(() =>
  queue.value.filter((i) => i.status === "pending"),
);
const saved = computed(() => queue.value.filter((i) => i.status === "saved"));
const failed = computed(() => queue.value.filter((i) => i.status === "failed"));

const activeList = computed(() => {
  if (activeTab.value === "pending") return pending.value;
  if (activeTab.value === "saved") return saved.value;
  return failed.value;
});

onMounted(async () => {
  queue.value = await getQueue();
});

async function scrapeUrl(item) {
  const res = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: item.url }),
  });
  return res.json();
}

async function processItem(item) {
  const result = await scrapeUrl(item);

  if (!result.success) {
    await updateQueueItem(item.id, {
      status: "failed",
      failureReason: result.failureReason,
    });
    item.status = "failed";
    item.failureReason = result.failureReason;
    return;
  }

  await updateQueueItem(item.id, { status: "scraped" });
  item.status = "scraped";
  emit("review-ready", { queueItem: item, recipe: result.recipe });
}

async function startScraping() {
  scraping.value = true;
  for (const item of pending.value) {
    if (!scraping.value) break;
    await processItem(item);
    if (item.status === "scraped") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  scraping.value = false;
}

function stopScraping() {
  scraping.value = false;
}
</script>

<template>
  <div>
    <h2>Scrape Queue</h2>

    <div class="tabs">
      <button
        :class="{ active: activeTab === 'pending' }"
        @click="activeTab = 'pending'"
      >
        Pending ({{ pending.length }})
      </button>
      <button
        :class="{ active: activeTab === 'saved' }"
        @click="activeTab = 'saved'"
      >
        Saved ({{ saved.length }})
      </button>
      <button
        :class="{ active: activeTab === 'failed' }"
        @click="activeTab = 'failed'"
      >
        Failed ({{ failed.length }})
      </button>
    </div>

    <div v-if="activeTab === 'pending'" class="controls">
      <button v-if="!scraping && pending.length > 0" @click="startScraping">
        Start Scraping
      </button>
      <button v-if="scraping" @click="stopScraping">Stop</button>
      <span v-if="pending.length === 0">All done!</span>
    </div>

    <ul class="queue-list">
      <li v-for="item in activeList" :key="item.id">
        <span class="title">{{ item.title }}</span>
        <span class="folder">{{ item.folder }}</span>
        <span v-if="item.failureReason" class="failure-reason">{{
          item.failureReason
        }}</span>
        <button
          v-if="activeTab === 'pending' && !scraping"
          @click="processItem(item)"
        >
          Scrape
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 2px solid #ddd;
}
.tabs button {
  padding: 0.5rem 1.25rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.95rem;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.tabs button.active {
  color: #333;
  border-bottom-color: #333;
  font-weight: bold;
}
.tabs button:hover:not(.active) {
  color: #333;
}
.controls {
  margin-bottom: 1rem;
}
.queue-list {
  list-style: none;
  padding: 0;
}
.queue-list li {
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 1rem;
  align-items: center;
}
.title {
  flex: 1;
}
.folder {
  color: #888;
  font-size: 0.85rem;
}
.failure-reason {
  color: #c00;
  font-size: 0.8rem;
}
</style>
