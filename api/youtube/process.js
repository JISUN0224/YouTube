import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

// Azure Speech Services 설정
const AZURE_SUBSCRIPTION_KEY = process.env.VITE_AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.VITE_AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION || 'koreacentral';
const AZURE_ENDPOINT = `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v`;

// Gemini API 설정
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

// 디버깅용 로그
console.log('🔧 [DEBUG] 환경 변수 상태:');
console.log('VITE_AZURE_SPEECH_KEY:', process.env.VITE_AZURE_SPEECH_KEY ? '✅ 있음 (길이: ' + process.env.VITE_AZURE_SPEECH_KEY.length + ')' : '❌ 없음');
console.log('AZURE_SPEECH_KEY:', process.env.AZURE_SPEECH_KEY ? '✅ 있음' : '❌ 없음');
console.log('VITE_AZURE_SPEECH_REGION:', process.env.VITE_AZURE_SPEECH_REGION || '❌ 없음');
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? '✅ 있음' : '❌ 없음');
console.log('최종 사용할 키:', AZURE_SUBSCRIPTION_KEY ? '✅ 있음' : '❌ 없음');
console.log('최종 사용할 지역:', AZURE_REGION);

// 진행 상태를 저장할 메모리 스토어 (실제 배포시에는 Redis나 DB 사용)
const sessions = new Map();

// Gemini 기능 활성: 길이/조건에 따라 고급(세그먼트 보정) 또는 경량(텍스트 정제) 모드 사용

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, previewSeconds } = req.body;
    console.log('📥 /api/youtube/process 요청 바디:', req.body);
    
    if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
      return res.status(400).json({ error: 'Valid YouTube URL required' });
    }

    if (!AZURE_SUBSCRIPTION_KEY) {
      return res.status(500).json({ error: 'Azure Speech key not configured' });
    }

    const sessionId = uuidv4();
    
    // 초기 세션 상태 설정
    sessions.set(sessionId, {
      status: 'started',
      progress: 0,
      step: 'initializing',
      message: '초기화 중...',
      start_time: Date.now() / 1000,
      url: url
    });

    // 백그라운드에서 처리 시작
    processVideo(sessionId, url, typeof previewSeconds === 'number' ? previewSeconds : undefined);

    return res.json({ 
      session_id: sessionId,
      status: 'started',
      message: '처리가 시작되었습니다.'
    });

  } catch (error) {
    console.error('Process error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

async function processVideo(sessionId, youtubeUrl, previewSeconds) {
  try {
    console.log('🔥🔥🔥 NEW processVideo 시작됨!!! (청크 처리 버전)');
    console.log('🔥 sessionId:', sessionId);
    console.log('🔥 youtubeUrl:', youtubeUrl);
    // 0. 유튜브 제공 자막 우선 사용 시도 (있으면 Azure 호출 생략)
    try {
      const captionsResult = await tryGetYouTubeCaptions(youtubeUrl);
      if (captionsResult && Array.isArray(captionsResult.segments) && captionsResult.segments.length > 0) {
        updateSession(sessionId, {
          status: 'completed',
          progress: 100,
          step: 'completed',
          message: '유튜브 제공 자막 사용 완료',
          result: captionsResult,
          end_time: Date.now() / 1000
        });
        console.log('✅ 유튜브 제공 자막 사용. Azure 호출 생략');
        return;
      }
    } catch (e) {
      console.warn('⚠️ 유튜브 자막 시도 실패, Azure로 진행:', e?.message || e);
    }
    // 1. 오디오 추출 단계
    updateSession(sessionId, {
      progress: 10,
      step: 'downloading',
      message: '오디오 추출 중...'
    });

    console.log('🎬 extractAudioUrl 호출 시작');
    const audioUrl = await extractAudioUrl(youtubeUrl);
    console.log('🎬 extractAudioUrl 결과:', audioUrl);
    
    if (!audioUrl) {
      throw new Error('오디오 추출 실패');
    }

    // 2. Azure Speech 전송 단계
    updateSession(sessionId, {
      progress: 40,
      step: 'transcribing',
      message: 'Azure Speech로 음성 인식 중...'
    });

    console.log('🗣️ transcribeWithAzure 호출 시작');
    const transcriptResult = await transcribeWithAzure(audioUrl, previewSeconds);
    console.log('🗣️ transcribeWithAzure 결과 수신');

    // 3. 결과 처리 단계
    updateSession(sessionId, {
      progress: 85,
      step: 'processing',
      message: '결과 처리 중...'
    });

    const finalResult = await formatTranscriptResult(transcriptResult, youtubeUrl);
    console.log('📦 formatTranscriptResult 결과 생성 완료');

    // 4. 완료
    updateSession(sessionId, {
      status: 'completed',
      progress: 100,
      step: 'completed',
      message: '처리 완료',
      result: finalResult,
      end_time: Date.now() / 1000
    });

  } catch (error) {
    console.error('Processing error:', error);
    updateSession(sessionId, {
      status: 'error',
      step: 'error',
      error: error.message,
      message: `Error: ${error.message}`,
      end_time: Date.now() / 1000
    });
  }
}

function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (session) {
    sessions.set(sessionId, { ...session, ...updates });
  }
}

// 유튜브 제공 자막을 yt-dlp로 가져오기 (있으면 json3로 파싱)
async function tryGetYouTubeCaptions(youtubeUrl) {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return null;
  const tmpDir = os.tmpdir();
  const outTemplate = path.join(tmpDir, `yt_subs_${videoId}_%(language)s.%(ext)s`);
  await new Promise((resolve) => {
    const y = spawn('yt-dlp', [
      '--skip-download',
      '--write-sub',
      '--write-auto-sub',
      '--sub-format', 'srv3/vtt/srt/best',
      '--sub-langs', 'zh-Hans,zh-CN,zh,zh-Hant,en',
      '-o', outTemplate,
      youtubeUrl
    ]);
    y.on('close', () => resolve(null));
    y.on('error', () => resolve(null));
  });
  // 후보 파일 탐색(언어 우선순위)
  const preferred = ['zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'en'];
  const files = await fs.readdir(tmpDir);
  const matches = files
    .filter(f => f.startsWith(`yt_subs_${videoId}_`) && (f.endsWith('.srv3') || f.endsWith('.vtt') || f.endsWith('.srt') || f.endsWith('.json3') || f.endsWith('.json')))
    .map(f => ({ f }));
  if (matches.length === 0) return null;
  let picked = null;
  for (const lang of preferred) {
    const m = matches.find(x => x.f.includes(`_${lang}.srv3`) || x.f.includes(`_${lang}.vtt`) || x.f.includes(`_${lang}.srt`) || x.f.includes(`_${lang}.json3`) || x.f.includes(`_${lang}.json`));
    if (m) { picked = m.f; break; }
  }
  if (!picked) picked = matches[0].f;
  const jsonPath = path.join(tmpDir, picked);
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    let segments = [];
    let id = 1;
    if (picked.endsWith('.srv3')) {
      // YouTube srv3(XML) 파서: <p t="startMs" d="durMs">text</p>
      const pRegex = /<p[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
      let m;
      while ((m = pRegex.exec(raw)) !== null) {
        const startSec = parseInt(m[1], 10) / 1000;
        const endSec = startSec + (parseInt(m[2], 10) / 1000);
        const text = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        segments.push({
          id: id++, seek: 0, start: startSec, end: endSec,
          start_time: formatSecondsToTimeString(startSec), end_time: formatSecondsToTimeString(endSec),
          text, original_text: text, tokens: [], temperature: 0.0, avg_logprob: 0.95, compression_ratio: 1.0, no_speech_prob: 0.1, keywords: [], words: []
        });
      }
    } else if (picked.endsWith('.vtt')) {
      // WebVTT 파서
      const blocks = raw.split(/\n\n+/);
      for (const b of blocks) {
        const lines = b.split(/\n/).map(l => l.trim());
        const ts = lines.find(l => /-->/.test(l));
        if (!ts) continue;
        const m = ts.match(/(\d\d:\d\d:\d\d[.,]\d{3})\s+-->\s+(\d\d:\d\d:\d\d[.,]\d{3})/);
        if (!m) continue;
        const toSec = (s) => { const [h,mi,rest] = s.replace(',', '.').split(':'); const sec = parseFloat(rest); return parseInt(h,10)*3600 + parseInt(mi,10)*60 + sec; };
        const startSec = toSec(m[1]); const endSec = toSec(m[2]);
        const text = lines.slice(lines.indexOf(ts)+1).join(' ').replace(/<[^>]+>/g,'').trim();
        if (!text) continue;
        segments.push({ id: id++, seek: 0, start: startSec, end: endSec, start_time: formatSecondsToTimeString(startSec), end_time: formatSecondsToTimeString(endSec), text, original_text: text, tokens: [], temperature: 0.0, avg_logprob: 0.95, compression_ratio: 1.0, no_speech_prob: 0.1, keywords: [], words: [] });
      }
    } else if (picked.endsWith('.srt')) {
      // SRT 파서
      const blocks = raw.split(/\r?\n\r?\n/);
      for (const b of blocks) {
        const lines = b.split(/\r?\n/).map(l => l.trim());
        if (lines.length < 2) continue;
        const ts = lines[1];
        const m = ts.match(/(\d\d:\d\d:\d\d,\d{3})\s+-->\s+(\d\d:\d\d:\d\d,\d{3})/);
        if (!m) continue;
        const toSec = (s) => { const [h,mi,rest] = s.replace(',', '.').split(':'); const sec = parseFloat(rest); return parseInt(h,10)*3600 + parseInt(mi,10)*60 + sec; };
        const startSec = toSec(m[1]); const endSec = toSec(m[2]);
        const text = lines.slice(2).join(' ').replace(/<[^>]+>/g,'').trim();
        if (!text) continue;
        segments.push({ id: id++, seek: 0, start: startSec, end: endSec, start_time: formatSecondsToTimeString(startSec), end_time: formatSecondsToTimeString(endSec), text, original_text: text, tokens: [], temperature: 0.0, avg_logprob: 0.95, compression_ratio: 1.0, no_speech_prob: 0.1, keywords: [], words: [] });
      }
    } else {
      // 구형 json(json3 유사) 지원
      const data = JSON.parse(raw);
      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          const startSec = (ev.tStartMs || 0) / 1000;
          const durSec = (ev.dDurationMs || 0) / 1000;
          const endSec = startSec + durSec;
          const text = Array.isArray(ev.segs) ? ev.segs.map(s => s.utf8 || '').join('').trim() : '';
          if (!text) continue;
          segments.push({ id: id++, seek: 0, start: startSec, end: endSec, start_time: formatSecondsToTimeString(startSec), end_time: formatSecondsToTimeString(endSec), text, original_text: text, tokens: [], temperature: 0.0, avg_logprob: 0.95, compression_ratio: 1.0, no_speech_prob: 0.1, keywords: [], words: [] });
        }
      }
    }
    if (segments.length === 0) return null;
    const fullText = segments.map(s => s.text).join(' ');
    return {
      text: fullText,
      segments,
      language: 'zh-CN',
      url: youtubeUrl,
      processed_at: new Date().toISOString(),
      source: 'youtube_captions'
    };
  } catch {
    return null;
  } finally {
    // 청소(실패해도 무시)
    try {
      for (const f of files) {
        if (f.startsWith(`yt_subs_${videoId}_`)) {
          await fs.unlink(path.join(tmpDir, f)).catch(() => {});
        }
      }
    } catch {}
  }
}

function extractYouTubeVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '').trim();
    }
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

async function extractAudioUrl(youtubeUrl) {
  console.log('🎬🎬🎬 extractAudioUrl 함수 시작');
  console.log('🎬🎬🎬 입력 URL:', youtubeUrl);
  return new Promise((resolve, reject) => {
    console.log('🎬🎬🎬 yt-dlp 명령 실행 시작');
    // yt-dlp를 사용하여 오디오 URL만 추출 (파일 다운로드 X)
    const ytdlp = spawn('yt-dlp', [
      '--get-url',
      '-f', 'bestaudio[ext=mp3]/bestaudio',
      '--no-playlist',
      youtubeUrl
    ]);

    let audioUrl = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      audioUrl += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      console.log('🎬🎬🎬 yt-dlp 종료 코드:', code);
      if (errorOutput) console.log('🎬🎬🎬 yt-dlp stderr:', errorOutput.slice(0, 500));
      if (code === 0 && audioUrl.trim()) {
        resolve(audioUrl.trim());
      } else {
        console.error('yt-dlp error:', errorOutput);
        reject(new Error('Failed to extract audio URL'));
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`yt-dlp spawn error: ${err.message}`));
    });
  });
}

async function transcribeWithAzure(audioUrl, previewSeconds) {
  try {
    console.log('🎯 Azure Speech API 호출 시작:', audioUrl);
    console.log('🎬 오디오 URL 분석:', {
      itag: audioUrl.match(/itag=(\d+)/)?.[1] || '알 수 없음',
      duration: audioUrl.match(/dur=([\d.]+)/)?.[1] || '알 수 없음',
      clen: audioUrl.match(/clen=(\d+)/)?.[1] || '알 수 없음',
      mime: audioUrl.match(/mime=([^&]+)/)?.[1] || '알 수 없음'
    });
    
    // 오디오 파일을 다운로드
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`오디오 다운로드 실패: ${audioResponse.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const fileSizeMB = (audioBuffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log('📁 원본 오디오 크기:', audioBuffer.byteLength, 'bytes', `(${fileSizeMB} MB)`);

    // 임시 파일 경로 준비
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `yt_audio_${Date.now()}.webm`);
    const outputPath = path.join(tmpDir, `yt_audio_${Date.now()}.wav`);
    await fs.writeFile(inputPath, audioBuffer);
    console.log('📝 임시 입력 파일 생성:', inputPath);

    // 먼저 오디오 길이 확인
    const durationInfo = await new Promise((resolve, reject) => {
      const ff = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        inputPath
      ]);
      let output = '';
      ff.stdout.on('data', (d) => { output += d.toString(); });
      ff.on('close', (code) => {
        if (code === 0) {
          try {
            const info = JSON.parse(output);
            resolve(parseFloat(info.format.duration));
          } catch (e) {
            resolve(0);
          }
        } else {
          resolve(0);
        }
      });
      ff.on('error', () => resolve(0));
    });
    
    console.log('🎵 원본 오디오 길이:', durationInfo, '초');

    // 🚨 제한 해제: 전체 영상 처리
    const TEST_DURATION_LIMIT = Infinity;
    console.log('✅ 제한 해제: 전체 영상 처리');
    
    // Azure REST API는 60초 제한이 있으므로 청크로 분할 처리 (오버랩 감소)
    const OVERLAP_SECONDS = 1.5; // 오버랩 감소 (3.0 → 1.5)
    const effectiveTotalDuration = Math.min(
      TEST_DURATION_LIMIT,
      typeof previewSeconds === 'number' && previewSeconds > 0
        ? Math.min(previewSeconds, durationInfo || previewSeconds)
        : durationInfo || TEST_DURATION_LIMIT
    );

    // VAD 기반 스마트 청크 분할 (더 진보적)
    const accurateChunks = await createProgressiveChunks(inputPath, effectiveTotalDuration).catch(() => null);
    const chunkList = Array.isArray(accurateChunks) && accurateChunks.length > 0
      ? accurateChunks
      : (() => {
          // 폴백: 더 진보적인 고정 청크
          const CHUNK_DURATION = 50; // 청크 크기 증가
          const total = Math.ceil((effectiveTotalDuration || 0) / CHUNK_DURATION);
          const arr = [];
          for (let i = 0; i < total; i++) {
            const start = i * CHUNK_DURATION;
            let end = Math.min(start + CHUNK_DURATION, effectiveTotalDuration || CHUNK_DURATION);
            // 마지막 청크가 아니면 오버랩 추가
            if (end < effectiveTotalDuration) {
              end = Math.min(end + OVERLAP_SECONDS, effectiveTotalDuration);
            }
            arr.push({ start, end });
          }
          return arr;
        })();

    console.log('📦 청크 분할:', chunkList.length, '개 청크로 처리');

    const allResults = [];
    for (let chunkIndex = 0; chunkIndex < chunkList.length; chunkIndex++) {
      const { start, end } = chunkList[chunkIndex];
      const effectiveStart = Math.max(0, start);
      const effectiveDuration = Math.max(0, end - start);
      const chunkOutputPath = path.join(tmpDir, `yt_audio_chunk_${chunkIndex}_${Date.now()}.wav`);

      console.log(`🔄 청크 ${chunkIndex + 1}/${chunkList.length} 처리 중 (${effectiveStart.toFixed(1)}초 ~ ${end.toFixed(1)}초, 지속시간: ${effectiveDuration.toFixed(1)}초)`);

      // 청크별로 WAV 변환 (정확한 시간 경계 사용)
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-y',
          '-i', inputPath,
          '-ss', effectiveStart.toString(),
          '-t', effectiveDuration.toString(),
          '-af', 'aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS', // PTS 리셋 추가
          '-fflags', '+genpts',
          '-avoid_negative_ts', 'make_zero',
          '-ac', '1',
          '-ar', '16000',
          '-f', 'wav',
          '-acodec', 'pcm_s16le',
          chunkOutputPath,
        ]);
        let ffErr = '';
        ff.stderr.on('data', (d) => { ffErr += d.toString(); });
        ff.on('close', (code) => {
          if (code === 0) resolve(null);
          else {
            console.error('ffmpeg stderr:', ffErr);
            reject(new Error(`ffmpeg 청크 변환 실패 (code ${code})`));
          }
        });
        ff.on('error', (err) => reject(err));
      });

      const chunkWavBuffer = await fs.readFile(chunkOutputPath);
      console.log(`📁 청크 ${chunkIndex + 1} WAV 크기:`, chunkWavBuffer.byteLength, 'bytes');

      // Azure API 호출 (실제 시작 시간을 전달)
      const chunkResult = await processChunkWithAzure(chunkWavBuffer, effectiveStart);
      if (chunkResult) {
        // 청크 메타 추가 (전역 재정렬/드리프트 보정용)
        chunkResult._chunk = { start: effectiveStart, end };
        allResults.push(chunkResult);
      }

      try { await fs.unlink(chunkOutputPath); } catch {}
    }

    // 모든 청크 결과를 병합
    console.log('🔗 청크 결과 병합 중:', allResults.length, '개 청크');
    const mergedResult = mergeChunkResults(allResults);
    // 실제 처리한 길이로 설정하여 테스트 모드(30초) 시 과도한 꼬리 연장을 방지
    mergedResult._totalDurationSec = typeof effectiveTotalDuration === 'number' ? effectiveTotalDuration : (typeof durationInfo === 'number' ? durationInfo : undefined);
    
    // 임시 파일 정리
    try { await fs.unlink(inputPath); } catch {}
    
    return mergedResult;

  } catch (error) {
    console.error('Azure transcription error:', error);
    throw new Error(`Azure 음성 인식 실패: ${error.message}`);
  }
}

// VAD 힌트 추출: 침묵 구간 시작 시각 수집
async function getVADHints(inputPath) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', 'silencedetect=noise=-30dB:duration=0.8',
      '-f', 'null', '-'
    ]);
    let output = '';
    ff.stderr.on('data', (d) => { output += d.toString(); });
    ff.on('close', () => {
      const silences = [];
      const regex = /silence_start:\s*([\d.]+)/g;
      let m;
      while ((m = regex.exec(output)) !== null) {
        const t = parseFloat(m[1]);
        if (Number.isFinite(t)) silences.push(t);
      }
      resolve(silences);
    });
    ff.on('error', () => resolve([]));
  });
}

// 침묵 지점으로 경계를 스냅하여 청크 분할 생성
async function createSmartChunks(inputPath, totalDuration) {
  const CHUNK_TARGET = 42;
  const OVERLAP_SECONDS = 3.0;
  const SNAP_WINDOW = 5; // 목표 경계로부터 ±5초 내
  const MIN_HEADROOM = 20; // 시작 후 최소 진행 시간

  try {
    const silences = await getVADHints(inputPath);
    const chunks = [];
    let currentStart = 0;
    while (currentStart < totalDuration - 0.5) {
      let targetEnd = Math.min(currentStart + CHUNK_TARGET, totalDuration);
      // 목표점 근처 침묵 찾기 (가장 가까운 것 선택)
      const candidates = silences
        .filter((s) => Math.abs(s - targetEnd) <= SNAP_WINDOW && s > currentStart + MIN_HEADROOM && s < totalDuration)
        .sort((a, b) => Math.abs(a - targetEnd) - Math.abs(b - targetEnd));
      const snapped = candidates.length > 0 ? candidates[0] : targetEnd;
      const actualEnd = Math.min(Math.max(snapped, currentStart + 1), totalDuration);
      chunks.push({ start: currentStart, end: actualEnd });
      currentStart = Math.max(0, actualEnd - OVERLAP_SECONDS);
      if (actualEnd >= totalDuration) break;
    }
    return chunks;
  } catch {
    return [];
  }
}

// 강화된 VAD 힌트 추출(저주파/고주파 컷 포함, 더 민감한 침묵 감지)
async function getEnhancedVADHints(inputPath) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', 'highpass=f=80,lowpass=f=8000,silencedetect=noise=-25dB:duration=0.5',
      '-f', 'null', '-'
    ]);
    let output = '';
    ff.stderr.on('data', (d) => { output += d.toString(); });
    ff.on('close', () => {
      const times = [];
      const startRegex = /silence_start:\s*([\d.]+)/g;
      const endRegex = /silence_end:\s*([\d.]+)/g;
      let m;
      while ((m = startRegex.exec(output)) !== null) {
        const t = parseFloat(m[1]);
        if (Number.isFinite(t)) times.push(t);
      }
      while ((m = endRegex.exec(output)) !== null) {
        const t = parseFloat(m[1]);
        if (Number.isFinite(t)) times.push(t);
      }
      const uniq = Array.from(new Set(times)).sort((a, b) => a - b);
      resolve(uniq);
    });
    ff.on('error', () => resolve([]));
  });
}

// 더 진보적인 청크 생성 (오버랩 최소화 + 자연 경계)
async function createProgressiveChunks(inputPath, totalDuration) {
  const CHUNK_TARGET = 55; // 목표 청크 크기 증가
  const OVERLAP_SECONDS = 1.0; // 오버랩 최소화
  const SNAP_WINDOW = 4; // 스냅 윈도우 감소
  const MIN_HEADROOM = 30; // 최소 진행 시간 증가
  
  try {
    const silences = await getEnhancedVADHints(inputPath);
    console.log(`🔍 ${silences.length}개 자연 경계 발견`);
    
    const chunks = [];
    let currentStart = 0;
    
    while (currentStart < totalDuration - 1.0) {
      let targetEnd = Math.min(currentStart + CHUNK_TARGET, totalDuration);
      
      // 자연 경계 찾기
      const candidates = silences
        .filter((s) => {
          return Math.abs(s - targetEnd) <= SNAP_WINDOW && 
                 s > currentStart + MIN_HEADROOM && 
                 s < totalDuration - 0.5;
        })
        .sort((a, b) => Math.abs(a - targetEnd) - Math.abs(b - targetEnd));
      
      const snapped = candidates.length > 0 ? candidates[0] : targetEnd;
      const actualEnd = Math.min(Math.max(snapped, currentStart + 5), totalDuration);
      
      chunks.push({ 
        start: currentStart, 
        end: actualEnd,
        natural: candidates.length > 0,
        duration: actualEnd - currentStart
      });
      
      // 다음 청크 시작점 (오버랩 최소화)
      currentStart = Math.max(0, actualEnd - OVERLAP_SECONDS);
      if (actualEnd >= totalDuration) break;
    }
    
    console.log(`📊 진보적 청크: ${chunks.length}개 (자연 경계: ${chunks.filter(c => c.natural).length}개)`);
    return chunks;
    
  } catch (e) {
    console.warn('진보적 청크 실패:', e?.message || e);
    return null;
  }
}

// 기존 createAccurateChunks 함수를 대체할 더 진보적인 버전
async function createAccurateChunks(inputPath, totalDuration) {
  const CHUNK_TARGET = 45;
  const OVERLAP_SECONDS = 2.0;
  const SNAP_WINDOW = 3;
  const MIN_HEADROOM = 25;
  try {
    const silences = await getEnhancedVADHints(inputPath);
    const chunks = [];
    let currentStart = 0;
    while (currentStart < totalDuration - 1.0) {
      let targetEnd = Math.min(currentStart + CHUNK_TARGET, totalDuration);
      const candidates = silences
        .filter((s) => Math.abs(s - targetEnd) <= SNAP_WINDOW && s > currentStart + MIN_HEADROOM && s < totalDuration - 0.5)
        .sort((a, b) => Math.abs(a - targetEnd) - Math.abs(b - targetEnd));
      const snapped = candidates.length > 0 ? candidates[0] : targetEnd;
      const actualEnd = Math.min(Math.max(snapped, currentStart + 2), totalDuration);
      chunks.push({ start: currentStart, end: actualEnd });
      currentStart = Math.max(0, actualEnd - OVERLAP_SECONDS);
      if (actualEnd >= totalDuration) break;
    }
    return chunks;
  } catch {
    // 폴백: 기존 간단 분할
    const CHUNK_DURATION = 45;
    const total = Math.ceil(totalDuration / CHUNK_DURATION);
    const arr = [];
    for (let i = 0; i < total; i++) {
      const start = Math.max(0, i * CHUNK_DURATION - (i === 0 ? 0 : 2.0));
      let end = start + CHUNK_DURATION + (i === 0 ? 0 : 2.0);
      end = Math.min(end, totalDuration);
      arr.push({ start, end });
    }
    return arr;
  }
}

// 청크별 Azure API 처리 함수
async function processChunkWithAzure(wavBuffer, chunkStartTime) {
  try {
    const AZURE_REGION = process.env.VITE_AZURE_SPEECH_REGION || 'eastasia';
    const AZURE_SUBSCRIPTION_KEY = process.env.VITE_AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
    
    if (!AZURE_SUBSCRIPTION_KEY) {
      throw new Error('Azure Speech API 키가 설정되지 않았습니다');
    }

    // 상세한 결과를 위한 엔드포인트와 설정
    const DETAILED_ENDPOINT = `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
    
    const params = new URLSearchParams({
      'language': 'zh-CN',
      'format': 'detailed',
      'profanity': 'raw',
      'wordLevelTimestamps': 'true',
      'punctuationMode': 'DictatedAndAutomatic',
      'enableDictation': 'true'
    });
    
    console.log(`🌐 청크 Azure API 호출 (시작시간: ${chunkStartTime}초)`);
    
    const response = await fetch(`${DETAILED_ENDPOINT}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SUBSCRIPTION_KEY,
        'Content-Type': 'audio/wav',
        'Accept': 'application/json'
      },
      body: wavBuffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 청크 Azure API 오류 (시작: ${chunkStartTime}초):`, errorText);
      return null; // 청크 실패 시 null 반환하고 계속 진행
    }

    const result = await response.json();
    console.log(`✅ 청크 Azure 응답 받음 (시작: ${chunkStartTime}초)`);
    
    // 청크 시작 시간을 결과에 추가
    if (result.NBest && result.NBest[0] && result.NBest[0].Words) {
      result.NBest[0].Words = result.NBest[0].Words.map(word => ({
        ...word,
        Offset: (word.Offset || 0) + (chunkStartTime * 10_000_000) // 청크 시작 시간만큼 오프셋 조정
      }));
    }
    
    return result;

  } catch (error) {
    console.error(`청크 Azure 처리 오류 (시작: ${chunkStartTime}초):`, error);
    return null;
  }
}

