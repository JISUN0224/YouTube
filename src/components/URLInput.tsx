import { useVideoProcessing } from '../../contexts/VideoProcessingContext'

export default function URLInput() {
  const { youtubeUrl, setYoutubeUrl } = useVideoProcessing()
  return (
    <input
      value={youtubeUrl}
      onChange={(e) => setYoutubeUrl(e.target.value)}
      placeholder="YouTube URL"
      className="w-full border rounded px-3 py-2"
    />
  )
}


