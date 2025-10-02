import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { UserProfile } from '../components/UserProfile'
import { LoginModal } from '../components/LoginModal'
import { recommendedVideos, sortVideosByDifficulty } from '../data/recommendedVideos'
import { RecommendedVideoCard } from '../components/RecommendedVideoCard'
import { addToFavorites, removeFromFavorites, getFavorites } from '../services/favoritesService'
import { FavoritesModal } from '../components/FavoritesModal'

const YouTubeGenerator: React.FC = () => {
  const navigate = useNavigate()
  const { currentUser } = useAuth()

  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showFavoritesModal, setShowFavoritesModal] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  

  // 필터링 상태
  const [activeTab, setActiveTab] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')



  // 로그인 상태 및 즐겨찾기 로드
  useEffect(() => {
    const loadUserData = async () => {
      // 사용자 데이터 로딩 시작
      
      if (currentUser) {
        setIsLoggedIn(true)
        const firebaseUserId = currentUser.uid
        
        try {
          const favorites = await getFavorites(firebaseUserId)
          setFavoriteIds(favorites)
        } catch (error) {
          setFavoriteIds([])
        }
      } else {
        // currentUser 없음, 로그아웃 상태로 설정
        setIsLoggedIn(false)
        setFavoriteIds([])
      }
    }
    loadUserData()
  }, [currentUser])

  // 즐겨찾기 토글 (Firebase Auth 기반)
  const handleToggleFavorite = async (videoId: string) => {
    if (!currentUser) {
      // 로그인되지 않음, 로그인 모달 표시
      setShowLoginModal(true)
      return
    }
    
    const firebaseUserId = currentUser.uid
    
    try {
      if (favoriteIds.includes(videoId)) {
        const success = await removeFromFavorites(firebaseUserId, videoId)
        if (success) {
          setFavoriteIds(prev => prev.filter(id => id !== videoId))
        }
      } else {
        const success = await addToFavorites(firebaseUserId, videoId)
        if (success) {
          setFavoriteIds(prev => [...prev, videoId])
        }
      }
    } catch (error) {
    }
  }

  // 로그아웃
  const handleLogout = () => {
    localStorage.removeItem('userId')
    setIsLoggedIn(false)
    setFavoriteIds([])
  }

  // 카테고리 목록 추출
  const categories = ['all', ...Array.from(new Set(recommendedVideos.map(video => video.category)))]
  
  // 태그 목록 추출 (빈도순으로 정렬)
  const allTags = recommendedVideos.flatMap(video => video.tags)
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const tags = ['all', ...Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a])]
  
  // 언어 목록 추출 (zh와 zh-CN을 통합)
  const allLanguages = recommendedVideos.map(video => {
    const lang = video.processedData?.language || 'unknown'
    return lang === 'zh' ? 'zh-CN' : lang // zh를 zh-CN으로 통일
  })
  const languages = ['all', ...Array.from(new Set(allLanguages))]
  
  // 필터링된 영상 목록
  const filteredVideos = recommendedVideos.filter(video => {
    const matchesDifficulty = activeTab === 'all' || video.difficulty === activeTab
    const matchesCategory = selectedCategory === 'all' || video.category === selectedCategory
    const matchesTag = selectedTag === 'all' || video.tags.includes(selectedTag)
    const videoLang = video.processedData?.language || 'unknown'
    const normalizedVideoLang = videoLang === 'zh' ? 'zh-CN' : videoLang
    const matchesLanguage = selectedLanguage === 'all' || normalizedVideoLang === selectedLanguage
    const matchesSearch = searchTerm === '' || 
      video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.channel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    
    return matchesDifficulty && matchesCategory && matchesTag && matchesLanguage && matchesSearch
  })

  // 정렬된 영상 목록
  const sortedVideos = sortVideosByDifficulty(filteredVideos, 'asc')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-800">
                5.3.4.  AI 유튜브 통역 연습 시스템
              </h1>
            </div>
            
            {/* 로그인 및 즐겨찾기 버튼 */}
            <div className="flex items-center gap-3">
        {currentUser ? (
          <UserProfile />
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            로그인
          </button>
        )}
        
              {/* 대시보드 버튼 */}
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
                대시보드
              </button>


        {isLoggedIn && (
          <button
                  onClick={() => setShowFavoritesModal(true)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
                  즐겨찾기
          </button>
        )}
      </div>
          </div>
        </div>
      </header>

      <main className="py-8">
        <div className="w-full max-w-7xl mx-auto px-6">
          {/* 필터링 섹션 */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* 검색 */}
              <div className="flex-1">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                  🔍 영상 검색
                </label>
                  <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="제목, 채널, 태그로 검색..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 난이도 필터 */}
              <div className="lg:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📊 난이도
                </label>
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">전체</option>
                  <option value="easy">쉬움</option>
                  <option value="medium">보통</option>
                  <option value="hard">어려움</option>
                </select>
              </div>

              {/* 카테고리 필터 */}
              <div className="lg:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📁 카테고리
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category === 'all' ? '전체' :
                       category === 'news' ? '뉴스' :
                       category === 'education' ? '교육' :
                       category === 'entertainment' ? '엔터테인먼트' :
                       category === 'culture' ? '문화' :
                       category === 'technology' ? '기술' :
                       category === 'business' ? '비즈니스' :
                       category === 'history' ? '역사' :
                       category === 'comedy' ? '코미디' :
                       category === 'documentary' ? '다큐멘터리' : category}
                    </option>
                  ))}
                </select>
                    </div>

              {/* 태그 필터 */}
              <div className="lg:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🏷️ 태그
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {tags.slice(0, 20).map(tag => (
                    <option key={tag} value={tag}>
                      {tag === 'all' ? '전체' : `#${tag} (${tagCounts[tag]})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* 언어 필터 */}
              <div className="lg:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🌐 언어
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {languages.map(language => (
                    <option key={language} value={language}>
                      {language === 'all' ? '전체' : 
                       language === 'ko' ? '한국어' :
                       language === 'zh-CN' ? '중국어' :
                       language === 'zh' ? '중국어' : language}
                    </option>
                  ))}
                </select>
              </div>
                </div>

            {/* 결과 개수 표시 */}
            <div className="mt-4 text-sm text-gray-600">
              총 {sortedVideos.length}개의 영상이 있습니다
            </div>
          </div>

          {/* 추천 영상 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedVideos.map((video) => (
                    <RecommendedVideoCard
                      key={video.id}
                      video={video}
                      isFavorite={favoriteIds.includes(video.id)}
                      onToggleFavorite={() => handleToggleFavorite(video.id)}
                      onClick={() => {
                          // 사전 변환된 데이터가 있으면 바로 결과 페이지로 이동
                          const videoId = video.url.includes('youtu.be/') 
                            ? video.url.split('youtu.be/')[1] 
                            : video.url.split('v=')[1]?.split('&')[0]
                          
                          // ProcessedVisualInterpretation에서 기대하는 형식으로 변환
                          const formattedData = {
                            video_info: {
                              id: videoId || '',
                              title: video.title,
                              speaker: video.channel,
                              duration: video.duration,
                      language: video.processedData?.language || 'ko',
                              description: video.url
                            },
                    segments: video.processedData?.segments.map(seg => ({
                              id: seg.id,
                              start_time: seg.start_time || `${Math.floor(seg.start / 60)}:${String(Math.floor(seg.start % 60)).padStart(2, '0')}`,
                              end_time: seg.end_time || `${Math.floor(seg.end / 60)}:${String(Math.floor(seg.end % 60)).padStart(2, '0')}`,
                              start_seconds: seg.start,
                              end_seconds: seg.end,
                              duration: seg.end - seg.start,
                              original_text: seg.original_text || seg.text,
                              translation_suggestion: '', // 통역 제안은 비워둠
                              keywords: seg.keywords || []
                    })) || [],
                    full_text: video.processedData?.text || '',
                            files: { audio: '', txt: '', srt: '', vtt: '' },
                            stats: {
                      total_segments: video.processedData?.segments.length || 0,
                              total_duration: video.duration,
                              processing_time: 0
                            }
                          }
                          
                          localStorage.setItem('processingResult', JSON.stringify(formattedData))
                          localStorage.setItem('currentYouTubeUrl', video.url)
                          navigate('/visual-interpretation')
                      }}
                    />
                  ))}
              </div>

          {/* 영상이 없을 때 */}
          {sortedVideos.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">검색 결과가 없습니다</h3>
              <p className="text-gray-500">다른 검색어나 필터를 시도해보세요.</p>
            </div>
          )}
        </div>
      </main>

      {/* 로그인 모달 */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />

      {/* 즐겨찾기 모달 */}
      <FavoritesModal
        isOpen={showFavoritesModal}
        onClose={() => setShowFavoritesModal(false)}
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
      />

    </div>
  )
}

export default YouTubeGenerator