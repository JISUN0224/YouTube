import React, { useState, useEffect, useRef } from 'react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  padding?: number;
}

interface TourProps {
  steps: TourStep[];
  visible: boolean;
  onClose: (opts?: { dontShowAgain?: boolean }) => void;
}

export const Tour: React.FC<TourProps> = ({ steps, visible, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    // setTimeout으로 렌더링 지연을 줍니다.
    const delay = 100;
    const timer = setTimeout(() => {
      const target = document.querySelector(steps[currentStep]?.targetSelector) as HTMLElement;
      setTargetElement(target);
    }, delay);

    // 컴포넌트 언마운트 시 타이머 클린업
    return () => clearTimeout(timer);

  }, [visible, currentStep, steps]);

  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
    }
  }, [visible]);

  if (!visible) return null;

  const currentStepData = steps[currentStep];
  if (!currentStepData) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleDontShowAgain = () => {
    onClose({ dontShowAgain: true });
  };

  const getTargetPosition = () => {
    if (!targetElement) return { top: 0, left: 0, width: 0, height: 0 };

    const rect = targetElement.getBoundingClientRect();
    const padding = currentStepData.padding || 8;
    
    return {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + (padding * 2),
      height: rect.height + (padding * 2),
    };
  };

  const getTooltipPosition = () => {
    if (!targetElement) return { top: 0, left: 0 };

    const rect = targetElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const margin = 16;

    let top, left;

    // 기본 로직: 오른쪽에 공간이 있으면 오른쪽에 배치
    if (rect.right + tooltipWidth + margin < viewportWidth) {
      left = rect.right + margin;
      top = rect.top;
    }
    // 왼쪽에 공간이 있으면 왼쪽에 배치
    else if (rect.left - tooltipWidth - margin > 0) {
      left = rect.left - tooltipWidth - margin;
      top = rect.top;
    }
    // 위쪽에 공간이 있으면 위쪽에 배치
    else if (rect.top - tooltipHeight - margin > 0) {
      left = rect.left;
      top = rect.top - tooltipHeight - margin;
    }
    // 아래쪽에 배치
    else {
      left = rect.left;
      top = rect.bottom + margin;
    }

    // 화면 경계를 벗어나지 않도록 조정
    if (left + tooltipWidth > viewportWidth) {
      left = viewportWidth - tooltipWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }
    if (top + tooltipHeight > viewportHeight) {
      top = viewportHeight - tooltipHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    return { top, left };
  };

  const targetPosition = getTargetPosition();
  const tooltipPosition = getTooltipPosition();

  return (
    <div className="fixed inset-0 z-50">
      {/* 어두운 배경 - 4개의 사각형으로 타겟 요소 부분 제외 */}
      <div 
        ref={overlayRef}
        className="absolute inset-0"
        onClick={handleSkip}
      >
        {/* 위쪽 사각형 */}
        <div 
          className="absolute bg-black bg-opacity-50"
          style={{
            top: 0,
            left: 0,
            width: '100%',
            height: targetPosition.top,
          }}
        />
        {/* 아래쪽 사각형 */}
        <div 
          className="absolute bg-black bg-opacity-50"
          style={{
            top: targetPosition.top + targetPosition.height,
            left: 0,
            width: '100%',
            height: window.innerHeight - (targetPosition.top + targetPosition.height),
          }}
        />
        {/* 왼쪽 사각형 */}
        <div 
          className="absolute bg-black bg-opacity-50"
          style={{
            top: targetPosition.top,
            left: 0,
            width: targetPosition.left,
            height: targetPosition.height,
          }}
        />
        {/* 오른쪽 사각형 */}
        <div 
          className="absolute bg-black bg-opacity-50"
          style={{
            top: targetPosition.top,
            left: targetPosition.left + targetPosition.width,
            width: window.innerWidth - (targetPosition.left + targetPosition.width),
            height: targetPosition.height,
          }}
        />
      </div>
      
      {/* 타겟 하이라이트 - 더 선명하게 */}
      <div
        className="absolute border-3 border-blue-500 bg-blue-500 bg-opacity-10 rounded-lg shadow-lg"
        style={{
          top: targetPosition.top,
          left: targetPosition.left,
          width: targetPosition.width,
          height: targetPosition.height,
          boxShadow: '0 0 0 6px rgba(59, 130, 246, 0.2), 0 8px 25px rgba(0, 0, 0, 0.2)',
          zIndex: 56,
        }}
      />

      {/* 툴팁 */}
      <div
        className="absolute bg-white rounded-lg shadow-xl p-6 max-w-sm border border-gray-200"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          zIndex: 60,
        }}
      >
        {/* 진행 표시 */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500">
            {currentStep + 1} / {steps.length}
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>

        {/* 제목 */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {currentStepData.title}
        </h3>

        {/* 설명 */}
        <p className="text-gray-600 mb-6">
          {currentStepData.description}
        </p>

        {/* 버튼들 */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                이전
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              {currentStep === steps.length - 1 ? '완료' : '다음'}
            </button>
          </div>
          
          <button
            onClick={handleDontShowAgain}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
};
