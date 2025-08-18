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

// 🎯 즐겨찾기 데이터 저장소 (실제로는 DB 사용)
const favorites = new Map(); // user_id -> Set of video_ids

// 🎯 즐겨찾기 API 엔드포인트들
app.post('/api/favorites/add', (req, res) => {
  try {
    const { userId, videoId } = req.body;
    
    if (!userId || !videoId) {
      return res.status(400).json({ error: '사용자 ID와 비디오 ID가 필요합니다' });
    }
    
    if (!favorites.has(userId)) {
      favorites.set(userId, new Set());
    }
    
    favorites.get(userId).add(videoId);
    
    console.log(`✅ 즐겨찾기 추가: 사용자 ${userId} -> 비디오 ${videoId}`);
    res.json({ success: true, message: '즐겨찾기에 추가되었습니다' });
    
  } catch (error) {
    console.error('즐겨찾기 추가 오류:', error);
    res.status(500).json({ error: '즐겨찾기 추가 중 오류가 발생했습니다' });
  }
});

app.delete('/api/favorites/remove', (req, res) => {
  try {
    const { userId, videoId } = req.body;
    
    if (!userId || !videoId) {
      return res.status(400).json({ error: '사용자 ID와 비디오 ID가 필요합니다' });
    }
    
    if (favorites.has(userId)) {
      favorites.get(userId).delete(videoId);
    }
    
    console.log(`❌ 즐겨찾기 제거: 사용자 ${userId} -> 비디오 ${videoId}`);
    res.json({ success: true, message: '즐겨찾기에서 제거되었습니다' });
    
  } catch (error) {
    console.error('즐겨찾기 제거 오류:', error);
    res.status(500).json({ error: '즐겨찾기 제거 중 오류가 발생했습니다' });
  }
});

app.get('/api/favorites/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다' });
    }
    
    const userFavorites = favorites.has(userId) ? Array.from(favorites.get(userId)) : [];
    
    console.log(`📋 즐겨찾기 조회: 사용자 ${userId} -> ${userFavorites.length}개`);
    res.json({ favorites: userFavorites });
    
  } catch (error) {
    console.error('즐겨찾기 조회 오류:', error);
    res.status(500).json({ error: '즐겨찾기 조회 중 오류가 발생했습니다' });
  }
});

// 🎯 간단한 로그인 API (테스트용)
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 간단한 테스트용 로그인 (실제로는 DB 검증 필요)
    if (email === 'test@example.com' && password === 'password') {
      const userId = 'user_' + Date.now();
      console.log(`🔐 로그인 성공: ${email} -> ${userId}`);
      res.json({ 
        success: true, 
        userId: userId,
        message: '로그인되었습니다' 
      });
    } else {
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }
    
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다' });
  }
});

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
