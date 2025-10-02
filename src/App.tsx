import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import YouTubeGenerator from './pages/YouTubeGenerator'
import ProcessedVisualInterpretation from './pages/ProcessedVisualInterpretation'
import StudyDashboard from './components/Dashboard/StudyDashboard'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/youtube-generator" replace />} />
          <Route path="/youtube-generator" element={<YouTubeGenerator />} />
          <Route path="/dashboard" element={<StudyDashboard />} />
          <Route path="/visual-interpretation" element={<ProcessedVisualInterpretation />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App


