import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VideoHistoryService } from '../services/videoHistoryService'

export default function VisualInterpretation() {
  const navigate = useNavigate()
  const [result, setResult] = useState<any | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('processingResult')
      if (raw) {
        const parsed = JSON.parse(raw)
        setResult(parsed)
        
        // 즐겨찾기 상태 확인
        if (parsed.url) {
          setIsFavorite(VideoHistoryService.isFavorite(parsed.url))
        }
      }
    } catch {}
  }, [])

  // 즐겨찾기 토글 핸들러
  const handleToggleFavorite = () => {
    if (!result?.url) return
    
    const newFavoriteStatus = VideoHistoryService.toggleFavorite(result.url)
    setIsFavorite(newFavoriteStatus)
    
    if (newFavoriteStatus) {
      alert('⭐ 즐겨찾기에 추가되었습니다!')
    } else {
      alert('즐겨찾기에서 제거되었습니다.')
    }
  }

  const filesBase = useMemo(() => {
    // Flask 서버 기본 URL (프론트 env와 동일 규칙)
    const base = (import.meta as any)?.env?.VITE_PY_SERVER_URL ?? 'http://localhost:5000'
    return `${base}/api/youtube/download/`
  }, [])

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="container mx-auto p-6">
          <h1 className="text-2xl font-bold mb-4">결과 없음</h1>
          <p className="text-gray-700">처리 결과가 없습니다. 먼저 URL을 처리해 주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="container mx-auto p-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">통역 연습 결과</h1>
          <div className="flex items-center gap-3">
            {/* 즐겨찾기 버튼 */}
            {result?.url && (
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
            {/* 홈으로 버튼 */}
            <button
              onClick={() => navigate('/youtube-generator')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🏠 홈으로
            </button>
          </div>
        </div>

        <section className="bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">비디오 정보</h2>
          <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(result.video_info, null, 2)}</pre>
        </section>

        <section className="bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">파일 다운로드</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {result.files?.audio && (
              <a className="px-3 py-2 bg-blue-600 text-white rounded" href={`${filesBase}${encodeURIComponent(result.files.audio)}`} target="_blank" rel="noreferrer">오디오</a>
            )}
            {result.files?.txt && (
              <a className="px-3 py-2 bg-blue-600 text-white rounded" href={`${filesBase}${encodeURIComponent(result.files.txt)}`} target="_blank" rel="noreferrer">원문 TXT</a>
            )}
            {result.files?.srt && (
              <a className="px-3 py-2 bg-blue-600 text-white rounded" href={`${filesBase}${encodeURIComponent(result.files.srt)}`} target="_blank" rel="noreferrer">SRT</a>
            )}
            {result.files?.vtt && (
              <a className="px-3 py-2 bg-blue-600 text-white rounded" href={`${filesBase}${encodeURIComponent(result.files.vtt)}`} target="_blank" rel="noreferrer">VTT</a>
            )}
            {result.files?.html && (
              <a className="px-3 py-2 bg-blue-600 text-white rounded" href={`${filesBase}${encodeURIComponent(result.files.html)}`} target="_blank" rel="noreferrer">하이라이트 HTML</a>
            )}
          </div>
        </section>

        <section className="bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">세그먼트(일부)</h2>
          <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto" style={{ maxHeight: 400 }}>{JSON.stringify(result.segments?.slice(0, 30), null, 2)}{result.segments?.length > 30 ? '\n... (더 있음)' : ''}</pre>
        </section>

        <section className="bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">통계</h2>
          <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(result.stats, null, 2)}</pre>
        </section>
      </div>
    </div>
  )
}


