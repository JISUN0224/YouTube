import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore, enableNetwork, disableNetwork, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
// import { getAnalytics, isSupported } from 'firebase/analytics'

let firebaseApp: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let storage: FirebaseStorage | undefined

const hasConfig = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)


if (hasConfig) {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  }


  try {
    firebaseApp = initializeApp(firebaseConfig)
    auth = getAuth(firebaseApp)
    db = getFirestore(firebaseApp)
    storage = getStorage(firebaseApp)
    
    
    // 네트워크 연결 상태 확인 및 재연결 시도
    enableNetwork(db).then(() => {
    }).catch(error => {
    })
    
    // export const analytics = (await isSupported()) ? getAnalytics(firebaseApp) : undefined
  } catch (error) {
  }
} else {
}

export { firebaseApp, auth, storage, db }


