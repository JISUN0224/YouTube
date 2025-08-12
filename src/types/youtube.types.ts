export interface VideoInfo {
  id: string
  title: string
  channel: string
  duration: string
  durationSeconds: number
  language: string
  description: string
  thumbnail: string
}

export interface ProcessingStep {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'error'
  progress: number
  message: string
}


