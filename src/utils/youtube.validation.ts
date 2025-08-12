export const validateYouTubeUrl = (input: string): boolean => {
  const url = (input || '').trim()
  // 1) 11자리 ID 자체 허용
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return true

  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const isYouTubeHost = host.includes('youtube.com') || host.includes('youtu.be') || host.includes('youtube-nocookie.com')
    if (!isYouTubeHost) return false

    // 쿼리 v 파라미터 또는 경로 패턴 지원
    if (u.searchParams.get('v')) return true
    const path = u.pathname.toLowerCase()
    return (
      /\/shorts\//.test(path) ||
      /\/embed\//.test(path) ||
      /\/v\//.test(path) ||
      host.includes('youtu.be')
    )
  } catch {
    // URL로 파싱 안되면 기존 정규식과 11자리 ID 재검증
    const legacy = /^(https?:\/\/)?(www\.)?(m\.)?(music\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)\w[\w-]{5,}/
    return legacy.test(url) || /^[a-zA-Z0-9_-]{11}$/.test(url)
  }
}

export const extractVideoId = (input: string): string | null => {
  const url = (input || '').trim()
  if (!url) return null
  // 1) 11자리 ID 자체
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url

  try {
    const u = new URL(url)
    const vParam = u.searchParams.get('v')
    if (vParam && /^[a-zA-Z0-9_-]{6,}$/.test(vParam)) return vParam

    const path = u.pathname
    const pathIdPatterns = [
      /\/shorts\/([^/?&#]+)/i,
      /\/embed\/([^/?&#]+)/i,
      /\/v\/([^/?&#]+)/i,
    ]
    for (const p of pathIdPatterns) {
      const m = path.match(p)
      if (m && m[1]) return m[1]
    }

    // youtu.be/<id>
    if (u.hostname.toLowerCase().includes('youtu.be')) {
      const seg = u.pathname.split('/').filter(Boolean)[0]
      if (seg) return seg
    }
  } catch {
    // URL 파싱 실패 시 정규식으로 시도
    const rxList = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{6,})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{6,})/,
    ]
    for (const rx of rxList) {
      const m = url.match(rx)
      if (m && m[1]) return m[1]
    }
  }
  return null
}


