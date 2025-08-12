export function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.split('/').filter(Boolean)[0] ?? null
    }
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const paths = u.pathname.split('/')
    const idx = paths.findIndex((p) => p === 'v')
    if (idx >= 0 && paths[idx + 1]) return paths[idx + 1]
    return null
  } catch {
    return null
  }
}


