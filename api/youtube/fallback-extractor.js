// YouTube 봇 차단을 우회하는 대체 추출기
import { spawn } from 'child_process'

/**
 * 여러 방법을 시도해서 YouTube 영상 정보를 추출
 */
export async function extractWithFallback(youtubeUrl) {
  const methods = [
    // 방법 1: Android 클라이언트
    {
      name: 'Android Client',
      args: [
        '--dump-json',
        '--skip-download',
        '--extractor-args', 'youtube:player_client=android',
        '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        youtubeUrl
      ]
    },
    // 방법 2: iOS 클라이언트
    {
      name: 'iOS Client', 
      args: [
        '--dump-json',
        '--skip-download',
        '--extractor-args', 'youtube:player_client=ios',
        '--user-agent', 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
        youtubeUrl
      ]
    },
    // 방법 3: TV 클라이언트
    {
      name: 'TV Client',
      args: [
        '--dump-json',
        '--skip-download', 
        '--extractor-args', 'youtube:player_client=tv_embedded',
        youtubeUrl
      ]
    },
    // 방법 4: 웹 임베드
    {
      name: 'Web Embedded',
      args: [
        '--dump-json',
        '--skip-download',
        '--extractor-args', 'youtube:player_client=web_embedded',
        youtubeUrl
      ]
    }
  ]

  for (const method of methods) {
    console.log(`🔄 ${method.name} 방법 시도 중...`)
    
    try {
      const result = await runYtDlp(method.args)
      if (result && !result.includes('Sign in to confirm')) {
        console.log(`✅ ${method.name} 성공!`)
        return result
      }
    } catch (error) {
      console.log(`❌ ${method.name} 실패:`, error.message)
    }
  }
  
  throw new Error('모든 추출 방법 실패')
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', args)
    
    let output = ''
    let errorOutput = ''
    
    ytdlp.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    ytdlp.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim())
      } else {
        reject(new Error(errorOutput || `Exit code: ${code}`))
      }
    })
    
    ytdlp.on('error', (err) => {
      reject(err)
    })
    
    // 30초 타임아웃
    setTimeout(() => {
      ytdlp.kill()
      reject(new Error('yt-dlp 타임아웃'))
    }, 30000)
  })
}
