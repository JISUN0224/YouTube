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
  duration: number // �??�위
  videoId: string
  videoTitle: string
  averageScore: number
}

export interface UserLearningData {
  userId: string
  completedVideos: string[]
  totalStudyTime: number // �??�위
  studySessions: StudySession[]
  lastUpdated: any
  createdAt: any
}

export class FirebaseLearningService {
  private static getLearningDataDoc(userId: string) {
    return doc(db, 'users', userId, 'learning', 'data')
  }

  // ?�� ?�용???�습 ?�이??초기??
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

  // ?�� ?�용???�습 ?�이??조회
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

  // ?�� ?�습 ?�션 추�?
  static async addStudySession(
    userId: string, 
    session: StudySession
  ): Promise<boolean> {
    try {
      const docRef = this.getLearningDataDoc(userId)
      
      await updateDoc(docRef, {
        studySessions: arrayUnion(session),
        totalStudyTime: session.duration, // Firestore?�서 increment ?�용 불�??��?�??�라?�언?�에??계산
        lastUpdated: serverTimestamp()
      })


      return true
    } catch (error) {

      return false
    }
  }

  // ?�� �??�습 ?�간 ?�데?�트
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

  // ?�� ?�료???�상 추�?
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

  // ?�� ?�료???�상 ?�거
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

  // ?�� ?�용???�습 ?�이???�체 ?�데?�트
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
