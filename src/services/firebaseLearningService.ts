import { db } from '../firebase'
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp 
} from 'firebase/firestore'

export interface StudySession {
  date: string
  duration: number // ì´??¨ìœ„
  videoId: string
  videoTitle: string
  averageScore: number
}

export interface UserLearningData {
  userId: string
  completedVideos: string[]
  totalStudyTime: number // ì´??¨ìœ„
  studySessions: StudySession[]
  lastUpdated: any
  createdAt: any
}

export class FirebaseLearningService {
  private static getLearningDataDoc(userId: string) {
    return doc(db, 'users', userId, 'learning', 'data')
  }

  // ?¯ ?¬ìš©???™ìŠµ ?°ì´??ì´ˆê¸°??
  static async initializeUserData(userId: string): Promise<UserLearningData> {
    try {
      const learningData: UserLearningData = {
        userId,
        completedVideos: [],
        totalStudyTime: 0,
        studySessions: [],
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
      }

      await setDoc(this.getLearningDataDoc(userId), learningData)

      return learningData
    } catch (error) {

      throw error
    }
  }

  // ?¯ ?¬ìš©???™ìŠµ ?°ì´??ì¡°íšŒ
  static async getUserLearningData(userId: string): Promise<UserLearningData | null> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        const data = docSnap.data() as UserLearningData

        return data
      } else {

        return await this.initializeUserData(userId)
      }
    } catch (error) {

      return null
    }
  }

  // ?¯ ?™ìŠµ ?¸ì…˜ ì¶”ê?
  static async addStudySession(
    userId: string, 
    session: StudySession
  ): Promise<boolean> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      
      await updateDoc(docRef, {
        studySessions: arrayUnion(session),
        totalStudyTime: session.duration, // Firestore?ì„œ increment ?¬ìš© ë¶ˆê??˜ë?ë¡??´ë¼?´ì–¸?¸ì—??ê³„ì‚°
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }

  // ?¯ ì´??™ìŠµ ?œê°„ ?…ë°?´íŠ¸
  static async updateTotalStudyTime(
    userId: string, 
    additionalTime: number
  ): Promise<boolean> {
    try {
      const currentData = await this.getUserLearningData(userId)
      if (!currentData) return false

      const newTotalTime = currentData.totalStudyTime + additionalTime
      
      const docRef = this.getLearningDataDoc(userId)
      await updateDoc(docRef, {
        totalStudyTime: newTotalTime,
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }

  // ?¯ ?„ë£Œ???ìƒ ì¶”ê?
  static async addCompletedVideo(
    userId: string, 
    videoId: string
  ): Promise<boolean> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      
      await updateDoc(docRef, {
        completedVideos: arrayUnion(videoId),
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }

  // ?¯ ?„ë£Œ???ìƒ ?œê±°
  static async removeCompletedVideo(
    userId: string, 
    videoId: string
  ): Promise<boolean> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      
      await updateDoc(docRef, {
        completedVideos: arrayRemove(videoId),
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }

  // ?¯ ?¬ìš©???™ìŠµ ?°ì´???„ì²´ ?…ë°?´íŠ¸
  static async updateUserLearningData(
    userId: string,
    updates: Partial<UserLearningData>
  ): Promise<boolean> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      
      await updateDoc(docRef, {
        ...updates,
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }
}
