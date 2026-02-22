import { db } from '../firebase.js'
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore'

export async function saveRecipe(recipe, sourceUrl) {
  const ref = await addDoc(collection(db, 'recipes'), {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    sourceUrl,
    createdAt: serverTimestamp(),
  })

  if (recipe.parsedIngredients?.length) {
    const batch = writeBatch(db)
    const ingCol = collection(db, 'recipes', ref.id, 'ingredients')
    for (const ing of recipe.parsedIngredients) {
      batch.set(doc(ingCol), ing)
    }
    await batch.commit()
  }

  return ref.id
}
