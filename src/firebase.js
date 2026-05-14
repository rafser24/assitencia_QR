import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  enableIndexedDbPersistence,
  connectFirestoreEmulator
} from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCaqkPkysGKZlkGVqQDo-G2emYyKlKW3Is",
  authDomain: "asistencia-qr-9f531.firebaseapp.com",
  projectId: "asistencia-qr-9f531",
  storageBucket: "asistencia-qr-9f531.firebasestorage.app",
  messagingSenderId: "576862231327",
  appId: "1:576862231327:web:e9a0bc5ef970469d046e2a"
}

const app  = initializeApp(firebaseConfig)
export const db   = getFirestore(app)
export const auth = getAuth(app)

// Persistencia offline (PWA) — Firestore guarda datos localmente
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistencia offline: múltiples pestañas abiertas.')
  } else if (err.code === 'unimplemented') {
    console.warn('Persistencia offline no soportada en este navegador.')
  }
})

// Descomentar para usar emuladores locales durante desarrollo:
// if (import.meta.env.DEV) {
//   connectFirestoreEmulator(db, 'localhost', 8080)
//   connectAuthEmulator(auth, 'http://localhost:9099')
// }

export default app
