import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { url } = req.body || {}
    if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
      return res.status(400).json({ error: 'Valid YouTube URL required' })
    }

    const result = await detectYouTubeCaptions(url)
    return res.json(result)
  } catch (e) {
    return res.status(500).json({ error: 'Internal server error', details: String(e?.message || e) })
  }
}

async function detectYouTubeCaptions(youtubeUrl) {
  const videoId = extractYouTubeVideoId(youtubeUrl)
  if (!videoId) return { hasCaptions: false }
  const tmpDir = os.tmpdir()
  const outTemplate = path.join(tmpDir, `yt_chk_${videoId}_%(language)s.%(ext)s`)

  // 1) 자막 다운로드 시도 (json3/vtt/srt/srv3 중 최선)
  await new Promise((resolve) => {
    const y = spawn('yt-dlp', [
      '--skip-download',
      '--write-sub',
      '--write-auto-sub',
      '--sub-format', 'srv3/vtt/srt/best',
      '--sub-langs', 'zh-Hans,zh-CN,zh,zh-Hant,en',
      '-o', outTemplate,
      youtubeUrl,
    ])
    y.on('close', () => resolve(null))
    y.on('error', () => resolve(null))
  })

  // 2) 생성된 자막 파일 존재 여부 확인
  try {
    const files = await fs.readdir(tmpDir)
    const match = files.find((f) =>
      f.startsWith(`yt_chk_${videoId}_`) && (f.endsWith('.srv3') || f.endsWith('.vtt') || f.endsWith('.srt') || f.endsWith('.json3') || f.endsWith('.json')),
    )
    const hasCaptions = Boolean(match)
    // 청소
    if (hasCaptions) {
      for (const f of files) {
        if (f.startsWith(`yt_chk_${videoId}_`)) {
          try { await fs.unlink(path.join(tmpDir, f)) } catch {}
        }
      }
    }
    return { hasCaptions }
  } catch {
    return { hasCaptions: false }
  }
}

function extractYouTubeVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '').trim()
    }
    if (u.searchParams.has('v')) return u.searchParams.get('v')
    return null
  } catch {
    return null
  }
}


