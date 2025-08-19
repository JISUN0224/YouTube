import React from 'react';

interface CaptionLanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLanguage: (language: string, type: 'manual' | 'automatic') => void;
  availableCaptions: {
    manual: string[];
    automatic: string[];
  };
}

const CaptionLanguageModal: React.FC<CaptionLanguageModalProps> = ({
  isOpen,
  onClose,
  onSelectLanguage,
  availableCaptions
}) => {
  if (!isOpen) return null;

  // 언어 코드를 표시 이름으로 변환
  const languageNames: { [key: string]: string } = {
    'zh-Hans': '중국어 간체',
    'zh-CN': '중국어 간체',
    'zh': '중국어',
    'zh-Hant': '중국어 번체',
    'en': '영어',
    'ko': '한국어',
    'ja': '일본어',
    'es': '스페인어',
    'fr': '프랑스어',
    'de': '독일어',
    'it': '이탈리아어',
    'pt': '포르투갈어',
    'ru': '러시아어',
    'ar': '아랍어',
    'hi': '힌디어',
    'th': '태국어',
    'vi': '베트남어',
    'id': '인도네시아어',
    'ms': '말레이어',
    'tr': '터키어',
    'pl': '폴란드어',
    'nl': '네덜란드어',
    'sv': '스웨덴어',
    'da': '덴마크어',
    'no': '노르웨이어',
    'fi': '핀란드어',
    'cs': '체코어',
    'hu': '헝가리어',
    'ro': '루마니아어',
    'bg': '불가리아어',
    'hr': '크로아티아어',
    'sk': '슬로바키아어',
    'sl': '슬로베니아어',
    'et': '에스토니아어',
    'lv': '라트비아어',
    'lt': '리투아니아어',
    'el': '그리스어',
    'he': '히브리어',
    'fa': '페르시아어',
    'ur': '우르두어',
    'bn': '벵골어',
    'ta': '타밀어',
    'te': '텔루구어',
    'ml': '말라얄람어',
    'kn': '칸나다어',
    'gu': '구자라트어',
    'pa': '펀자브어',
    'si': '싱할라어',
    'my': '미얀마어',
    'km': '크메르어',
    'lo': '라오어',
    'ne': '네팔어',
    'ka': '조지아어',
    'am': '암하라어',
    'sw': '스와힐리어',
    'zu': '줄루어',
    'af': '아프리칸스어',
    'xh': '코사어',
    'yo': '요루바어',
    'ig': '이그보어',
    'ha': '하우사어',
    'so': '소말리어',
    'rw': '키냐르완다어',
    'ak': '아칸어',
    'lg': '간다어',
    'ny': '치체와어',
    'sn': '쇼나어',
    'st': '소토어',
    'tn': '츠와나어',
    'ts': '총가어',
    've': '벤다어',
    'ss': '스와지어',
    'nr': '남부 은데벨레어',
    'nd': '북부 은데벨레어',
    'tum': '툼부카어',
    'bem': '벰바어',
    'luy': '루야어',
    'kln': '칼렌진어',
    'kam': '캄바어',
    'dav': '타이타어',
    'mer': '메루어',
    'kik': '키쿠유어',
    'gik': '기쿠유어',
    'emb': '엠부어',
    'teo': '테소어',
    'mas': '마사이어',
    'saq': '삼부루어',
         'nyn': '니안콜어',
     'cgg': '치가어',
     'xog': '소가어',
     'lwo': '루오어',
     'ach': '아촐리어'
  };

  // 언어 중복 제거 (수동 자막 우선)
  const languageMap = new Map<string, { code: string; type: 'manual' | 'automatic' }>();
  
  // 수동 자막 먼저 추가
  availableCaptions.manual.forEach(lang => {
    languageMap.set(lang, { code: lang, type: 'manual' });
  });
  
  // 자동 자막은 수동 자막에 없는 것만 추가
  availableCaptions.automatic.forEach(lang => {
    if (!languageMap.has(lang)) {
      languageMap.set(lang, { code: lang, type: 'automatic' });
    }
  });
  
  const allLanguages = Array.from(languageMap.values());

  const handleLanguageSelect = (language: string, type: 'manual' | 'automatic') => {
    onSelectLanguage(language, type);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
      style={{ position: 'fixed' }}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">자막 언어 선택</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        <p className="text-gray-600 mb-4">
          사용할 자막 언어를 선택해주세요:
        </p>
        
        <div className="space-y-2">
          {allLanguages.map(({ code, type }) => (
            <button
              key={`${code}-${type}`}
              onClick={() => handleLanguageSelect(code, type)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="font-medium text-gray-800">
                {languageNames[code] || code}
              </div>
              <div className="text-sm text-gray-500">
                {type === 'manual' ? '수동 자막' : '자동 자막'}
              </div>
            </button>
          ))}
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptionLanguageModal;
