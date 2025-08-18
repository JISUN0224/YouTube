import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoProcessing } from '../contexts/VideoProcessingContext'
import { validateYouTubeUrl, extractVideoId } from '../utils/youtube.validation'
import type { VideoInfo } from '../types/youtube.types'

import { useAuth } from '../contexts/AuthContext'
import { UserProfile } from '../components/UserProfile'
import { LoginModal } from '../components/LoginModal'
import { recommendedVideos } from '../data/recommendedVideos'
import { RecommendedVideoCard } from '../components/RecommendedVideoCard'
import { useAzureProcessing } from '../services/azureProcessingService'
import { addToFavorites, removeFromFavorites, getFavorites } from '../services/favoritesService'
import { FavoritesModal } from '../components/FavoritesModal'

const styles = {
  background: 'bg-gradient-to-br from-sky-50 to-blue-100',
  container: 'max-w-[1800px] mx-auto px-4 py-16',
  card: 'bg-white rounded-[20px] shadow-2xl p-10',
  button:
    'px-6 py-3 bg-[#4285f4] hover:bg-[#3367d6] text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed font-semibold',
  input:
    'flex-1 px-4 py-3 border-2 border-gray-300 rounded-[10px] focus:border-[#4285f4] focus:outline-none transition-colors',
}

