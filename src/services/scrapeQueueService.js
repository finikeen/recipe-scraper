import { db } from '../firebase.js'
import {
  collection, addDoc, getDocs, updateDoc, doc
} from 'firebase/firestore'

const COL = 'scrapeQueue'

export async function getQueue() {
  const snap = await getDocs(collection(db, COL))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addToQueue(items) {
  const existing = await getQueue()
  const existingUrls = new Set(existing.map(e => e.url))

  const newItems = items.filter(item => !existingUrls.has(item.url))
  const added = []
  for (const item of newItems) {
    const data = {
      url: item.url,
      title: item.title,
      folder: item.folder,
      status: 'pending',
      recipeId: null,
      failureReason: null,
    }
    const ref = await addDoc(collection(db, COL), data)
    added.push({ id: ref.id, ...data })
  }
  return added
}

export async function updateQueueItem(id, updates) {
  await updateDoc(doc(db, COL, id), updates)
}
