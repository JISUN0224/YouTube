import React, { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useAuth } from '../../contexts/AuthContext';
import { getFavorites } from '../../services/favoritesService';
import { recommendedVideos } from '../../data/recommendedVideos';
import { FirebaseLearningService } from '../../services/firebaseLearningService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// 데모 데이터 생성
const createDemoData = () => ({
  totalVideos: 12,
  completedVideos: 8,
  averageAccuracy: 87.3,
  totalStudyTime: 12540, // 초단위(3시간 29분)
  totalSessions: 28,
  streakDays: 12,
  weeklyGoal: 85,
  dailyStudyTime: [45, 32, 55, 48, 67, 72, 38],
  weeklyProgress: [
    { week: '1월 1주차', averageScore: 82, totalVideos: 2, studyTime: 120, improvement: '+8%' },
    { week: '1월 2주차', averageScore: 85, totalVideos: 3, studyTime: 135, improvement: '+4%' },
    { week: '1월 3주차', averageScore: 88, totalVideos: 2, studyTime: 145, improvement: '+3%' },
    { week: '1월 4주차', averageScore: 91, totalVideos: 1, studyTime: 158, improvement: '+3%' }
  ],
  categoryRanking: [
    { category: '교육', averageScore: 92.5, videoCount: 4, rank: 1 },
    { category: '뉴스', averageScore: 89.2, videoCount: 3, rank: 2 },
    { category: '비즈니스', averageScore: 85.8, videoCount: 2, rank: 3 }
  ],
  recentActivities: [
    { title: '중국 디지털경제 최신 동향 분석', category: '비즈니스', difficulty: '어려움', studyTime: 1260, averageScore: 94, date: '2025-01-20T14:30:00' },
    { title: 'TED-Ed 면의 과학', category: '교육', difficulty: '보통', studyTime: 1850, averageScore: 88, date: '2025-01-20T10:15:00' },
    { title: '뉴스 브리핑', category: '뉴스', difficulty: '쉬움', studyTime: 900, averageScore: 91, date: '2025-01-19T16:45:00' },
    { title: '기술 동향 분석', category: '기술', difficulty: '어려움', studyTime: 1560, averageScore: 85, date: '2025-01-19T09:20:00' }
  ],
  insights: [
    '교육 영상에서 월등한 성과를 보이고 있어요! 평균 92.5점을 달성했습니다.',
    '12일 연속 학습! 꾸준함이 실력 향상의 비결이에요.',
    '최근 성과가 15% 상승했어요! 노력의 결과가 보이고 있습니다.'
  ]
});

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
};

