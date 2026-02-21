<script setup>
import { ref } from 'vue'
import { saveRecipe } from '../services/recipesService.js'
import { updateQueueItem } from '../services/scrapeQueueService.js'

const props = defineProps({
  queueItem: Object,
  recipe: Object,
})
const emit = defineEmits(['done'])

const saving = ref(false)

async function onSave() {
  saving.value = true
  const recipeId = await saveRecipe(props.recipe, props.queueItem.url)
  await updateQueueItem(props.queueItem.id, { status: 'saved', recipeId })
  emit('done')
}

async function onReject() {
  await updateQueueItem(props.queueItem.id, {
    status: 'failed',
    failureReason: 'Rejected',
  })
  emit('done')
}
</script>

<template>
  <div>
    <h2>Review Recipe</h2>
    <p class="source">Source: <a :href="queueItem.url" target="_blank">{{ queueItem.url }}</a></p>

    <h3>{{ recipe.name }}</h3>
    <p>{{ recipe.description }}</p>

    <h4>Ingredients</h4>
    <ul>
      <li v-for="(ing, i) in recipe.ingredients" :key="i">{{ ing }}</li>
    </ul>

    <h4>Directions</h4>
    <ol>
      <li v-for="(step, i) in recipe.directions" :key="i">{{ step }}</li>
    </ol>

    <div class="actions">
      <button class="save" :disabled="saving" @click="onSave">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
      <button class="reject" :disabled="saving" @click="onReject">Reject</button>
    </div>
  </div>
</template>

<style scoped>
.source { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
.actions { margin-top: 2rem; display: flex; gap: 1rem; }
.save { background: #2d8a4e; color: white; padding: 0.5rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
.reject { background: #c0392b; color: white; padding: 0.5rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
