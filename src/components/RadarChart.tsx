import React from 'react';

interface RadarChartProps {
  accuracy: number;
  fluency: number;
  prosody: number;
  confidence: number;
}

const RadarChart: React.FC<RadarChartProps> = ({ accuracy, fluency, prosody, confidence }) => {
  return (
    <div className="mb-4">
      <div className="text-sm font-medium text-gray-700 mb-3 text-center">📊 발음 분석 차트</div>
      <div className="flex justify-center">
        <div className="relative">
          <svg width="300" height="200" viewBox="0 0 300 200" className="mx-auto">
            {/* 등급선들 (배경) */}
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((grade, index) => {
              const points = [
                { x: 150 + 60 * grade, y: 100 }, // 정확도 (오른쪽)
                { x: 150, y: 100 - 60 * grade }, // 유창성 (위쪽)
                { x: 150 - 60 * grade, y: 100 }, // 운율 (왼쪽)
                { x: 150, y: 100 + 60 * grade }  // 완전성 (아래쪽)
              ];
              const path = points.map((point, i) => 
                `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
              ).join(' ') + ' Z';
              return (
                <path
                  key={index}
                  d={path}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  opacity="0.5"
                />
              );
            })}
            
            {/* 축 선들 */}
            {[
              { x1: 150, y1: 100, x2: 210, y2: 100 }, // 정확도
              { x1: 150, y1: 100, x2: 150, y2: 40 },  // 유창성
              { x1: 150, y1: 100, x2: 90, y2: 100 },  // 운율
              { x1: 150, y1: 100, x2: 150, y2: 160 }  // 완전성
            ].map((line, index) => (
              <line
                key={index}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#d1d5db"
                strokeWidth="1"
              />
            ))}
            
            {/* 점수 다각형 */}
            <path
              d={`M ${150 + 60 * (accuracy / 100)} ${100} L ${150} ${100 - 60 * (fluency / 100)} L ${150 - 60 * (prosody / 100)} ${100} L ${150} ${100 + 60 * (confidence / 100)} Z`}
              fill="rgba(59, 130, 246, 0.2)"
              stroke="#3b82f6"
              strokeWidth="2"
            />
            
            {/* 점수 점들 */}
            {[
              { x: 150 + 60 * (accuracy / 100), y: 100 },
              { x: 150, y: 100 - 60 * (fluency / 100) },
              { x: 150 - 60 * (prosody / 100), y: 100 },
              { x: 150, y: 100 + 60 * (confidence / 100) }
            ].map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r="4"
                fill="#3b82f6"
                stroke="white"
                strokeWidth="2"
              />
            ))}
            
            {/* 축 라벨들 */}
            {[
              { x: 220, y: 105, text: '정확도' },
              { x: 150, y: 25, text: '유창성' },
              { x: 80, y: 105, text: '운율' },
              { x: 150, y: 175, text: '자신감' }
            ].map((label, index) => (
              <text
                key={index}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-medium fill-gray-600"
              >
                {label.text}
              </text>
            ))}
          </svg>
          
          {/* 중앙 평균 점수 표시 */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: '150px' }}>
            <div className="text-lg font-bold text-blue-600">
              {((accuracy + fluency + prosody + confidence) / 4).toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">평균</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadarChart;
