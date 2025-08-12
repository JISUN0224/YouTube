import { createContext, useContext, useMemo, useState } from 'react'
import type { ProcessingStep, VideoInfo } from '../types/youtube.types'

interface VideoProcessingContextType {
  youtubeUrl: string
  setYoutubeUrl: (url: string) => void
  videoInfo: VideoInfo | null
  setVideoInfo: (info: VideoInfo | null) => void
  processingSteps: ProcessingStep[]
  setProcessingSteps: (steps: ProcessingStep[]) => void
}

const VideoProcessingContext = createContext<VideoProcessingContextType | undefined>(undefined)

export function VideoProcessingProvider({ children }: { children: React.ReactNode }) {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])

  const value = useMemo(
    () => ({ youtubeUrl, setYoutubeUrl, videoInfo, setVideoInfo, processingSteps, setProcessingSteps }),
    [youtubeUrl, videoInfo, processingSteps],
  )

  return <VideoProcessingContext.Provider value={value}>{children}</VideoProcessingContext.Provider>
}

export function useVideoProcessing() {
  const ctx = useContext(VideoProcessingContext)
  if (!ctx) throw new Error('useVideoProcessing must be used within VideoProcessingProvider')
  return ctx
}


