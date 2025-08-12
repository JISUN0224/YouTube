import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractVideoId } from '../utils/youtube.validation'
import { auth, db } from '../firebase'
import { doc, setDoc } from 'firebase/firestore'
import { VideoHistoryService } from '../services/videoHistoryService'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
    webkitSpeechRecognition?: any
  }
}

interface Segment {
  id: number
  start_time: string
  end_time: string
  start_seconds: number
  end_seconds: number
  duration: number
  original_text: string
  translation_suggestion: string
  keywords: string[]
}

interface VideoInfo {
  id: string
  title: string
  speaker: string
  duration: string
  language: string
  description: string
}

interface ProcessedData {
  video_info: VideoInfo
  segments: Segment[]
  full_text: string
  files: {
    audio: string
    txt: string
    srt: string
    vtt: string
    html?: string
  }
  stats: {
    total_segments: number
    total_duration: string
    processing_time: number
  }
}

const ProcessedVisualInterpretation: React.FC = () => {
  const navigate = useNavigate()

  const [currentScript, setCurrentScript] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [pauseMode, setPauseMode] = useState<'segment' | 'sentence' | 'manual'>('sentence')
  const [youtubeAPIReady, setYoutubeAPIReady] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)

  // 녹음 관련 상태
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [accumulatedText, setAccumulatedText] = useState('')
  const [currentText, setCurrentText] = useState('')
  const [recordedSegments] = useState<{ [key: number]: string }>({})

  // 통역 연습 모드 상태
  const [practiceMode, setPracticeMode] = useState<'listen' | 'interpret' | 'review'>('listen')
  const [isAutoMode, setIsAutoMode] = useState(true)
  const [practiceSegmentIndex, setPracticeSegmentIndex] = useState(0)
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true)
  const [lastAutoDetectionEnabledTime, setLastAutoDetectionEnabledTime] = useState(0)
  const [hideOriginalText, setHideOriginalText] = useState(false)

  // 세션 관리
  const [completedSegments, setCompletedSegments] = useState<number[]>([])
  const [totalScore, setTotalScore] = useState(0)

  // 음성 재생 관련 상태
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false)
  const [isPlayingModelAudio, setIsPlayingModelAudio] = useState(false)
  const userAudioRef = useRef<HTMLAudioElement>(null)
  const modelAudioRef = useRef<HTMLAudioElement>(null)

  // YouTube
  const [youtubeVideoId, setYoutubeVideoId] = useState('')
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  
  // 즐겨찾기 상태
  const [isFavorite, setIsFavorite] = useState(false)
  const [currentVideoUrl, setCurrentVideoUrl] = useState('')

  // Refs for recording functionality
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const intervalRef = useRef<number | null>(null)
  const isRecordingRef = useRef<boolean>(false)
  const scriptContainerRef = useRef<HTMLDivElement | null>(null)

  // 처리된 데이터 로드
  useEffect(() => {
    const loadProcessedData = () => {
      try {
        setLoading(true)
        const processingResultStr = localStorage.getItem('processingResult')
        if (!processingResultStr) {
          navigate('/youtube-generator')
          return
        }
        const processedData: ProcessedData = JSON.parse(processingResultStr)
        if (processedData.video_info) setVideoInfo(processedData.video_info)
        if (processedData.segments && Array.isArray(processedData.segments)) {
          setSegments(processedData.segments)
        }
        const originalUrl = localStorage.getItem('currentYouTubeUrl') || ''
        const id = extractVideoId(originalUrl || processedData.video_info?.description || '')
        if (id) setYoutubeVideoId(id)
        
        // 즐겨찾기 상태 확인
        const videoUrl = originalUrl || `https://www.youtube.com/watch?v=${id}`
        setCurrentVideoUrl(videoUrl)
        if (videoUrl) {
          setIsFavorite(VideoHistoryService.isFavorite(videoUrl))
        }
        
        setIsDataLoaded(true)
      } catch {
        navigate('/youtube-generator')
      } finally {
        setLoading(false)
      }
    }
    loadProcessedData()
  }, [navigate])

  // 즐겨찾기 토글 핸들러
  const handleToggleFavorite = () => {
    if (!currentVideoUrl) return
    
    const newFavoriteStatus = VideoHistoryService.toggleFavorite(currentVideoUrl)
    setIsFavorite(newFavoriteStatus)
    
    if (newFavoriteStatus) {
      alert('⭐ 즐겨찾기에 추가되었습니다!')
    } else {
      alert('즐겨찾기에서 제거되었습니다.')
    }
  }

  const timeToSeconds = (timeStr: string | number): number => {
    // 숫자인 경우 바로 반환
    if (typeof timeStr === 'number') {
      return timeStr;
    }
    
    // 문자열이 아니거나 undefined인 경우 0 반환
    if (!timeStr || typeof timeStr !== 'string') {
      return 0;
    }
    
    // HH:MM:SS,mmm 형식 파싱
    const parts = timeStr.split(':')
    if (parts.length !== 3) {
      return 0;
    }
    
    const hours = parseInt(parts[0], 10) || 0
    const minutes = parseInt(parts[1], 10) || 0
    const secondsParts = parts[2].split(',')
    const seconds = parseInt(secondsParts[0], 10) || 0
    const milliseconds = secondsParts[1] ? parseInt(secondsParts[1], 10) / 1000 : 0
    return hours * 3600 + minutes * 60 + seconds + milliseconds
  }

  const findCurrentSegmentIndex = (currentTimeInSeconds: number): number => {
    for (let i = 0; i < segments.length; i++) {
      const startTime = timeToSeconds(segments[i].start_time)
      const endTime = timeToSeconds(segments[i].end_time)
      if (currentTimeInSeconds >= startTime && currentTimeInSeconds <= endTime) {
        return i
      }
    }
    return -1
  }

  const isCompleteSentence = (text: string | undefined): boolean => {
    if (!text || typeof text !== 'string') {
      return false;
    }
    const chineseEndPunctuations = ['。', '！', '？', '；']
    return chineseEndPunctuations.some((punct) => text.trim().endsWith(punct))
  }

  // YouTube API 로드
  useEffect(() => {
    if (!isDataLoaded || !youtubeVideoId) return

    let isSubscribed = true
    const loadYouTubeAPI = () => {
      return new Promise<void>((resolve) => {
        if (window.YT && window.YT.Player) {
          resolve()
          return
        }
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
        window.onYouTubeIframeAPIReady = () => {
          if (isSubscribed) resolve()
        }
      })
    }

    const initializePlayer = async () => {
      try {
        await loadYouTubeAPI()
        if (!isSubscribed) return
        const elOk = async (): Promise<boolean> => {
          let retry = 0
          while (retry < 5) {
            const el = document.getElementById('youtube-player')
            if (el) return true
            retry += 1
            await new Promise((r) => setTimeout(r, 500))
          }
          return false
        }
        if (!(await elOk())) return
        const ytPlayer = new window.YT.Player('youtube-player', {
          height: '100%',
          width: '100%',
          videoId: youtubeVideoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (!isSubscribed) return
              setPlayer(event.target)
              setPlayerError(null)
              setYoutubeAPIReady(true)
            },
            onStateChange: (event: any) => {
              if (!isSubscribed) return
              if (event.data === window.YT.PlayerState.PLAYING) setIsPlaying(true)
              else setIsPlaying(false)
            },
            onError: (event: any) => {
              if (!isSubscribed) return
              let errorMsg = `알 수 없는 에러 (코드: ${event?.data ?? 'unknown'})`
              setPlayerError(errorMsg)
            },
          },
        })
      } catch (error) {
        if (!isSubscribed) return
        setPlayerError('YouTube 플레이어를 초기화할 수 없습니다.')
      }
    }
    void initializePlayer()
    return () => {
      isSubscribed = false
      window.onYouTubeIframeAPIReady = () => {}
    }
  }, [isDataLoaded, youtubeVideoId])

  // 비디오 시간 추적 및 자동 일시정지
  useEffect(() => {
    if (!player || !segments.length) return
    const interval = window.setInterval(() => {
      if (player.getCurrentTime) {
        const time = player.getCurrentTime()
        setCurrentTime(time)
        const segmentIndex = findCurrentSegmentIndex(time)
        if (segmentIndex !== -1 && segmentIndex !== currentScript) {
          setCurrentScript(segmentIndex)
        }

        if (
          pauseMode !== 'manual' &&
          practiceMode === 'listen' &&
          autoDetectionEnabled &&
          currentScript < segments.length &&
          isPlaying &&
          !isRecording
        ) {
          const currentSegment = segments[currentScript]
          const endTime = timeToSeconds(currentSegment.end_time)
          const startTime = timeToSeconds(currentSegment.start_time)
          if (time >= endTime && time - startTime >= 1) {
            const since = Date.now() - lastAutoDetectionEnabledTime
            if (since > 1000) {
              if (pauseMode === 'segment') {
                player.pauseVideo()
                if (isAutoMode) {
                  setPracticeSegmentIndex(currentScript)
                  setPracticeMode('interpret')
                }
              } else if (pauseMode === 'sentence') {
                if (currentSegment && isCompleteSentence(currentSegment.original_text || currentSegment.text)) {
                  player.pauseVideo()
                  if (isAutoMode) {
                    setPracticeSegmentIndex(currentScript)
                    setPracticeMode('interpret')
                  }
                }
              }
            }
          }
        }
      }
    }, 100)
    return () => window.clearInterval(interval)
  }, [player, segments, currentScript, isPlaying, pauseMode, isRecording, isAutoMode, practiceMode, autoDetectionEnabled, lastAutoDetectionEnabledTime])

  // 자막 스크립트 자동 스크롤
  useEffect(() => {
    if (scriptContainerRef.current && segments.length > 0) {
      const currentElement = scriptContainerRef.current.children[currentScript] as HTMLElement
      if (currentElement) currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentScript, segments.length])

  // 녹음 제어 + 간단 ASR
  const startRecording = async () => {
    try {
      if (isRecordingRef.current) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      const chunks: BlobPart[] = []
      mr.ondataavailable = (e) => e.data && chunks.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach((tr) => tr.stop())
        streamRef.current = null
      }
      mr.start()
      isRecordingRef.current = true
      setIsRecording(true)
      setRecordingTime(0)
      intervalRef.current = window.setInterval(() => setRecordingTime((t) => t + 1), 1000)

      const Rec = (window as any).webkitSpeechRecognition
      if (Rec) {
        const rec = new Rec()
        recognitionRef.current = rec
        rec.lang = 'ko-KR'
        rec.interimResults = true
        rec.continuous = true
        rec.onresult = (ev: any) => {
          let interim = ''
          let final = ''
          for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
            const r = ev.results[i]
            if (r.isFinal) final += r[0].transcript
            else interim += r[0].transcript
          }
          if (final) setAccumulatedText((prev) => (prev ? `${prev} ${final}` : final))
          setCurrentText(interim)
        }
        rec.onerror = () => {}
        rec.start()
      }
    } catch {
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }

  const stopRecording = () => {
    try { mediaRecorderRef.current?.stop() } catch {}
    try { recognitionRef.current?.stop?.() } catch {}
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    setIsRecording(false)
    isRecordingRef.current = false
  }

  const speakKorean = (text: string) => {
    if (!text) return
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch {}
  }

  // 선택: Firebase에 저장
  useEffect(() => {
    const save = async () => {
      try {
        if (!segments.length || !db) return
        const raw = localStorage.getItem('processingResult')
        if (!raw) return
        const id = `processed_${Date.now()}`
        await setDoc(doc(db, 'visual_interpretation_processed', id), {
          ...JSON.parse(raw),
          created_at: new Date().toISOString(),
          user_id: auth?.currentUser?.uid || 'anonymous',
        })
      } catch {}
    }
    void save()
  }, [segments])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-lg text-gray-600">처리된 영상 데이터를 로드하는 중...</p>
        </div>
      </div>
    )
  }

  if (!segments.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">데이터가 없습니다</h2>
          <p className="text-gray-600 mb-6">처리된 영상 데이터를 찾을 수 없습니다.</p>
          <button onClick={() => navigate('/youtube-generator')} className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600">새 영상 처리하기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 홈으로 버튼 */}
      <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-50 px-4 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-lg shadow-md transition-colors duration-200 flex items-center space-x-2">
        <span>🏠</span>
        <span>홈으로</span>
      </button>

      <div className="min-h-screen bg-gray-50 p-5">
        <div className="max-w-7xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => navigate('/youtube-generator')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                🏠 홈으로
              </button>
              
              <h1 className="text-4xl font-bold text-gray-900">🎥 시각자료 통역 연습</h1>
              
              {/* 즐겨찾기 버튼 */}
              {currentVideoUrl && (
                <button
                  onClick={handleToggleFavorite}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isFavorite
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {isFavorite ? '⭐ 즐겨찾기 제거' : '⭐ 즐겨찾기 추가'}
                </button>
              )}
            </div>
            <p className="text-lg text-gray-600">처리된 YouTube 영상으로 실제 통역 환경에서 연습해보세요</p>
            {videoInfo && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg inline-block">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">{videoInfo.title}</h2>
                <p className="text-sm text-blue-700">🎤 강연자: <span className="font-semibold">{videoInfo.speaker}</span> | ⏱️ 길이: {videoInfo.duration} | 🌏 언어: {videoInfo.language}</p>
                <p className="text-xs text-blue-600 mt-2">{videoInfo.description}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[calc(100vh-200px)]">
            {/* 왼쪽: 비디오 및 컨트롤 영역 */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-lg">
              <div className="mb-5">
                <audio ref={userAudioRef} style={{ display: 'none' }} />
                <audio ref={modelAudioRef} style={{ display: 'none' }} />

                <div className="w-full h-96 rounded-xl overflow-hidden bg-black relative">
                  <div id="youtube-player" className="w-full h-full"></div>
                  {!youtubeAPIReady && !playerError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
                      <div className="text-center text-white">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
                        <p>YouTube 플레이어 로딩 중...</p>
                      </div>
                    </div>
                  )}
                  {playerError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-600 bg-opacity-90">
                      <div className="text-center text-white p-6">
                        <div className="text-4xl mb-3">⚠️</div>
                        <h3 className="text-lg font-semibold mb-2">비디오 로드 실패</h3>
                        <p className="text-sm mb-4">{playerError}</p>
                        <button onClick={() => { setPlayerError(null); setYoutubeAPIReady(false); window.location.reload() }} className="px-4 py-2 bg-white text-red-600 rounded-lg font-semibold hover:bg-gray-100">다시 시도</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 자막 표시 */}
              <div className="bg-gray-900 text-white p-4 rounded-lg text-center min-h-[80px] flex flex-col justify-center mb-6 relative">
                <button onClick={() => setHideOriginalText(!hideOriginalText)} className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md transition-colors">
                  {hideOriginalText ? '원문 보이기' : '원문 숨기기'}
                </button>
                {segments.length > 0 && currentScript < segments.length ? (
                  !hideOriginalText ? (
                    <div className="text-lg mb-2 text-yellow-300">{segments[currentScript].original_text}</div>
                  ) : (
                    <div className="text-gray-400 italic text-sm">원문이 숨겨져 있습니다</div>
                  )
                ) : (
                  <div className="text-gray-400">자막을 선택해주세요</div>
                )}
              </div>

              {/* 자동 일시정지 */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">⏸️ 자동 일시정지 설정</h4>
                <div className="flex gap-3">
                  <button onClick={() => setPauseMode('sentence')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${pauseMode === 'sentence' ? 'bg-green-500 text-white border-2 border-green-500' : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-500'}`}>🧠 문장별 (추천)</button>
                  <button onClick={() => setPauseMode('segment')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${pauseMode === 'segment' ? 'bg-yellow-500 text-white border-2 border-yellow-500' : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-yellow-500'}`}>⏱️ 세그먼트별</button>
                  <button onClick={() => setPauseMode('manual')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${pauseMode === 'manual' ? 'bg-gray-500 text-white border-2 border-gray-500' : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500'}`}>🎛️ 수동 제어</button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {pauseMode === 'sentence' && '완전한 문장이 끝날 때만 자동 일시정지'}
                  {pauseMode === 'segment' && '각 세그먼트가 끝날 때마다 자동 일시정지'}
                  {pauseMode === 'manual' && '자동 일시정지 없음 (사용자가 직접 제어)'}
                </div>
              </div>

              {/* 듣기 모드 */}
              {practiceMode === 'listen' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2"><span>🔊</span> 원문 듣기 단계</h4>
                  <div className="flex justify-center mb-4">
                    <button onClick={() => { if (player && segments[currentScript]) { const s = timeToSeconds(segments[currentScript].start_time); player.seekTo(s); player.playVideo(); setLastAutoDetectionEnabledTime(Date.now()) } }} disabled={!player || segments.length === 0} className={`w-24 h-24 rounded-full text-4xl font-bold transition-all duration-300 shadow-lg flex items-center justify-center ${!player || segments.length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : isPlaying ? 'bg-orange-500 text-white hover:bg-orange-600 animate-pulse' : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105'}`} style={{ lineHeight: '1' }}>{isPlaying ? '⏸️' : '▶️'}</button>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-600 mb-2">{isPlaying ? '재생 중...' : '현재 세그먼트 재생'}</div>
                    {isAutoMode && <div className="text-sm text-blue-600">자동 모드: 세그먼트가 끝나면 통역 단계로 자동 전환됩니다</div>}
                  </div>
                </div>
              )}

              {/* 통역 모드 */}
              {practiceMode === 'interpret' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2"><span>🎙️</span> 통역 녹음 단계</h4>
                  <div className="flex justify-center mb-4">
                    <button onClick={() => { if (isRecording) { stopRecording() } else { void startRecording() } }} className={`w-24 h-24 rounded-full text-4xl font-bold transition-all duration-300 shadow-lg flex items-center justify-center ${isRecording ? 'bg-red-600 text-white animate-pulse hover:bg-red-700' : 'bg-red-500 text-white hover:bg-red-600 hover:scale-105'}`} style={{ lineHeight: '1' }}>{isRecording ? '⏹️' : '🎙️'}</button>
                  </div>
                  <div className="text-center mb-6">
                    <div className="text-3xl font-mono font-bold text-red-600 mb-2">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</div>
                    <div className="text-gray-600">{isRecording ? '녹음 중... 한국어로 통역해주세요' : '녹음 시작하기'}</div>
                  </div>
                  <div className="bg-white border-2 border-red-200 rounded-xl p-4 min-h-[100px]">
                    <div className="text-sm font-medium text-red-700 mb-2">실시간 음성 인식 결과:</div>
                    {(accumulatedText || currentText) ? (
                      <div className="text-lg text-gray-800 leading-relaxed"><span className="font-medium">{accumulatedText}</span> <span className="text-gray-500 italic">{currentText}</span></div>
                    ) : (
                      <div className="text-gray-400 italic text-center py-6">{isRecording ? '음성을 인식하고 있습니다...' : '녹음을 시작하면 실시간으로 텍스트가 표시됩니다'}</div>
                    )}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => { if (player && segments[practiceSegmentIndex]) { const s = timeToSeconds(segments[practiceSegmentIndex].start_time); player.seekTo(s); player.playVideo() } }} className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">🔁 다시 듣기</button>
                    {(accumulatedText.trim() || currentText.trim()) && (
                      <button onClick={() => { setAccumulatedText(''); setCurrentText(''); setRecordingTime(0) }} className="py-3 px-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">🗑️ 초기화</button>
                    )}
                  </div>
                </div>
              )}

              {/* 검토 모드 */}
              {practiceMode === 'review' && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2"><span>📝</span> 검토 단계</h4>
                  <div className="bg-white border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-semibold text-green-700">내 통역 결과 (세그먼트 {practiceSegmentIndex + 1}):</h5>
                      <button onClick={() => setIsPlayingUserAudio(!isPlayingUserAudio)} disabled={!audioBlob} className={`px-3 py-1 rounded text-xs ${isPlayingUserAudio ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}>{isPlayingUserAudio ? '⏸️ 일시정지' : '🔊 듣기'}</button>
                    </div>
                    <p className="text-gray-800 leading-relaxed">{recordedSegments[practiceSegmentIndex] || accumulatedText || '녹음된 내용이 없습니다.'}</p>
                    <div className="mt-2 text-xs text-gray-500 border-t pt-2">원문: {segments[practiceSegmentIndex]?.original_text || '원문 없음'}</div>
                  </div>
                  {segments[practiceSegmentIndex] && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="font-semibold text-blue-700">AI 제안 답안 (세그먼트 {practiceSegmentIndex + 1}):</h5>
                        <button onClick={() => { setIsPlayingModelAudio(!isPlayingModelAudio); if (!isPlayingModelAudio) speakKorean(segments[practiceSegmentIndex].translation_suggestion) }} className={`px-3 py-1 rounded text-xs ${isPlayingModelAudio ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}>{isPlayingModelAudio ? '⏸️ 일시정지' : '🔊 듣기'}</button>
                      </div>
                      <p className="text-gray-800 leading-relaxed mb-3">{segments[practiceSegmentIndex].translation_suggestion}</p>
                      {!!segments[practiceSegmentIndex].keywords?.length && (
                        <div className="mb-3">
                          <div className="text-sm font-medium text-blue-700 mb-2">🔑 핵심 키워드:</div>
                          <div className="flex flex-wrap gap-2">
                            {segments[practiceSegmentIndex].keywords.map((kw, i) => (
                              <span key={i} className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full font-medium">{kw}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setPracticeMode('listen'); setAccumulatedText(''); setCurrentText(''); setRecordingTime(0) }} className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">🔁 다시 연습</button>
                    <button onClick={() => { if (practiceSegmentIndex < segments.length - 1) { const nextIndex = practiceSegmentIndex + 1; setPracticeSegmentIndex(nextIndex); setCurrentScript(nextIndex); setPracticeMode('listen'); setAccumulatedText(''); setCurrentText(''); setRecordingTime(0); if (!completedSegments.includes(practiceSegmentIndex)) { setCompletedSegments((prev) => [...prev, practiceSegmentIndex]); const segmentScore = Math.min(accumulatedText.trim().length * 2, 100); setTotalScore((prev) => prev + segmentScore) } setAutoDetectionEnabled(false); if (player) { const start = timeToSeconds(segments[nextIndex].start_time); player.seekTo(start); player.playVideo(); setTimeout(() => setAutoDetectionEnabled(true), 1000) } else { setTimeout(() => setAutoDetectionEnabled(true), 500) } } }} disabled={practiceSegmentIndex >= segments.length - 1} className={`flex-1 py-3 px-4 rounded-lg transition-colors ${practiceSegmentIndex >= segments.length - 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}>➡️ 다음 세그먼트</button>
                  </div>
                </div>
              )}

              {/* 수동 모드 컨트롤 */}
              {!isAutoMode && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">수동 제어</h4>
                  <div className="flex gap-3">
                    <button onClick={() => { if (player) { if (isPlaying) player.pauseVideo(); else player.playVideo() } }} disabled={!player} className={`px-4 py-2 rounded-lg font-medium transition-colors ${!player ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}>{isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}</button>
                    <button onClick={() => { if (player && segments.length > 0) { setPracticeMode('listen'); setPracticeSegmentIndex(0); setCurrentScript(0); setAccumulatedText(''); setCurrentText(''); setRecordingTime(0); setAutoDetectionEnabled(false); const startTime = timeToSeconds(segments[0].start_time); player.seekTo(startTime); setTimeout(() => setAutoDetectionEnabled(true), 1000) } }} disabled={!player} className={`px-4 py-2 rounded-lg font-medium transition-colors ${!player ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}>🔄 처음부터</button>
                    <button onClick={() => { if (player && currentScript < segments.length) { setPracticeMode('listen'); setPracticeSegmentIndex(currentScript); setAccumulatedText(''); setCurrentText(''); setRecordingTime(0); setAutoDetectionEnabled(false); const startTime = timeToSeconds(segments[currentScript].start_time); player.seekTo(startTime); player.playVideo(); setTimeout(() => setAutoDetectionEnabled(true), 1000) } }} disabled={!player || segments.length === 0} className={`px-4 py-2 rounded-lg font-medium transition-colors ${!player || segments.length === 0 ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>🎯 현재 세그먼트</button>
                  </div>
                </div>
              )}
            </div>

            {/* 오른쪽: 연습 설정 및 자막 패널 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              {/* 통역 설정 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">⚙️ 통역 설정</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">재생 속도</label>
                    <select className="w-full p-2 border-2 border-gray-300 rounded-md" defaultValue={1} onChange={(e) => { try { player?.setPlaybackRate?.(Number(e.target.value)) } catch {} }}>
                      <option value={1}>정상 속도 (1.0x)</option>
                      <option value={0.8}>느림 (0.8x)</option>
                      <option value={0.6}>더 느림 (0.6x)</option>
                      <option value={1.2}>빠름 (1.2x)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 연습 상태 */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 연습 현황</h3>
                <div className="space-y-2">
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md"><span className="text-gray-700 font-medium">총 세그먼트</span><span className="text-gray-900 font-semibold">{segments.length}개</span></div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md"><span className="text-gray-700 font-medium">현재 구간</span><span className="text-gray-900 font-semibold">#{currentScript + 1}</span></div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md"><span className="text-gray-700 font-medium">진행률</span><span className="text-gray-900 font-semibold">{Math.round(((currentScript + 1) / segments.length) * 100)}%</span></div>
                  <div className="flex justify-between p-3 bg-gray-100 rounded-md"><span className="text-gray-700 font-medium">남은 구간</span><span className="text-gray-900 font-semibold">{segments.length - currentScript - 1}개</span></div>
                </div>
              </div>

              {/* 자막 스크립트 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 자막 스크립트</h3>
                <div ref={scriptContainerRef} className="h-[28rem] overflow-y-auto border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
                  {segments.map((segment, index) => (
                    <div key={segment.id} onClick={() => { setPracticeMode('listen'); setPracticeSegmentIndex(index); setCurrentScript(index); setAccumulatedText(''); setCurrentText(''); setRecordingTime(0); if (player) { const startTime = timeToSeconds(segment.start_time); setLastAutoDetectionEnabledTime(Date.now()); player.seekTo(startTime); player.playVideo() } }} className={`p-3 mb-2 rounded cursor-pointer transition-all ${currentScript === index ? 'bg-blue-100 border-l-4 border-blue-500 shadow-md scale-105' : 'hover:bg-gray-200'}`}>
                      <div className="text-gray-600 text-xs mb-1">[{segment.start_time} - {segment.end_time}]</div>
                      <div className="text-gray-900 font-medium text-sm">{segment.original_text}</div>
                      {segment.keywords && segment.keywords.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {segment.keywords.slice(0, 3).map((keyword, kIndex) => (
                            <span key={kIndex} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">{keyword}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProcessedVisualInterpretation


