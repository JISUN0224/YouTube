import json
import re
from pathlib import Path

def time_to_seconds(time_str):
    """SRT 타임스탬프를 초로 변환"""
    time_parts = time_str.replace(',', '.').split(':')
    hours = int(time_parts[0])
    minutes = int(time_parts[1])
    seconds = float(time_parts[2])
    return hours * 3600 + minutes * 60 + seconds

def seconds_to_time(seconds):
    """초를 SRT 타임스탬프로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:06.3f}".replace('.', ',')

def create_word_highlight_json(srt_path, json_path):
    """SRT를 글자별 하이라이트 JSON으로 변환"""
    with open(srt_path, 'r', encoding='utf-8') as f:
        srt_content = f.read()

    pattern = re.compile(r'(\d+)\n([\d:,]+) --> ([\d:,]+)\n(.+?)(?=\n\d+\n|\Z)', re.S)
    segments = []
    
    for match in pattern.finditer(srt_content):
        idx, start, end, text = match.groups()
        text = text.replace('\n', ' ').strip()
        
        # 시간을 초로 변환
        start_seconds = time_to_seconds(start)
        end_seconds = time_to_seconds(end)
        duration = end_seconds - start_seconds
        
        # 글자별로 균등 분할
        chars = list(text)
        char_count = len(chars)
        
        if char_count > 0:
            time_per_char = duration / char_count
            words = []
            
            for i, char in enumerate(chars):
                char_start = start_seconds + (i * time_per_char)
                char_end = start_seconds + ((i + 1) * time_per_char)
                
                words.append({
                    "char": char,
                    "start": round(char_start, 3),
                    "end": round(char_end, 3),
                    "start_time": seconds_to_time(char_start),
                    "end_time": seconds_to_time(char_end)
                })
            
            segments.append({
                "id": int(idx),
                "start_time": start,
                "end_time": end,
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
                "duration": duration,
                "text": text,
                "words": words
            })

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 글자별 하이라이트 JSON 생성 완료: {json_path}")
    print(f"📊 총 {len(segments)}개 세그먼트, {sum(len(s['words']) for s in segments)}개 글자")

if __name__ == '__main__':
    srt_file = '../output/output/audio_1752312657.srt'
    json_file = '../output/audio_1752312657_word_highlight.json'
    create_word_highlight_json(srt_file, json_file) 