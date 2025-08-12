import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoProcessing } from '../contexts/VideoProcessingContext'
import { useAzureProcessing } from '../services/azureProcessingService'
import { VideoHistoryService } from '../services/videoHistoryService'

interface ProcessStep {
  id: string
  name: string
  icon: string
  status: 'pending' | 'active' | 'completed'
}

const ProcessingPage: React.FC = () => {
  const navigate = useNavigate()
  const { youtubeUrl } = useVideoProcessing()
  const { isProcessing, progress, currentStep, message, result, error, startProcessing } = useAzureProcessing()
  const processingStartedRef = useRef(false) // 중복 실행 방지

  const [steps, setSteps] = useState<ProcessStep[]>([
    { id: 'downloading', name: '음성 추출', icon: '🎵', status: 'pending' },
    { id: 'transcribing', name: 'Azure 음성 인식', icon: '☁️', status: 'pending' },
    { id: 'processing', name: '결과 처리', icon: '📝', status: 'pending' },
    { id: 'completed', name: '완료', icon: '✅', status: 'pending' },
  ])

  useEffect(() => {
    setSteps((prevSteps) => {
      return prevSteps.map((step) => {
        if (step.id === currentStep) {
          return { ...step, status: 'active' as const }
        }
        const stepOrder = ['downloading', 'transcribing', 'generating', 'completed']
        const currentIndex = stepOrder.indexOf(currentStep)
        const stepIndex = stepOrder.indexOf(step.id)
        if (stepIndex < currentIndex || currentStep === 'completed') {
          return { ...step, status: 'completed' as const }
        }
        return { ...step, status: 'pending' as const }
      })
    })
  }, [currentStep])

  useEffect(() => {
    // 이미 처리가 시작되었거나 진행 중이면 중복 실행 방지
    if (processingStartedRef.current || isProcessing) {
      console.log('[ProcessingPage] 이미 처리 중이므로 중복 실행 방지')
      return
    }

    console.log('[ProcessingPage] 현재 YouTube URL:', youtubeUrl)
    
    // YouTube URL이 없으면 localStorage에서 복구 시도
    if (!youtubeUrl) {
      try {
        const savedUrl = localStorage.getItem('currentYouTubeUrl')
        console.log('[ProcessingPage] localStorage에서 URL 복구 시도:', savedUrl)
        if (savedUrl) {
          // Context에 URL 설정하고 다시 시작
          console.log('[ProcessingPage] 복구된 URL로 처리 시작:', savedUrl)
          processingStartedRef.current = true
          startProcessing(savedUrl)
          return
        }
      } catch (e) {
        console.error('[ProcessingPage] localStorage에서 URL 복구 실패:', e)
      }
      console.log('[ProcessingPage] URL이 없어서 홈으로 리다이렉트')
      navigate('/youtube-generator')
      return
    }
    
    try {
      localStorage.setItem('currentYouTubeUrl', youtubeUrl)
      console.log('[ProcessingPage] URL을 localStorage에 저장:', youtubeUrl)
    } catch {}
    
    console.log('[ProcessingPage] 처리 시작:', youtubeUrl)
    processingStartedRef.current = true
    startProcessing(youtubeUrl)
  }, [youtubeUrl, navigate, isProcessing])

  useEffect(() => {
    if (result) {
      console.log('[ProcessingPage] 처리 완료, 결과:', result)
      
      // 기존 localStorage에 결과 저장
      try {
        localStorage.setItem('processingResult', JSON.stringify(result))
      } catch {}
      
      // 히스토리에 자동 저장
      try {
        const videoId = VideoHistoryService.extractVideoId(result.url || youtubeUrl || '')
        const title = `YouTube Video ${videoId ? `(${videoId})` : ''}` // 나중에 YouTube API로 실제 제목 가져올 예정
        const thumbnail = VideoHistoryService.generateThumbnailUrl(result.url || youtubeUrl || '')
        
        VideoHistoryService.addToHistory({
          url: result.url || youtubeUrl || '',
          title,
          thumbnail,
          text: result.text || '',
          segments: result.segments || [],
          language: result.language || 'zh-CN'
        })
        console.log('[ProcessingPage] 히스토리에 저장 완료')
      } catch (error) {
        console.error('[ProcessingPage] 히스토리 저장 실패:', error)
      }
      
      processingStartedRef.current = false // 처리 완료 시 리셋
      setTimeout(() => {
        navigate('/visual-interpretation')
      }, 3000)
    }
  }, [result, navigate, youtubeUrl])

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-600 mb-4">처리 실패</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => {
                processingStartedRef.current = false // 오류 시 리셋
                navigate('/youtube-generator')
              }}
              className="w-full bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-4">
          <div className="text-center">
            <div className="text-8xl mb-6 animate-bounce">🎉</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-3">처리 완료!</h1>
            <p className="text-gray-600 mb-6">YouTube 영상이 통역 연습 환경으로 성공적으로 변환되었습니다</p>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{result.stats?.total_segments || 0}</div>
                  <div className="text-sm text-gray-600">세그먼트</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{result.stats?.total_duration || '0:00'}</div>
                  <div className="text-sm text-gray-600">총 길이</div>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/visual-interpretation')}
              className="w-full bg-green-500 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-green-600 transition-colors shadow-lg"
            >
              🎯 통역 연습 시작하기
            </button>
            <div className="mt-4 text-sm text-gray-500">잠시 후 자동으로 이동됩니다...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎬 YouTube 실시간 통역 연습 생성기</h1>
          <p className="text-gray-600">YouTube 영상에서 바로 통역 연습 환경을 만들어보세요</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <div className="flex items-center mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
            <span className="text-lg font-semibold text-gray-700">처리 중...</span>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {steps.map((step) => (
              <div key={step.id} className="text-center">
                <div
                  className={`
                  w-16 h-16 mx-auto mb-3 rounded-xl flex items-center justify-center text-2xl transition-all duration-500
                  ${step.status === 'active' ? 'bg-blue-500 text-white shadow-lg scale-110 animate-pulse' : step.status === 'completed' ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-200 text-gray-400'}
                `}
                >
                  {step.status === 'active' ? <div className="animate-bounce">{step.icon}</div> : step.icon}
                </div>
                <div
                  className={`text-sm font-medium ${step.status === 'active' ? 'text-blue-600' : step.status === 'completed' ? 'text-green-600' : 'text-gray-500'}`}
                >
                  {step.name}
                </div>
              </div>
            ))}
          </div>
          <div className="mb-4">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-800 mb-1">{getStepDisplayName(currentStep)} ({progress}%)</div>
            <div className="text-sm text-gray-600 mb-4">{message}</div>
            <div className="flex items-center justify-center text-sm text-gray-500 space-x-4">
              <div className="flex items-center">
                <span className="mr-1">⏱️</span>
                <span>예상 소요 시간: 2-3분</span>
              </div>
              <div className="flex items-center">
                <span className="mr-1">💡</span>
                <span>페이지를 닫지 마시고 잠시만 기다려주세요</span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center">
          <div className="inline-flex items-center bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
            <span className="mr-2">🐍</span>
            Python 서버에서 FFmpeg + Whisper로 무료 처리 중
          </div>
          <div className="mt-4">
            <button onClick={() => navigate('/youtube-generator')} className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2 rounded transition-colors">
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getStepDisplayName(step: string): string {
  const stepNames: { [key: string]: string } = {
    initializing: '초기화 중',
    dependency_check: '환경 확인 중',
    downloading: '음성 추출 중',
    transcribing: '음성 인식 중',
    generating: '자막 생성 중',
    finalizing: '마무리 중',
    completed: '처리 완료',
    error: '오류 발생',
  }
  return stepNames[step] || '처리 중'
}

export default ProcessingPage