const getCategoryIcon = (category: string) => {
  const icons: Record<string, { icon: string; bg: string }> = {
    'education': { icon: '📚', bg: 'linear-gradient(135deg, #667eea, #764ba2)' },
    'news': { icon: '📰', bg: 'linear-gradient(135deg, #f093fb, #f5576c)' },
    'business': { icon: '💼', bg: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
    'technology': { icon: '💻', bg: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
    'culture': { icon: '🎭', bg: 'linear-gradient(135deg, #fa709a, #fee140)' },
    'entertainment': { icon: '🎬', bg: 'linear-gradient(135deg, #a8edea, #fed6e3)' },
    'history': { icon: '🏛️', bg: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
    'comedy': { icon: '😂', bg: 'linear-gradient(135deg, #ff9a9e, #fecfef)' },
    'documentary': { icon: '🎥', bg: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' }
  };
  return icons[category] || { icon: '📺', bg: 'linear-gradient(135deg, #667eea, #764ba2)' };
};

const StudyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // 사용자 데이터 로드
  useEffect(() => {
    const loadUserData = async () => {
      if (currentUser) {
        try {
          setLoading(true);
          
          // 즐겨찾기 데이터 로드
          const favorites = await getFavorites(currentUser.uid);
          setFavoriteIds(favorites);
          
          // Firebase 학습 데이터 로드
          const learningData = await FirebaseLearningService.getUserLearningData(currentUser.uid);
          if (learningData) {
            setFirebaseLearningData(learningData);
          }
          
          setShowLoginPrompt(false);
        } catch (error) {
          // 에러 처리
        }
      } else {
        setShowLoginPrompt(true);
      }
      setLoading(false);
    };
    
    loadUserData();
  }, [currentUser]);

  // Firebase 학습 데이터 상태
  const [firebaseLearningData, setFirebaseLearningData] = useState<any>(null);

  // 실제 데이터가 있으면 실제 데이터, 없으면 데모 데이터 사용
  const stats = useMemo(() => {
    if (currentUser && firebaseLearningData) {
      // Firebase 데이터 사용
      const completedVideos = firebaseLearningData.completedVideos || [];
      const totalStudyTime = firebaseLearningData.totalStudyTime || 0;
      const studySessions = firebaseLearningData.studySessions || [];
      
      // 연속 학습일 계산
      const uniqueDays = [...new Set(studySessions.map((s: any) => s.date.split('T')[0]))];
      uniqueDays.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      let streakDays = 0;
      const today = new Date().toISOString().split('T')[0];
      let currentDate = new Date(today);
      for (let i = 0; i < uniqueDays.length; i++) {
        const sessionDate = currentDate.toISOString().split('T')[0];
        if (uniqueDays.includes(sessionDate)) {
          streakDays++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          break;
        }
      }

      // 주간 목표 진행률(이번 주 세션 수)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const thisWeekSessions = studySessions.filter((s: any) => new Date(s.date) >= weekStart);
      const weeklyGoal = Math.min((thisWeekSessions.length / 5) * 100, 100);

      // 일일 학습 시간 (최근 7일)
      const dailyStudyTime = Array(7).fill(0);
      studySessions.forEach((session: any) => {
        const sessionDate = new Date(session.date);
        const daysDiff = Math.floor((new Date().getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff >= 0 && daysDiff < 7) {
          dailyStudyTime[6 - daysDiff] += Math.max(1, Math.round(session.duration / 60)); // 최소 1분으로 표시
        }
      });

      // 주간 성과 추이
      const weeklyData: Record<string, { scores: number[]; videos: number; time: number }> = {};
      studySessions.forEach((session: any) => {
        const date = new Date(session.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { scores: [], videos: 0, time: 0 };
        }
        weeklyData[weekKey].scores.push(session.averageScore || 85);
        weeklyData[weekKey].videos += 1;
        weeklyData[weekKey].time += session.duration || 0; // duration 사용
      });

      const weeklyProgress = Object.entries(weeklyData)
        .map(([week, data]) => ({
          week: `${new Date(week).getMonth() + 1}월 ${Math.ceil(new Date(week).getDate() / 7)}주차`,
          averageScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length * 10) / 10,
          totalVideos: data.videos,
          studyTime: data.time,
          improvement: '+3%'
        }))
        .sort((a, b) => b.week.localeCompare(a.week))
        .slice(0, 4);

      // 카테고리별 성과 (실제 AI 평가 점수 사용)

      const categoryStats = completedVideos.reduce((acc: any, videoId: string) => {
        // YouTube ID를 URL에서 추출하여 찾기
        const video = recommendedVideos.find(v => {
          const youtubeId = v.url?.split('v=')[1]?.split('&')[0];
          return youtubeId === videoId;
        });

        if (video) {
          if (!acc[video.category]) {
            acc[video.category] = { scores: [], videoCount: 0 };
          }
          // 해당 영상의 실제 AI 평가 점수 찾기
          const videoSession = studySessions.find((s: any) => s.videoId === videoId);
          const actualScore = videoSession?.averageScore || 85;

          acc[video.category].scores.push(actualScore);
          acc[video.category].videoCount += 1;
        }
        return acc;
      }, {});

      const categoryRanking = Object.entries(categoryStats).map(([category, data]: [string, any]) => ({
        category: category === 'education' ? '교육' : 
                 category === 'news' ? '뉴스' : 
                 category === 'business' ? '비즈니스' :
                 category === 'technology' ? '기술' :
                 category === 'culture' ? '문화' :
                 category === 'entertainment' ? '엔터테인먼트' :
                 category === 'history' ? '역사' :
                 category === 'comedy' ? '코미디' :
                 category === 'documentary' ? '다큐멘터리' : category,
        averageScore: Math.round(data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length * 10) / 10,
        videoCount: data.videoCount,
        rank: 0
      })).sort((a, b) => b.averageScore - a.averageScore);

      categoryRanking.forEach((item, index) => {
        item.rank = index + 1;
      });

      // 최근 활동 (실제 세션 데이터 사용)
      const recentActivities = completedVideos.slice(0, 4).map((videoId: string) => {
        const video = recommendedVideos.find(v => v.id === videoId);
        const videoSession = studySessions.find((s: any) => s.videoId === videoId);
        return video ? {
          title: video.title,
          category: video.category === 'education' ? '교육' : 
                   video.category === 'news' ? '뉴스' : 
                   video.category === 'business' ? '비즈니스' :
                   video.category === 'technology' ? '기술' :
                   video.category === 'culture' ? '문화' :
                   video.category === 'entertainment' ? '엔터테인먼트' :
                   video.category === 'history' ? '역사' :
                   video.category === 'comedy' ? '코미디' :
                   video.category === 'documentary' ? '다큐멘터리' : video.category,
          difficulty: video.difficulty === 'easy' ? '쉬움' : video.difficulty === 'medium' ? '보통' : '어려움',
          studyTime: videoSession?.duration || 1800, // 실제 학습 시간 사용 (초단위)
          averageScore: videoSession?.averageScore || 85, // 실제 AI 평가 점수 사용
          date: videoSession?.date || new Date().toISOString()
        } : null;
      }).filter(Boolean);

      // 전체 평균 정확도 계산 (실제 AI 평가 점수 기반) - 인사이트 생성용
      const allScores = studySessions.map((s: any) => s.averageScore).filter(score => score > 0);
      const averageAccuracy = allScores.length > 0 
        ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length * 10) / 10
        : 0;

      // 인사이트 (실제 데이터 기반)
      const insights = [];
      
      if (completedVideos.length > 0) {
        // 완료된 영상 수 기반
        insights.push(`총 ${completedVideos.length}개의 영상을 완료하셨어요! 꾸준한 학습이 실력 향상의 비결입니다.`);
        
        // 연속 학습일 기반
        if (streakDays > 0) {
          insights.push(`${streakDays}일 연속 학습! 꾸준함이 실력 향상의 비결이에요.`);
        }
        
        // 평균 점수 기반
        if (averageAccuracy > 0) {
          if (averageAccuracy >= 90) {
            insights.push(`평균 ${averageAccuracy}점으로 월등한 통역 실력을 보여주고 있어요!`);
          } else if (averageAccuracy >= 80) {
            insights.push(`평균 ${averageAccuracy}점으로 좋은 성과를 보이고 있습니다!`);
          } else if (averageAccuracy >= 70) {
            insights.push(`평균 ${averageAccuracy}점으로 꾸준히 학습하면 더욱 향상될 거예요!`);
          } else {
            insights.push(`평균 ${averageAccuracy}점으로 더 많은 학습으로 실력 향상을 도모해보세요!`);
          }
        }
        
        // 카테고리별 성과 기반
        if (categoryRanking.length > 0) {
          const topCategory = categoryRanking[0];
          insights.push(`${topCategory.category}에서 가장 좋은 성과를 보이고 있어요! (평균 ${topCategory.averageScore}점)`);
        }
        
        // 총 학습 시간 기반
        const totalMinutes = Math.floor(totalStudyTime / 60);
        if (totalMinutes > 0) {
          if (totalMinutes >= 60) {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            insights.push(`총 ${hours}시간 ${minutes}분 학습하셨어요! 정말 대단합니다!`);
          } else {
            insights.push(`총 ${totalMinutes}분 학습하셨어요! 꾸준히 노력하면 더욱 향상될 거예요!`);
          }
        }
        
        // 최근 성과 기반 (마지막 2개 세션 비교)
        if (studySessions.length >= 2) {
          const recentSessions = studySessions.slice(-2);
          const recentAvg = recentSessions.reduce((sum, s) => sum + s.averageScore, 0) / recentSessions.length;
          const olderSessions = studySessions.slice(0, -2);
          if (olderSessions.length > 0) {
            const olderAvg = olderSessions.reduce((sum, s) => sum + s.averageScore, 0) / olderSessions.length;
            const improvement = recentAvg - olderAvg;
            if (improvement > 5) {
              insights.push(`최근 성과가 ${improvement.toFixed(1)}점 상승했어요! 노력의 결과가 보이고 있습니다!`);
            } else if (improvement < -5) {
              insights.push(`최근 성과가 조금 떨어졌네요. 더 집중해서 학습해보세요!`);
            }
          }
        }
      } else {
        // 데이터가 없는 경우
        insights.push(`${currentUser.displayName || '사용자'}님, 환영합니다! 첫 번째 영상을 시작해보세요.`);
        insights.push('다양한 영상으로 통역 실력을 향상시켜보세요!');
        insights.push('AI가 처리한 고품질 영상으로 효과적인 학습이 가능합니다.');
      }

      return {
        totalVideos: recommendedVideos.length,
        completedVideos: completedVideos.length,
        averageAccuracy,
        totalStudyTime,
        totalSessions: studySessions.length,
        streakDays,
        weeklyGoal,
        dailyStudyTime,
        weeklyProgress,
        categoryRanking,
        recentActivities,
        insights
      };
    } else {
      // 데모 데이터 사용 (로그인 안했거나 데이터 없음)
      return createDemoData();
    }
  }, [currentUser, favoriteIds, firebaseLearningData]);

  // 차트 데이터
  const dailyChartData = useMemo(() => ({
    labels: ['월', '화', '수', '목', '금', '토', '일'],
    datasets: [
      {
        label: '학습 시간',
        data: stats.dailyStudyTime,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 3,
        pointRadius: 6,
      },
    ],
  }), [stats]);

  const weeklyChartData = useMemo(() => ({
    labels: stats.weeklyProgress.map(w => w.week),
    datasets: [
      {
        label: '통역 정확도',
        data: stats.weeklyProgress.map(w => w.averageScore),
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: '#667eea',
        borderWidth: 2,
        borderRadius: 8,
      },
      {
        label: '학습 시간',
        data: stats.weeklyProgress.map(w => Math.round(w.studyTime / 60)),
        backgroundColor: 'rgba(118, 75, 162, 0.8)',
        borderColor: '#764ba2',
        borderWidth: 2,
        borderRadius: 8,
        yAxisID: 'y1',
      },
    ],
  }), [stats]);

  const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '학습자';

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-purple-100 py-8">
      {/* 로그인 안내 모달 */}
      {showLoginPrompt && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
            <div className="text-5xl mb-5">👋</div>
            <h2 className="text-3xl text-gray-800 mb-4 font-bold">
              아직 로그인을 하지 않으셨나요?
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              이 페이지는 <strong>개인 맞춤 대시보드</strong>입니다.<br/>
              로그인하시면 <strong>사용자 맞춤 학습 분석</strong>이 제공됩니다.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button 
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 rounded-xl px-8 py-4 text-lg font-semibold cursor-pointer shadow-lg transition-all duration-300 hover:transform hover:-translate-y-1"
                onClick={() => window.location.href = '/youtube-generator'}
              >
                🔗 지금 로그인하기
              </button>
              <button 
                className="bg-transparent text-blue-600 border-2 border-blue-600 rounded-xl px-8 py-4 text-lg font-semibold cursor-pointer transition-all duration-300 hover:bg-blue-600 hover:text-white"
                onClick={() => setShowLoginPrompt(false)}
              >
                🔍 데모 먼저 보기
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-5">
              로그인하시면 학습 진도, 성과 분석, 개인화 추천 등 더 많은 기능을 이용하실 수 있어요!
            </p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto bg-white bg-opacity-95 rounded-3xl p-8 shadow-2xl backdrop-blur-lg" id="dashboard-root">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5 pb-4 border-b-2 border-gray-100">
          <div>
            <h1 className="text-3xl text-gray-800 mb-2 font-bold">안녕하세요, {userName}님!</h1>
            <p className="text-gray-600 text-sm">오늘의 YouTube 통역 학습 현황을 확인해보세요</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="bg-gradient-to-r from-blue-400 to-blue-500 text-white px-4 py-3 rounded-xl text-center shadow-lg">
              <div className="text-xl font-bold mb-1">{stats.streakDays}</div>
              <div className="text-xs opacity-90">연속 학습일</div>
            </div>
          </div>
        </div>

        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* 통계 카드들 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xl mb-3 text-white">📺</div>
              <div className="text-3xl font-bold text-gray-800 mb-2">{stats.totalVideos}</div>
              <div className="text-gray-600 text-xs">총 영상 수</div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xl mb-3 text-white">✅</div>
              <div className="text-3xl font-bold text-gray-800 mb-2">{stats.completedVideos}</div>
              <div className="text-gray-600 text-xs">완료된 영상</div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xl mb-3 text-white">🎯</div>
              <div className="text-3xl font-bold text-gray-800 mb-2">{stats.averageAccuracy}%</div>
              <div className="text-gray-600 text-xs">통역 정확도</div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xl mb-3 text-white">⏱️</div>
              <div className="text-3xl font-bold text-gray-800 mb-2">{formatTime(stats.totalStudyTime)}</div>
              <div className="text-gray-600 text-xs">총 학습 시간</div>
            </div>
          </div>

          {/* 주간 목표 진행률 */}
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 주간 목표 진행률</h3>
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-40 h-40 transform -rotate-90">
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
                <circle cx="80" cy="80" r="70" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                <circle cx="80" cy="80" r="70" stroke="url(#progressGradient)" strokeWidth="10" fill="none" 
                  strokeDasharray={2 * Math.PI * 70} 
                  strokeDashoffset={2 * Math.PI * 70 * (1 - stats.weeklyGoal / 100)} 
                  strokeLinecap="round" />
              </svg>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-2xl font-bold text-blue-600">{Math.round(stats.weeklyGoal)}%</div>
                <div className="text-xs text-gray-600 mt-1">목표 달성</div>
              </div>
            </div>
          </div>

          {/* 일일 학습 시간 차트 */}
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 주 일일 학습 시간</h3>
            <div className="h-48">
              <Line data={dailyChartData} options={{ 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#718096' } }, 
                  x: { grid: { display: false }, ticks: { color: '#718096' } } 
                } 
              }} />
            </div>
          </div>
        </div>

        {/* 성과 분석 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 주간 성과 추이</h3>
            <div className="h-72">
              <Bar data={weeklyChartData} options={{ 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, color: '#718096' } } }, 
                scales: { 
                  y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#718096' } }, 
                  y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#718096' } }, 
                  x: { grid: { display: false }, ticks: { color: '#718096' } } 
                } 
              }} />
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 카테고리별 성과 순위</h3>
            {stats.categoryRanking.map((item, i) => (
              <div key={i} className="flex items-center py-3 border-b border-gray-100 last:border-b-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 text-sm ${
                  item.rank === 1 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-800' :
                  item.rank === 2 ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700' :
                  item.rank === 3 ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {item.rank}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800 text-sm">{item.category}</div>
                  <div className="text-xs text-gray-600">{item.videoCount}영상 완료</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">{item.averageScore}</div>
                  <div className="text-xs text-gray-600">%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 활동 & AI 인사이트 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 최근 통역 활동</h3>
            {stats.recentActivities.length > 0 ? (
              stats.recentActivities.map((item, i) => {
                const { icon, bg } = getCategoryIcon(item.category.toLowerCase());
                return (
                  <div key={i} className="flex items-center py-3 border-b border-gray-100 last:border-b-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg mr-3 text-white" style={{ background: bg }}>
                      {icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 text-sm">{item.title}</div>
                      <div className="text-xs text-gray-600">{item.category} • {item.difficulty} • {formatTime(item.studyTime)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-800">{item.averageScore}점</div>
                      <div className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl mx-auto mb-4">
                  🎯
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">첫 번째 영상을 시작해보세요!</h4>
                <p className="text-gray-600 mb-4">
                  AI가 처리한 다양한 영상으로 통역 실력을 향상시켜보세요!
                </p>
                <button
                  onClick={() => window.location.href = '/youtube-generator'}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all duration-300"
                >
                  영상 학습 시작하기
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">이번 학습 인사이트</h3>
            {stats.insights.map((text, i) => (
              <div key={i} className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-lg mb-3 relative overflow-hidden">
                <div className="text-xs leading-relaxed relative z-10">{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 데모 로그인 버튼 (로그인 안된 경우에만) */}
        {!currentUser && (
          <div className="mt-8 text-center p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
            <h3 className="text-xl text-gray-700 mb-2 font-semibold">
              이번 정확한 분석이 필요하신가요?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              지금 로그인하시면 개인화 맞춤 학습 분석과 진도 관리를 받을 수 있어요!
            </p>
            <button 
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 rounded-xl px-6 py-3 text-lg font-semibold cursor-pointer shadow-lg transition-all duration-300 hover:transform hover:-translate-y-1"
              onClick={() => window.location.href = '/youtube-generator'}
            >
              이번 나만의 대시보드 만들기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyDashboard;