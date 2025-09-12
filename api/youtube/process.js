import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// Azure Speech Services 설정
const AZURE_SUBSCRIPTION_KEY = process.env.VITE_AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.VITE_AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION || 'eastasia';
const AZURE_ENDPOINT = `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v`;

// 디버깅용 로그
console.log('🔧 [DEBUG] 환경 변수 상태:');
console.log('VITE_AZURE_SPEECH_KEY:', process.env.VITE_AZURE_SPEECH_KEY ? '✅ 있음 (길이: ' + process.env.VITE_AZURE_SPEECH_KEY.length + ')' : '❌ 없음');
console.log('AZURE_SPEECH_KEY:', process.env.AZURE_SPEECH_KEY ? '✅ 있음' : '❌ 없음');
console.log('VITE_AZURE_SPEECH_REGION:', process.env.VITE_AZURE_SPEECH_REGION || '❌ 없음');
console.log('최종 사용할 키:', AZURE_SUBSCRIPTION_KEY ? '✅ 있음' : '❌ 없음');
console.log('최종 사용할 지역:', AZURE_REGION);

// 진행 상태를 저장할 메모리 스토어 (실제 배포시에는 Redis나 DB 사용)
const sessions = new Map();

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
      '--cookies-from-browser', 'chrome',
      '--extractor-args', 'youtube:player_client=web',
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
      '--cookies-from-browser', 'chrome',
      '--extractor-args', 'youtube:player_client=web',
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

      // Azure API 호출 (실제 시작 시간과 지속 시간을 전달)
      const chunkResult = await processChunkWithAzure(chunkWavBuffer, effectiveStart, effectiveDuration);
      console.log(`🔍 청크 ${chunkIndex + 1} 원본 결과:`, chunkResult);
      if (chunkResult) {
        // 청크 메타 추가 (전역 재정렬/드리프트 보정용)
        chunkResult._chunk = { start: effectiveStart, end };
        allResults.push(chunkResult);
      }

      try { await fs.unlink(chunkOutputPath); } catch {}
    }

    // 모든 청크 결과를 병합
    console.log('🔗 청크 결과 병합 중:', allResults.length, '개 청크');
    const mergedResult = mergeChunkResultsFixed(allResults);
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

