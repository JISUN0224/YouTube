import React from 'react'
import { recommendedVideos } from '../data/recommendedVideos'
import { RecommendedVideoCard } from './RecommendedVideoCard'
import { useNavigate } from 'react-router-dom'

interface FavoritesModalProps {
  isOpen: boolean
  onClose: () => void
  favoriteIds: string[]
  onToggleFavorite: (videoId: string) => void
}

export function FavoritesModal({ isOpen, onClose, favoriteIds, onToggleFavorite }: FavoritesModalProps) {
  const navigate = useNavigate()
  
  console.log('🎭 FavoritesModal 렌더링:', { 
    isOpen, 
    favoriteIds,
    favoriteIdsLength: favoriteIds.length,
    timestamp: new Date().toISOString()
  })
  
  if (!isOpen) {
    console.log('❌ FavoritesModal: isOpen이 false이므로 모달을 렌더링하지 않음')
    return null
  }
  
  console.log('✅ FavoritesModal: isOpen이 true이므로 모달을 렌더링함')

  // 즐겨찾기된 영상들만 필터링 (더 유연한 매칭)
  const favoriteVideos = recommendedVideos.filter(video => {
    // 1. 정확한 ID 매칭
    if (favoriteIds.includes(video.id)) {
      return true
    }
    
    // 2. URL에서 추출한 비디오 ID 매칭
    const videoIdFromUrl = video.url.includes('youtu.be/') 
      ? video.url.split('youtu.be/')[1] 
      : video.url.split('v=')[1]?.split('&')[0]
    
    if (videoIdFromUrl && favoriteIds.includes(videoIdFromUrl)) {
      return true
    }
    
    return false
  })
  
  console.log('🎭 FavoritesModal 디버깅:')
  console.log('  - favoriteIds:', favoriteIds)
  console.log('  - recommendedVideos IDs:', recommendedVideos.map(v => v.id))
  console.log('  - filtered favoriteVideos:', favoriteVideos.map(v => v.id))

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-[20px] shadow-2xl p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">❤️ 즐겨찾기 영상</h2>
            <p className="text-sm text-gray-600 mt-1">
              {favoriteVideos.length}개의 영상이 즐겨찾기에 추가되어 있습니다
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* 즐겨찾기 영상 목록 */}
        <div className="overflow-y-auto max-h-[60vh] pr-2">
          {favoriteVideos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">즐겨찾기된 영상이 없습니다</h3>
              <p className="text-gray-500 mb-4">
                추천 영상에서 하트 아이콘을 클릭하여 즐겨찾기에 추가해보세요
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                추천 영상 보기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {favoriteVideos.map((video) => (
                <RecommendedVideoCard
                  key={video.id}
                  video={video}
                  isFavorite={true}
                  onToggleFavorite={() => onToggleFavorite(video.id)}
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
                          translation_suggestion: '',
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
                      onClose()
                      navigate('/visual-interpretation')
                    } else {
                      // 사전 변환된 데이터가 없으면 기존 방식 (URL 입력)
                      onClose()
                      // URL 입력 페이지로 이동하는 로직은 부모 컴포넌트에서 처리
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
