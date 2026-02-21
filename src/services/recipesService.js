import { db } from '../firebase.js'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export async function saveRecipe(recipe, sourceUrl) {
  const ref = await addDoc(collection(db, 'recipes'), {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    sourceUrl,
    createdAt: serverTimestamp(),
  })
  return ref.id
}
