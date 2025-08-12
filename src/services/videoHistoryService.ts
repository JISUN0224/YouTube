// 비디오 히스토리 관리를 위한 localStorage 서비스

export interface VideoHistoryItem {
  id: string
  url: string
  title: string
  thumbnail: string
  text: string
  segments: any[]
  processedAt: string
  duration?: string
  language: string
  isFavorite?: boolean
  isTemporary?: boolean
}

const STORAGE_KEY = 'youtube_video_history'
const MAX_ITEMS = 1000 // 최대 1000개 저장

export class VideoHistoryService {
  /**
   * 비디오 히스토리를 localStorage에서 가져오기
   */
  static getHistory(): VideoHistoryItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return []
      
      const history = JSON.parse(data) as VideoHistoryItem[]
      // 최신순으로 정렬
      return history.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())
    } catch (error) {
      console.error('[VideoHistory] 히스토리 로드 실패:', error)
      return []
    }
  }

  /**
   * 새로운 비디오를 히스토리에 추가 (임시 저장)
   */
  static addToHistory(item: Omit<VideoHistoryItem, 'id' | 'processedAt'>): boolean {
    try {
      const history = this.getHistory()
      
      // 중복 URL 확인 (이미 처리된 영상인지 체크)
      const existingIndex = history.findIndex(h => h.url === item.url)
      if (existingIndex >= 0) {
        // 기존 항목 업데이트 (최신 처리 결과로, 즐겨찾기 상태 유지)
        history[existingIndex] = {
          ...history[existingIndex],
          ...item,
          processedAt: new Date().toISOString(),
          isFavorite: history[existingIndex].isFavorite || false
        }
      } else {
        // 새 항목 추가 (기본적으로 임시 저장)
        const newItem: VideoHistoryItem = {
          ...item,
          id: this.generateId(),
          processedAt: new Date().toISOString(),
          isTemporary: true,
          isFavorite: false
        }
        history.unshift(newItem) // 맨 앞에 추가
      }

      // 최대 개수 제한
      if (history.length > MAX_ITEMS) {
        history.splice(MAX_ITEMS)
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
      console.log('[VideoHistory] 임시 저장됨:', item.title || item.url)
      return true
    } catch (error) {
      console.error('[VideoHistory] 히스토리 저장 실패:', error)
      return false
    }
  }

  /**
   * 즐겨찾기 상태 토글
   */
  static toggleFavorite(url: string): boolean {
    try {
      const history = this.getHistory()
      const targetIndex = history.findIndex(h => h.url === url)
      
      if (targetIndex >= 0) {
        history[targetIndex].isFavorite = !history[targetIndex].isFavorite
        history[targetIndex].isTemporary = false // 즐겨찾기 추가 시 임시 상태 해제
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
        console.log('[VideoHistory] 즐겨찾기 토글:', url, history[targetIndex].isFavorite)
        return history[targetIndex].isFavorite
      }
      return false
    } catch (error) {
      console.error('[VideoHistory] 즐겨찾기 토글 실패:', error)
      return false
    }
  }

  /**
   * 특정 URL의 즐겨찾기 상태 확인
   */
  static isFavorite(url: string): boolean {
    try {
      const history = this.getHistory()
      const item = history.find(h => h.url === url)
      return item?.isFavorite || false
    } catch (error) {
      return false
    }
  }

  /**
   * 즐겨찾기만 가져오기
   */
  static getFavorites(): VideoHistoryItem[] {
    return this.getHistory().filter(item => item.isFavorite)
  }

  /**
   * 임시 저장된 항목들을 정리 (7일 이상된 것들)
   */
  static cleanupTemporary(): number {
    try {
      const history = this.getHistory()
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const initialCount = history.length
      const filteredHistory = history.filter(item => {
        if (item.isFavorite) return true // 즐겨찾기는 유지
        if (!item.isTemporary) return true // 임시가 아니면 유지
        
        const itemDate = new Date(item.processedAt)
        return itemDate > sevenDaysAgo // 7일 이내면 유지
      })
      
      const removedCount = initialCount - filteredHistory.length
      if (removedCount > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredHistory))
        console.log('[VideoHistory] 임시 저장 항목 정리:', removedCount, '개 삭제됨')
      }
      
      return removedCount
    } catch (error) {
      console.error('[VideoHistory] 임시 저장 정리 실패:', error)
      return 0
    }
  }

  /**
   * 특정 비디오를 히스토리에서 제거
   */
  static removeFromHistory(id: string): boolean {
    try {
      const history = this.getHistory()
      const filteredHistory = history.filter(item => item.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredHistory))
      console.log('[VideoHistory] 히스토리에서 제거됨:', id)
      return true
    } catch (error) {
      console.error('[VideoHistory] 히스토리 제거 실패:', error)
      return false
    }
  }

  /**
   * 히스토리 전체 삭제
   */
  static clearHistory(): boolean {
    try {
      localStorage.removeItem(STORAGE_KEY)
      console.log('[VideoHistory] 히스토리 전체 삭제됨')
      return true
    } catch (error) {
      console.error('[VideoHistory] 히스토리 삭제 실패:', error)
      return false
    }
  }

  /**
   * URL로 기존 히스토리 아이템 찾기
   */
  static findByUrl(url: string): VideoHistoryItem | null {
    try {
      const history = this.getHistory()
      return history.find(item => item.url === url) || null
    } catch (error) {
      console.error('[VideoHistory] URL로 검색 실패:', error)
      return null
    }
  }

  /**
   * 히스토리 통계 정보
   */
  static getStats() {
    try {
      const history = this.getHistory()
      const totalSize = JSON.stringify(history).length
      const totalSizeKB = Math.round(totalSize / 1024)
      
      return {
        totalItems: history.length,
        totalSizeKB,
        availableSpaceKB: Math.max(0, 5120 - totalSizeKB), // 5MB 기준
        oldestItem: history[history.length - 1]?.processedAt,
        newestItem: history[0]?.processedAt
      }
    } catch (error) {
      console.error('[VideoHistory] 통계 계산 실패:', error)
      return {
        totalItems: 0,
        totalSizeKB: 0,
        availableSpaceKB: 5120,
        oldestItem: null,
        newestItem: null
      }
    }
  }

  /**
   * 유니크 ID 생성
   */
  private static generateId(): string {
    return `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * YouTube URL에서 비디오 ID 추출
   */
  static extractVideoId(url: string): string | null {
    try {
      const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/
      const match = url.match(regex)
      return match ? match[1] : null
    } catch (error) {
      return null
    }
  }

  /**
   * YouTube 썸네일 URL 생성
   */
  static generateThumbnailUrl(url: string): string {
    const videoId = this.extractVideoId(url)
    if (!videoId) return ''
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  }
}
