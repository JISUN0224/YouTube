# YouTube 통역 연습 시스템

AI 기반 YouTube 영상을 활용한 통역 연습 플랫폼입니다.

## 🚀 주요 기능

- YouTube 영상 기반 통역 연습
- AI 발음 평가 (Azure Speech Services)
- AI 내용 평가 (Gemini/GPT)
- 실시간 음성 인식
- 학습 진도 추적
- 즐겨찾기 기능

## 🛠️ 환경 설정

### 1. 환경변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 환경변수들을 설정하세요:

```env
# Firebase Configuration (필수)
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# AI Services (선택사항)
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_OPENAI_API_KEY=your_openai_api_key_here

# Azure Speech Services (선택사항)
VITE_AZURE_SPEECH_KEY=your_azure_speech_key_here
VITE_AZURE_SPEECH_REGION=your_azure_region_here
```

### 2. Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Authentication, Firestore, Storage 활성화
3. 웹 앱 등록 후 설정 정보를 `.env` 파일에 입력

### 3. AI 서비스 설정 (선택사항)

#### Gemini API
- [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 발급
- `VITE_GEMINI_API_KEY`에 입력

#### OpenAI API
- [OpenAI Platform](https://platform.openai.com/api-keys)에서 API 키 발급
- `VITE_OPENAI_API_KEY`에 입력

#### Azure Speech Services
- [Azure Portal](https://portal.azure.com/)에서 Speech Services 리소스 생성
- `VITE_AZURE_SPEECH_KEY`와 `VITE_AZURE_SPEECH_REGION`에 입력

## 📦 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

## 🔒 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요
- API 키는 환경변수로만 관리하고 하드코딩하지 마세요
- 프로덕션 배포 시 환경변수를 안전하게 설정하세요

## 📝 라이선스

MIT License