// 청크 결과들을 병합하는 함수 (시간 순서 보정 강화)
function mergeChunkResults(chunkResults) {
  try {
    console.log('🔗 청크 병합 시작, 유효한 청크 수:', chunkResults.filter(r => r).length);
    
    const validChunks = chunkResults.filter(chunk => chunk && chunk.NBest && chunk.NBest[0]);
    
    if (validChunks.length === 0) {
      console.warn('⚠️ 유효한 청크가 없음');
      return {
        DisplayText: '',
        NBest: [],
        RecognitionStatus: 'NoMatch'
      };
    }

    // 1) 청크별로 시간 정보 출력 (디버깅)
    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const meta = chunk._chunk;
      const words = chunk?.NBest?.[0]?.Words || [];
      if (words.length > 0) {
        const firstWord = words[0];
        const lastWord = words[words.length - 1];
        const firstTime = (firstWord.Offset || 0) / 10_000_000;
        const lastTime = ((lastWord.Offset || 0) + (lastWord.Duration || 0)) / 10_000_000;
        console.log(`📍 청크 ${i + 1}: 예상(${meta?.start?.toFixed(1)}~${meta?.end?.toFixed(1)}초) vs 실제(${firstTime.toFixed(1)}~${lastTime.toFixed(1)}초) - "${words.slice(0, 3).map(w => w.Word || '').join('')}..."`);
      }
    }

    // 2) 모든 단어 수집 후 시간 기준 정렬
    let allWords = [];
    
    for (const chunk of validChunks) {
      if (chunk.NBest && chunk.NBest[0] && chunk.NBest[0].Words) {
        for (const word of chunk.NBest[0].Words) {
          allWords.push({
            ...word,
            _chunkId: validChunks.indexOf(chunk) // 어느 청크에서 왔는지 기록
          });
        }
      }
    }
    
    // 3) 오프셋 기준으로 엄격하게 정렬
    allWords.sort((a, b) => (a.Offset || 0) - (b.Offset || 0));
    
    // 4) 중복 제거 (시간과 텍스트 모두 고려)
    const cleanWords = [];
    for (let i = 0; i < allWords.length; i++) {
      const current = allWords[i];
      const previous = cleanWords[cleanWords.length - 1];
      
      const isDuplicate = previous && 
        (current.Word || '') === (previous.Word || '') &&
        Math.abs((current.Offset || 0) - (previous.Offset || 0)) <= 500_000; // 50ms 이내
      
      if (!isDuplicate) {
        cleanWords.push(current);
      } else {
        console.log(`🔄 중복 제거: "${current.Word}" at ${((current.Offset || 0) / 10_000_000).toFixed(2)}초`);
      }
    }
    
    // 5) 시간 연속성 검증 및 보정 (+ 청크 간 역행 방지)
    const correctedWords = [];
    let runningLastEnd = 0;
    for (let i = 0; i < cleanWords.length; i++) {
      const word = { ...cleanWords[i] };
      
      // 이전 단어와의 시간 간격 체크
      if (i > 0) {
        const prevWord = correctedWords[i - 1];
        const prevEnd = (prevWord.Offset || 0) + (prevWord.Duration || 0);
        const currentStart = word.Offset || 0;
        const gap = (currentStart - prevEnd) / 10_000_000;
        
        // 큰 시간 점프나 역순이 발견되면 경고
        if (gap > 5.0) {
          console.warn(`⚠️ 큰 시간 점프 감지: ${(prevEnd/10_000_000).toFixed(2)}초 → ${(currentStart/10_000_000).toFixed(2)}초 (${gap.toFixed(2)}초 점프)`);
        } else if (gap < -0.5) {
          console.warn(`⚠️ 시간 역순 감지: ${(prevEnd/10_000_000).toFixed(2)}초 → ${(currentStart/10_000_000).toFixed(2)}초`);
          // 역순인 경우 이전 단어 바로 뒤로 조정
          word.Offset = prevEnd;
        }
      }

      // 청크 경계로 인한 앞당김 보정: 현재 단어 시작이 누적 종료보다 300ms 이상 앞서 있으면 당겨줌
      const NEG_GAP_CLAMP = 300_000; // 300ms
      const wStart = word.Offset || 0;
      if (wStart < runningLastEnd - NEG_GAP_CLAMP) {
        const delta = (runningLastEnd + 50_000) - wStart; // 50ms 여유
        word.Offset = wStart + delta;
      }
      const wEnd = (word.Offset || 0) + (word.Duration || 0);
      runningLastEnd = Math.max(runningLastEnd, wEnd);
      
      correctedWords.push(word);
    }
    
    console.log(`📝 병합 결과: ${allWords.length} → ${cleanWords.length} → ${correctedWords.length} 단어`);
    
    // 6) 전체 텍스트 재구성 및 문장 단위 중복 제거
    let rawDisplayText = correctedWords.map(w => w.Word || '').join('');
    
    // 문장 단위 중복 제거 (특히 청크 오버랩으로 인한 중복)
    console.log('🔍 중복 제거 전 원본 텍스트:', rawDisplayText.slice(0, 200) + '...');
    
    // 1) 먼저 중국어 구두점으로 문장 분할
    const sentences = rawDisplayText
      .split(/(?<=[。！？；])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log('📝 분할된 문장 수:', sentences.length);
    
    const uniqueSentences = [];
    const removedDuplicates = [];
    
    for (const sentence of sentences) {
              const normalized = sentence.replace(/[\s。！？]/g, '').trim();
      if (normalized.length === 0) continue;
      
      // 이미 있는 문장과 유사도 체크
      let isDuplicate = false;
      let duplicateMatch = '';
      let replaceExisting = false;
      let replaceIndex = -1;
      
      for (let i = 0; i < uniqueSentences.length; i++) {
        const existing = uniqueSentences[i];
        const existingNorm = existing.replace(/[\s。！？]/g, '').trim();
        if (existingNorm.length === 0) continue;
        
        // 방법 1: 포함 관계 체크 (70% 이상)
        const shorter = normalized.length < existingNorm.length ? normalized : existingNorm;
        const longer = normalized.length >= existingNorm.length ? normalized : existingNorm;
        const inclusionSim = longer.includes(shorter) ? (shorter.length / longer.length) : 0;
        
        // 방법 2: 편집 거리 기반 유사도 (간단 버전)
        const maxLen = Math.max(normalized.length, existingNorm.length);
        const minLen = Math.min(normalized.length, existingNorm.length);
        const lengthSim = minLen / maxLen;
        
        // 방법 3: 특정 패턴 체크 ("球，" 같은 이상한 prefix 제거 후 비교)
        const cleanCurrent = normalized.replace(/^[球。]+/, '');
        const cleanExisting = existingNorm.replace(/^[球。]+/, '');
        const cleanSim = cleanExisting.length > 0 && cleanCurrent.length > 0 && 
          (cleanExisting.includes(cleanCurrent) || cleanCurrent.includes(cleanExisting)) ?
          Math.min(cleanCurrent.length, cleanExisting.length) / Math.max(cleanCurrent.length, cleanExisting.length) : 0;
        
        if (inclusionSim >= 0.7 || (lengthSim >= 0.8 && longer.includes(shorter.slice(0, Math.floor(shorter.length * 0.7)))) || cleanSim >= 0.9) {
          isDuplicate = true;
          duplicateMatch = existing.slice(0, 30);
          
          // 완성도 비교: 새 문장이 기존 문장보다 더 완전한지 체크
          const currentComplete = sentence.includes('。') || sentence.includes('！') || sentence.includes('？');
          const existingComplete = existing.includes('。') || existing.includes('！') || existing.includes('？');
          const currentLonger = sentence.length > existing.length;
          const currentCleaner = !sentence.match(/^[球，、。]/) && existing.match(/^[球，、。]/);
          
          // 새 문장이 더 완전하거나 깨끗하면 기존 문장을 대체
          if ((currentComplete && !existingComplete) || 
              (currentComplete === existingComplete && currentLonger) ||
              currentCleaner) {
            replaceExisting = true;
            replaceIndex = i;
            console.log(`🔄 더 완전한 문장으로 교체: "${existing.slice(0, 30)}..." → "${sentence.slice(0, 30)}..."`);
          } else {
            console.log(`🔄 문장 중복 제거: "${sentence.slice(0, 30)}..." → 유지: "${duplicateMatch}..."`);
          }
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueSentences.push(sentence);
      } else if (replaceExisting) {
        // 더 완전한 문장으로 교체
        uniqueSentences[replaceIndex] = sentence;
        removedDuplicates.push({
          removed: duplicateMatch,
          replacedWith: sentence.slice(0, 30)
        });
      } else {
        // 기존 문장 유지, 새 문장 제거
        removedDuplicates.push({
          removed: sentence.slice(0, 30),
          similarTo: duplicateMatch
        });
      }
    }
    
    console.log('✅ 중복 제거 완료:', sentences.length, '→', uniqueSentences.length, '문장');
    if (removedDuplicates.length > 0) {
      console.log('🗑️ 제거된 중복:', removedDuplicates.length, '개');
    }
    
    const allDisplayText = uniqueSentences.join('');
    
    // 병합된 결과 구성
    const mergedResult = {
      DisplayText: allDisplayText,
      NBest: [{
        Display: allDisplayText,
        Lexical: allDisplayText,
        Words: correctedWords.map(w => {
          const { _chunkId, ...cleanWord } = w; // _chunkId 제거
          return cleanWord;
        }),
        Confidence: validChunks.length > 0 ? 
          (validChunks.reduce((sum, chunk) => sum + (chunk.NBest[0].Confidence || 0.9), 0) / validChunks.length) : 0.9
      }],
      RecognitionStatus: 'Success'
    };
    
    return mergedResult;
    
  } catch (error) {
    console.error('청크 병합 오류:', error);
    return {
      DisplayText: '',
      NBest: [],
      RecognitionStatus: 'Failed'
    };
  }
}

// Batch API용 함수 제거됨 - 실시간 API 사용

// WebM 오디오를 WAV로 변환하는 함수
async function convertWebMToWav(webmBuffer) {
  try {
    // 간단한 WAV 헤더 생성 (16kHz, 16bit, Mono)
    // 실제로는 FFmpeg나 다른 라이브러리를 사용해야 하지만
    // 일단 기본 PCM 데이터로 가정하고 WAV 헤더 추가
    
    const dataSize = webmBuffer.byteLength;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    
    // WAV 헤더 구성
    // RIFF 청크
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, dataSize + 36, true); // 파일 크기 - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmt 청크
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // PCM 포맷 청크 크기
    view.setUint16(20, 1, true); // PCM 포맷
    view.setUint16(22, 1, true); // 모노
    view.setUint32(24, 16000, true); // 샘플 레이트 16kHz
    view.setUint32(28, 32000, true); // 바이트 레이트
    view.setUint16(32, 2, true); // 블록 정렬
    view.setUint16(34, 16, true); // 비트 깊이
    
    // data 청크
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true); // 데이터 크기
    
    // 헤더와 데이터 결합
    const wavBuffer = new Uint8Array(44 + dataSize);
    wavBuffer.set(new Uint8Array(wavHeader), 0);
    wavBuffer.set(new Uint8Array(webmBuffer), 44);
    
    return wavBuffer.buffer;
  } catch (error) {
    console.error('WebM → WAV 변환 실패:', error);
    // 변환 실패 시 원본 반환
    return webmBuffer;
  }
}

