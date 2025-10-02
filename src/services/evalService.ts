import { evaluateContentWithAI } from './contentEvalService';
// Optional: Azure Speech SDK WS path (better CORS behavior)
let SpeechSDK: any;
try {
  SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk');
} catch {}

export type LangCode = 'ko' | 'zh';

export interface AzureWordDetail {
  word: string;
  accuracy: number;
  errorType?: string;
  offsetMs?: number;
  durationMs?: number;
  phonemes?: Array<{ phoneme: string; accuracy?: number }>;
}

export interface PronunciationScores {
  accuracy: number;
  fluency: number;
  prosody?: number;
  completeness?: number;
  source?: 'azure' | 'heuristic';
  words?: AzureWordDetail[];
  longPauses?: Array<{ startMs: number; durationMs: number }>;
}

export interface ContentScores {
  accuracy: number;
  completeness: number;
  fluency: number;
  summary?: string;
  tips?: string;
  details?: string[];
  accuracyComment?: string;
  completenessComment?: string;
  fluencyComment?: string;
}

export interface EvaluationResult {
  pronunciation?: PronunciationScores;
  content?: ContentScores;
  overall?: number;
}

function clamp100(n: any): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function languageToAzureLocale(lang: LangCode): string {
  return lang === 'zh' ? 'zh-CN' : 'ko-KR';
}

// Convert recorded audio (webm/ogg/opus) to WAV(PCM16, mono) for Azure SDK/REST compatibility
async function convertToWav(input: Blob): Promise<Blob> {
  try {
    if ((input.type || '').includes('wav')) return input;
    const arrayBuf = await input.arrayBuffer();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const OfflineCtx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx) return input; // environment does not support
    const ctx = new AudioCtx();
    const decoded: AudioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    ctx.close?.();
    const channels = 1;
    const offline = new OfflineCtx(channels, decoded.length, decoded.sampleRate);
    const src = offline.createBufferSource();
    // Downmix to mono by averaging channels
    const mono = offline.createGain();
    src.buffer = decoded;
    src.connect(mono);
    mono.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const ch = rendered.getChannelData(0);
    // Encode PCM16
    const pcm = new ArrayBuffer(ch.length * 2);
    const view = new DataView(pcm);
    let offset = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    // WAV header
    const header = new ArrayBuffer(44);
    const h = new DataView(header);
    const sampleRate = rendered.sampleRate;
    h.setUint32(0, 0x52494646, false); // 'RIFF'
    h.setUint32(4, 36 + pcm.byteLength, true);
    h.setUint32(8, 0x57415645, false); // 'WAVE'
    h.setUint32(12, 0x666d7420, false); // 'fmt '
    h.setUint32(16, 16, true); // PCM chunk size
    h.setUint16(20, 1, true); // PCM format
    h.setUint16(22, 1, true); // mono
    h.setUint32(24, sampleRate, true);
    h.setUint32(28, sampleRate * 2, true); // byte rate
    h.setUint16(32, 2, true); // block align
    h.setUint16(34, 16, true); // bits per sample
    h.setUint32(36, 0x64617461, false); // 'data'
    h.setUint32(40, pcm.byteLength, true);
    const wav = new Blob([header, pcm], { type: 'audio/wav' });
    // debug trimmed
    return wav;
  } catch (e) {
    // debug trimmed
    return input;
  }
}

