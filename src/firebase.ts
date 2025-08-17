import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
// import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
// import { getAnalytics, isSupported } from 'firebase/analytics'

let firebaseApp: FirebaseApp | undefined
let auth: Auth | undefined
// let db: Firestore | undefined
let storage: FirebaseStorage | undefined

const hasConfig = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)

console.log('🔧 Firebase 설정 확인:')
console.log('VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY ? '✅ 있음' : '❌ 없음')
console.log('VITE_FIREBASE_AUTH_DOMAIN:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '✅ 있음' : '❌ 없음')
console.log('VITE_FIREBASE_PROJECT_ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✅ 있음' : '❌ 없음')

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

  console.log('🔧 Firebase 설정 객체:', firebaseConfig)

  try {
    firebaseApp = initializeApp(firebaseConfig)
    auth = getAuth(firebaseApp)
    // db = getFirestore(firebaseApp)  // 현재 사용하지 않으므로 주석 처리
    storage = getStorage(firebaseApp)
    console.log('✅ Firebase 초기화 성공')
    // export const analytics = (await isSupported()) ? getAnalytics(firebaseApp) : undefined
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error)
  }
} else {
  // eslint-disable-next-line no-console
  console.warn('[firebase] .env에 Firebase 설정이 없어 초기화를 건너뜁니다.')
}

export { firebaseApp, auth, storage }
// export { db }  // 나중에 Firestore 사용할 때 활성화


