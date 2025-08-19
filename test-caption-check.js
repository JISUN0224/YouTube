import { spawn } from 'child_process';

// 자막이 있는 것으로 알려진 YouTube 영상들 (한국어 자막)
const testUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll - 자막 있음
  'https://www.youtube.com/watch?v=9bZkp7q19f0', // PSY - Gangnam Style - 자막 있음  
  'https://youtu.be/dQw4w9WgXcQ', // 짧은 형식
  'dQw4w9WgXcQ' // ID만
];

async function testCaptionCheck(url) {
  console.log(`\n🧪 테스트 시작: ${url}`);
  console.log('─'.repeat(50));
  
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--skip-download',
      url
    ]);
    
    let output = '';
    let errorOutput = '';
    
    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ytdlp.on('close', (code) => {
      console.log(`🏁 종료 코드: ${code}`);
      console.log(`📊 출력 길이: ${output.length}자`);
      console.log(`❌ 에러 길이: ${errorOutput.length}자`);
      
      if (code === 0 && output) {
        try {
          const info = JSON.parse(output);
          console.log(`✅ JSON 파싱 성공`);
          console.log(`📹 제목: ${info.title?.slice(0, 60)}...`);
          console.log(`⏱️ 길이: ${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, '0')}`);
          
          const subtitles = info.subtitles || {};
          const automaticCaptions = info.automatic_captions || {};
          
          console.log(`📋 수동 자막 언어: ${Object.keys(subtitles).join(', ') || '없음'}`);
          console.log(`🤖 자동 자막 언어: ${Object.keys(automaticCaptions).join(', ') || '없음'}`);
          
          const hasSubtitles = Object.keys(subtitles).length > 0 || Object.keys(automaticCaptions).length > 0;
          console.log(`🎯 자막 감지 결과: ${hasSubtitles ? '✅ 있음' : '❌ 없음'}`);
          
          resolve({ success: true, hasSubtitles, info });
        } catch (e) {
          console.error(`❌ JSON 파싱 실패: ${e.message}`);
          console.log(`📝 출력 미리보기: ${output.slice(0, 200)}`);
          resolve({ success: false, error: e.message });
        }
      } else {
        console.error(`❌ yt-dlp 실행 실패 (코드: ${code})`);
        if (errorOutput) {
          console.error(`📝 에러 내용: ${errorOutput.slice(0, 500)}`);
        }
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });
    
    ytdlp.on('error', (error) => {
      console.error(`❌ 프로세스 오류: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    // 30초 타임아웃
    setTimeout(() => {
      ytdlp.kill();
      console.log('⏰ 타임아웃으로 프로세스 종료');
      resolve({ success: false, error: 'timeout' });
    }, 30000);
  });
}

async function runTests() {
  console.log('🚀 YouTube 자막 감지 테스트 시작');
  console.log('=' .repeat(60));
  
  // yt-dlp 설치 확인
  try {
    await new Promise((resolve, reject) => {
      const check = spawn('yt-dlp', ['--version']);
      check.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp not found (code: ${code})`));
      });
      check.on('error', reject);
    });
    console.log('✅ yt-dlp 설치 확인됨');
  } catch (error) {
    console.error('❌ yt-dlp가 설치되지 않았거나 PATH에 없습니다');
    console.error('설치 방법: pip install yt-dlp 또는 https://github.com/yt-dlp/yt-dlp');
    return;
  }
  
  for (const url of testUrls) {
    const result = await testCaptionCheck(url);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
  }
  
  console.log('\n🏁 모든 테스트 완료');
}

runTests().catch(console.error);
