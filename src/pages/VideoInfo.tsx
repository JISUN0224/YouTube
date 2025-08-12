import { useNavigate } from 'react-router-dom'
import { useVideoProcessing } from '../contexts/VideoProcessingContext'

export default function VideoInfo() {
  const navigate = useNavigate()
  const { videoInfo } = useVideoProcessing()

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">영상 정보</h1>

        {!videoInfo ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded p-4">
            아직 불러온 영상 정보가 없습니다. 먼저 YouTube URL 확인을 진행해 주세요.
          </div>
        ) : (
          <pre className="bg-white p-4 rounded shadow text-sm overflow-auto">{JSON.stringify(videoInfo, null, 2)}</pre>
        )}

        <div className="mt-4 flex gap-2">
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={() => navigate('/youtube-generator')}
          >
            이전
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            onClick={() => navigate('/processing')}
            disabled={!videoInfo}
          >
            처리 시작
          </button>
        </div>
      </div>
    </div>
  )
}