// 초를 SRT 형식 시간 문자열로 변환 (HH:MM:SS,mmm)
function formatSecondsToTimeString(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

async function formatTranscriptResult(azureResult, youtubeUrl) {
  try {
    console.log('🔄 Azure 전체 응답 분석:', {
      DisplayText: azureResult.DisplayText,
      RecognitionStatus: azureResult.RecognitionStatus,
      Confidence: azureResult.NBest?.[0]?.Confidence,
      WordCount: azureResult.NBest?.[0]?.Words?.length || 0,
      TotalDuration: azureResult._totalDurationSec
    });
    
    // Azure Speech API 결과 상세 분석
    let displayText = '';
    
    // 다양한 Azure 응답 형식 처리
    if (azureResult.DisplayText && azureResult.DisplayText.trim() !== '') {
      displayText = azureResult.DisplayText;
      console.log('✅ DisplayText 사용:', displayText);
    } else if (azureResult.NBest && azureResult.NBest.length > 0) {
      displayText = azureResult.NBest[0].Display || azureResult.NBest[0].Lexical || '';
      console.log('✅ NBest Display 사용:', displayText);
    } else {
      console.warn('⚠️ 모든 텍스트 필드가 비어있음, RecognitionStatus:', azureResult.RecognitionStatus);
      displayText = '';
    }
    
    console.log('🔍 최종 추출된 텍스트:', displayText);

    // 단어 레벨 타임스탬프를 활용해 종료 시간 계산
    const nbest = Array.isArray(azureResult.NBest) && azureResult.NBest.length > 0 ? azureResult.NBest[0] : null;
    let words = Array.isArray(nbest?.Words) ? nbest.Words : [];

    // 앵커 기반 구간별 재스케일링: 긴 침묵(>=1.2s)을 앵커로 삼아 구간별 스케일링
    try {
      const totalDurationSec = typeof azureResult._totalDurationSec === 'number' ? azureResult._totalDurationSec : undefined;
      if (totalDurationSec && Array.isArray(words) && words.length > 1) {
        words = applyPiecewiseAnchorScalingToWords(words, totalDurationSec);
        // nbest에도 반영
        if (nbest) nbest.Words = words;
      }
    } catch (e) {
      console.warn('앵커 기반 재스케일링 실패(무시):', e?.message || e);
    }

    // 텍스트가 비어있고 단어 목록이 있으면 단어로 재구성 (중국어는 공백 없이 연결)
    if ((!displayText || displayText.trim() === '') && words.length > 0) {
      try {
        const joined = words.map(w => w.Word || '').join('');
        if (joined.trim() !== '') {
          displayText = joined;
          console.log('✍️ Words로 텍스트 재구성:', displayText);
        }
      } catch {}
    }
    
    // 구두점 개선: 자연스러운 마침표와 쉼표 추가
    if (displayText && displayText.length > 10) {
      console.log('🔧 구두점 개선 시도');
      
      // 기존 구두점이 적으면 개선
      const punctCount = (displayText.match(/[。！？，]/g) || []).length;
      const shouldImprove = punctCount < Math.floor(displayText.length / 50);
      
      if (shouldImprove) {
        // 문장 끝에 마침표 추가
        if (!displayText.endsWith('。') && !displayText.endsWith('！') && !displayText.endsWith('？')) {
          displayText += '。';
        }
        
        // 자연스러운 위치에 쉼표 추가 (특정 키워드 뒤)
        const naturalBreaks = ['报道称', '表示', '称', '说', '认为', '指出', '强调', '宣布', '决定', '要求'];
        for (const breakWord of naturalBreaks) {
          const regex = new RegExp(`(${breakWord})([^，。！？]{8,})`, 'g');
          displayText = displayText.replace(regex, '$1，$2');
        }
        
        console.log('🔧 구두점 개선 후:', displayText);
      } else {
        console.log('🔧 구두점이 이미 충분함, 건너뜀');
      }
    }
    // Azure 단어 시간 정보를 활용한 자연스러운 문장 단위 분할
    let formattedSegments = [];
    console.log('🎯 자연스러운 문장 단위 분할 시작 - 단어 수:', words.length);
    if (words.length > 0) {
      const MAX_SEGMENT_SEC = 60; // 최대 60초
      const MIN_SEGMENT_SEC = 3; // 최소 3초
      const SILENCE_THRESHOLD = 0.8; // 침묵 구간 임계값 (0.8초)
      const MAX_SILENCE_GAP = 2.0; // 최대 허용 침묵 구간

      const isPunct = (ch) => /[。！？]/.test(ch);
      const stripPunct = (s) => (s || '').replace(/[。！？\s]/g, '');

      // 1) 침묵 구간과 의미 단위를 기반으로 한 자연스러운 분할
      let segmentId = 1;
      let currentSegment = {
        startIdx: 0,
        startTime: 0,
        text: '',
        words: []
      };

      const getWordStartSec = (idx) => ((words[idx]?.Offset || 0) / 10_000_000);
      const getWordEndSec = (idx) => (((words[idx]?.Offset || 0) + (words[idx]?.Duration || 0)) / 10_000_000);
      const getWordGap = (idx1, idx2) => Math.max(0, getWordStartSec(idx2) - getWordEndSec(idx1));

      // 세그먼트 추가 함수
      const addSegment = (endIdx) => {
        if (currentSegment.startIdx > endIdx || currentSegment.words.length === 0) return;
        
        const startSec = currentSegment.startTime;
        const endSec = getWordEndSec(endIdx);
        const duration = endSec - startSec;
        
        // 최소 길이 보장
        if (duration < MIN_SEGMENT_SEC) return;
        
        const segmentText = currentSegment.words.map(w => w.Word || '').join('');
        
        formattedSegments.push({
          id: segmentId++,
          seek: 0,
          start: startSec,
          end: endSec,
          start_time: formatSecondsToTimeString(startSec),
          end_time: formatSecondsToTimeString(endSec),
          text: segmentText,
          original_text: segmentText,
          tokens: [],
          temperature: 0.0,
          avg_logprob: typeof nbest?.Confidence === 'number' ? nbest.Confidence : 0.9,
          compression_ratio: 1.0,
          no_speech_prob: 0.1,
          keywords: [],
          words: currentSegment.words.map(w => ({
            word: w.Word || '',
            start: (w.Offset || 0) / 10_000_000,
            end: ((w.Offset || 0) + (w.Duration || 0)) / 10_000_000,
            probability: typeof w.Confidence === 'number' ? w.Confidence : 0.9,
          }))
        });
        
        console.log(`📝 세그먼트 ${segmentId-1} 추가: [${startSec.toFixed(1)}s-${endSec.toFixed(1)}s] "${segmentText.slice(0, 30)}..."`);
      };

      // 새로운 세그먼트 시작
      const startNewSegment = (idx) => {
        if (currentSegment.words.length > 0) {
          addSegment(idx - 1);
        }
        currentSegment = {
          startIdx: idx,
          startTime: getWordStartSec(idx),
          text: '',
          words: []
        };
      };

      // 2) 단어들을 순회하면서 자연스러운 분할점 찾기
      console.log('🔄 단어별 분석 시작...');
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const currentTime = getWordStartSec(i);
        const currentDuration = getWordEndSec(i) - getWordStartSec(i);
        
        // 첫 번째 단어인 경우 세그먼트 시작
        if (i === 0) {
          currentSegment.startTime = currentTime;
        }
        
        // 현재 단어를 세그먼트에 추가
        currentSegment.words.push(word);
        
        // 다음 단어와의 간격 확인
        if (i < words.length - 1) {
          const gap = getWordGap(i, i + 1);
          const segmentDuration = getWordEndSec(i) - currentSegment.startTime;
          
          // 분할 조건 확인
          let shouldSplit = false;
          let splitReason = '';
          
          // 1. 침묵 구간이 충분히 긴 경우 (0.8초 이상)
          if (gap >= SILENCE_THRESHOLD) {
            shouldSplit = true;
            splitReason = `침묵 구간 (${gap.toFixed(1)}초)`;
          }
          // 2. 세그먼트가 너무 긴 경우 (60초 이상)
          else if (segmentDuration >= MAX_SEGMENT_SEC) {
            shouldSplit = true;
            splitReason = `길이 제한 (${segmentDuration.toFixed(1)}초)`;
          }
          // 3. 의미 단위 확인 (특정 키워드 뒤에서 분할)
          else {
            const wordText = word.Word || '';
            const meaningBreaks = ['。', '！', '？', '报道称', '表示', '称', '说', '认为', '指出', '强调', '宣布', '决定'];
            if (meaningBreaks.some(breakWord => wordText.includes(breakWord))) {
              shouldSplit = true;
              splitReason = `의미 단위 (${wordText})`;
            }
          }
          
          if (shouldSplit) {
            console.log(`🔪 분할점 발견 [${i}]: ${splitReason}`);
            startNewSegment(i + 1);
          }
        }
      }
      
      // 마지막 세그먼트 처리
      if (currentSegment.words.length > 0) {
        addSegment(words.length - 1);
      }

      console.log('✅ 세그먼트 분할 완료, 총 세그먼트 수:', formattedSegments.length);
    } else {
      // 단어 정보가 없는 경우 fallback
      console.log('⚠️ 단어 정보 없음, 전체를 하나의 세그먼트로 처리');
      const endTimeSec = azureResult.Duration ? azureResult.Duration / 10_000_000 : 10;
      
      formattedSegments.push({
        id: 1,
        seek: 0,
        start: 0,
        end: endTimeSec,
        start_time: formatSecondsToTimeString(0),
        end_time: formatSecondsToTimeString(endTimeSec),
        text: displayText || '텍스트 없음',
        original_text: displayText || '',
        tokens: [],
        temperature: 0.0,
        avg_logprob: 0.9,
        compression_ratio: 1.0,
        no_speech_prob: 0.1,
        keywords: [],
        words: []
      });
    }

    // 문장 시작부 노이즈(예: 단일 한자+쉼표 '球，') 정리 및 선행 구두점 제거
    try {
      for (let i = 0; i < formattedSegments.length; i++) {
        const prev = i > 0 ? formattedSegments[i - 1] : null;
        const seg = formattedSegments[i];
        if (!seg || typeof seg.text !== 'string') continue;

        // 선행 구두점/공백 정리
        let newText = seg.text.replace(/^[\s]+/, '');

        if (prev && typeof prev.text === 'string') {
          const prevEndsWithPunct = /[。！？；]$/.test(prev.text);
          const gapSec = Math.max(0, (seg.start || 0) - (prev.end || 0));
          // 이전 문장이 종결 부호로 끝났고, 시간 간격이 매우 짧다면
          if (prevEndsWithPunct && gapSec <= 0.35) {
            // 문장 시작의 단일 한자 + 마침표 패턴 제거 (예: "球。")
            newText = newText.replace(/^[\u4e00-\u9fff][。]+/, '');
          }
        }

        if (newText !== seg.text) {
          seg.text = newText.trim();
          seg.original_text = seg.text;
        }
      }
      // 내용이 비어버린 세그먼트 제거
      formattedSegments = formattedSegments.filter(s => s && typeof s.text === 'string' && s.text.trim() !== '');
    } catch {}

    // 연속 중복 세그먼트 병합/제거: 같은 문장이 두 번 나오면 한 번만 남김
    try {
      const normalize = (s) => (s || '')
        .replace(/[\s。！？]/g, '')
        .trim();
      let i = 0;
      while (i < formattedSegments.length - 1) {
        const a = formattedSegments[i];
        const b = formattedSegments[i + 1];
        if (!a || !b) { i++; continue; }
        const gap = Math.max(0, (b.start || 0) - (a.end || 0));
        if (gap <= 0.5) {
          const na = normalize(a.text);
          const nb = normalize(b.text);
          const aInB = nb.startsWith(na) || nb.includes(na);
          const bInA = na.startsWith(nb) || na.includes(nb);
          if ((aInB || bInA) && Math.min(na.length, nb.length) >= 4) {
            // 중복으로 판단 → 더 긴 텍스트를 남기되 시간은 앞쪽 시작을 유지
            const keepLongerB = nb.length >= na.length;
            const keep = keepLongerB ? b : a;
            const other = keepLongerB ? a : b;
            const newStart = Math.min(a.start || 0, b.start || 0);
            let newEnd = Math.max(a.end || 0, b.end || 0);
            // 단어 결합
            const mergedWords = [
              ...(Array.isArray(a.words) ? a.words : []),
              ...(Array.isArray(b.words) ? b.words : [])
            ].sort((x, y) => (x.start || 0) - (y.start || 0));
            // 근접 중복 단어 제거(50ms 이내 같은 단어)
            const dedupWords = [];
            for (const w of mergedWords) {
              const prevW = dedupWords[dedupWords.length - 1];
              const same = prevW && (w.word || '') === (prevW.word || '') && Math.abs((w.start || 0) - (prevW.start || 0)) <= 0.05;
              if (!same) dedupWords.push(w);
            }
            keep.text = keepLongerB ? b.text : a.text;
            keep.original_text = keep.text;
            keep.start = newStart;
            keep.start_time = formatSecondsToTimeString(newStart);
            keep.end = newEnd;
            keep.end_time = formatSecondsToTimeString(newEnd);
            keep.words = dedupWords;
            // 앞쪽 위치(i)에 keep을 두고 다음 것을 제거
            formattedSegments[i] = keep;
            formattedSegments.splice(i + 1, 1);
            // 이전과의 추가 병합을 위해 i를 감소시키지 않고 동일 인덱스 재검토
            continue;
          }
        }
        i++;
      }

      // 인접 세그먼트 경계 겹침 최소화(앞 세그먼트의 끝을 다음 시작 직전으로 클램프)
      for (let j = 0; j < formattedSegments.length - 1; j++) {
        const cur = formattedSegments[j];
        const nxt = formattedSegments[j + 1];
        if (!cur || !nxt) continue;
        const maxEnd = Math.max(cur.start || 0, (nxt.start || 0) - 0.05);
        if ((cur.end || 0) > maxEnd) {
          cur.end = maxEnd;
          cur.end_time = formatSecondsToTimeString(maxEnd);
        }
      }
    } catch {}

    // 보수적 드리프트 보정(전체 대비 ±0.2% 이내 클램프)
    try {
      const totalDurationSec = typeof azureResult._totalDurationSec === 'number' ? azureResult._totalDurationSec : undefined;
      if (totalDurationSec && formattedSegments.length > 0) {
        const predictedTotal = formattedSegments[formattedSegments.length - 1].end || 0;
        if (predictedTotal > 0) {
          const CLAMP_MIN = 0.998;
          const CLAMP_MAX = 1.002;
          let ratio = totalDurationSec / predictedTotal;
          ratio = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, ratio));
          if (Math.abs(1 - ratio) > 0.0005) {
            const scale = (t) => (t || 0) * ratio;
            formattedSegments = formattedSegments.map(seg => {
              const newStart = scale(seg.start);
              const newEnd = scale(seg.end);
              const newWords = Array.isArray(seg.words) ? seg.words.map(w => ({
                ...w,
                start: scale(w.start),
                end: scale(w.end),
              })) : seg.words;
              return {
                ...seg,
                start: newStart,
                end: newEnd,
                start_time: formatSecondsToTimeString(newStart),
                end_time: formatSecondsToTimeString(newEnd),
                words: newWords,
              };
            });
            console.log('⏱️ 드리프트 보정 적용됨 (ratio):', ratio);
          }
        }
      }
    } catch {}

    const cleanedSegments = formattedSegments.map(seg => ({
      ...seg,
      original_text: seg.text  // 프론트엔드에서 사용하는 필드 추가
    }));
    
    // 정제된 텍스트로 전체 텍스트 업데이트
    const cleanedFullText = cleanedSegments.map(seg => seg.text).join(' ');

    let result = {
      text: cleanedFullText,
      segments: cleanedSegments,
        language: 'zh-CN',  // 중국어 간체로 명시
      url: youtubeUrl,
      processed_at: new Date().toISOString()
    };

    // Gemini 기반 일관성 검증 및 스크립트 보정
    try {
      console.log('🔍 === GEMINI API 상세 진단 시작 ===');
      console.log('🔍 1. 환경변수 상태:');
      console.log('   - process.env.GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음');
      console.log('   - process.env.VITE_GEMINI_API_KEY:', process.env.VITE_GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음');
      console.log('   - GEMINI_API_KEY 변수:', GEMINI_API_KEY ? '✅ 있음' : '❌ 없음');
      console.log('   - GEMINI_API_KEY 길이:', GEMINI_API_KEY ? GEMINI_API_KEY.length : 0);
      console.log('   - GEMINI_API_KEY 시작:', GEMINI_API_KEY ? GEMINI_API_KEY.slice(0, 15) + '...' : 'null');
      
      console.log('🔍 2. 엔드포인트 정보:');
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      console.log('   - GEMINI_ENDPOINT:', geminiUrl);
      
      const canUseGeminiHeavy = GEMINI_API_KEY && 
        result.segments.length > 5 && 
        displayText && displayText.length > 200;
      const canUseGeminiLight = GEMINI_API_KEY && displayText && displayText.length > 50;

      console.log('🔍 3. 사용 조건 체크:');
      console.log('   - API Key 존재:', GEMINI_API_KEY ? '✅ 있음' : '❌ 없음');
      console.log('   - 세그먼트 수:', result.segments.length, '(최소 5개 필요)');
      console.log('   - 세그먼트 개수 조건(고급 모드):', result.segments.length > 5 ? '✅ 통과' : '❌ 실패');
      console.log('   - displayText 존재:', displayText ? '✅ 있음' : '❌ 없음');
      console.log('   - 텍스트 길이:', displayText ? displayText.length : 0, '자');
      console.log('   - 텍스트 길이 조건(고급 200자):', (displayText && displayText.length > 200) ? '✅ 통과' : '❌ 실패');
      console.log('   - 텍스트 길이 조건(경량 50자):', (displayText && displayText.length > 50) ? '✅ 통과' : '❌ 실패');
      console.log('   - displayText 샘플:', displayText ? displayText.slice(0, 100) + '...' : 'null');
      console.log('   - 최종 결정:', canUseGeminiHeavy ? '✅ Gemini 고급 모드' : (canUseGeminiLight ? '✅ Gemini 경량 모드' : '❌ 기본 로직만 사용'));

      if (canUseGeminiHeavy) {
        console.log('🤖 Gemini 스크립트 일관성 검증 시작');
        
        const segmentTexts = result.segments.map((seg, i) => 
          `[${seg.start_time} - ${seg.end_time}] ${seg.text}`
        ).join('\n');

        // 영상 총 길이와 비교 정보 추가
        const totalDurationSec = azureResult._totalDurationSec || 0;
        const lastSegmentTime = result.segments.length > 0 ? result.segments[result.segments.length - 1].end : 0;
        const timingInfo = totalDurationSec > 0 ? 
          `\n影片总长度: ${totalDurationSec.toFixed(1)}秒 (${formatSecondsToTimeString(totalDurationSec)})\n最后分段结束时间: ${lastSegmentTime.toFixed(1)}秒 (${formatSecondsToTimeString(lastSegmentTime)})\n时间差: ${(totalDurationSec - lastSegmentTime).toFixed(1)}秒` : '';

        const prompt = `作为中文转录质量专家，请检查以下转录结果的一致性并修正问题：

原始完整文本：
${displayText}

当前分段脚本：
${segmentTexts}
${timingInfo}

请识别并修正以下问题：
1. 重复句子（如前句"埃方表示愿意接待哈马斯代表"后又出现"球，埃方表示愿意接待哈马斯代表团"）
2. 句子截断或分割错误（如"带冲突痛苦和饥饿的最大希望连"应该是完整句子）
3. 丢失的句子（原文中存在但分段中缺失的完整句子）
4. 时间戳不合理的分段
5. **同步丢失问题**: 如果最后分段时间比影片总长度短超过2秒，且原文中有句子在分段中缺失，需要补充遗漏的句子并分配合理时间戳
6. **尾部覆盖不足**: 原文的结尾句子如果在分段中完全缺失，必须添加到脚本末尾

返回修正后的JSON格式：
{
  "correctedText": "修正后的完整文本",
  "segments": [
    {"start_time": "00:00:00,000", "end_time": "00:00:05,000", "text": "修正后的文本"}
  ],
  "changes": ["具体修改说明"],
  "coverageIssues": ["覆盖问题说明（如发现尾部缺失等）"]
}

要求：
- 保持时间戳的合理性和连续性，确保最后分段尽量接近影片总长度
- 确保每个句子完整且无重复
- 优先保留语义完整的长句子
- 标点符号准确
- 如果发现原文结尾的句子在分段中缺失，必须补充并给予合理时间戳
- 最后一个分段的结束时间应接近影片总长度（误差不超过1秒）`;

        const apiKey = GEMINI_API_KEY;
        const heavyUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const geminiResponse = await fetch(heavyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          console.log('📥 Gemini 원본 응답 길이:', responseText.length, '자');
          console.log('📝 Gemini 응답 미리보기:', responseText.slice(0, 200) + '...');
          
          // JSON 추출
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const correctionData = JSON.parse(jsonMatch[0]);
            
            console.log('📊 Gemini 분석 결과:');
            console.log('  - 수정 전 세그먼트:', result.segments.length, '개');
            console.log('  - 수정 후 세그먼트:', correctionData.segments?.length || 0, '개');
            console.log('  - 변경사항:', correctionData.changes?.length || 0, '항목');
            console.log('  - 커버리지 이슈:', correctionData.coverageIssues?.length || 0, '항목');
            
            if (correctionData.segments && Array.isArray(correctionData.segments)) {
              // 수정 전후 비교 로그
              const beforeTexts = result.segments.map(s => s.text);
              const afterTexts = correctionData.segments.map(s => s.text);
              
              console.log('🔄 Gemini 변경 내용:');
              if (correctionData.changes) {
                correctionData.changes.forEach((change, i) => {
                  console.log(`  ${i + 1}. ${change}`);
                });
              }
              
              // 삭제된 문장 찾기
              const deletedSentences = beforeTexts.filter(before => 
                !afterTexts.some(after => after.includes(before.slice(0, 10)))
              );
              if (deletedSentences.length > 0) {
                console.log('🗑️ Gemini가 삭제한 문장들:');
                deletedSentences.forEach((deleted, i) => {
                  console.log(`  ${i + 1}. "${deleted.slice(0, 30)}..."`);
                });
              }
              
              // 추가된 문장 찾기
              const addedSentences = afterTexts.filter(after => 
                !beforeTexts.some(before => before.includes(after.slice(0, 10)))
              );
              if (addedSentences.length > 0) {
                console.log('➕ Gemini가 추가한 문장들:');
                addedSentences.forEach((added, i) => {
                  console.log(`  ${i + 1}. "${added.slice(0, 30)}..."`);
                });
              }

              // Gemini 수정 사항 적용
              const correctedSegments = correctionData.segments.map((seg, index) => ({
                id: index + 1,
                seek: 0,
                start: parseFloat(seg.start_time?.replace(/[\:,]/g, '') || '0') / 1000 || (index * 5),
                end: parseFloat(seg.end_time?.replace(/[\:,]/g, '') || '0') / 1000 || ((index + 1) * 5),
                start_time: seg.start_time || formatSecondsToTimeString(index * 5),
                end_time: seg.end_time || formatSecondsToTimeString((index + 1) * 5),
                text: seg.text || '',
                original_text: seg.text || '',
                tokens: [],
                temperature: 0.0,
                avg_logprob: 0.85,
                compression_ratio: 1.0,
                no_speech_prob: 0.1,
                keywords: [],
                words: []
              }));

              result.segments = correctedSegments;
              result.text = correctionData.correctedText || correctedSegments.map(s => s.text).join(' ');
              
              console.log('✅ Gemini 스크립트 보정 완료');
              console.log('📈 최종 통계: 세그먼트', beforeTexts.length, '→', correctedSegments.length, '개');
            } else {
              console.log('⚠️ Gemini 응답에서 유효한 segments 배열을 찾을 수 없음');
            }
          } else {
            console.log('⚠️ Gemini 응답에서 JSON을 찾을 수 없음');
          }
        } else {
          console.log('❌ Gemini API 요청 실패:', geminiResponse.status, geminiResponse.statusText);
        }
      } else if (canUseGeminiLight) {
        // 경량 모드: 텍스트 정제만 수행 (세그먼트 구조는 유지)
        console.log('🤖 === Gemini 경량 모드 시작 ===');
        console.log('🤖 1. 요청 준비:');
        const lightUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        console.log('   - 엔드포인트:', lightUrl);
        console.log('   - API 키 길이:', GEMINI_API_KEY ? GEMINI_API_KEY.length : 0);
        
        const prompt = `다음 음성인식 결과를 깔끔하게 정제해 주세요:\n\n${displayText}\n\n수정 지침:\n1) 중복 문장 제거\n2) 잘못 끊어진 문장 연결\n3) 구두점 정리\n4) 의미 없는 토큰(예: \"球，\") 제거\n\nJSON 형식으로만 응답:\n{\n  \"cleanedText\": \"정제된 텍스트\"\n}`;
        
        const requestBody = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        };
        
        console.log('🤖 2. 요청 바디:');
        console.log('   - 프롬프트 길이:', prompt.length, '자');
        console.log('   - 요청 바디 크기:', JSON.stringify(requestBody).length, '바이트');
        
        console.log('🤖 3. API 호출 시작...');
        const startTime = Date.now();
        
        const apiKey = GEMINI_API_KEY;
        const lightModeUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const geminiResponse = await fetch(lightModeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const endTime = Date.now();
        console.log('🤖 4. API 응답 받음:');
        console.log('   - 응답 시간:', endTime - startTime, 'ms');
        console.log('   - 상태 코드:', geminiResponse.status);
        console.log('   - 상태 텍스트:', geminiResponse.statusText);
        console.log('   - 응답 헤더:', Object.fromEntries(geminiResponse.headers.entries()));
        
        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const cleanedData = JSON.parse(jsonMatch[0]);
              if (cleanedData.cleanedText && cleanedData.cleanedText.trim()) {
                console.log('✅ Gemini 정제 적용됨 (경량)');
                console.log('   - Before:', (displayText || '').slice(0, 80) + '...');
                console.log('   - After :', cleanedData.cleanedText.slice(0, 80) + '...');
                displayText = cleanedData.cleanedText;
                result.text = cleanedData.cleanedText;
              } else {
                console.log('⚠️ Gemini 경량 응답에 cleanedText 없음');
              }
            } catch (e) {
              console.log('⚠️ Gemini 경량 JSON 파싱 실패:', e?.message || e);
            }
          } else {
            console.log('⚠️ Gemini 경량 응답에서 JSON을 찾을 수 없음');
          }
        } else {
          console.log('❌ === Gemini API 요청 실패 ===');
          console.log('❌ 1. 오류 정보:');
          console.log('   - 상태 코드:', geminiResponse.status);
          console.log('   - 상태 텍스트:', geminiResponse.statusText);
          
          // 응답 본문 읽기 시도
          let errorBody = '';
          try {
            errorBody = await geminiResponse.text();
            console.log('❌ 2. 오류 응답 본문:');
            console.log('   - 길이:', errorBody.length, '자');
            console.log('   - 내용:', errorBody.slice(0, 500));
          } catch (e) {
            console.log('❌ 2. 응답 본문 읽기 실패:', e?.message || e);
          }
          
          console.log('❌ 3. 문제 진단:');
          if (geminiResponse.status === 503) {
            console.log('   - 503 Service Unavailable: Gemini API 서버 과부하 또는 일시적 장애');
            console.log('🔄 Gemini 서비스 일시적 장애, 재시도 중...');
            
            // 503 에러인 경우 재시도
            try {
              await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
              
              const apiKey = GEMINI_API_KEY;
              const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
              const retryResponse = await fetch(retryUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
              });
              
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                const responseText = retryData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const cleanedData = JSON.parse(jsonMatch[0]);
                    if (cleanedData.cleanedText && cleanedData.cleanedText.trim()) {
                      console.log('✅ Gemini 재시도 성공');
                      console.log('   - Before:', (displayText || '').slice(0, 80) + '...');
                      console.log('   - After :', cleanedData.cleanedText.slice(0, 80) + '...');
                      displayText = cleanedData.cleanedText;
                      result.text = cleanedData.cleanedText;
                    }
                  } catch (e) {
                    console.log('⚠️ Gemini 재시도 JSON 파싱 실패:', e?.message || e);
                  }
                }
              } else {
                console.log('❌ Gemini 재시도도 실패:', retryResponse.status, retryResponse.statusText);
              }
            } catch (retryError) {
              console.log('❌ Gemini 재시도 중 오류:', retryError?.message || retryError);
            }
          } else if (geminiResponse.status === 401) {
            console.log('   - 401 Unauthorized: API 키 인증 실패');
          } else if (geminiResponse.status === 400) {
            console.log('   - 400 Bad Request: 요청 형식 오류');
          } else if (geminiResponse.status === 429) {
            console.log('   - 429 Too Many Requests: 할당량 초과');
          } else {
            console.log('   - 기타 오류:', geminiResponse.status);
          }
        }

      } else {
        console.log('⚠️ === Gemini 사용 안함 ===');
        console.log('⚠️ 1. 스킵 이유:');
        if (!GEMINI_API_KEY) {
          console.log('   - API 키가 없음');
        } else if (result.segments.length <= 5) {
          console.log('   - 세그먼트 수 부족 (현재:', result.segments.length, ', 필요: >5)');
        } else if (!displayText || displayText.length <= 50) {
          console.log('   - 텍스트 길이 부족 (현재:', displayText?.length || 0, ', 필요: >50)');
        } else {
          console.log('   - 기타 조건 불충족');
        }
        console.log('⚠️ 2. 기본 일관성 체크만 수행');
        
        // 기본 누락 문장 보강 (기존 로직 유지)
        const normalize = (s) => (s || '').replace(/[\s。！？]/g, '').trim();
        const sentSplit = (s) => (s || '')
          .split(/(?<=[。！？])/)
          .map(x => x.trim())
          .filter(Boolean);

        const fullSentences = sentSplit(displayText);
        const segSentences = result.segments.map(seg => seg.text).flatMap(sentSplit);

        const normSegSet = new Set(segSentences.map(normalize).filter(Boolean));
        const missing = fullSentences.filter(s => !normSegSet.has(normalize(s)));

        // 시간 커버리지 체크 추가
        const totalDurationSec = azureResult._totalDurationSec || 0;
        const lastSegmentTime = result.segments.length > 0 ? result.segments[result.segments.length - 1].end : 0;
        const timeCoverage = totalDurationSec > 0 ? (lastSegmentTime / totalDurationSec) * 100 : 100;
        const timeGap = Math.max(0, totalDurationSec - lastSegmentTime);

        console.log(`⏱️ 시간 커버리지: ${timeCoverage.toFixed(1)}% (${lastSegmentTime.toFixed(1)}s/${totalDurationSec.toFixed(1)}s), 누락: ${timeGap.toFixed(1)}s`);

        if (missing.length > 0 || timeGap > 2.0) {
          if (missing.length > 0) {
            console.log('📝 누락 문장 발견:', missing.length, '개');
          }
          if (timeGap > 2.0) {
            console.log('⚠️ 시간 커버리지 부족: 마지막', timeGap.toFixed(1), '초 구간 누락 가능성');
          }
          
          let avgCharsPerSec = 6.0;
          try {
            const samples = result.segments
              .filter(seg => typeof seg.start === 'number' && typeof seg.end === 'number' && seg.end > seg.start && (seg.text || '').length > 0)
              .map(seg => (seg.text || '').length / Math.max(0.2, (seg.end - seg.start)));
            if (samples.length >= 3) {
              samples.sort((a, b) => a - b);
              const mid = samples[Math.floor(samples.length / 2)];
              if (Number.isFinite(mid) && mid > 0.5 && mid < 20) avgCharsPerSec = mid;
            }
          } catch {}

          const lastEnd = result.segments.length > 0 ? (result.segments[result.segments.length - 1].end || 0) : 0;
          let cursor = lastEnd;

          // 누락 문장 추가
          for (const ms of missing) {
            const dur = Math.max(1.0, Math.min(8.0, (ms.length || 1) / Math.max(0.5, avgCharsPerSec)));
            const start = cursor;
            const end = start + dur;
            result.segments.push({
              id: result.segments.length + 1,
              seek: 0,
              start,
              end,
              start_time: formatSecondsToTimeString(start),
              end_time: formatSecondsToTimeString(end),
              text: ms,
              original_text: ms,
              tokens: [],
              temperature: 0.0,
              avg_logprob: 0.6,
              compression_ratio: 1.0,
              no_speech_prob: 0.4,
              keywords: [],
              words: []
            });
            cursor = end;
          }

          // 시간 커버리지 부족 시 마지막 세그먼트를 영상 끝까지 연장 (텍스트는 그대로 유지)
          if (timeGap > 1.0 && result.segments.length > 0) {
            const lastSeg = result.segments[result.segments.length - 1];
            if (lastSeg.end < totalDurationSec - 0.5) {
              console.log(`📏 마지막 세그먼트 연장: ${lastSeg.end.toFixed(1)}s → ${totalDurationSec.toFixed(1)}s`);
              lastSeg.end = totalDurationSec;
              lastSeg.end_time = formatSecondsToTimeString(totalDurationSec);
              // 텍스트는 원래대로 유지 (전체 텍스트 반복 방지)
              lastSeg.text = lastSeg.original_text || lastSeg.text;
            }
          }

          result.text = result.segments.map(seg => seg.text).join(' ');
        }
      }
    } catch (e) {
      console.warn('⚠️ === Gemini 처리 중 예외 발생 ===');
      console.warn('⚠️ 오류 메시지:', e?.message || e);
      console.warn('⚠️ 오류 스택:', e?.stack || '스택 없음');
      console.warn('⚠️ 오류 타입:', e?.constructor?.name || '알 수 없음');
    }
    
    // 커버리지 응급 보정: 마지막 세그먼트가 실제 길이보다 짧으면 꼬리까지 늘려 잘림 방지
    try {
      const totalDurationSec = typeof azureResult._totalDurationSec === 'number' ? azureResult._totalDurationSec : undefined;
      if (totalDurationSec && Array.isArray(result.segments) && result.segments.length > 0) {
        const last = result.segments[result.segments.length - 1];
        const missing = totalDurationSec - (last.end || 0);
        const coverage = ((last.end || 0) / totalDurationSec) * 100;
        
        console.log(`📊 커버리지 체크: ${coverage.toFixed(1)}% (${(last.end || 0).toFixed(2)}초/${totalDurationSec.toFixed(2)}초), 누락: ${missing.toFixed(2)}초`);
        
        // 조건 완화: 1초 이상 누락이거나 95% 미만 커버리지면 보정
        if (missing > 1.0 || coverage < 95) {
          if (missing > 3.0) {
            // 3초 이상 누락 시 별도 세그먼트 추가
            console.log(`🔧 누락 구간 별도 세그먼트 추가: ${last.end.toFixed(2)}초 ~ ${totalDurationSec.toFixed(2)}초`);
            result.segments.push({
              id: result.segments.length + 1,
              seek: 0,
              start: last.end,
              end: totalDurationSec,
              start_time: formatSecondsToTimeString(last.end),
              end_time: formatSecondsToTimeString(totalDurationSec),
              text: '[누락된 구간 - 음성 인식 불가]',
              original_text: '[누락된 구간]',
              tokens: [],
              temperature: 0.0,
              avg_logprob: 0.5,
              compression_ratio: 1.0,
              no_speech_prob: 0.8,
              keywords: [],
              words: []
            });
          } else {
            // 3초 미만 누락 시 마지막 세그먼트 연장 (텍스트는 그대로 유지)
            console.log(`🔧 꼬리 연장 보정 적용: ${last.end.toFixed(2)}초 → ${totalDurationSec.toFixed(2)}초`);
            last.end = totalDurationSec;
            last.end_time = formatSecondsToTimeString(totalDurationSec);
            // 텍스트는 원래대로 유지 (전체 텍스트 반복 방지)
            last.text = last.original_text || last.text;
          }
        }
      }
    } catch (e) {
      console.warn('커버리지 보정 실패:', e?.message || e);
    }
    
    // 세그먼트 변경 후 전체 텍스트 업데이트
    const finalFullText = result.segments.map(seg => seg.text).join(' ');
    result.text = finalFullText;
    
    console.log('✅ 포맷팅 및 Gemini 정제 완료');
    console.log('📊 최종 세그먼트 수:', result.segments.length);
    console.log('📊 최종 커버리지:', result.segments.length > 0 ? ((result.segments[result.segments.length - 1].end / (azureResult._totalDurationSec || 1)) * 100).toFixed(1) + '%' : '0%');
    return result;

  } catch (error) {
    console.error('Format result error:', error);
    // 오류 시 기본 응답 반환
    return {
      text: azureResult.DisplayText || '음성 인식 결과',
      segments: [{
        id: 1,
        seek: 0,
        start: 0.0,
        end: 10.0,
        text: azureResult.DisplayText || '음성 인식 결과',
        tokens: [],
        temperature: 0.0,
        avg_logprob: 0.9,
        compression_ratio: 1.0,
        no_speech_prob: 0.1,
        words: []
      }],
      language: 'zh-CN',
      url: youtubeUrl,
      processed_at: new Date().toISOString()
    };
  }
}