// Azure SDK 다중 결과 올바른 수집 및 병합
async function processChunkWithAzureFixed(wavBuffer, chunkStartTime) {
  try {
    const AZURE_REGION = process.env.VITE_AZURE_SPEECH_REGION || 'eastasia';
    const AZURE_SUBSCRIPTION_KEY = process.env.VITE_AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
    
    if (!AZURE_SUBSCRIPTION_KEY) {
      throw new Error('Azure Speech API 키가 설정되지 않았습니다');
    }

    console.log(`🌐 청크 Azure SDK 호출 (시작시간: ${chunkStartTime}초)`);
    
    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SUBSCRIPTION_KEY, AZURE_REGION);
      speechConfig.speechRecognitionLanguage = 'zh-CN';
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EnableDictation, 'true');
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EnableAutomaticPunctuation, 'true');
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EnableWordLevelTimestamps, 'true');
      
      const pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      
      // 🎯 모든 인식 결과를 수집할 배열
      const allSegments = [];
      let sessionEnded = false;
      let timeoutHandle = null;
      
      // 🎯 인식 결과 이벤트 - 모든 결과를 순서대로 수집
      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const resultText = e.result.text;
          if (resultText && resultText.trim().length > 0) {
            const segmentData = {
              text: resultText,
              confidence: 0.9,
              timestamp: Date.now(),
              order: allSegments.length // 순서 보장
            };
            
            allSegments.push(segmentData);
            console.log(`✅ 청크 SDK 세그먼트 ${allSegments.length} 수집: "${resultText}"`);
          }
        }
      };
      
      // 오류 처리
      recognizer.canceled = (s, e) => {
        console.error(`❌ 청크 SDK 오류 (시작: ${chunkStartTime}초):`, e.reason);
        if (!sessionEnded) {
          sessionEnded = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          finalizeResults();
        }
      };
      
      // 세션 종료 처리
      recognizer.sessionStopped = (s, e) => {
        console.log(`🏁 청크 SDK 세션 종료 (시작: ${chunkStartTime}초) - 수집된 세그먼트: ${allSegments.length}개`);
        if (!sessionEnded) {
          sessionEnded = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          finalizeResults();
        }
      };
      
      // 🎯 최종 결과 처리 함수
      function finalizeResults() {
        if (allSegments.length === 0) {
          console.log(`⚠️ 청크 ${chunkStartTime}초 - 세그먼트 없음`);
          resolve(null);
          return;
        }
        
        console.log(`🔗 청크 내 ${allSegments.length}개 세그먼트 병합 시작`);
        
        // 🎯 순서대로 정렬 (timestamp 기준)
        allSegments.sort((a, b) => a.order - b.order);
        
        // 🎯 텍스트를 자연스럽게 연결 (공백으로 구분)
        const mergedText = allSegments.map(seg => seg.text).join(' ');
        
        console.log(`✅ 청크 내 세그먼트 병합 완료: "${mergedText.slice(0, 100)}..."`);
        
        // 🎯 병합된 단어 생성
        const mergedWords = generateEnhancedWordsFromSegments(allSegments, chunkStartTime);
        
        // REST API 형식 반환
        const result = {
          DisplayText: mergedText,
          NBest: [{
            Display: mergedText,
            Lexical: mergedText,
            Confidence: calculateAverageConfidence(allSegments),
            Words: mergedWords
          }],
          RecognitionStatus: 'Success',
          _chunk: { start: chunkStartTime, end: chunkStartTime + 55 },
          _source: 'sdk_multi_segment',
          _segmentCount: allSegments.length,
          _originalSegments: allSegments // 디버깅용
        };
        
        resolve(result);
      }
      
      // 인식 시작
      recognizer.startContinuousRecognitionAsync(() => {
        console.log(`🎤 청크 ${chunkStartTime}초 연속 인식 시작`);
        
        // WAV 데이터 전송
        pushStream.write(wavBuffer);
        pushStream.close();
        
        // 타임아웃 설정 (60초)
        timeoutHandle = setTimeout(() => {
          if (!sessionEnded) {
            console.log(`⏰ 청크 ${chunkStartTime}초 타임아웃, 강제 종료`);
            recognizer.stopContinuousRecognitionAsync();
            
            // 추가 대기 후 결과 처리
            setTimeout(() => {
              if (!sessionEnded) {
                sessionEnded = true;
                if (allSegments.length > 0) {
                  console.log(`⚠️ 오류 발생했지만 ${allSegments.length}개 세그먼트 수집됨 - 부분 결과 반환`);
                  finalizeResults();
                } else {
                  resolve(null);
                }
              }
            }, 2000);
          }
        }, 60000);
        
      }, (error) => {
        console.error(`❌ 청크 SDK 시작 오류:`, error);
        reject(error);
      });
    });

  } catch (error) {
    console.error(`청크 Azure SDK 처리 오류:`, error);
    return null;
  }
}

// 🎯 세그먼트들로부터 향상된 단어 생성
function generateEnhancedWordsFromSegments(segments, chunkStartTime) {
  const words = [];
  const startOffsetTicks = chunkStartTime * 10_000_000;
  let currentOffset = startOffsetTicks;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.text || '';
    const characters = Array.from(text);
    
    // 세그먼트 시작 시간 조정 (이전 세그먼트와 약간의 간격)
    if (i > 0) {
      currentOffset += 5000000; // 0.5초 간격
    }
    
    for (const char of characters) {
      if (!char.trim()) continue;
      
      let duration;
      if (/[。！？]/.test(char)) {
        duration = 5000000; // 0.5초
      } else if (/[，、；：]/.test(char)) {
        duration = 2000000; // 0.2초
      } else if (/[0-9]/.test(char)) {
        duration = 3500000; // 0.35초
      } else {
        duration = 3000000; // 0.3초
      }
      
      words.push({
        Word: char,
        Offset: currentOffset,
        Duration: duration,
        Confidence: segment.confidence || 0.9
      });
      
      currentOffset += duration;
    }
  }
  
  console.log(`✅ 향상된 Words 생성: ${words.length}개 (${segments.length}개 세그먼트에서)`);
  return words;
}

