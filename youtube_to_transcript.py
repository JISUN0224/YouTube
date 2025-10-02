#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 영상 → 중국어 텍스트 변환 도구
OpenAI Whisper + yt-dlp 사용
"""

import os
import sys
import subprocess
import glob
import shutil
import time
from pathlib import Path

# FFmpeg 경로 자동 설정
def setup_ffmpeg_path():
    """FFmpeg 경로를 환경변수에 자동 추가"""
    # 현재 스크립트 위치 기준으로 ffmpeg 경로 찾기
    script_dir = Path(__file__).parent
    ffmpeg_paths = [
        script_dir / "ffmpeg" / "bin",
        script_dir.parent / "ffmpeg" / "bin",
        Path("ffmpeg/bin"),
        Path("../ffmpeg/bin")
    ]
    
    for ffmpeg_path in ffmpeg_paths:
        if (ffmpeg_path / "ffmpeg.exe").exists():
            ffmpeg_bin = str(ffmpeg_path)
            if ffmpeg_bin not in os.environ.get("PATH", ""):
                os.environ["PATH"] = ffmpeg_bin + os.pathsep + os.environ.get("PATH", "")
                print(f"✅ FFmpeg 경로 추가됨: {ffmpeg_bin}")
            return True
    
    print("⚠️ FFmpeg를 찾을 수 없습니다. 수동으로 설치해주세요.")
    return False

# 스크립트 시작 시 FFmpeg 경로 설정
setup_ffmpeg_path()

def check_dependencies():
    """필요한 패키지 설치 확인"""
    required_packages = ['openai-whisper', 'yt-dlp']
    
    for package in required_packages:
        try:
            if package == 'openai-whisper':
                import whisper
            elif package == 'yt-dlp':
                import yt_dlp
        except ImportError:
            print(f"📦 {package} 설치 중...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
            print(f"✅ {package} 설치 완료!")

def find_ffmpeg():
    """FFmpeg 경로 찾기"""
    # 1. 로컬 ffmpeg 폴더 확인 (상대 경로)
    local_ffmpeg = Path("../ffmpeg/bin/ffmpeg.exe")
    if local_ffmpeg.exists():
        return str(local_ffmpeg.parent)
    
    # 2. 현재 디렉토리 기준 ffmpeg 폴더 확인
    current_ffmpeg = Path("ffmpeg/bin/ffmpeg.exe")
    if current_ffmpeg.exists():
        return str(current_ffmpeg.parent)
    
    # 3. 시스템 PATH 확인
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            return None  # 시스템 PATH에 있음
    except:
        pass
    
    return None

def download_audio(youtube_url, output_dir="./output"):
    """유튜브에서 음성 파일 다운로드"""
    print(f"🎵 유튜브 영상에서 음성 추출 중...")
    print(f"URL: {youtube_url}")
    
    # 출력 디렉토리 생성
    Path(output_dir).mkdir(exist_ok=True)
    
    # FFmpeg 경로 찾기
    ffmpeg_path = find_ffmpeg()
    
    try:
        # yt-dlp로 최고 품질 오디오 다운로드
        cmd = [
            'yt-dlp',
            '-f', 'bestaudio',
            '-x',  # 오디오만 추출
            '--audio-format', 'mp3',
            '--audio-quality', '0',  # 최고 품질
            '-o', f'{output_dir}/%(title)s.%(ext)s',
            youtube_url
        ]
        
        # FFmpeg 경로가 있으면 추가
        if ffmpeg_path:
            cmd.extend(['--ffmpeg-location', ffmpeg_path])
        
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        
        if result.returncode != 0:
            error_msg = result.stderr or "알 수 없는 오류"
            print(f"❌ 다운로드 실패: {error_msg}")
            return None
            
        # 다운로드된 파일 찾기
        audio_files = glob.glob(f"{output_dir}/*.mp3")
        if audio_files:
            original_file = str(audio_files[-1])  # 가장 최근 파일
            print(f"✅ 음성 파일 다운로드 완료: {os.path.basename(original_file)}")
            
            # 파일명을 영어로 변경 (Whisper 호환성을 위해)
            safe_filename = "audio_" + str(int(time.time())) + ".mp3"
            safe_filepath = os.path.join(output_dir, safe_filename)
            
            # 파일 이름 변경
            shutil.copy2(original_file, safe_filepath)
            print(f"🔄 파일명 변경: {safe_filename}")
            
            return safe_filepath
        else:
            print("❌ 다운로드된 음성 파일을 찾을 수 없습니다.")
            return None
            
    except FileNotFoundError:
        print("❌ yt-dlp가 설치되지 않았습니다. pip install yt-dlp로 설치해주세요.")
        return None
    except Exception as e:
        print(f"❌ 다운로드 중 오류: {e}")
        return None

def transcribe_audio(audio_file):
    """Whisper로 음성을 중국어 텍스트로 변환"""
    print(f"🎯 Whisper로 중국어 텍스트 변환 중...")
    
    try:
        import whisper
        
        # Whisper 모델 로드 (large-v2가 가장 정확함)
        print("📥 Whisper 모델 로딩 중... (처음에는 시간이 걸릴 수 있습니다)")
        # 환경 변수에서 모델 크기 가져오기 (기본값: base)
        model_size = os.getenv('WHISPER_MODEL', 'base')
        device = os.getenv('WHISPER_DEVICE', 'cpu')
        model = whisper.load_model(model_size, device=device)
        
        # 음성 파일 변환
        print("🔄 음성 인식 처리 중...")
        result = model.transcribe(
            audio_file,
            language="zh",  # 중국어
            word_timestamps=True,  # 단어별 타이밍
            verbose=True  # 진행상황 표시
        )
        
        # 결과 파일들 생성
        base_name = Path(audio_file).stem
        output_dir = Path(audio_file).parent
        
        # 1. 순수 텍스트 파일
        txt_file = output_dir / f"{base_name}.txt"
        text_content = result["text"]
        if not isinstance(text_content, str):
            if isinstance(text_content, list):
                text_content = ' '.join(map(str, text_content))
            else:
                text_content = str(text_content)
        with open(txt_file, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        # 2. SRT 자막 파일
        srt_file = output_dir / f"{base_name}.srt"
        write_srt(result["segments"], srt_file)
        
        # 3. VTT 웹 자막 파일
        vtt_file = output_dir / f"{base_name}.vtt"
        write_vtt(result["segments"], vtt_file)
        
        print(f"✅ 변환 완료!")
        print(f"📄 텍스트 파일: {txt_file}")
        print(f"🎬 SRT 자막: {srt_file}")
        print(f"🌐 VTT 자막: {vtt_file}")
        
        # 메모리 정리
        del model
        import gc
        gc.collect()
        
        # 결과 미리보기
        print(f"\n📝 텍스트 미리보기:")
        print("=" * 50)
        preview_text = text_content[:200] + "..." if len(text_content) > 200 else text_content
        print(preview_text)
        print("=" * 50)
        
        return txt_file, srt_file, vtt_file
        
    except Exception as e:
        print(f"❌ 텍스트 변환 중 오류: {e}")
        return None, None, None

def write_srt(segments, output_file):
    """SRT 자막 파일 생성"""
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start_time = format_timestamp(segment['start'])
            end_time = format_timestamp(segment['end'])
            text = segment['text'].strip()
            
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")

def write_vtt(segments, output_file):
    """VTT 자막 파일 생성"""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("WEBVTT\n\n")
        
        for segment in segments:
            start_time = format_timestamp_vtt(segment['start'])
            end_time = format_timestamp_vtt(segment['end'])
            text = segment['text'].strip()
            
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")

def format_timestamp(seconds):
    """초를 SRT 형식 타임스탬프로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:06.3f}".replace('.', ',')

