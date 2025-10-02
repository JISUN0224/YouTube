import React from 'react';

interface Word {
  word: string;
  accuracy: number;
}

interface ProsodyAnalysisProps {
  words: Word[];
}

const ProsodyAnalysis: React.FC<ProsodyAnalysisProps> = ({ words }) => {
  // 전체 운율 점수 계산 (모든 단어 정확도 점수의 평균)
  const overallProsodyScore = words.length > 0 
    ? words.reduce((sum, word) => sum + (word.accuracy || 0), 0) / words.length 
    : 0;

  // 색상 함수들
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-gradient-to-br from-sky-50 to-blue-50 p-4 rounded-xl border border-sky-200 mt-4">
      <h4 className="text-lg font-semibold mb-4 flex items-center">
        <span className="text-xl mr-2">🎵</span>
        운율 분석
      </h4>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* 1. STRESS PATTERN DISPLAY (강세 패턴) */}
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <h5 className="font-medium text-gray-700 mb-3 flex items-center">
            <span className="text-lg mr-2">💪</span>
            강세 패턴
          </h5>
          <div className="text-xs text-gray-500 mb-3 text-center">
            🟢 좋음 (80점 이상) | 🟡 보통 (60-79점) | 🔴 개선 필요 (60점 미만)
          </div>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {words.map((word, index) => (
              <div
                key={index}
                className="flex flex-col items-center group cursor-pointer"
                title={`${word.word}: ${word.accuracy.toFixed(1)}점`}
              >
                <div
                  className={`rounded-full transition-all duration-300 group-hover:scale-110 ${
                    word.accuracy >= 80 ? 'bg-green-500' :
                    word.accuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{
                    width: `${Math.max((word.accuracy / 10) * 2, 8)}px`,
                    height: `${Math.max((word.accuracy / 10) * 2, 8)}px`
                  }}
                ></div>
                <span className="text-xs mt-1 font-medium">
                  {word.word}
                </span>
              </div>
            ))}
          </div>
          
          {/* 종합 운율 점수 통합 */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">종합 운율:</span>
                <span className={`text-lg font-bold ${getScoreColor(overallProsodyScore)}`}>
                  {overallProsodyScore.toFixed(1)}점
                </span>
              </div>
              <div className={`text-sm font-medium ${getScoreColor(overallProsodyScore)}`}>
                {overallProsodyScore >= 80 ? '훌륭한 운율!' :
                 overallProsodyScore >= 60 ? '좋은 기반' : '개선 필요'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. RHYTHM PATTERN VISUALIZATION (리듬 패턴) */}
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <h5 className="font-medium text-gray-700 mb-3 flex items-center">
            <span className="text-lg mr-2">⏱️</span>
            리듬 패턴
          </h5>
          <div className="text-xs text-gray-500 mb-3 text-center">
            🟢 좋음 (80점 이상) | 🟡 보통 (60-79점) | 🔴 개선 필요 (60점 미만)
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
            {words.map((word, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-sm font-medium min-w-[3rem]">
                  {word.word}
                </span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      word.accuracy >= 80 ? 'bg-green-500' :
                      word.accuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(word.accuracy, 100)}%` }}
                  ></div>
                </div>
                <span className={`text-xs font-medium ${getScoreColor(word.accuracy)}`}>
                  {word.accuracy.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 개선 팁 */}
      <div className="mt-4 p-3 bg-purple-100 rounded-lg border border-purple-200">
        <h5 className="font-medium text-purple-800 flex items-center mb-2">
          <span className="text-lg mr-2">💡</span>
          운율 개선 팁
        </h5>
        <div className="space-y-1 text-sm text-purple-700">
          <div className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <span>문장 끝에서는 억양을 낮춰주세요</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <span>중요한 단어는 높은 톤으로 강조하세요</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <span>자연스러운 속도로 말하기 연습을 해보세요</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProsodyAnalysis;
