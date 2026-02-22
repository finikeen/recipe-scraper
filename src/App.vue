<script setup>
import { ref, onMounted } from "vue";
import QueueView from "./components/QueueView.vue";
import ReviewView from "./components/ReviewView.vue";

const currentView = ref("loading");
const pendingReview = ref(null); // { queueItem, recipe }

onMounted(() => {
  currentView.value = "queue";
});

function onReviewReady({ queueItem, recipe }) {
  pendingReview.value = { queueItem, recipe };
  currentView.value = "review";
}

function onReviewDone() {
  pendingReview.value = null;
  currentView.value = "queue";
}
</script>

<template>
  <div id="app">
    <h1>Recipe Scraper</h1>
    <div v-if="currentView === 'loading'">Loading...</div>
    <QueueView
      v-else-if="currentView === 'queue'"
      @review-ready="onReviewReady"
    />
    <ReviewView
      v-else-if="currentView === 'review'"
      :queue-item="pendingReview.queueItem"
      :recipe="pendingReview.recipe"
      @done="onReviewDone"
    />
  </div>
</template>

<style>
body {
  font-family: sans-serif;
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  border-bottom: 2px solid #333;
  padding-bottom: 0.5rem;
}
</style>
