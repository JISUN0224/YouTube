import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

// Azure Speech Services 설정
const AZURE_SUBSCRIPTION_KEY = process.env.VITE_AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.VITE_AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION || 'koreacentral';
const AZURE_ENDPOINT = `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

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
    const { url } = req.body;
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
    processVideo(sessionId, url);

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

async function processVideo(sessionId, youtubeUrl) {
  try {
    console.log('🔥🔥🔥 NEW processVideo 시작됨!!! (청크 처리 버전)');
    console.log('🔥 sessionId:', sessionId);
    console.log('🔥 youtubeUrl:', youtubeUrl);
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
    const transcriptResult = await transcribeWithAzure(audioUrl);
    console.log('🗣️ transcribeWithAzure 결과 수신');

    // 3. 결과 처리 단계
    updateSession(sessionId, {
      progress: 85,
      step: 'processing',
      message: '결과 처리 중...'
    });

    const finalResult = formatTranscriptResult(transcriptResult, youtubeUrl);
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

async function transcribeWithAzure(audioUrl) {
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

    // Azure REST API는 60초 제한이 있으므로 청크로 분할 처리 (오버랩 포함)
    const CHUNK_DURATION = 50; // 기본 청크 길이
    const OVERLAP_SECONDS = 1.5; // 청크 경계 안정화를 위한 오버랩
    const totalChunks = Math.ceil(durationInfo / CHUNK_DURATION);
    console.log('📦 청크 분할:', totalChunks, '개 청크로 처리');

    const allResults = [];
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startTime = chunkIndex * CHUNK_DURATION;
      const effectiveStart = Math.max(0, startTime - (chunkIndex === 0 ? 0 : OVERLAP_SECONDS));
      const effectiveDuration = CHUNK_DURATION + (chunkIndex === 0 ? 0 : OVERLAP_SECONDS);
      const chunkOutputPath = path.join(tmpDir, `yt_audio_chunk_${chunkIndex}_${Date.now()}.wav`);
      
      console.log(`🔄 청크 ${chunkIndex + 1}/${totalChunks} 처리 중 (${startTime}초부터)`);
      
      // 청크별로 WAV 변환 (오버랩 포함)
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-y',
          '-i', inputPath,
          '-ss', effectiveStart.toString(),
          '-t', effectiveDuration.toString(),
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
        allResults.push(chunkResult);
      }

      // 청크 파일 정리
      try { await fs.unlink(chunkOutputPath); } catch {}
    }

    // 모든 청크 결과를 병합
    console.log('🔗 청크 결과 병합 중:', allResults.length, '개 청크');
    const mergedResult = mergeChunkResults(allResults);
    
    // 임시 파일 정리
    try { await fs.unlink(inputPath); } catch {}
    
    return mergedResult;

  } catch (error) {
    console.error('Azure transcription error:', error);
    throw new Error(`Azure 음성 인식 실패: ${error.message}`);
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
      'wordLevelTimestamps': 'true'
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

// 청크 결과들을 병합하는 함수
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

    // 모든 청크의 텍스트와 단어들을 병합 (오버랩 중복 제거)
    let allDisplayText = '';
    let allWords = [];
    let lastWordGlobalEnd = -1;
    
    for (const chunk of validChunks) {
      if (chunk.DisplayText) {
        allDisplayText += chunk.DisplayText;
      }
      
      if (chunk.NBest && chunk.NBest[0] && chunk.NBest[0].Words) {
        for (const w of chunk.NBest[0].Words) {
          const start = (w.Offset || 0);
          const end = (w.Offset || 0) + (w.Duration || 0);
          // 이전 단어 글로벌 엔드와 200ms 이하로 겹치면 중복으로 간주하고 스킵
          if (lastWordGlobalEnd >= 0 && start <= lastWordGlobalEnd + 2_000_000) {
            // 단, 내용이 연속되는 경우는 유지. 여기서는 간단히 스킵
            continue;
          }
          allWords.push(w);
          lastWordGlobalEnd = end;
        }
      }
    }
    
    console.log('📝 병합된 텍스트 길이:', allDisplayText.length);
    console.log('📝 병합된 단어 수:', allWords.length);
    
    // 병합된 결과 구성
    const mergedResult = {
      DisplayText: allDisplayText,
      NBest: [{
        Display: allDisplayText,
        Lexical: allDisplayText,
        Words: allWords,
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

function formatTranscriptResult(azureResult, youtubeUrl) {
  try {
    console.log('🔄 Azure 전체 응답 분석:', JSON.stringify(azureResult, null, 2));
    
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
    const words = Array.isArray(nbest?.Words) ? nbest.Words : [];

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
    // 단어 타임스탬프를 이용해 자막 스타일로 세그먼트 분할 + 문장 경계 보정
    const formattedSegments = [];
    
    if (words.length > 0) {
      console.log('📝 단어 기반 세그먼트 분할 시작, 총 단어 수:', words.length);
      
      const SEGMENT_DURATION = 8; // 기본 세그먼트 길이
      const SENTENCE_PAUSE_SEC = 0.7; // 문장 경계로 볼 수 있는 침묵 길이
      const PHRASE_PAUSE_SEC = 0.3; // 구 절단 기준 침묵 길이
      let currentSegmentId = 1;
      let segmentStartTime = 0;
      let segmentWords = [];
      let segmentWordObjects = [];
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordStartSec = (word.Offset || 0) / 10_000_000;
        const wordEndSec = ((word.Offset || 0) + (word.Duration || 0)) / 10_000_000;
        const prevEndSec = i > 0 ? (((words[i-1].Offset || 0) + (words[i-1].Duration || 0)) / 10_000_000) : null;
        const gap = prevEndSec != null ? Math.max(0, wordStartSec - prevEndSec) : 0;
        
        // 현재 세그먼트에 단어 추가
        segmentWords.push(word.Word || '');
        segmentWordObjects.push({
          word: word.Word || '',
          start: wordStartSec,
          end: wordEndSec,
          probability: typeof word.Confidence === 'number' ? word.Confidence : 0.9,
        });
        
        // 세그먼트 종료 조건: 8초 경과, 문장 경계 침묵, 마지막 단어
        const pauseBoundary = gap >= SENTENCE_PAUSE_SEC; // 문장 경계로 간주
        const shouldEndSegment = pauseBoundary || (wordEndSec - segmentStartTime >= SEGMENT_DURATION) || (i === words.length - 1);
        
        if (shouldEndSegment && segmentWords.length > 0) {
          let segmentText = segmentWords.join(''); // 중국어는 공백 없이 연결
          // 간단한 구두점 복원: 문장 경계면 '。' 추가, 구 경계면 '，' 추가
          if (pauseBoundary) {
            if (!segmentText.endsWith('。') && !segmentText.endsWith('！') && !segmentText.endsWith('？')) {
              segmentText += '。';
            }
          } else if (gap >= PHRASE_PAUSE_SEC) {
            if (!segmentText.endsWith('，') && !segmentText.endsWith('、') && !segmentText.endsWith('。')) {
              segmentText += '，';
            }
          }
          const segmentEndTime = wordEndSec;
          
          formattedSegments.push({
            id: currentSegmentId,
            seek: 0,
            start: segmentStartTime,
            end: segmentEndTime,
            start_time: formatSecondsToTimeString(segmentStartTime),
            end_time: formatSecondsToTimeString(segmentEndTime),
            text: segmentText,
            original_text: segmentText,
            tokens: [],
            temperature: 0.0,
            avg_logprob: typeof nbest?.Confidence === 'number' ? nbest.Confidence : 0.9,
            compression_ratio: 1.0,
            no_speech_prob: 0.1,
            keywords: [],
            words: [...segmentWordObjects] // 복사본 생성
          });
          
          console.log(`📋 세그먼트 ${currentSegmentId}: ${formatSecondsToTimeString(segmentStartTime)} - ${formatSecondsToTimeString(segmentEndTime)} (${segmentWords.length}단어)`);
          
          // 다음 세그먼트 준비
          currentSegmentId++;
          segmentStartTime = segmentEndTime;
          segmentWords = [];
          segmentWordObjects = [];
        }
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

    const result = {
      text: displayText,
      segments: formattedSegments,
      language: 'zh-CN',  // 중국어 간체로 명시
      url: youtubeUrl,
      processed_at: new Date().toISOString()
    };
    
    console.log('✅ 포맷팅 완료:', result);
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
      language: 'zh',
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
