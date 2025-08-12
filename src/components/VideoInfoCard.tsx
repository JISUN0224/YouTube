import type { VideoInfo } from '../../types/youtube.types'

export default function VideoInfoCard({ info }: { info: VideoInfo }) {
  return (
    <div className="bg-white rounded shadow p-4 flex gap-4">
      <img src={info.thumbnail} alt={info.title} className="w-40 h-24 object-cover rounded" />
      <div className="space-y-1">
        <div className="font-semibold">{info.title}</div>
        <div className="text-sm text-gray-600">{info.channel}</div>
        <div className="text-sm text-gray-600">{info.duration} • {info.language}</div>
      </div>
    </div>
  )
}


