import React, { createContext, useContext, useEffect, useState } from 'react'
import { 
  User, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth'
import { auth } from '../firebase'

interface AuthContextType {
  currentUser: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 이메일/비밀번호 로그인
  async function login(email: string, password: string) {
    if (!auth) throw new Error('Firebase Auth가 초기화되지 않았습니다')
    await signInWithEmailAndPassword(auth, email, password)
  }

  // 이메일/비밀번호 회원가입
  async function signup(email: string, password: string) {
    if (!auth) throw new Error('Firebase Auth가 초기화되지 않았습니다')
    await createUserWithEmailAndPassword(auth, email, password)
  }

  // Google 로그인
  async function loginWithGoogle() {
    if (!auth) throw new Error('Firebase Auth가 초기화되지 않았습니다')
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    
    // Google 로그인 성공 시 userId를 localStorage에 저장
    if (result.user) {
      const userId = 'user_' + Date.now()
      localStorage.setItem('userId', userId)
      // Google 로그인 성공, userId 저장
    }
  }

  // 로그아웃
  async function logout() {
    if (!auth) throw new Error('Firebase Auth가 초기화되지 않았습니다')
    await signOut(auth)
    
    // 로그아웃 시 userId 제거
    localStorage.removeItem('userId')
    // 로그아웃 완료, userId 제거됨
  }

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      
      // 사용자 상태 변경 시 userId 관리
      if (user) {
        // 로그인된 경우 userId가 없으면 생성
        const existingUserId = localStorage.getItem('userId')
        if (!existingUserId) {
          const userId = 'user_' + Date.now()
          localStorage.setItem('userId', userId)
          // 사용자 로그인 감지, userId 생성
        }
      } else {
        // 로그아웃된 경우 userId 제거
        localStorage.removeItem('userId')
        // 사용자 로그아웃 감지, userId 제거됨
      }
      
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    signup,
    loginWithGoogle,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