def format_timestamp_vtt(seconds):
    """초를 VTT 형식 타임스탬프로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:06.3f}"

def main():
    """메인 실행 함수"""
    print("🎬 YouTube → 중국어 텍스트 변환기")
    print("=" * 50)
    
    # 유튜브 URL (여기를 수정하세요)
    youtube_url = "https://www.youtube.com/shorts/Q8qW4u6mN3c"
    
    print(f"📺 처리할 영상: {youtube_url}")
    
    # 1. 의존성 확인
    print("\n1️⃣ 필요한 패키지 확인 중...")
    check_dependencies()
    
    # 2. 음성 다운로드
    print("\n2️⃣ 음성 파일 다운로드 중...")
    audio_file = download_audio(youtube_url)
    
    if not audio_file:
        print("❌ 음성 다운로드에 실패했습니다.")
        return
    
    # 3. 텍스트 변환
    print("\n3️⃣ 중국어 텍스트 변환 중...")
    txt_file, srt_file, vtt_file = transcribe_audio(audio_file)
    
    if txt_file:
        # 4. 자막 하이라이트 HTML 생성
        print("\n4️⃣ 자막 하이라이트 HTML 생성 중...")
        html_file = create_subtitle_highlight_html(srt_file, audio_file)
        
        print(f"\n🎉 모든 작업이 완료되었습니다!")
        print(f"📁 결과 파일들:")
        print(f"   🎵 음성: {audio_file}")
        print(f"   📄 텍스트: {txt_file}")
        print(f"   🎬 SRT 자막: {srt_file}")
        print(f"   🌐 VTT 자막: {vtt_file}")
        if html_file:
            print(f"   🎯 자막 하이라이트: {html_file}")
    else:
        print("❌ 텍스트 변환에 실패했습니다.")

def create_subtitle_highlight_html(srt_file, audio_file):
    """자막 하이라이트 HTML 파일 생성"""
    try:
        import re
        
        # SRT 파일 읽기
        with open(srt_file, 'r', encoding='utf-8') as f:
            srt_content = f.read()
        
        # SRT 파싱
        subtitle_blocks = re.split(r'\n\n+', srt_content.strip())
        subtitles = []
        
        for block in subtitle_blocks:
            lines = block.strip().split('\n')
            if len(lines) >= 3:
                index = lines[0]
                timestamp = lines[1]
                text = '\n'.join(lines[2:])
                
                # 타임스탬프 파싱
                time_match = re.match(r'(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})', timestamp)
                if time_match:
                    start_time = time_match.group(1)
                    end_time = time_match.group(2)
                    
                    # 초 단위로 변환
                    start_seconds = time_to_seconds(start_time)
                    end_seconds = time_to_seconds(end_time)
                    
                    subtitles.append({
                        'index': index,
                        'start_time': start_time,
                        'end_time': end_time,
                        'start_seconds': start_seconds,
                        'end_seconds': end_seconds,
                        'text': text
                    })
        
        # HTML 생성
        audio_filename = os.path.basename(audio_file)
        html_content = f'''<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>자막 하이라이트 플레이어</title>
    <style>
        body {{
            font-family: 'Arial', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }}
        .container {{
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }}
        h1 {{
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }}
        .audio-player {{
            width: 100%;
            margin-bottom: 30px;
        }}
        .subtitle-container {{
            max-height: 400px;
            overflow-y: auto;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            padding: 20px;
            background: #f8f9fa;
        }}
        .subtitle-item {{
            padding: 10px;
            margin: 5px 0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }}
        .subtitle-item:hover {{
            background: #e3f2fd;
            border-left-color: #2196f3;
        }}
        .subtitle-item.active {{
            background: #2196f3;
            color: white;
            border-left-color: #1976d2;
            transform: scale(1.02);
        }}
        .timestamp {{
            font-size: 0.8em;
            color: #666;
            margin-bottom: 5px;
        }}
        .subtitle-text {{
            font-size: 1.1em;
            line-height: 1.4;
        }}
        .controls {{
            text-align: center;
            margin: 20px 0;
        }}
        .btn {{
            background: #2196f3;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 0 5px;
            font-size: 14px;
        }}
        .btn:hover {{
            background: #1976d2;
        }}
        .progress-bar {{
            width: 100%;
            height: 6px;
            background: #e0e0e0;
            border-radius: 3px;
            margin: 10px 0;
            overflow: hidden;
        }}
        .progress-fill {{
            height: 100%;
            background: #2196f3;
            width: 0%;
            transition: width 0.1s ease;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 자막 하이라이트 플레이어</h1>
        
        <div class="audio-player">
            <audio id="audioPlayer" controls>
                <source src="{audio_filename}" type="audio/mpeg">
                브라우저가 오디오를 지원하지 않습니다.
            </audio>
        </div>
        
        <div class="controls">
            <button class="btn" onclick="playPause()">▶️ 재생/일시정지</button>
            <button class="btn" onclick="restart()">⏮️ 처음부터</button>
            <button class="btn" onclick="toggleAutoScroll()">📜 자동 스크롤</button>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        
        <div class="subtitle-container" id="subtitleContainer">
            {chr(10).join([f'''
            <div class="subtitle-item" data-start="{sub['start_seconds']}" data-end="{sub['end_seconds']}">
                <div class="timestamp">{sub['start_time']} → {sub['end_time']}</div>
                <div class="subtitle-text">{sub['text']}</div>
            </div>''' for sub in subtitles])}
        </div>
    </div>

    <script>
        const audio = document.getElementById('audioPlayer');
        const subtitleItems = document.querySelectorAll('.subtitle-item');
        const progressFill = document.getElementById('progressFill');
        const subtitleContainer = document.getElementById('subtitleContainer');
        let autoScroll = true;
        
        // 자막 하이라이트 업데이트
        function updateSubtitles() {{
            const currentTime = audio.currentTime;
            
            subtitleItems.forEach(item => {{
                const start = parseFloat(item.dataset.start);
                const end = parseFloat(item.dataset.end);
                
                if (currentTime >= start && currentTime <= end) {{
                    item.classList.add('active');
                    if (autoScroll) {{
                        item.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                    }}
                }} else {{
                    item.classList.remove('active');
                }}
            }});
            
            // 진행률 업데이트
            const progress = (currentTime / audio.duration) * 100;
            progressFill.style.width = progress + '%';
        }}
        
        // 재생/일시정지
        function playPause() {{
            if (audio.paused) {{
                audio.play();
            }} else {{
                audio.pause();
            }}
        }}
        
        // 처음부터 재생
        function restart() {{
            audio.currentTime = 0;
            audio.play();
        }}
        
        // 자동 스크롤 토글
        function toggleAutoScroll() {{
            autoScroll = !autoScroll;
            const btn = event.target;
            btn.textContent = autoScroll ? '📜 자동 스크롤' : '📜 수동 스크롤';
        }}
        
        // 자막 클릭으로 이동
        subtitleItems.forEach(item => {{
            item.addEventListener('click', () => {{
                const start = parseFloat(item.dataset.start);
                audio.currentTime = start;
                audio.play();
            }});
        }});
        
        // 이벤트 리스너
        audio.addEventListener('timeupdate', updateSubtitles);
        audio.addEventListener('loadedmetadata', () => {{
            console.log('오디오 로드 완료');
        }});
        
        // 초기화
        updateSubtitles();
    </script>
</body>
</html>'''
        
        # HTML 파일 저장
        base_name = Path(srt_file).stem
        html_file = Path(srt_file).parent / f"{base_name}_highlight.html"
        
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print(f"✅ 자막 하이라이트 HTML 생성 완료: {html_file}")
        return html_file
        
    except Exception as e:
        print(f"❌ HTML 생성 중 오류: {e}")
        return None

def time_to_seconds(time_str):
    """SRT 타임스탬프를 초 단위로 변환"""
    # "00:01:23,456" -> 83.456
    time_parts = time_str.replace(',', '.').split(':')
    hours = int(time_parts[0])
    minutes = int(time_parts[1])
    seconds = float(time_parts[2])
    
    return hours * 3600 + minutes * 60 + seconds

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️ 작업이 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류: {e}") 