// 🎯 즐겨찾기 관리 서비스
const API_BASE_URL = 'http://localhost:3001/api';

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
export const addToFavorites = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    console.log('🌐 즐겨찾기 추가 API 호출:', { userId, videoId })
    
    const response = await fetch(`${API_BASE_URL}/favorites/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, videoId }),
    });

    console.log('📡 API 응답 상태:', response.status, response.statusText)

    if (!response.ok) {
      throw new Error('즐겨찾기 추가 실패');
    }

    const result = await response.json();
    console.log('✅ 즐겨찾기 추가 성공:', result.message);
    
    return true;
  } catch (error) {
    console.error('❌ 즐겨찾기 추가 오류:', error);
    return false;
  }
};

// 🎯 즐겨찾기 제거
export const removeFromFavorites = async (userId: string, videoId: string): Promise<boolean> => {
  try {
    console.log('🌐 즐겨찾기 제거 API 호출:', { userId, videoId })
    
    const response = await fetch(`${API_BASE_URL}/favorites/remove`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, videoId }),
    });

    console.log('📡 API 응답 상태:', response.status, response.statusText)

    if (!response.ok) {
      throw new Error('즐겨찾기 제거 실패');
    }

    const result = await response.json();
    console.log('✅ 즐겨찾기 제거 성공:', result.message);
    
    return true;
  } catch (error) {
    console.error('❌ 즐겨찾기 제거 오류:', error);
    return false;
  }
};

// 🎯 즐겨찾기 목록 조회
export const getFavorites = async (userId: string): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/favorites/${userId}`);
    
    if (!response.ok) {
      throw new Error('즐겨찾기 조회 실패');
    }

    const result = await response.json();
    console.log('📋 즐겨찾기 조회 성공:', result.favorites.length, '개');
    return result.favorites;
  } catch (error) {
    console.error('❌ 즐겨찾기 조회 오류:', error);
    return [];
  }
};

// 🎯 로그인
export const login = async (email: string, password: string): Promise<{ success: boolean; userId?: string; message?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('🔐 로그인 성공:', result.message);
      return { success: true, userId: result.userId, message: result.message };
    } else {
      console.log('❌ 로그인 실패:', result.error);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('❌ 로그인 오류:', error);
    return { success: false, message: '로그인 중 오류가 발생했습니다' };
  }
};