// 세션 정보 접근 함수 (다른 API에서 사용)
export function getSession(sessionId) {
  return sessions.get(sessionId);
}

export function getAllSessions() {
  return sessions;
}

// ===== 앵커 기반 구간별 재스케일링 =====
function applyPiecewiseAnchorScalingToWords(words, totalDurationSec) {
  const TICKS = 10_000_000;
  const LONG_PAUSE_SEC = 1.2;
  const CLAMP_MIN = 0.996; // 구간별 보정은 보수적으로
  const CLAMP_MAX = 1.004;

  // 정렬 보장
  const sorted = [...words].sort((a, b) => (a.Offset || 0) - (b.Offset || 0));
  if (sorted.length < 2) return sorted;

  const anchorsTicks = [];
  const startTicks = 0;
  const endTicks = Math.max(1, Math.floor(totalDurationSec * TICKS));
  anchorsTicks.push(startTicks);

  // 긴 침묵으로 앵커 생성
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = (sorted[i - 1].Offset || 0) + (sorted[i - 1].Duration || 0);
    const curStart = sorted[i].Offset || 0;
    const gapSec = Math.max(0, (curStart - prevEnd) / TICKS);
    if (gapSec >= LONG_PAUSE_SEC) {
      anchorsTicks.push(curStart);
    }
  }
  anchorsTicks.push(endTicks);

  // 중복 제거 및 정렬
  const uniqAnchors = Array.from(new Set(anchorsTicks)).sort((a, b) => a - b);
  if (uniqAnchors.length <= 2) return sorted; // 앵커 부족 시 스킵

  const adjusted = [...sorted];

  for (let ai = 0; ai < uniqAnchors.length - 1; ai++) {
    const segStart = uniqAnchors[ai];
    const segEnd = uniqAnchors[ai + 1];
    const actualDur = Math.max(1, segEnd - segStart);

    // 이 구간의 단어 인덱스 범위 찾기
    const inSegIdx = [];
    for (let i = 0; i < adjusted.length; i++) {
      const off = adjusted[i].Offset || 0;
      if (off >= segStart && off < segEnd) inSegIdx.push(i);
    }
    if (inSegIdx.length === 0) continue;

    let predictedStart = adjusted[inSegIdx[0]].Offset || 0;
    let predictedEnd = predictedStart;
    for (const idx of inSegIdx) {
      const w = adjusted[idx];
      const wEnd = (w.Offset || 0) + (w.Duration || 0);
      if (wEnd > predictedEnd) predictedEnd = wEnd;
    }
    let predictedDur = Math.max(1, predictedEnd - predictedStart);
    let ratio = actualDur / predictedDur;
    ratio = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, ratio));

    if (Math.abs(1 - ratio) < 0.0001) continue; // 변화 미미

    // 구간 내 단어 스케일링 (세그먼트 시작 정렬)
    for (const idx of inSegIdx) {
      const w = adjusted[idx];
      const off = w.Offset || 0;
      const dur = w.Duration || 0;
      const rel = off - predictedStart;
      const newOff = Math.round(segStart + rel * ratio);
      const newDur = Math.max(0, Math.round(dur * ratio));
      w.Offset = newOff;
      w.Duration = newDur;
    }
  }

  // 단조 증가 보정(희소한 역전 방지)
  for (let i = 1; i < adjusted.length; i++) {
    const prev = adjusted[i - 1];
    const cur = adjusted[i];
    const prevEnd = (prev.Offset || 0) + (prev.Duration || 0);
    if ((cur.Offset || 0) < prevEnd) {
      cur.Offset = prevEnd;
    }
  }

  return adjusted;
}