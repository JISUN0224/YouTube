// Analytics 서비스 - 현재 비활성화됨
// Firebase Analytics가 설정되지 않아 모든 메서드가 비활성화 상태

export class AnalyticsService {
  // 통역 연습 시작
  static logTranslationStart(videoId: string, videoTitle: string, difficulty: string) {
    // Analytics 비활성화
    return
  }

  // 통역 연습 완료
  static logTranslationComplete(
    videoId: string, 
    accuracy: number, 
    studyDuration: number,
    difficulty: string
  ) {
    // Analytics 비활성화
    return
  }

  // AI 평가 받기
  static logAIEvaluation(
    videoId: string,
    accuracy: number,
    completeness: number,
    fluency: number,
    overall: number
  ) {
    // Analytics 비활성화
    return
  }

  // 영상 즐겨찾기 추가/제거
  static logFavoriteToggle(videoId: string, action: 'add' | 'remove') {
    // Analytics 비활성화
    return
  }

  // 대시보드 방문
  static logDashboardVisit() {
    // Analytics 비활성화
    return
  }

  // 페이지 방문
  static logPageView(pageName: string) {
    // Analytics 비활성화
    return
  }

  // 사용자 로그인
  static logUserLogin(method: 'google' | 'email') {
    // Analytics 비활성화
    return
  }

  // 사용자 로그아웃
  static logUserLogout() {
    // Analytics 비활성화
    return
  }

  // 학습 세션 시작
  static logStudySessionStart(videoId: string) {
    // Analytics 비활성화
    return
  }

  // 학습 세션 종료
  static logStudySessionEnd(videoId: string, duration: number) {
    // Analytics 비활성화
    return
  }
}