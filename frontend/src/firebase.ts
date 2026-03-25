// ⚠️ ВАЖНО: Замените значения ниже на ваш реальный firebaseConfig
// Где взять: console.firebase.google.com → Project Settings (шестерёнка ⚙️)
//            → Your apps → Web app (</>)  → SDK setup → Config

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            "AIzaSyAG7suoHlByWL-PZIJh3-RM_PQ1PITLenw",
  authDomain:        "kalamkas-map.firebaseapp.com",
  projectId:         "kalamkas-map",
  storageBucket:     "kalamkas-map.firebasestorage.app",
  messagingSenderId: "420001825264",
  appId:             "1:420001825264:web:e621ba75250d6e2682dd35",
}

const app  = initializeApp(firebaseConfig)
export const auth    = getAuth(app)
export const db      = getFirestore(app)
export const storage = getStorage(app)
