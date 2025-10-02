#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎬 YouTube → 중국어 텍스트 변환기 (독립 실행 버전)
YouTube 영상에서 음성을 추출하고 OpenAI Whisper로 중국어 텍스트로 변환하는 완전한 도구

사용법:
    python youtube_transcript_standalone.py

필요사항:
    - Python 3.6 이상
    - 인터넷 연결
"""

import os
import sys
import subprocess
import glob
import shutil
import time
import re
import json
from pathlib import Path
from urllib.request import urlretrieve
import zipfile
import platform

# 색상 출력을 위한 ANSI 코드
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_color(text, color=Colors.GREEN):
    """색상이 있는 텍스트 출력"""
    print(f"{color}{text}{Colors.END}")

def print_header():
    """헤더 출력"""
    print_color("🎬 YouTube → 중국어 텍스트 변환기", Colors.BOLD + Colors.CYAN)
    print_color("=" * 50, Colors.CYAN)
    print_color("독립 실행 버전 - 모든 의존성 자동 설치", Colors.YELLOW)
    print()

def check_python_version():
    """Python 버전 확인"""
    if sys.version_info < (3, 6):
        print_color("❌ Python 3.6 이상이 필요합니다.", Colors.RED)
        print_color(f"현재 버전: {sys.version}", Colors.RED)
        sys.exit(1)
    print_color(f"✅ Python 버전 확인: {sys.version.split()[0]}", Colors.GREEN)

def install_package(package_name, pip_name=None):
    """패키지 설치"""
    if pip_name is None:
        pip_name = package_name
    
    try:
        __import__(package_name)
        print_color(f"✅ {package_name} 이미 설치됨", Colors.GREEN)
        return True
    except ImportError:
        print_color(f"📦 {package_name} 설치 중...", Colors.YELLOW)
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])
            print_color(f"✅ {package_name} 설치 완료!", Colors.GREEN)
            return True
        except subprocess.CalledProcessError:
            print_color(f"❌ {package_name} 설치 실패", Colors.RED)
            return False

def convert_traditional_to_simplified(text):
    """번체를 간체로 변환"""
    try:
        import opencc
        converter = opencc.OpenCC('t2s')  # Traditional to Simplified
        return converter.convert(text)
    except ImportError:
        # opencc가 설치되지 않은 경우 기본 변환 시도
        print_color("⚠️ opencc 패키지가 설치되지 않아 기본 변환을 시도합니다.", Colors.YELLOW)
        return text
    except Exception as e:
        print_color(f"⚠️ 번체→간체 변환 실패: {e}", Colors.YELLOW)
        return text

def download_ffmpeg():
    """FFmpeg 다운로드 및 설치"""
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    # FFmpeg 다운로드 URL
    ffmpeg_urls = {
        'windows': {
            'x86_64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
            'x86': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip'
        },
        'linux': {
            'x86_64': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
        },
        'darwin': {
            'x86_64': 'https://evermeet.cx/ffmpeg/getrelease/zip'
        }
    }
    
    if system not in ffmpeg_urls:
        print_color("⚠️ 이 운영체제는 지원되지 않습니다. FFmpeg를 수동으로 설치해주세요.", Colors.YELLOW)
        return False
    
    if machine not in ffmpeg_urls[system]:
        print_color("⚠️ 이 아키텍처는 지원되지 않습니다. FFmpeg를 수동으로 설치해주세요.", Colors.YELLOW)
        return False
    
    url = ffmpeg_urls[system][machine]
    filename = url.split('/')[-1]
    
    print_color("📥 FFmpeg 다운로드 중...", Colors.YELLOW)
    
    try:
        # 임시 디렉토리 생성
        temp_dir = Path("temp_ffmpeg")
        temp_dir.mkdir(exist_ok=True)
        
        # 다운로드
        zip_path = temp_dir / filename
        urlretrieve(url, zip_path)
        
        # 압축 해제
        print_color("📦 FFmpeg 압축 해제 중...", Colors.YELLOW)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # bin 디렉토리로 이동
        bin_dir = Path("bin")
        bin_dir.mkdir(exist_ok=True)
        
        # 실행파일 찾기 및 복사
        for exe_name in ['ffmpeg', 'ffprobe', 'ffplay']:
            if system == 'windows':
                exe_name += '.exe'
            
            # 압축 해제된 디렉토리에서 찾기
            for root, dirs, files in os.walk(temp_dir):
                if exe_name in files:
                    src_path = Path(root) / exe_name
                    dst_path = bin_dir / exe_name
                    shutil.copy2(src_path, dst_path)
                    break
        
        # 임시 디렉토리 정리
        shutil.rmtree(temp_dir)
        
        print_color("✅ FFmpeg 설치 완료!", Colors.GREEN)
        return True
        
    except Exception as e:
        print_color(f"❌ FFmpeg 설치 실패: {e}", Colors.RED)
        return False

def setup_environment():
    """환경 설정"""
    print_color("🔧 환경 설정 중...", Colors.BLUE)
    
    # Python 버전 확인
    check_python_version()
    
    # 필요한 패키지 설치
    packages = [
        ('whisper', 'openai-whisper'),
        ('yt_dlp', 'yt-dlp'),
        ('opencc', 'opencc-python-reimplemented')  # 번체→간체 변환용
    ]
    
    for package_name, pip_name in packages:
        if not install_package(package_name, pip_name):
            print_color(f"❌ {package_name} 설치에 실패했습니다.", Colors.RED)
            sys.exit(1)
    
    # FFmpeg 확인 및 설치
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        print_color("✅ FFmpeg 이미 설치됨", Colors.GREEN)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print_color("📥 FFmpeg 설치 중...", Colors.YELLOW)
        if not download_ffmpeg():
            print_color("⚠️ FFmpeg 자동 설치에 실패했습니다. 수동으로 설치해주세요.", Colors.YELLOW)
    
    print_color("✅ 환경 설정 완료!", Colors.GREEN)

def download_audio(youtube_url, output_dir="./output"):
    """유튜브에서 음성 파일 다운로드"""
    print_color(f"🎵 유튜브 영상에서 음성 추출 중...", Colors.BLUE)
    print_color(f"URL: {youtube_url}", Colors.CYAN)
    
    # 출력 디렉토리 생성
    Path(output_dir).mkdir(exist_ok=True)
    
    try:
        import yt_dlp
        
        # yt-dlp 설정
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{output_dir}/%(title)s.%(ext)s',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
        
        # 다운로드 실행
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        
        # 다운로드된 파일 찾기
        audio_files = glob.glob(f"{output_dir}/*.mp3")
        if audio_files:
            original_file = str(audio_files[-1])  # 가장 최근 파일
            print_color(f"✅ 음성 파일 다운로드 완료: {os.path.basename(original_file)}", Colors.GREEN)
            
            # 파일명을 영어로 변경 (Whisper 호환성을 위해)
            safe_filename = "audio_" + str(int(time.time())) + ".mp3"
            safe_filepath = os.path.join(output_dir, safe_filename)
            
            # 파일 이름 변경
            shutil.copy2(original_file, safe_filepath)
            print_color(f"🔄 파일명 변경: {safe_filename}", Colors.YELLOW)
            
            return safe_filepath
        else:
            print_color("❌ 다운로드된 음성 파일을 찾을 수 없습니다.", Colors.RED)
            return None
            
    except Exception as e:
        print_color(f"❌ 다운로드 중 오류: {e}", Colors.RED)
        return None

def transcribe_audio(audio_file):
    """Whisper로 음성을 중국어 텍스트로 변환"""
    print_color(f"🎯 Whisper로 중국어 텍스트 변환 중...", Colors.BLUE)
    
    try:
        import whisper
        
        # Whisper 모델 로드
        print_color("📥 Whisper 모델 로딩 중... (처음에는 시간이 걸릴 수 있습니다)", Colors.YELLOW)
        model = whisper.load_model("large-v2")
        
        # 음성 파일 변환
        print_color("🔄 음성 인식 처리 중...", Colors.YELLOW)
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
        
        # 번체를 간체로 변환
        simplified_text = convert_traditional_to_simplified(text_content)
        
        with open(txt_file, 'w', encoding='utf-8') as f:
            f.write(simplified_text)
        
        # 2. SRT 자막 파일
        srt_file = output_dir / f"{base_name}.srt"
        write_srt(result["segments"], srt_file)
        
        # 3. VTT 웹 자막 파일
        vtt_file = output_dir / f"{base_name}.vtt"
        write_vtt(result["segments"], vtt_file)
        
        # 4. JSON 파일 (타이밍 정보 포함)
        json_file = output_dir / f"{base_name}.json"
        write_json(result, json_file)
        
        print_color(f"✅ 변환 완료!", Colors.GREEN)
        print_color(f"📄 텍스트 파일: {txt_file}", Colors.CYAN)
        print_color(f"🎬 SRT 자막: {srt_file}", Colors.CYAN)
        print_color(f"🌐 VTT 자막: {vtt_file}", Colors.CYAN)
        print_color(f"📊 JSON 데이터: {json_file}", Colors.CYAN)
        
        # 결과 미리보기
        print_color(f"\n📝 텍스트 미리보기 (간체):", Colors.BOLD)
        print_color("=" * 50, Colors.CYAN)
        preview_text = simplified_text[:200] + "..." if len(simplified_text) > 200 else simplified_text
        print_color(preview_text, Colors.WHITE)
        print_color("=" * 50, Colors.CYAN)
        
        return txt_file, srt_file, vtt_file, json_file
        
    except Exception as e:
        print_color(f"❌ 텍스트 변환 중 오류: {e}", Colors.RED)
        return None, None, None, None

def write_srt(segments, output_file):
    """SRT 자막 파일 생성"""
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start_time = format_timestamp(segment['start'])
            end_time = format_timestamp(segment['end'])
            text = segment['text'].strip()
            
            # 번체를 간체로 변환
            simplified_text = convert_traditional_to_simplified(text)
            
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{simplified_text}\n\n")

def write_vtt(segments, output_file):
    """VTT 자막 파일 생성"""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("WEBVTT\n\n")
        
        for segment in segments:
            start_time = format_timestamp_vtt(segment['start'])
            end_time = format_timestamp_vtt(segment['end'])
            text = segment['text'].strip()
            
            # 번체를 간체로 변환
            simplified_text = convert_traditional_to_simplified(text)
            
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{simplified_text}\n\n")

def write_json(result, output_file):
    """JSON 파일 생성 (타이밍 정보 포함)"""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

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

def create_html_player(srt_file, audio_file):
    """자막 하이라이트 HTML 플레이어 생성"""
    try:
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
        .audio-info {{
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #2196f3;
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
        .warning {{
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 자막 하이라이트 플레이어</h1>
        
        <div class="warning">
            <strong>⚠️ 음성 재생 문제 해결:</strong><br>
            1. 브라우저에서 F12를 눌러 개발자 도구를 열어주세요<br>
            2. Console 탭에서 오류 메시지를 확인해주세요<br>
            3. 음성이 재생되지 않으면 아래 "음성 파일 다운로드" 버튼을 사용해주세요
        </div>
        
        <div class="audio-info">
            <strong>📁 음성 파일:</strong> {audio_filename}<br>
            <button class="btn" onclick="downloadAudio()">🎵 음성 파일 다운로드</button>
        </div>
        
        <div class="audio-player">
            <audio id="audioPlayer" controls preload="metadata">
                <source src="{audio_filename}" type="audio/mpeg">
                <source src="{audio_filename}" type="audio/mp3">
                브라우저가 오디오를 지원하지 않습니다.
            </audio>
        </div>
        
        <div class="controls">
            <button class="btn" onclick="playPause()">▶️ 재생/일시정지</button>
            <button class="btn" onclick="restart()">⏮️ 처음부터</button>
            <button class="btn" onclick="toggleAutoScroll()">📜 자동 스크롤</button>
            <button class="btn" onclick="openAudioFile()">📂 음성 파일 열기</button>
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
        
        // 오디오 로드 확인
        audio.addEventListener('loadstart', () => {{
            console.log('오디오 로딩 시작');
        }});
        
        audio.addEventListener('canplay', () => {{
            console.log('오디오 재생 가능');
        }});
        
        audio.addEventListener('error', (e) => {{
            console.error('오디오 로드 오류:', e);
            alert('음성 파일을 로드할 수 없습니다. 음성 파일이 같은 폴더에 있는지 확인해주세요.');
        }});
        
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
                audio.play().catch(e => {{
                    console.error('재생 실패:', e);
                    alert('음성 재생에 실패했습니다. 브라우저 설정을 확인해주세요.');
                }});
            }} else {{
                audio.pause();
            }}
        }}
        
        // 처음부터 재생
        function restart() {{
            audio.currentTime = 0;
            audio.play().catch(e => {{
                console.error('재생 실패:', e);
            }});
        }}
        
        // 자동 스크롤 토글
        function toggleAutoScroll() {{
            autoScroll = !autoScroll;
            const btn = event.target;
            btn.textContent = autoScroll ? '📜 자동 스크롤' : '📜 수동 스크롤';
        }}
        
        // 음성 파일 다운로드
        function downloadAudio() {{
            const link = document.createElement('a');
            link.href = '{audio_filename}';
            link.download = '{audio_filename}';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}
        
        // 음성 파일 열기
        function openAudioFile() {{
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = function(e) {{
                const file = e.target.files[0];
                if (file) {{
                    const url = URL.createObjectURL(file);
                    audio.src = url;
                    audio.load();
                }}
            }};
            input.click();
        }}
        
        // 자막 클릭으로 이동
        subtitleItems.forEach(item => {{
            item.addEventListener('click', () => {{
                const start = parseFloat(item.dataset.start);
                audio.currentTime = start;
                audio.play().catch(e => {{
                    console.error('재생 실패:', e);
                }});
            }});
        }});
        
        // 이벤트 리스너
        audio.addEventListener('timeupdate', updateSubtitles);
        audio.addEventListener('loadedmetadata', () => {{
            console.log('오디오 메타데이터 로드 완료');
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
        
        print_color(f"✅ 자막 하이라이트 HTML 생성 완료: {html_file}", Colors.GREEN)
        return html_file
        
    except Exception as e:
        print_color(f"❌ HTML 생성 중 오류: {e}", Colors.RED)
        return None

def time_to_seconds(time_str):
    """SRT 타임스탬프를 초 단위로 변환"""
    # "00:01:23,456" -> 83.456
    time_parts = time_str.replace(',', '.').split(':')
    hours = int(time_parts[0])
    minutes = int(time_parts[1])
    seconds = float(time_parts[2])
    
    return hours * 3600 + minutes * 60 + seconds

def get_user_input():
    """사용자로부터 YouTube URL 입력받기"""
    # 여기에 원하는 YouTube URL을 직접 설정하세요
    # youtube_url = "https://www.youtube.com/watch?v=your_video_id"
    
    print_color("\n📺 YouTube URL을 입력해주세요:", Colors.BOLD)
    print_color("예시: https://www.youtube.com/watch?v=example", Colors.CYAN)
    
    while True:
        url = input("URL: ").strip()
        if url:
            if "youtube.com" in url or "youtu.be" in url:
                return url
            else:
                print_color("❌ 유효한 YouTube URL이 아닙니다.", Colors.RED)
        else:
            print_color("❌ URL을 입력해주세요.", Colors.RED)

def main():
    """메인 실행 함수"""
    print_header()
    
    # 환경 설정
    setup_environment()
    
    # 사용자 입력 받기
    youtube_url = get_user_input()
    
    print_color(f"\n📺 처리할 영상: {youtube_url}", Colors.BOLD)
    
    # 1. 음성 다운로드
    print_color("\n1️⃣ 음성 파일 다운로드 중...", Colors.BLUE)
    audio_file = download_audio(youtube_url)
    
    if not audio_file:
        print_color("❌ 음성 다운로드에 실패했습니다.", Colors.RED)
        return
    
    # 2. 텍스트 변환
    print_color("\n2️⃣ 중국어 텍스트 변환 중...", Colors.BLUE)
    txt_file, srt_file, vtt_file, json_file = transcribe_audio(audio_file)
    
    if txt_file:
        # 3. 자막 하이라이트 HTML 생성
        print_color("\n3️⃣ 자막 하이라이트 HTML 생성 중...", Colors.BLUE)
        html_file = create_html_player(srt_file, audio_file)
        
        print_color(f"\n🎉 모든 작업이 완료되었습니다!", Colors.BOLD + Colors.GREEN)
        print_color(f"📁 결과 파일들:", Colors.BOLD)
        print_color(f"   🎵 음성: {audio_file}", Colors.CYAN)
        print_color(f"   📄 텍스트: {txt_file}", Colors.CYAN)
        print_color(f"   🎬 SRT 자막: {srt_file}", Colors.CYAN)
        print_color(f"   🌐 VTT 자막: {vtt_file}", Colors.CYAN)
        print_color(f"   📊 JSON 데이터: {json_file}", Colors.CYAN)
        if html_file:
            print_color(f"   🎯 자막 하이라이트: {html_file}", Colors.CYAN)
        
        print_color(f"\n💡 HTML 파일을 브라우저에서 열어서 자막 하이라이트를 확인하세요!", Colors.YELLOW)
    else:
        print_color("❌ 텍스트 변환에 실패했습니다.", Colors.RED)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print_color("\n\n⏹️ 작업이 중단되었습니다.", Colors.YELLOW)
    except Exception as e:
        print_color(f"\n❌ 예상치 못한 오류: {e}", Colors.RED) 