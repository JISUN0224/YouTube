import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoProcessing } from '../contexts/VideoProcessingContext'
import { validateYouTubeUrl, extractVideoId } from '../utils/youtube.validation'
import type { VideoInfo } from '../types/youtube.types'
import { VideoHistoryService, type VideoHistoryItem } from '../services/videoHistoryService'
import { useAuth } from '../contexts/AuthContext'
import { UserProfile } from '../components/UserProfile'
import { LoginModal } from '../components/LoginModal'
import { recommendedVideos } from '../data/recommendedVideos'
import { RecommendedVideoCard } from '../components/RecommendedVideoCard'
import { useAzureProcessing } from '../services/azureProcessingService'

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
  const [history, setHistory] = useState<VideoHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
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

  // 즐겨찾기 로드 및 임시 저장 정리
  useEffect(() => {
    const loadFavorites = () => {
      // 임시 저장된 항목들 정리 (7일 이상된 것들)
      VideoHistoryService.cleanupTemporary()
      
      // 즐겨찾기만 가져오기
      const favorites = VideoHistoryService.getFavorites()
      setHistory(favorites)
      setShowHistory(favorites.length > 0)
    }
    loadFavorites()
  }, [])

  // 히스토리 아이템 클릭 핸들러
  const handleHistoryClick = (item: VideoHistoryItem) => {
    // 처리된 결과를 localStorage에 저장하고 결과 페이지로 이동
    try {
      const result = {
        text: item.text,
        segments: item.segments,
        language: item.language,
        url: item.url,
        processed_at: item.processedAt
      }
      localStorage.setItem('processingResult', JSON.stringify(result))
      navigate('/visual-interpretation')
    } catch (error) {
      console.error('[YouTubeGenerator] 히스토리 아이템 클릭 오류:', error)
    }
  }

  // 즐겨찾기 아이템 삭제
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // 클릭 이벤트 전파 방지
    VideoHistoryService.removeFromHistory(id)
    setHistory(VideoHistoryService.getFavorites()) // 즐겨찾기만 다시 로드
  }

  // 상대 시간 포맷팅
  const formatRelativeTime = (dateString: string): string => {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffDays > 0) return `${diffDays}일 전`
    if (diffHours > 0) return `${diffHours}시간 전`
    if (diffMinutes > 0) return `${diffMinutes}분 전`
    return '방금 전'
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
      <div className="absolute top-0 right-0 p-6 z-10">
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
      </div>

      <div className={styles.container}>
        {/* 페이지 제목 */}
        <div className="text-center text-black mb-12">
          <h1 className="text-6xl font-extrabold mb-4"> YouTube 실시간 통역 연습 생성기</h1>
          <p className="text-2xl opacity-90">YouTube 영상에서 바로 통역 연습 환경을 만들어보세요</p>
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

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-2"> 예시 URL</h3>
                <code className="text-sm text-gray-600 bg-white px-2 py-1 rounded">https://www.youtube.com/watch?v=example</code>
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
              
              <div className="space-y-2 max-h-[80vh] overflow-y-auto">
                                  {recommendedVideos.map((video) => (
                    <RecommendedVideoCard
                      key={video.id}
                      video={video}
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
              
              <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-600">
                  ✅ <span className="text-green-600 font-medium">즉시 재생</span> = 별도 과정 없이 클릭만 하면 통역 연습 가능해요<br/>
                  💡 일반 영상 = URL 입력 후 스크립트 추출 등 과정이 필요해요요
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 사용자 즐겨찾기 섹션 (로그인한 경우만) */}
        {currentUser && showHistory && (
          <div className="max-w-4xl mx-auto mt-8">
              <div className={styles.card}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">⭐ 내 즐겨찾기</h2>
                  <div className="text-sm text-gray-500">
                    {history.length}개 즐겨찾기 • 전체 {VideoHistoryService.getStats().totalSizeKB}KB 사용
                  </div>
                </div>
                
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {history.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="flex items-center p-4 bg-gray-50 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors group"
                    >
                      {/* 썸네일 */}
                      <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-gray-200">
                        <img
                          src={item.thumbnail}
                          alt="thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement
                            target.onerror = null
                            target.src = 'https://www.youtube.com/s/desktop/fe8e0a7f/img/favicon_144x144.png'
                          }}
                        />
                      </div>
                      
                      {/* 정보 */}
                      <div className="flex-1 ml-4 min-w-0">
                        <div className="font-medium text-gray-900 truncate group-hover:text-blue-700">
                          {item.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate mt-1">
                          {item.text.slice(0, 80)}...
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatRelativeTime(item.processedAt)} • {item.segments.length}개 세그먼트
                        </div>
                      </div>
                      
                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="ml-3 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
                
                {history.length > 10 && (
                  <div className="mt-4 text-center text-sm text-gray-500">
                    {history.length - 10}개 더 있음 (최신 10개만 표시)
                  </div>
                )}
                
                {history.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                    <p className="text-sm text-gray-600 mb-2">
                      💡 결과 페이지에서 "⭐ 즐겨찾기 추가" 버튼을 눌러 여기에 저장하세요!
                    </p>
                    <button
                      onClick={() => {
                        if (confirm('모든 즐겨찾기를 삭제하시겠습니까?')) {
                          const favorites = VideoHistoryService.getFavorites()
                          favorites.forEach(item => VideoHistoryService.removeFromHistory(item.id))
                          setHistory([])
                          setShowHistory(false)
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-700 transition-colors"
                    >
                      모든 즐겨찾기 삭제
                    </button>
                  </div>
                )}
                
                {history.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-4">⭐</div>
                    <p className="text-lg font-medium mb-2">아직 즐겨찾기가 없습니다</p>
                    <p className="text-sm">영상을 처리한 후 결과 페이지에서 즐겨찾기로 추가해보세요!</p>
                  </div>
                )}
              </div>
          </div>
        )}
      </div>

      {/* 로그인 모달 */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
    </div>
  )
}
