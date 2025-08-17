import React from 'react'
import type { RecommendedVideo } from '../data/recommendedVideos'

interface RecommendedVideoCardProps {
  video: RecommendedVideo
  onClick: () => void
}

export function RecommendedVideoCard({ video, onClick }: RecommendedVideoCardProps) {
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
      </div>

      {/* 더보기 메뉴 (옵션) */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1 text-gray-400 hover:text-gray-600 rounded">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