// 평균 신뢰도 계산
function calculateAverageConfidence(segments) {
  if (segments.length === 0) return 0.9;
  
  const totalConfidence = segments.reduce((sum, seg) => sum + (seg.confidence || 0.9), 0);
  return totalConfidence / segments.length;
}

// 🎯 기존 processChunkWithAzure 함수를 이것으로 교체
async function processChunkWithAzure(wavBuffer, chunkStartTime, chunkDuration) {
  return await processChunkWithAzureFixed(wavBuffer, chunkStartTime);
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
              const normalized = sentence.replace(/\s/g, '').trim(); // 구두점 제거하지 않음
      if (normalized.length === 0) continue;
      
      // 이미 있는 문장과 유사도 체크
      let isDuplicate = false;
      let duplicateMatch = '';
      let replaceExisting = false;
      let replaceIndex = -1;
      
      for (let i = 0; i < uniqueSentences.length; i++) {
        const existing = uniqueSentences[i];
        const existingNorm = existing.replace(/\s/g, '').trim(); // 구두점 제거하지 않음
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

// 1. SDK 결과 구조 파악 및 변환 함수
function convertSDKResultToRESTFormat(sdkResults, chunkStartTime) {
  console.log(`🔄 SDK 결과 변환 시작 (청크 ${chunkStartTime}초)`);
  console.log('📊 SDK 결과 구조 분석:', {
    type: typeof sdkResults,
    length: Array.isArray(sdkResults) ? sdkResults.length : 'N/A',
    keys: typeof sdkResults === 'object' ? Object.keys(sdkResults) : 'N/A'
  });
  
  // SDK 결과가 배열인 경우 (여러 결과)
  if (Array.isArray(sdkResults)) {
    console.log(`📝 SDK 배열 결과 ${sdkResults.length}개 처리`);
    
    // 모든 텍스트 결합
    const allTexts = sdkResults.filter(result => result && typeof result === 'string');
    const combinedText = allTexts.join(' ');
    
    console.log(`✅ SDK 결합 텍스트: "${combinedText}"`);
    console.log(`📊 구두점 개수: ${(combinedText.match(/[。，！？；]/g) || []).length}개`);
    
    // REST API 형식으로 변환
    const restFormat = {
      DisplayText: combinedText,
      NBest: [{
        Display: combinedText,
        Lexical: combinedText,
        Confidence: 0.9,
        Words: generateWordsFromText(combinedText, chunkStartTime)
      }],
      RecognitionStatus: 'Success'
    };
    
    return restFormat;
  }
  
  // SDK 결과가 객체인 경우
  if (typeof sdkResults === 'object' && sdkResults !== null) {
    console.log('📊 SDK 객체 결과 분석:', sdkResults);
    
    // SDK 결과에서 텍스트 추출
    const text = sdkResults.text || sdkResults.DisplayText || sdkResults.result || '';
    
    if (text) {
      console.log(`✅ SDK 추출 텍스트: "${text}"`);
      
      return {
        DisplayText: text,
        NBest: [{
          Display: text,
          Lexical: text,
          Confidence: sdkResults.confidence || 0.9,
          Words: sdkResults.words || generateWordsFromText(text, chunkStartTime)
        }],
        RecognitionStatus: 'Success'
      };
    }
  }
  
  // SDK 결과가 문자열인 경우
  if (typeof sdkResults === 'string') {
    console.log(`✅ SDK 문자열 결과: "${sdkResults}"`);
    
    return {
      DisplayText: sdkResults,
      NBest: [{
        Display: sdkResults,
        Lexical: sdkResults,
        Confidence: 0.9,
        Words: generateWordsFromText(sdkResults, chunkStartTime)
      }],
      RecognitionStatus: 'Success'
    };
  }
  
  console.warn('⚠️ SDK 결과 형식을 인식할 수 없음:', sdkResults);
  return null;
}

// 2. 텍스트에서 Words 배열 생성 함수
function generateWordsFromText(text, chunkStartTime) {
  if (!text || typeof text !== 'string') return [];
  
  console.log(`🔧 텍스트에서 Words 생성: "${text.slice(0, 50)}..."`);
  
  const words = [];
  const characters = Array.from(text); // 유니코드 문자 정확히 분리
  const startOffsetTicks = chunkStartTime * 10_000_000; // 청크 시작 시간 오프셋
  
  let currentOffset = startOffsetTicks;
  const avgCharDurationTicks = 3000000; // 평균 0.3초/문자 (중국어 기준)
  
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    
    // 공백이나 빈 문자 스킵
    if (!char.trim()) continue;
    
    const word = {
      Word: char,
      Offset: currentOffset,
      Duration: avgCharDurationTicks,
      Confidence: 0.9
    };
    
    words.push(word);
    currentOffset += avgCharDurationTicks;
  }
  
  console.log(`✅ Words 생성 완료: ${words.length}개 단어`);
  return words;
}

// 3. 수정된 청크 병합 함수
function mergeChunkResultsFixed(chunkResults) {
  try {
    console.log('🔗 청크 병합 시작 (SDK 호환), 유효한 청크 수:', chunkResults.filter(r => r).length);
    
    const validChunks = chunkResults.filter(chunk => {
      if (!chunk) return false;
      
      // REST API 형식 체크
      if (chunk.NBest && chunk.NBest[0]) return true;
      
      // SDK 형식 체크 (문자열, 배열, 객체)
      if (typeof chunk === 'string' && chunk.trim() !== '') return true;
      if (Array.isArray(chunk) && chunk.length > 0) return true;
      if (typeof chunk === 'object' && (chunk.text || chunk.DisplayText)) return true;
      
      return false;
    });
    
    if (validChunks.length === 0) {
      console.warn('⚠️ 유효한 청크가 없음');
      return {
        DisplayText: '',
        NBest: [],
        RecognitionStatus: 'NoMatch'
      };
    }

    console.log(`📋 유효한 청크 형식 분석:`);
    validChunks.forEach((chunk, i) => {
      const type = Array.isArray(chunk) ? 'array' : typeof chunk;
      console.log(`   청크 ${i + 1}: ${type} - ${JSON.stringify(chunk).slice(0, 50)}...`);
    });

    // 모든 청크의 텍스트 수집 (개선된 버전)
    let allTexts = [];
    let allWords = [];
    
    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      let chunkTexts = [];
      let chunkWords = [];
      
      // REST API 형식
      if (chunk.NBest && chunk.NBest[0]) {
        const text = chunk.NBest[0].Display || chunk.NBest[0].Lexical || chunk.DisplayText || '';
        if (text.trim()) {
          chunkTexts.push(text.trim());
        }
        chunkWords = chunk.NBest[0].Words || [];
      }
      // SDK 문자열 형식
      else if (typeof chunk === 'string') {
        if (chunk.trim()) {
          chunkTexts.push(chunk.trim());
        }
        chunkWords = generateWordsFromText(chunk, i * 55);
      }
      // SDK 배열 형식
      else if (Array.isArray(chunk)) {
        const texts = chunk.filter(item => typeof item === 'string' && item.trim());
        if (texts.length > 0) {
          chunkTexts.push(...texts);
        }
        chunkWords = generateWordsFromText(texts.join(' '), i * 55);
      }
      // SDK 객체 형식
      else if (typeof chunk === 'object') {
        const text = chunk.text || chunk.DisplayText || chunk.result || '';
        if (text.trim()) {
          chunkTexts.push(text.trim());
        }
        chunkWords = chunk.words || generateWordsFromText(text, i * 55);
      }
      
      // 청크의 모든 텍스트를 추가
      if (chunkTexts.length > 0) {
        allTexts.push(...chunkTexts);
        console.log(`✅ 청크 ${i + 1} 텍스트들 (${chunkTexts.length}개):`);
        chunkTexts.forEach((text, idx) => {
          console.log(`   ${idx + 1}. "${text.slice(0, 50)}..."`);
          console.log(`   📊 구두점: ${(text.match(/[。，！？；]/g) || []).length}개`);
        });
      }
      
      if (chunkWords.length > 0) {
        allWords.push(...chunkWords);
      }
    }
    
    // 전체 텍스트 결합
    const combinedText = allTexts.join(' ');
    
    console.log(`📝 병합 결과:`);
    console.log(`   - 총 청크: ${validChunks.length}개`);
    console.log(`   - 텍스트 길이: ${combinedText.length}자`);
    console.log(`   - 단어 수: ${allWords.length}개`);
    console.log(`   - 구두점 수: ${(combinedText.match(/[。，！？；]/g) || []).length}개`);
    console.log(`   - 샘플: "${combinedText.slice(0, 100)}..."`);
    
    // 단어가 없으면 텍스트에서 생성
    if (allWords.length === 0 && combinedText) {
      console.log('🔧 단어 정보 없음, 텍스트에서 생성');
      allWords = generateWordsFromText(combinedText, 0);
    }
    
    // 최종 결과 구성
    const mergedResult = {
      DisplayText: combinedText,
      NBest: [{
        Display: combinedText,
        Lexical: combinedText,
        Words: allWords,
        Confidence: 0.9
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

// 🎯 완벽한 동기화 포맷팅 시스템
async function formatTranscriptResultWithPerfectSync(azureResult, youtubeUrl) {
  try {
    console.log('🔄 완벽한 동기화 포맷팅 시작');
    
    // 1. 텍스트 추출
    let rawText = extractCleanText(azureResult);
    if (!rawText) {
      return createErrorResult(youtubeUrl, '음성 인식 결과가 없습니다');
    }
    
    console.log(`📝 추출된 텍스트: ${rawText.length}자`);
    console.log(`📝 미리보기: "${rawText.slice(0, 150)}..."`);
    
    // 2. 안전한 텍스트 정제
    let enhancedText = performSafeTextCleanup(rawText);
    console.log(`✨ 정제된 텍스트: ${enhancedText.length}자`);
    
    // 3. 완벽한 동기화 세그먼트 생성
    const totalDuration = azureResult._totalDurationSec || 0;
    const segments = generatePerfectlySyncedSegments(enhancedText, totalDuration);
    
    // 4. 최종 검증
    const validationResult = performFinalValidation(segments, totalDuration);
    if (!validationResult.isValid) {
      console.warn('⚠️ 검증 실패, 안전 모드로 재생성');
      const safeSegments = generateSafeSegments(enhancedText, totalDuration);
      return buildFinalResult(enhancedText, safeSegments, youtubeUrl);
    }
    
    return buildFinalResult(enhancedText, segments, youtubeUrl);
    
  } catch (error) {
    console.error('완벽한 동기화 포맷팅 오류:', error);
    return createErrorResult(youtubeUrl, `처리 오류: ${error.message}`);
  }
}

// 🎯 깨끗한 텍스트 추출
function extractCleanText(azureResult) {
  let text = '';
  
  if (azureResult.DisplayText) {
    text = azureResult.DisplayText;
  } else if (azureResult.NBest?.[0]) {
    text = azureResult.NBest[0].Display || azureResult.NBest[0].Lexical || '';
  }
  
  // 단어에서 재구성 (필요시)
  if ((!text || text.trim() === '') && azureResult.NBest?.[0]?.Words) {
    const words = azureResult.NBest[0].Words;
    text = words.map(w => w.Word || '').join('');
    console.log('🔧 단어에서 텍스트 재구성');
  }
  
  return text?.trim() || '';
}

// 🎯 안전한 텍스트 정제
function performSafeTextCleanup(text) {
  let cleaned = text;
  
  // 최소한의 안전한 정제만
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/球，/g, '');
  cleaned = cleaned.replace(/^[，。、；：\s]+/g, '');
  cleaned = cleaned.replace(/[，。、；：\s]+$/g, '');
  
  // 기본 오류 수정
  const safeFixes = [
    [/断开拓奋进/g, '不断开拓奋进'],
    [/狼官牙兵/g, '狼牙'],
    [/血血荣光/g, '血与荣光']
  ];
  
  safeFixes.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern, replacement);
  });
  
  // 문장 끝 확인
  if (cleaned && !cleaned.match(/[。！？]$/)) {
    cleaned += '。';
  }
  
  console.log('🔧 안전한 정제 완료');
  return cleaned;
}

// 🎯 완벽하게 동기화된 세그먼트 생성
function generatePerfectlySyncedSegments(text, totalDuration) {
  console.log('📝 완벽한 동기화 세그먼트 생성');
  
  // 문장 분할
  const sentences = text
    .split(/(?<=[。！？])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (sentences.length === 0) {
    return [createSingleSegment(text, 0, totalDuration || 10)];
  }
  
  console.log(`📄 ${sentences.length}개 문장 분할:`);
  sentences.forEach((sentence, i) => {
    console.log(`   ${i + 1}. "${sentence.slice(0, 40)}..." (${sentence.length}자)`);
  });
  
  // 🎯 시간 배분 계산
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const timePerChar = totalDuration > 0 ? totalDuration / totalChars : 0.15;
  
  console.log(`⏱️ 시간 배분: 총 ${totalChars}자, ${timePerChar.toFixed(3)}초/자`);
  
  const segments = [];
  let currentTime = 0;
  
  // 🎯 각 문장에 비례적 시간 할당
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const startTime = currentTime;
    
    // 문장 길이에 비례한 시간 계산 (최소 1초, 최대 30초)
    const baseDuration = sentence.length * timePerChar;
    const duration = Math.max(1.0, Math.min(30.0, baseDuration));
    const endTime = startTime + duration;
    
    segments.push({
      id: i + 1,
      seek: 0,
      start: startTime,
      end: endTime,
      text: sentence,
      start_time: formatSecondsToTimeStringPrecise(startTime),
      end_time: formatSecondsToTimeStringPrecise(endTime),
      original_text: sentence,
      tokens: [],
      temperature: 0.0,
      avg_logprob: 0.85,
      compression_ratio: 1.0,
      no_speech_prob: 0.1,
      keywords: extractBasicKeywords(sentence),
      words: []
    });
    
    console.log(`✅ 세그먼트 ${i + 1}: [${startTime.toFixed(3)} → ${endTime.toFixed(3)}] "${sentence.slice(0, 30)}..."`);
    
    // 🎯 다음 세그먼트는 정확히 이어서 시작
    currentTime = endTime;
  }
  
  // 🎯 마지막 세그먼트 시간 조정
  if (totalDuration > 0 && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    const timeDiff = totalDuration - lastSegment.end;
    
    if (Math.abs(timeDiff) > 0.1) {
      console.log(`🔧 마지막 세그먼트 조정: ${lastSegment.end.toFixed(3)} → ${totalDuration.toFixed(3)}`);
      lastSegment.end = totalDuration;
      lastSegment.end_time = formatSecondsToTimeStringPrecise(totalDuration);
    }
  }
  
  return segments;
}

// 🎯 최종 검증
function performFinalValidation(segments, totalDuration) {
  console.log('🔍 최종 검증 수행');
  
  const issues = [];
  
  // 1. 연속성 검증
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];
    const gap = Math.abs(next.start - current.end);
    
    if (gap > 0.001) {
      issues.push(`세그먼트 ${i + 1}-${i + 2} 간격: ${gap.toFixed(3)}초`);
    }
  }
  
  // 2. 시간 순서 검증
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.start >= segment.end) {
      issues.push(`세그먼트 ${i + 1} 시간 오류: start=${segment.start}, end=${segment.end}`);
    }
  }
  
  // 3. 전체 시간 검증
  if (segments.length > 0 && totalDuration > 0) {
    const lastEnd = segments[segments.length - 1].end;
    const timeDiff = Math.abs(lastEnd - totalDuration);
    if (timeDiff > 1.0) {
      issues.push(`전체 시간 불일치: ${lastEnd.toFixed(3)} vs ${totalDuration.toFixed(3)}`);
    }
  }
  
  // 4. 텍스트 검증
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment.text || segment.text.trim().length === 0) {
      issues.push(`세그먼트 ${i + 1} 빈 텍스트`);
    }
  }
  
  if (issues.length > 0) {
    console.warn('⚠️ 검증 이슈 발견:');
    issues.forEach(issue => console.warn(`   - ${issue}`));
    return { isValid: false, issues };
  }
  
  console.log('✅ 모든 검증 통과');
  return { isValid: true, issues: [] };
}

