import json
import re
from pathlib import Path

# 번체→간체 변환기 (opencc 필요)
def to_simplified(text):
    try:
        from opencc import OpenCC
        cc = OpenCC('t2s')
        return cc.convert(text)
    except ImportError:
        print('opencc가 설치되어 있지 않습니다. pip install opencc-python-reimplemented')
        return text

def srt_to_json(srt_path, json_path):
    with open(srt_path, 'r', encoding='utf-8') as f:
        srt_content = f.read()

    pattern = re.compile(r'(\d+)\n([\d:,]+) --> ([\d:,]+)\n(.+?)(?=\n\d+\n|\Z)', re.S)
    segments = []
    for match in pattern.finditer(srt_content):
        idx, start, end, text = match.groups()
        text = text.replace('\n', ' ').strip()
        text_simp = to_simplified(text)
        segments.append({
            'id': int(idx),
            'start_time': start,
            'end_time': end,
            'text': text_simp
        })

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    print(f'✅ 변환 완료: {json_path}')

if __name__ == '__main__':
    srt_file = 'audio_1752312657.srt'
    json_file = 'audio_1752312657.json'
    srt_to_json(srt_file, json_file) 