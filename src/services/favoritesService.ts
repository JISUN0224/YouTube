// 🎯 Firebase 기반 즐겨찾기 관리 서비스
import { FirebaseFavoritesService } from './firebaseFavoritesService'

export interface FavoriteVideo {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  uploadTime: string;
  thumbnail: string;
  url: string;
  description: string;
  verified: boolean;
  processedData?: {
    text: string;
    segments: any[];
    language: string;
    processed_at: string;
  };
}

// 🎯 즐겨찾기 추가
export const addToFavorites = async (userId: string, videoId: string, videoData?: { title?: string; url?: string }): Promise<boolean> => {
  try {
    await FirebaseFavoritesService.addFavorite(userId, videoId, videoData)
    return true;
  } catch (error) {
    return false;
  }
};

// 🎯 즐겨찾기 제거
export const removeFromFavorites = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    await FirebaseFavoritesService.removeFavorite(userId, videoId)
    return true;
  } catch (error) {
    return false;
  }
};

// 🎯 즐겨찾기 목록 조회
export const getFavorites = async (userId: string): Promise<string[]> => {
  try {
    const favorites = await FirebaseFavoritesService.getFavorites(userId)
    return favorites;
  } catch (error) {
    return [];
  }
};

// 🎯 즐겨찾기 여부 확인
export const isFavorite = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    return await FirebaseFavoritesService.isFavorite(userId, videoId)
  } catch (error) {
    return false;
  }
};

// 🎯 로그인 (Firebase Auth 사용)
export const login = async (email: string, password: string): Promise<{ success: boolean; userId?: string; message?: string }> => {
  try {
    // Firebase Auth를 사용하므로 실제 로그인은 AuthContext에서 처리
    // 여기서는 호환성을 위해 더미 응답 반환
    return { success: true, message: 'Firebase Auth를 통해 로그인되었습니다' };
  } catch (error) {
    return { success: false, message: '로그인 중 오류가 발생했습니다' };
  }
};