export default function YouTubeGenerator() {
  const navigate = useNavigate()
  const { setYoutubeUrl, setVideoInfo, videoInfo } = useVideoProcessing()
  const { currentUser } = useAuth()
  const { checkCaptions } = useAzureProcessing()
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [videoId, setVideoId] = useState('')

  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showFavoritesModal, setShowFavoritesModal] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const derivedId = extractVideoId(url || '')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<any>(null)
  const CAPTION_LIMIT_SECONDS = 40 * 60
  const NO_CAPTION_LIMIT_SECONDS = 25 * 60
  const [hasCaptions, setHasCaptions] = useState<boolean | null>(null)

  const formatDuration = (totalSeconds: number): string => {
    if (!totalSeconds || totalSeconds < 0) return '확인 중...'
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
    const ss = String(seconds).padStart(2, '0')
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
  }

  // 로그인 상태 및 즐겨찾기 로드
  useEffect(() => {
    const loadUserData = async () => {
      console.log('🔄 사용자 데이터 로딩 시작...')
      console.log('📋 currentUser 상태:', currentUser)
      console.log('📋 localStorage에서 userId:', localStorage.getItem('userId'))
      
      // AuthContext의 currentUser 상태를 우선 확인
      if (currentUser) {
        console.log('✅ currentUser 발견, 로그인 상태로 설정')
        setIsLoggedIn(true)
        
        const userId = localStorage.getItem('userId')
        if (userId) {
          try {
            console.log('🌐 서버에서 즐겨찾기 목록 가져오는 중...')
            const favorites = await getFavorites(userId)
            console.log('📋 서버에서 받은 즐겨찾기:', favorites)
            console.log('📋 추천 영상 ID 목록:', recommendedVideos.map(v => ({ id: v.id, title: v.title })))
            setFavoriteIds(favorites)
          } catch (error) {
            console.error('❌ 즐겨찾기 로딩 실패:', error)
            setFavoriteIds([])
          }
        } else {
          console.log('⚠️ currentUser는 있지만 userId가 없음')
          setFavoriteIds([])
        }
      } else {
        console.log('❌ currentUser 없음, 로그아웃 상태로 설정')
        setIsLoggedIn(false)
        setFavoriteIds([])
      }
    }
    loadUserData()
  }, [currentUser]) // currentUser가 변경될 때마다 실행



  // 즐겨찾기 토글 (로그인 기반)
  const handleToggleFavorite = async (videoId: string) => {
    console.log('🎯 즐겨찾기 토글 시작:', videoId)
    
    const userId = localStorage.getItem('userId')
    console.log('📋 userId:', userId)
    
    if (!userId) {
      console.log('❌ userId 없음, 로그인 모달 표시')
      setShowLoginModal(true)
      return
    }
    
    console.log('📊 현재 favoriteIds:', favoriteIds)
    console.log('🔍 videoId가 favoriteIds에 포함되어 있나?', favoriteIds.includes(videoId))
    
    try {
      if (favoriteIds.includes(videoId)) {
        // 즐겨찾기 제거
        console.log('🗑️ 즐겨찾기 제거 시도:', videoId)
        const success = await removeFromFavorites(userId, videoId)
        console.log('✅ 즐겨찾기 제거 결과:', success)
        if (success) {
          setFavoriteIds(prev => {
            const newIds = prev.filter(id => id !== videoId)
            console.log('🔄 favoriteIds 업데이트 (제거):', newIds)
            return newIds
          })
        }
      } else {
        // 즐겨찾기 추가
        console.log('➕ 즐겨찾기 추가 시도:', videoId)
        const success = await addToFavorites(userId, videoId)
        console.log('✅ 즐겨찾기 추가 결과:', success)
        if (success) {
          setFavoriteIds(prev => {
            const newIds = [...prev, videoId]
            console.log('🔄 favoriteIds 업데이트 (추가):', newIds)
            return newIds
          })
        }
      }
    } catch (error) {
      console.error('❌ 즐겨찾기 토글 오류:', error)
    }
  }

  // 로그아웃
  const handleLogout = () => {
    localStorage.removeItem('userId')
    setIsLoggedIn(false)
    setFavoriteIds([])
    // 기존 Firebase 로그아웃도 함께
    if (currentUser) {
      // Firebase 로그아웃 로직이 있다면 여기에 추가
    }
  }





  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateYouTubeUrl(url) || !derivedId) {
      setError('영상 ID를 추출하지 못했습니다. 지원 형식: https://www.youtube.com/watch?v=ID, https://youtu.be/ID 또는 11자리 ID')
      return
    }

    setIsLoading(true)
    setYoutubeUrl(url)
    setVideoId(derivedId)
    const placeholder: VideoInfo = {
      id: derivedId,
      title: 'YouTube 영상',
      channel: 'YouTube',
      duration: '확인 중...',
      durationSeconds: 0,
      language: '확인 중...',
      description: '',
      thumbnail: `https://img.youtube.com/vi/${derivedId}/mqdefault.jpg`,
    }
    setVideoInfo(placeholder)
    try {
      // 자막 존재 여부 확인(백엔드 경량 체크)
      let detectedCaptions = false
      try {
        const chk = await checkCaptions(url)
        detectedCaptions = !!chk?.hasCaptions
      } catch {}
      setHasCaptions(detectedCaptions)
      setVerified(true)
    } catch (err: any) {
      setError(err?.message || '영상 확인에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!verified || !derivedId) return

    const loadIframeApi = (): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
          resolve()
          return
        }
        const prev = document.querySelector('script[src="https://www.youtube.com/iframe_api"]') as HTMLScriptElement | null
        if (prev) {
          const check = () => {
            if ((window as any).YT && (window as any).YT.Player) resolve()
            else setTimeout(check, 50)
          }
          check()
          return
        }
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(tag)
        ;(window as any).onYouTubeIframeAPIReady = () => resolve()
      })
    }

    let isMounted = true
    loadIframeApi().then(() => {
      if (!isMounted || !iframeRef.current) return
      try {
        // attach player to existing iframe
        playerRef.current = new (window as any).YT.Player(iframeRef.current, {
          events: {
            onReady: (event: any) => {
              const seconds = Math.floor(event.target.getDuration?.() || 0)
              if (videoInfo) {
                setVideoInfo({ ...videoInfo, durationSeconds: seconds, duration: formatDuration(seconds) })
              }
            },
          },
        })
      } catch {
        // ignore
      }
    })

    return () => {
      isMounted = false
      try {
        playerRef.current?.destroy?.()
      } catch {
        // ignore
      }
    }
  }, [verified, derivedId, setVideoInfo])

  const isInvalid = url.length > 0 && !validateYouTubeUrl(url)

  return (
    <div className={`${styles.background} min-h-screen animate-fadeIn`}>
      {/* 네비게이션 헤더 */}
      <div className="absolute top-0 right-0 p-6 z-10 flex items-center gap-3">
        {/* 기존 로그인 버튼 */}
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
        
        {/* 즐겨찾기 버튼 (로그인된 경우) */}
        {isLoggedIn && (
          <button
            onClick={() => {
              console.log('🎯 즐겨찾기 버튼 클릭됨!')
              console.log('📊 현재 상태:')
              console.log('  - showFavoritesModal:', showFavoritesModal)
              console.log('  - isLoggedIn:', isLoggedIn)
              console.log('  - currentUser:', currentUser)
              console.log('  - favoriteIds:', favoriteIds)
              console.log('  - localStorage userId:', localStorage.getItem('userId'))
              
              // 상태 변경 전후 로그
              console.log('🔄 showFavoritesModal을 true로 설정 중...')
              setShowFavoritesModal(true)
              
              // 다음 렌더링에서 상태 확인
              setTimeout(() => {
                console.log('⏰ 100ms 후 showFavoritesModal 상태:', showFavoritesModal)
              }, 100)
            }}
            className="px-3 py-2 rounded-lg bg-pink-500 text-white hover:bg-pink-600 shadow-md focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2 text-sm"
            title="즐겨찾기 목록 보기"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            즐겨찾기 ({favoriteIds.length})
          </button>
        )}
      </div>

      <div className={styles.container}>
        {/* 페이지 제목 */}
        <div className="text-center mb-12">
          <div className="inline-block p-8 md:p-16 bg-white/20 backdrop-blur-xl rounded-[20px] border-2 border-white/40 shadow-2xl">
            {/* 메인 제목 */}
            <h1 className="text-3xl md:text-6xl font-bold bg-gradient-to-r from-red-600 via-purple-600 to-blue-600 bg-[length:300%_300%] animate-[gradientShift_4s_ease-in-out_infinite,fadeInUp_1s_ease-out_0.6s_forwards] bg-clip-text text-transparent opacity-0">
              YouTube 실시간 통역 연습 생성기<span className="text-white ml-2 md:ml-4 text-2xl md:text-4xl animate-bounce">🎬</span>
            </h1>
          </div>
        </div>

        {/* 메인 레이아웃: 왼쪽 입력/정보, 오른쪽 추천 리스트 */}
        <div className="flex gap-12 items-start">
          {/* 왼쪽: URL 입력 및 영상 정보 (1.5배 확장) */}
          <div className="flex-1 max-w-5xl">
            <div className={styles.card}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6"> YouTube URL 입력</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">YouTube 영상 URL</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setVerified(false)
                      setVideoId('')
                      setError('')
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={styles.input}
                    disabled={isLoading}
                  />
                  <button type="submit" disabled={!url || isLoading || isInvalid} className={styles.button}>
                    {isLoading ? '확인 중...' : '영상 확인'}
                  </button>
                </div>
                {url && (
                  <div className="mt-2 text-sm">
                    {derivedId ? (
                      <span className="text-green-700">동영상 ID 확인됨: {derivedId}</span>
                    ) : (
                      <span className="text-red-600">동영상 ID를 추출하지 못했습니다. 예: https://www.youtube.com/watch?v=dQw4w9WgXcQ</span>
                    )}
                  </div>
                )}
                {!url && <p className="mt-2 text-sm text-gray-500">지원 형식: youtube.com/watch?v=ID, youtu.be/ID, 또는 11자리 ID</p>}
                {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                {!derivedId && url && (
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded p-3">
                    확인 불가 사유 예시:
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>URL 형식이 지원 범위를 벗어났습니다. 예: youtube.com/watch?v=ID, youtu.be/ID</li>
                      <li>영상이 비공개/연령제한/지역제한일 수 있습니다</li>
                      <li>일시적 네트워크 문제로 확인에 실패했습니다. 잠시 후 다시 시도해 주세요</li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2"> 읽어주세요!</h3>
                <div className="text-sm text-blue-800 space-y-2">
                  <div>
                    <div className="font-semibold">최대 길이 제한</div>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>유튜브 자막이 있는 경우: 최대 40분</li>
                      <li>유튜브 자막이 없는 경우: 최대 25분</li>
                    </ul>
                    <div className="mt-1 text-blue-900/80">
                      이유: 자막이 있으면 다운로드·파싱만으로 정확한 타임라인 사용이 가능하지만, 자막이 없으면 오디오를 여러 청크로 나눠 인식·병합해야하므로, 처리 시간과 오류 리스크가 커집니다.
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="font-semibold">주의사항</div>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>배경음/음악이 과도하게 크거나 음질이 나쁜 경우 인식 정확도가 떨어질 수 있어요.</li>
                      <li>동시 대화(인터뷰/토론 등)나 강한 리버브 환경은 성능이 낮아질 수 있어요.</li>
                      <li>비공개/연령제한/지역제한 영상, 라이브/프리미어 진행 중인 영상은 지원되지 않을 수 있어요.</li>
                    </ul>
                  </div>
                </div>
              </div>


            </form>

            {verified && (
              <div className="mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">영상 미리보기</h2>
                <div className="bg-blue-50 border-l-4 border-[#4285f4] rounded-r-lg p-4">
                  <div className="space-y-4">
                    <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
                      <iframe
                        className="w-full h-full"
                        ref={iframeRef}
                        id="yt-preview-player"
                        src={`https://www.youtube-nocookie.com/embed/${derivedId}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      <div className="w-full sm:w-56">
                        <img
                          src={`https://img.youtube.com/vi/${derivedId}/mqdefault.jpg`}
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement
                            target.onerror = null
                            target.src = 'https://www.youtube.com/s/desktop/fe8e0a7f/img/favicon_144x144.png'
                          }}
                          alt="thumbnail"
                          className="rounded-lg w-full h-auto object-cover"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="text-lg font-semibold text-gray-900">YouTube 영상</div>
                        <div className="text-sm text-gray-600">채널: YouTube</div>
                        <div className="text-sm text-gray-600">
                          길이: {videoInfo?.durationSeconds ? formatDuration(videoInfo.durationSeconds) : '확인 중...'}
                          {videoInfo?.durationSeconds != null && hasCaptions != null ? (
                            videoInfo.durationSeconds <= (hasCaptions ? CAPTION_LIMIT_SECONDS : NO_CAPTION_LIMIT_SECONDS) ? (
                              <span className="ml-2 text-green-700">({hasCaptions ? '자막 있음: 40분 이하' : '자막 없음: 25분 이하'} 지원)</span>
                            ) : (
                              <span className="ml-2 text-red-600">({hasCaptions ? '40분 초과' : '25분 초과'} — 지원 대상 아님)</span>
                            )
                          ) : null}
                        </div>

                        {hasCaptions != null && (
                          <div className={`${(videoInfo?.durationSeconds || 0) <= (hasCaptions ? CAPTION_LIMIT_SECONDS : NO_CAPTION_LIMIT_SECONDS) ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'} border rounded-md px-3 py-2 text-sm`}>
                            {hasCaptions ? '유튜브 자막 감지됨' : '유튜브 자막이 감지되지 않았습니다'} — 제한: {hasCaptions ? '40분' : '25분'} 이하
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    className={styles.button}
                    disabled={!!(videoInfo?.durationSeconds && hasCaptions != null && videoInfo.durationSeconds > (hasCaptions ? CAPTION_LIMIT_SECONDS : NO_CAPTION_LIMIT_SECONDS))}
                    onClick={() => navigate('/processing')}
                  >
                    통역 연습 생성 시작
                  </button>
                  <button
                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    onClick={() => {
                      setVerified(false)
                      setUrl('')
                      setVideoId('')
                      setError('')
                    }}
                  >
                    다른 영상 선택
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* 오른쪽: 추천 영상 리스트 (1.5배 확장) */}
          <div className="w-[570px] flex-shrink-0">
            <div className="bg-white rounded-[20px] shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">🔥 추천 영상</h2>
                <div className="text-xs text-gray-500">
                  {recommendedVideos.length}개
                </div>
              </div>
              
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-gray-700">
                  ✅ <span className="text-green-600 font-medium">즉시 재생</span> = 별도 과정 없이 클릭만 하면 통역 연습 가능해요<br/>
                  💡 일반 영상 = URL 입력 후 스크립트 추출 등 과정이 필요해요
                </p>
              </div>
              
              <div className="space-y-2 max-h-[80vh] overflow-y-auto">
                                  {recommendedVideos.map((video) => (
                    <RecommendedVideoCard
                      key={video.id}
                      video={video}
                      isFavorite={favoriteIds.includes(video.id)}
                      onToggleFavorite={() => handleToggleFavorite(video.id)}
                      onClick={() => {
                        if (video.processedData) {
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
                              language: video.processedData.language,
                              description: video.url
                            },
                            segments: video.processedData.segments.map(seg => ({
                              id: seg.id,
                              start_time: seg.start_time || `${Math.floor(seg.start / 60)}:${String(Math.floor(seg.start % 60)).padStart(2, '0')}`,
                              end_time: seg.end_time || `${Math.floor(seg.end / 60)}:${String(Math.floor(seg.end % 60)).padStart(2, '0')}`,
                              start_seconds: seg.start,
                              end_seconds: seg.end,
                              duration: seg.end - seg.start,
                              original_text: seg.original_text || seg.text,
                              translation_suggestion: '', // 통역 제안은 비워둠
                              keywords: seg.keywords || []
                            })),
                            full_text: video.processedData.text,
                            files: { audio: '', txt: '', srt: '', vtt: '' },
                            stats: {
                              total_segments: video.processedData.segments.length,
                              total_duration: video.duration,
                              processing_time: 0
                            }
                          }
                          
                          localStorage.setItem('processingResult', JSON.stringify(formattedData))
                          localStorage.setItem('currentYouTubeUrl', video.url)
                          navigate('/visual-interpretation')
                        } else {
                          // 사전 변환된 데이터가 없으면 기존 방식 (URL 입력)
                          setUrl(video.url)
                          setVerified(false)
                        }
                      }}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>


      </div>

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
