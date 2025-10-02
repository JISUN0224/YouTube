import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function UserProfile() {
  const { currentUser, logout } = useAuth()
  const [showDropdown, setShowDropdown] = useState(false)

  if (!currentUser) return null

  const handleLogout = async () => {
    try {
      await logout()
      setShowDropdown(false)
    } catch (error) {
      // 에러 처리
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
      >
        {/* 프로필 이미지 */}
        <img
          src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email || 'User')}&background=random`}
          alt="프로필"
          className="w-8 h-8 rounded-full"
        />
        <span className="hidden md:inline text-sm">
          {currentUser.displayName || currentUser.email}
        </span>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* 드롭다운 메뉴 */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="py-1">
            <div className="px-4 py-2 text-sm text-gray-500 border-b">
              {currentUser.email}
            </div>
            <button
              onClick={() => setShowDropdown(false)}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              ⭐ 즐겨찾기
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}

      {/* 클릭 외부 영역 감지 */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  )
}