// 🎯 안전 모드 세그먼트 생성
function generateSafeSegments(text, totalDuration) {
  console.log('🛡️ 안전 모드 세그먼트 생성');
  
  const maxSegments = 10; // 최대 10개 세그먼트
  const segmentDuration = totalDuration > 0 ? totalDuration / maxSegments : 6.0;
  
  const sentences = text.split(/(?<=[。！？])/).filter(s => s.trim());
  const segmentsPerGroup = Math.ceil(sentences.length / maxSegments);
  
  const segments = [];
  let currentTime = 0;
  
  for (let i = 0; i < maxSegments; i++) {
    const startIdx = i * segmentsPerGroup;
    const endIdx = Math.min(startIdx + segmentsPerGroup, sentences.length);
    
    if (startIdx >= sentences.length) break;
    
    const groupText = sentences.slice(startIdx, endIdx).join(' ');
    const startTime = currentTime;
    const endTime = startTime + segmentDuration;
    
    segments.push(createSingleSegment(groupText, startTime, endTime, i + 1));
    currentTime = endTime;
  }
  
  // 마지막 세그먼트 시간 조정
  if (segments.length > 0 && totalDuration > 0) {
    segments[segments.length - 1].end = totalDuration;
    segments[segments.length - 1].end_time = formatSecondsToTimeStringPrecise(totalDuration);
  }
  
  console.log(`🛡️ 안전 모드: ${segments.length}개 세그먼트 생성`);
  return segments;
}