async function tryAzureUnscriptedPronunciationAssessment(_audio: Blob, language: LangCode): Promise<PronunciationScores | null> {
  const key = import.meta.env.VITE_AZURE_SPEECH_KEY as string | undefined;
  const region = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined;
  if (!key || !region || !SpeechSDK) return null;
  try {
    // console debug trimmed in production usage
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = languageToAzureLocale(language);
    // Use recorded audio rather than live mic. Convert to WAV for SDK compatibility.
    const wav = await convertToWav(_audio);
    const file = new File([wav], 'recording.wav', { type: 'audio/wav' });
    const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(file);
    const paConfig = new SpeechSDK.PronunciationAssessmentConfig(
      '',
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Word,
      false
    );
    try { paConfig.phonemeAlphabet = SpeechSDK.PronunciationAssessmentPhonemeAlphabet.IPA; } catch {}
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    paConfig.applyTo(recognizer);
    const result: any = await new Promise((resolve) => {
      recognizer.recognizeOnceAsync((r: any) => resolve(r), (e: any) => resolve({ errorDetails: String(e || '') }));
    });
    try { recognizer.close(); } catch {}
    if (result?.errorDetails) throw new Error(result.errorDetails);
    const detailJson = result?.properties?.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
    const data = detailJson ? JSON.parse(detailJson) : {};
    const nbest = data?.NBest?.[0] || {};
    const pa = nbest?.PronunciationAssessment || data?.PronunciationAssessment || {};
    // Words with timing in 100-ns units -> ms
    const rawWords: any[] = Array.isArray(nbest?.Words) ? nbest.Words : [];
    const words: AzureWordDetail[] = rawWords.map((w: any) => {
      const wpa = w?.PronunciationAssessment || {};
      return {
        word: String(w?.Word ?? w?.word ?? ''),
        accuracy: clamp100(wpa?.AccuracyScore ?? wpa?.Accuracy ?? 0),
        errorType: wpa?.ErrorType || w?.ErrorType,
        offsetMs: typeof w?.Offset === 'number' ? Math.round(w.Offset / 10000) : undefined,
        durationMs: typeof w?.Duration === 'number' ? Math.round(w.Duration / 10000) : undefined,
        phonemes: Array.isArray(w?.Syllables)
          ? ([] as any[]).concat(...w.Syllables.map((s: any) => Array.isArray(s?.Phonemes) ? s.Phonemes : [])).map((p: any) => ({
              phoneme: String(p?.Phoneme || p?.phoneme || ''),
              accuracy: clamp100(p?.AccuracyScore ?? p?.Accuracy ?? 0),
            }))
          : undefined,
      } as AzureWordDetail;
    });
    // Long pauses from gaps between word end and next word start
    // Long pauses from gaps between word end and next word start (client-side prosody hint)
    const pauses: Array<{ startMs: number; durationMs: number; beforeWord?: string; afterWord?: string }> = [];
    for (let i = 0; i < words.length - 1; i++) {
      const curEnd = (words[i].offsetMs ?? 0) + (words[i].durationMs ?? 0);
      const nextStart = words[i + 1].offsetMs ?? curEnd;
      const gap = nextStart - curEnd;
      if (gap >= 500) {
        pauses.push({ startMs: curEnd, durationMs: gap, beforeWord: words[i].word, afterWord: words[i + 1].word });
      }
    }
    return {
      accuracy: clamp100(pa?.AccuracyScore ?? pa?.Accuracy ?? 0),
      fluency: clamp100(pa?.FluencyScore ?? pa?.Fluency ?? 0),
      source: 'azure',
      words,
      longPauses: pauses,
    };
  } catch (e) {
    // swallow detailed logs; return null to fallback
    return null;
  }
}

function heuristicPronunciationFromText(hypo: string, ref: string): PronunciationScores {
  const clean = (s: string) => (s || '').replace(/\s+/g, '').trim();
  const h = clean(hypo);
  const r = clean(ref);
  if (!h || !r) return { accuracy: 0, fluency: 0, prosody: 0, completeness: 0 };
  let match = 0;
  const len = Math.min(h.length, r.length);
  for (let i = 0; i < len; i++) if (h[i] === r[i]) match++;
  const acc = (match / r.length) * 100;
  const flu = Math.min(100, (h.length / Math.max(1, r.length)) * 100);
  return { accuracy: clamp100(acc), fluency: clamp100(flu * 0.9), prosody: clamp100(flu * 0.85), completeness: clamp100((h.length / r.length) * 100), source: 'heuristic' };
}

export async function evaluatePronunciation(audio: Blob | null, recognizedText: string, language: LangCode): Promise<PronunciationScores> {
  if (audio) {
    const azure = await tryAzureUnscriptedPronunciationAssessment(audio, language);
    if (azure) return azure;
  }
  return heuristicPronunciationFromText(recognizedText, recognizedText);
}

export async function evaluateContent(recognizedText: string, referenceText: string, language: LangCode): Promise<ContentScores> {
  // Delegate to AI model
  const res = await evaluateContentWithAI({ reference: referenceText || '', hypothesis: recognizedText || '', language });
  const toScore = (raw: any): number => {
    if (raw == null) return 0;
    const s = String(raw).trim();
    // 85% -> 85
    if (/^\d+(?:\.\d+)?%$/.test(s)) return clamp100(parseFloat(s));
    // 85/100 -> 85
    const m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*100$/);
    if (m) return clamp100(parseFloat(m[1]));
    // 0~1 -> scale to 0~100
    const n = Number(s);
    if (Number.isFinite(n)) {
      if (n > 0 && n <= 1) return clamp100(Math.round(n * 100));
      return clamp100(n);
    }
    return 0;
  };
  return {
    accuracy: toScore(res?.accuracy),
    completeness: toScore(res?.completeness ?? res?.coverage),
    fluency: toScore(res?.fluency ?? res?.context),
    summary: res?.summary || res?.comment,
    tips: res?.tips || res?.improvement,
    details: Array.isArray(res?.details) ? res.details : undefined,
    accuracyComment: res?.accuracyComment,
    completenessComment: res?.completenessComment,
    fluencyComment: res?.fluencyComment,
  };
}

export function combineScores(p: PronunciationScores | undefined, c: ContentScores | undefined): number {
  if (!p && !c) return 0;
  const pAvg = p ? (p.accuracy * 0.5 + p.fluency * 0.3 + (p.prosody ?? p.fluency) * 0.2) : 0;
  const cAvg = c ? (c.accuracy * 0.6 + c.completeness * 0.25 + c.fluency * 0.15) : 0;
  if (p && c) return clamp100(pAvg * 0.5 + cAvg * 0.5);
  return clamp100(p ? pAvg : cAvg);
}


