import { db } from '../firebase'
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore'

export interface FavoriteVideo {
  videoId: string
  addedAt: Date
  title?: string
  url?: string
}

export class FirebaseFavoritesService {
  private static getFavoritesCollection(userId: string) {
    return collection(db, 'users', userId, 'favorites')
  }

  private static getFavoritesDoc(userId: string) {
    return doc(db, 'users', userId, 'favorites', 'list')
  }

  // 즐겨찾기 추가
  static async addFavorite(userId: string, videoId: string, videoData?: { title?: string; url?: string }) {
    try {
      if (!userId || !videoId) {
        throw new Error('사용자 ID와 비디오 ID가 필요합니다')
      }

      // undefined 값 필터링
      const cleanVideoData: any = {
        videoId,
        addedAt: new Date()
      }
      
      if (videoData?.title) {
        cleanVideoData.title = videoData.title
      }
      
      if (videoData?.url) {
        cleanVideoData.url = videoData.url
      }

      const favoritesDoc = this.getFavoritesDoc(userId)
      const docSnap = await getDoc(favoritesDoc)

      if (docSnap.exists()) {
        // 기존 즐겨찾기 목록에 추가
        await updateDoc(favoritesDoc, {
          videos: arrayUnion(cleanVideoData)
        })
      } else {
        // 새로운 즐겨찾기 목록 생성
        await setDoc(favoritesDoc, {
          videos: [cleanVideoData]
        })
      }

      return { success: true, message: '즐겨찾기에 추가되었습니다' }
    } catch (error) {
      throw error
    }
  }

  // 즐겨찾기 제거
  static async removeFavorite(userId: string, videoId: string) {
    try {
      if (!userId || !videoId) {
        throw new Error('사용자 ID와 비디오 ID가 필요합니다')
      }

      const favoritesDoc = this.getFavoritesDoc(userId)
      const docSnap = await getDoc(favoritesDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        const videos = data.videos || []
        const updatedVideos = videos.filter((video: FavoriteVideo) => video.videoId !== videoId)

        await setDoc(favoritesDoc, { videos: updatedVideos })
      }

      return { success: true, message: '즐겨찾기에서 제거되었습니다' }
    } catch (error) {
      throw error
    }
  }

  // 즐겨찾기 목록 조회
  static async getFavorites(userId: string): Promise<string[]> {
    try {
      if (!userId) {
        throw new Error('사용자 ID가 필요합니다')
      }

      const favoritesDoc = this.getFavoritesDoc(userId)
      const docSnap = await getDoc(favoritesDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        const videos = data.videos || []
        const videoIds = videos.map((video: FavoriteVideo) => video.videoId)
        
        return videoIds
      } else {
        return []
      }
    } catch (error) {
      return []
    }
  }

  // 즐겨찾기 여부 확인
  static async isFavorite(userId: string, videoId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavorites(userId)
      return favorites.includes(videoId)
    } catch (error) {
      return false
    }
  }
}