// 🎯 단일 세그먼트 생성
function createSingleSegment(text, startTime, endTime, id = 1) {
  return {
    id: id,
    seek: 0,
    start: startTime,
    end: endTime,
    text: text.trim(),
    start_time: formatSecondsToTimeStringPrecise(startTime),
    end_time: formatSecondsToTimeStringPrecise(endTime),
    original_text: text.trim(),
    tokens: [],
    temperature: 0.0,
    avg_logprob: 0.85,
    compression_ratio: 1.0,
    no_speech_prob: 0.1,
    keywords: [],
    words: []
  };
}

// 🎯 기본 키워드 추출
function extractBasicKeywords(text) {
  const keywords = [];
  const patterns = [
    /八路军/g, /狼牙山/g, /五壮士/g, /连队/g, /战士/g,
    /\d{4}年/g, /\d+月/g, /\d+日/g
  ];
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) keywords.push(...matches);
  });
  
  return [...new Set(keywords)];
}

// 🎯 최종 결과 구성
function buildFinalResult(text, segments, youtubeUrl) {
  return {
    text: text,
    segments: segments,
    language: 'zh-CN',
    url: youtubeUrl,
    processed_at: new Date().toISOString(),
    source: 'perfect_sync_processing',
    sync_info: {
      total_segments: segments.length,
      total_duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
      avg_segment_duration: segments.length > 0 ? segments.reduce((sum, s) => sum + (s.end - s.start), 0) / segments.length : 0,
      continuous: true
    }
  };
}

// 🎯 오류 결과 생성
function createErrorResult(youtubeUrl, message) {
  return {
    text: message,
    segments: [{
      id: 1,
      seek: 0,
      start: 0.0,
      end: 10.0,
      text: message,
      start_time: formatSecondsToTimeStringPrecise(0),
      end_time: formatSecondsToTimeStringPrecise(10),
      original_text: message,
      tokens: [],
      temperature: 0.0,
      avg_logprob: 0.9,
      compression_ratio: 1.0,
      no_speech_prob: 0.1,
      keywords: [],
      words: []
    }],
    language: 'zh-CN',
    url: youtubeUrl,
    processed_at: new Date().toISOString(),
    source: 'error_processing'
  };
}

// 🎯 정밀한 시간 포맷팅 함수
function formatSecondsToTimeStringPrecise(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

// 🎯 메인 함수 교체
async function formatTranscriptResult(azureResult, youtubeUrl) {
  return await formatTranscriptResultWithPerfectSync(azureResult, youtubeUrl);
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