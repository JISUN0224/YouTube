import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import YouTubeGenerator from './pages/YouTubeGenerator'
import VideoInfo from './pages/VideoInfo'
import ProcessingPage from './pages/ProcessingPage'
import ProcessedVisualInterpretation from './pages/ProcessedVisualInterpretation'
import { VideoProcessingProvider } from './contexts/VideoProcessingContext'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <VideoProcessingProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/youtube-generator" replace />} />
            <Route path="/youtube-generator" element={<YouTubeGenerator />} />
            <Route path="/video-info" element={<VideoInfo />} />
            <Route path="/processing" element={<ProcessingPage />} />
            <Route path="/visual-interpretation" element={<ProcessedVisualInterpretation />} />
          </Routes>
        </VideoProcessingProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App


