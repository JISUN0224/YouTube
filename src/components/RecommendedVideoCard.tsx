import React from 'react'
import type { RecommendedVideo } from '../data/recommendedVideos'

interface RecommendedVideoCardProps {
  video: RecommendedVideo
  onClick: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

export function RecommendedVideoCard({ video, onClick, isFavorite = false, onToggleFavorite }: RecommendedVideoCardProps) {
  return (
    <div 
      onClick={onClick}
      className="flex gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
    >
      {/* 썸네일 */}
      <div className="flex-shrink-0 relative">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-36 h-20 object-cover rounded-lg"
          onError={(e) => {
            // 썸네일 로드 실패 시 기본 이미지 사용
            const target = e.target as HTMLImageElement
            target.src = `https://img.youtube.com/vi/${video.url.split('v=')[1]}/mqdefault.jpg`
          }}
        />
        {/* 재생 시간 */}
        <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 py-0.5 rounded">
          {video.duration}
        </div>
        {/* 변환 완료 배지 */}
        {video.processedData && (
          <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            즉시 재생
          </div>
        )}
      </div>

      {/* 비디오 정보 */}
      <div className="flex-1 min-w-0">
        {/* 제목 */}
        <h3 className="font-medium text-[15px] leading-snug text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors chinese-text">
          {video.title}
        </h3>
        
        {/* 채널명 */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-600">{video.channel}</span>
          {video.verified && (
            <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        
        {/* 조회수 및 업로드 시간 */}
        <div className="text-xs text-gray-500 mt-0.5">
          {video.views} • {video.uploadTime}
        </div>
        
        {/* 난이도 및 카테고리 */}
        <div className="flex items-center gap-2 mt-2">
          {/* 난이도 */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            video.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
            video.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {video.difficulty === 'easy' ? '쉬움' :
             video.difficulty === 'medium' ? '보통' : '어려움'}
          </span>
          
          {/* 카테고리 */}
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
            {video.category === 'news' ? '뉴스' :
             video.category === 'education' ? '교육' :
             video.category === 'entertainment' ? '엔터테인먼트' :
             video.category === 'culture' ? '문화' :
             video.category === 'technology' ? '기술' :
             video.category === 'business' ? '비즈니스' :
             video.category === 'history' ? '역사' :
             video.category === 'comedy' ? '코미디' :
             video.category === 'documentary' ? '다큐멘터리' : video.category}
          </span>
        </div>
        

      </div>

      {/* 즐겨찾기 버튼 */}
      {onToggleFavorite && (
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => {
              // 즐겨찾기 토글 처리
              console.log('📋 비디오 정보:', {
                id: video.id,
                title: video.title,
                isFavorite: isFavorite
              })
              e.stopPropagation()
              // onToggleFavorite 함수 호출
              onToggleFavorite()
            }}
            className={`p-1 rounded transition-colors ${
              isFavorite 
                ? 'text-red-500 hover:text-red-600' 
                : 'text-gray-400 hover:text-red-500'
            }`}
            title={isFavorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
