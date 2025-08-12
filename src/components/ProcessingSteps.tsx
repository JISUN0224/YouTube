import type { ProcessingStep } from '../../types/youtube.types'

export default function ProcessingSteps({ steps }: { steps: ProcessingStep[] }) {
  return (
    <ul className="space-y-2">
      {steps.map((step) => (
        <li key={step.id} className="bg-white rounded shadow p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{step.name}</span>
            <span className="text-sm text-gray-500">{step.status}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded mt-2">
            <div
              className={`h-2 rounded ${step.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}
              style={{ width: `${step.progress}%` }}
            />
          </div>
          {step.message && <p className="text-sm text-gray-600 mt-2">{step.message}</p>}
        </li>
      ))}
    </ul>
  )
}


