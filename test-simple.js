// 자막 감지 테스트용 간단한 스크립트
import { spawn } from 'child_process';

// 자막이 있는 것으로 알려진 영상 테스트
const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll - 확실히 자막 있음

console.log('🧪 자막 감지 테스트 시작');
console.log('📍 테스트 URL:', TEST_URL);
console.log('─'.repeat(50));

const ytdlp = spawn('yt-dlp', [
  '--dump-json',
  '--skip-download',
  TEST_URL
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
  console.log(`🏁 yt-dlp 종료 코드: ${code}`);
  console.log(`📊 출력 길이: ${output.length}자`);
  console.log(`❌ 에러 출력 길이: ${errorOutput.length}자`);
  
  if (errorOutput.length > 0) {
    console.log('📝 에러 출력 미리보기:');
    console.log(errorOutput.slice(0, 300));
  }
  
  if (code === 0 && output) {
    try {
      console.log('🔧 JSON 파싱 시도 중...');
      const info = JSON.parse(output);
      console.log('✅ JSON 파싱 성공');
      
      console.log('📹 영상 정보:');
      console.log(`  제목: ${info.title?.slice(0, 60)}...`);
      console.log(`  길이: ${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, '0')}`);
      console.log(`  업로더: ${info.uploader}`);
      
      const subtitles = info.subtitles || {};
      const automaticCaptions = info.automatic_captions || {};
      
      console.log('\n📋 자막 정보:');
      console.log(`  수동 자막 언어: ${Object.keys(subtitles).length > 0 ? Object.keys(subtitles).join(', ') : '없음'}`);
      console.log(`  자동 자막 언어: ${Object.keys(automaticCaptions).length > 0 ? Object.keys(automaticCaptions).join(', ') : '없음'}`);
      
      const hasSubtitles = Object.keys(subtitles).length > 0 || Object.keys(automaticCaptions).length > 0;
      console.log(`\n🎯 최종 자막 감지 결과: ${hasSubtitles ? '✅ 자막 있음' : '❌ 자막 없음'}`);
      
      if (hasSubtitles) {
        console.log('\n🔍 자막 세부 정보:');
        if (Object.keys(subtitles).length > 0) {
          console.log('  수동 자막:');
          Object.keys(subtitles).forEach(lang => {
            console.log(`    ${lang}: ${subtitles[lang].length}개 포맷`);
          });
        }
        if (Object.keys(automaticCaptions).length > 0) {
          console.log('  자동 자막:');
          Object.keys(automaticCaptions).forEach(lang => {
            console.log(`    ${lang}: ${automaticCaptions[lang].length}개 포맷`);
          });
        }
      }
    } catch (e) {
      console.error(`❌ JSON 파싱 실패: ${e.message}`);
      console.log('📝 출력 미리보기:');
      console.log(output.slice(0, 500));
    }
  } else {
    console.error(`❌ yt-dlp 실행 실패`);
    if (errorOutput) {
      console.error('에러 내용:', errorOutput);
    }
  }
});

ytdlp.on('error', (error) => {
  console.error(`❌ 프로세스 오류: ${error.message}`);
});

// 30초 타임아웃
setTimeout(() => {
  ytdlp.kill();
  console.log('⏰ 타임아웃으로 프로세스 종료');
}, 30000);
