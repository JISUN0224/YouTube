import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

// 기본 정보 조회로 자막 확인
// 이 함수가 자막 체크의 주 로직이 됩니다.
async function checkWithBasicInfo(youtubeUrl) {
  console.log('🔍 자막 감지 시작:', youtubeUrl)
  
  return new Promise((resolve, reject) => {
    // --dump-json 옵션으로 모든 정보를 JSON으로 가져옵니다.
    // --skip-download 옵션으로 실제 영상 다운로드를 막습니다.
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--skip-download',
      youtubeUrl
    ])
    
    console.log('🚀 yt-dlp 프로세스 시작됨')
    
    let output = ''
    let errorOutput = ''
    
    // 표준 출력을 모두 수집
    ytdlp.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    // 표준 에러를 모두 수집
    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    ytdlp.on('close', (code) => {
      console.log(`🏁 yt-dlp 종료 코드: ${code}`)
      console.log(`📊 출력 길이: ${output.length}자`)
      console.log(`❌ 에러 출력 길이: ${errorOutput.length}자`)
      
      if (code === 0 && output) {
        try {
          console.log('🔧 JSON 파싱 시도 중...')
          // 수집된 전체 출력을 파싱
          const info = JSON.parse(output)
          console.log('✅ JSON 파싱 성공')
          console.log('📋 영상 정보:', {
            title: info.title?.slice(0, 50) + '...',
            duration: info.duration,
            subtitles_keys: info.subtitles ? Object.keys(info.subtitles) : null,
            automatic_captions_keys: info.automatic_captions ? Object.keys(info.automatic_captions) : null
          })
          
          // `subtitles` 또는 `automatic_captions` 객체에 키가 있는지 확인
          const hasSubtitles = !!(info.subtitles && Object.keys(info.subtitles).length > 0) ||
                               !!(info.automatic_captions && Object.keys(info.automatic_captions).length > 0)
          
                              console.log(`📊 JSON 정보 기반 자막 감지: ${hasSubtitles}`)
                    if (hasSubtitles) {
                      console.log('📋 사용 가능한 자막 정보:')
                      if (info.subtitles) {
                        console.log('  - 수동 자막:', Object.keys(info.subtitles))
                      }
                      if (info.automatic_captions) {
                        console.log('  - 자동 자막:', Object.keys(info.automatic_captions))
                      }
                    } else {
                      console.log('❌ 자막이 감지되지 않음')
                    }
                    
                    // 사용 가능한 자막 언어 목록 반환
                    const availableCaptions = {
                      manual: info.subtitles ? Object.keys(info.subtitles) : [],
                      automatic: info.automatic_captions ? Object.keys(info.automatic_captions) : []
                    }
                    
                    resolve({ hasCaptions: hasSubtitles, availableCaptions })
        } catch (e) {
          console.error('JSON 파싱 오류:', e.message)
          console.error('원본 출력 미리보기:', output.slice(0, 200))
          reject(new Error('JSON 파싱 실패'))
        }
      } else {
        console.error(`yt-dlp 실행 실패, 코드: ${code}`)
        console.error('에러 출력:', errorOutput)
        reject(new Error(`yt-dlp 실행 실패`))
      }
    })
    
    ytdlp.on('error', (error) => {
      console.error('기본 정보 조회 오류:', error.message)
      reject(error)
    })
    
    setTimeout(() => {
      ytdlp.kill()
      console.log('⏰ yt-dlp 타임아웃')
      reject(new Error('yt-dlp 타임아웃'))
    }, 30000)
  })
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { url } = req.body || {}
    console.log('🔍 자막 감지 요청 받음:', { url, body: req.body })
    
    if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
      console.log('❌ 유효하지 않은 YouTube URL:', url)
      return res.status(400).json({ error: 'Valid YouTube URL required' })
    }

    const videoId = extractYouTubeVideoId(url)
    if (!videoId) {
      console.log('❌ 비디오 ID 추출 실패:', url)
      return res.status(400).json({ error: 'Invalid YouTube URL' })
    }

    console.log(`🔍 자막 감지 시작: ${videoId} (URL: ${url})`)
    
    // checkWithBasicInfo 함수만 호출하도록 수정
    const result = await checkWithBasicInfo(url)
    console.log(`✅ 자막 감지 완료:`, result)
    return res.json(result)
  } catch (e) {
    console.error('자막 감지 오류:', e.message, e.stack)
    return res.status(500).json({ error: 'Internal server error', details: String(e?.message || e) })
  }
}


