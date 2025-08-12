import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 구하기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = 3001;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
// 요청 로깅 미들웨어
app.use((req, _res, next) => {
  try {
    const bodyPreview = req.method === 'POST' ? JSON.stringify(req.body).slice(0, 200) : '';
    console.log(`[API] ${req.method} ${req.path} ${bodyPreview ? '- body: ' + bodyPreview : ''}`);
  } catch {}
  next();
});

// API 라우트들을 동적으로 import
const setupRoutes = async () => {
  try {
    // process API
    const { default: processHandler } = await import('./api/youtube/process.js');
    app.post('/api/youtube/process', processHandler);

    // status API
    const { default: statusHandler } = await import('./api/youtube/status/[sessionId].js');
    app.get('/api/youtube/status/:sessionId', (req, res) => {
      // req.query 대신 새로운 객체로 덮어쓰기
      const newReq = { ...req, query: { sessionId: req.params.sessionId } };
      statusHandler(newReq, res);
    });

    // result API
    const { default: resultHandler } = await import('./api/youtube/result/[sessionId].js');
    app.get('/api/youtube/result/:sessionId', (req, res) => {
      // req.query 대신 새로운 객체로 덮어쓰기
      const newReq = { ...req, query: { sessionId: req.params.sessionId } };
      resultHandler(newReq, res);
    });

    console.log('✅ API 라우트 설정 완료');
  } catch (error) {
    console.error('❌ API 라우트 설정 실패:', error);
  }
};

// 에러 핸들링 추가
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// 서버 시작
setupRoutes().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 개발 API 서버가 http://localhost:${PORT}에서 실행 중입니다`);
    console.log('📍 API 엔드포인트:');
    console.log(`   POST http://localhost:${PORT}/api/youtube/process`);
    console.log(`   GET  http://localhost:${PORT}/api/youtube/status/:sessionId`);
    console.log(`   GET  http://localhost:${PORT}/api/youtube/result/:sessionId`);
  });

  // 서버 종료 방지
  server.on('close', () => {
    console.log('🔴 서버가 종료되었습니다');
  });

  // graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🔴 SIGTERM 신호 받음, 서버 종료 중...');
    server.close(() => {
      console.log('🔴 서버 종료 완료');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🔴 SIGINT 신호 받음, 서버 종료 중...');
    server.close(() => {
      console.log('🔴 서버 종료 완료');
      process.exit(0);
    });
  });
}).catch(error => {
  console.error('❌ 서버 시작 실패:', error);
  process.exit(1);
});

console.log('🔧 서버 스크립트 끝까지 실행됨');

// Keep-alive: 이벤트 루프가 종료되지 않도록 주기적으로 실행
setInterval(() => {
  // 아무것도 하지 않지만 이벤트 루프 유지
}, 60000); // 1분마다
