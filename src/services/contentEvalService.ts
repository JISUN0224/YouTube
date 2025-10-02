/*
  contentEvalService.ts
  - AI 내용 평가 전용 서비스 (Gemini/GPT 폴백)
  - 환경변수: VITE_GEMINI_API_KEY, VITE_OPENAI_API_KEY
*/

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

// 평가 모델 우선순위
const EVAL_MODEL_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gpt-4o-mini',
  'gpt-3.5-turbo-0125',
  'gpt-4.1-mini'
];

// Gemini API 호출
async function callGeminiAPI(prompt: string, model: string, config: any) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not found');
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: config
      })
    }
  );
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  return await response.json();
}

// GPT API 호출
async function callGPTAPI(prompt: string, model: string, config: any) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not found');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '당신은 통역 평가 전문가입니다. JSON 형식으로만 응답하세요.' },
        { role: 'user', content: prompt }
      ],
      temperature: config.temperature || 0.2,
      max_tokens: config.maxOutputTokens || 256,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  return await response.json();
}

// JSON 추출 헬퍼
function extractJsonString(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

// 내용 평가 메인 함수
export async function evaluateContentWithAI(args: { 
  reference: string; 
  hypothesis: string; 
  language: 'ko' | 'zh' 
}): Promise<any> {
  const langName = args.language === 'zh' ? 'Chinese' : 'Korean';
  const ref = String(args.reference || '').slice(0, 800);
  const hyp = String(args.hypothesis || '').slice(0, 800);

  const prompt = `통역 품질을 평가하세요. 반드시 한국어로만 답변하세요.

【원문 (${langName})】
${ref}

【사용자 통역】
${hyp}

평가 시 각 comment는 반드시 원문과 통역의 실제 문구를 '따옴표'로 인용하여 작성하세요.

좋은 예시:
"accuracyComment": "원문 '也进行着一项更迫切的事'를 '더 급한 일'로 통역했으나, '更迫切'은 단순히 '급한'보다는 '더욱 시급한', '더 중요한'의 뉘앙스입니다. '더욱 시급한 일을 처리했다'로 표현하면 원문의 강조 어감이 잘 살아납니다."

나쁜 예시:
"accuracyComment": "의미 전달이 잘 되었습니다." ← 구체적인 인용 없음 (절대 금지!)

각 항목 평가:
1. accuracy (정확도 0-100): 원문의 '정확한 표현'과 통역의 '정확한 표현'을 직접 인용해서 비교
2. completeness (완성도 0-100): 누락된 부분이 있으면 원문에서 '어떤 표현'이 빠졌는지 정확히 인용
3. fluency (자연스러움 0-100): 어색한 부분은 사용자가 말한 '정확한 표현'을 인용하고 개선안 제시

반환 형식 (JSON만, 한국어만):
{
  "accuracy": 숫자,
  "completeness": 숫자,
  "fluency": 숫자,
  "accuracyComment": "원문 '...'을 '...'로 통역. ○○ 부분이 △△함. '~~~'로 수정 권장 (2-4줄, 인용 필수)",
  "completenessComment": "원문 '...' 누락. '~~~' 추가 필요 (2-4줄, 인용 필수)",
  "fluencyComment": "'...' 표현이 어색함. '~~~'로 개선 (2-4줄, 인용 필수)",
  "summary": "한줄 종합평"
}

**절대 준수**: 모든 comment에 반드시 '따옴표' 인용 포함. 추상적 평가 금지.`;

  const config = {
    temperature: 0.3,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 800,
    responseMimeType: 'application/json',
  };

  // 모델 폴백 시도
  for (let i = 0; i < EVAL_MODEL_FALLBACKS.length; i++) {
    const model = EVAL_MODEL_FALLBACKS[i];
    const isGPT = model.startsWith('gpt-');
    
    // 해당 API 키가 없으면 스킵
    if (isGPT && !OPENAI_API_KEY) continue;
    if (!isGPT && !GEMINI_API_KEY) continue;
    
    try {
      let data: any;
      let text = '';
      
      if (isGPT) {
        data = await callGPTAPI(prompt, model, config);
        text = data?.choices?.[0]?.message?.content || '';
      } else {
        data = await callGeminiAPI(prompt, model, config);
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      
      // JSON 파싱
      const jsonStr = extractJsonString(text);
      const parsed = JSON.parse(jsonStr);
      
      // 유효성 검사
      if (parsed && 
          Number.isFinite(Number(parsed.accuracy)) &&
          Number.isFinite(Number(parsed.completeness)) &&
          Number.isFinite(Number(parsed.fluency))) {
        return parsed;
      }
      
      throw new Error('Invalid response format');
      
    } catch (error) {
      // 마지막 모델이면 기본값 반환
      if (i === EVAL_MODEL_FALLBACKS.length - 1) {
        return {
          accuracy: 70,
          completeness: 70,
          fluency: 70,
          summary: '평가를 완료하지 못했습니다.',
          tips: 'API 키를 확인하거나 나중에 다시 시도해주세요.'
        };
      }
    }
  }
  
  return null;
} 