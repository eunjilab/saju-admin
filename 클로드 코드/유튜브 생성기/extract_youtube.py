#!/usr/bin/env python3
"""
YouTube 영상 정보 추출 스크립트
- 영상 메타데이터 (제목, 채널, 조회수 등)
- 영상 설명
- 자막/스크립트 (가능한 경우)
- Markdown 형식으로 저장
"""

import json
import sys
import re
from datetime import datetime
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
except ImportError:
    print("Error: yt-dlp를 설치해주세요")
    print("실행: pip install yt-dlp")
    sys.exit(1)


def format_duration(seconds):
    """초를 HH:MM:SS 형식으로 변환"""
    if not seconds:
        return "알 수 없음"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def format_number(num):
    """숫자를 읽기 쉬운 형식으로 변환"""
    if not num:
        return "알 수 없음"
    if num >= 1_000_000_000:
        return f"{num / 1_000_000_000:.1f}B"
    if num >= 1_000_000:
        return f"{num / 1_000_000:.1f}M"
    if num >= 1_000:
        return f"{num / 1_000:.1f}K"
    return str(num)


def format_date(date_str):
    """YYYYMMDD 형식을 읽기 쉬운 날짜로 변환"""
    if not date_str:
        return "알 수 없음"
    try:
        date = datetime.strptime(date_str, "%Y%m%d")
        return date.strftime("%Y년 %m월 %d일")
    except:
        return date_str


def extract_subtitles(info):
    """자막 데이터 추출"""
    subtitles_text = ""

    # 자동 생성 자막 확인
    auto_captions = info.get('automatic_captions', {})
    subtitles = info.get('subtitles', {})

    # 한국어 우선, 없으면 영어
    for lang in ['ko', 'ko-KR', 'en', 'en-US', 'en-GB']:
        if lang in subtitles:
            return f"[{lang} 자막 사용 가능]"
        if lang in auto_captions:
            return f"[{lang} 자동 생성 자막 사용 가능]"

    if subtitles:
        langs = list(subtitles.keys())[:3]
        return f"[자막 사용 가능: {', '.join(langs)}]"

    if auto_captions:
        langs = list(auto_captions.keys())[:3]
        return f"[자동 생성 자막 사용 가능: {', '.join(langs)}]"

    return "[자막 없음]"


def fetch_transcript(url, lang='ko'):
    """youtube-transcript-api를 사용하여 실제 자막 텍스트 가져오기"""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        # URL에서 video_id 추출
        video_id = None
        patterns = [
            r'(?:v=|/v/|youtu\.be/)([^&\n?#]+)',
            r'(?:embed/)([^&\n?#]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                video_id = match.group(1)
                break

        if not video_id:
            return None

        # 새 API 방식 (youtube-transcript-api 1.x+)
        api = YouTubeTranscriptApi()

        try:
            # 자막 가져오기
            transcript = api.fetch(video_id)
            # 자막 텍스트 합치기
            text = "\n".join([snippet.text for snippet in transcript.snippets])
            return text
        except Exception as e:
            print(f"자막 가져오기 실패: {e}", file=sys.stderr)
            return None

    except ImportError:
        return None
    except Exception as e:
        print(f"자막 가져오기 실패: {e}", file=sys.stderr)
        return None


def extract_video_info(url):
    """YouTube 영상 정보 추출"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['ko', 'en'],
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            # 자막 텍스트 가져오기 시도
            transcript = fetch_transcript(url)
            subtitle_info = extract_subtitles(info)

            video_data = {
                'title': info.get('title', '제목 없음'),
                'video_id': info.get('id'),
                'url': url,
                'channel': info.get('uploader', '알 수 없음'),
                'channel_url': info.get('uploader_url', ''),
                'duration': format_duration(info.get('duration')),
                'duration_seconds': info.get('duration'),
                'upload_date': format_date(info.get('upload_date')),
                'view_count': format_number(info.get('view_count')),
                'view_count_raw': info.get('view_count'),
                'like_count': format_number(info.get('like_count')),
                'like_count_raw': info.get('like_count'),
                'comment_count': format_number(info.get('comment_count')),
                'description': info.get('description', '설명 없음'),
                'thumbnail': info.get('thumbnail', ''),
                'tags': info.get('tags', []),
                'categories': info.get('categories', []),
                'subtitle_info': subtitle_info,
                'transcript': transcript,
                'extracted_at': datetime.now().isoformat()
            }
            return video_data

    except Exception as e:
        print(f"Error: {url} 정보 추출 실패 - {str(e)}", file=sys.stderr)
        return None


def generate_markdown(video_data):
    """비디오 데이터를 Markdown 형식으로 변환"""

    md = f"""# {video_data['title']}

## 기본 정보

| 항목 | 내용 |
|------|------|
| **채널** | [{video_data['channel']}]({video_data['channel_url']}) |
| **업로드** | {video_data['upload_date']} |
| **길이** | {video_data['duration']} |
| **조회수** | {video_data['view_count']} |
| **좋아요** | {video_data['like_count']} |
| **댓글 수** | {video_data['comment_count']} |
| **원본 URL** | {video_data['url']} |

"""

    if video_data['thumbnail']:
        md += f"## 썸네일\n\n![썸네일]({video_data['thumbnail']})\n\n"

    if video_data['tags']:
        tags_str = ', '.join(video_data['tags'][:15])  # 최대 15개
        md += f"## 태그\n\n{tags_str}\n\n"

    md += f"""## 설명

{video_data['description']}

## 자막/스크립트

"""

    if video_data['transcript']:
        # 자막이 너무 길면 앞부분만
        transcript = video_data['transcript']
        if len(transcript) > 10000:
            transcript = transcript[:10000] + "\n\n... (자막이 너무 길어 일부만 표시됩니다)"
        md += f"{transcript}\n\n"
    else:
        md += f"{video_data['subtitle_info']}\n\n"

    md += f"""## AI 요약 요청

> 이 영상의 내용을 요약해주세요.

---
*추출 시간: {video_data['extracted_at']}*
"""

    return md


def save_markdown(video_data, output_dir=None):
    """Markdown 파일로 저장"""

    # 파일명 생성 (특수문자 제거)
    safe_title = re.sub(r'[<>:"/\\|?*]', '', video_data['title'])
    safe_title = safe_title[:50]  # 최대 50자
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"youtube_{safe_title}_{timestamp}.md"

    if output_dir:
        filepath = Path(output_dir) / filename
    else:
        filepath = Path(filename)

    md_content = generate_markdown(video_data)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md_content)

    return filepath


def main():
    if len(sys.argv) < 2:
        print("사용법: python3 extract_youtube.py <YouTube_URL> [출력_디렉토리]")
        print("\n예시:")
        print("  python3 extract_youtube.py 'https://www.youtube.com/watch?v=VIDEO_ID'")
        print("  python3 extract_youtube.py 'https://youtu.be/VIDEO_ID' ./output")
        sys.exit(1)

    url = sys.argv[1]
    # 기본 출력 디렉토리: 스크립트 위치의 결과물 폴더
    default_output = Path(__file__).parent / "결과물"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else default_output

    print(f"📥 영상 정보 추출 중: {url}")

    video_data = extract_video_info(url)

    if not video_data:
        print("❌ 영상 정보를 가져올 수 없습니다.")
        sys.exit(1)

    print(f"✅ 제목: {video_data['title']}")
    print(f"📺 채널: {video_data['channel']}")
    print(f"⏱️ 길이: {video_data['duration']}")
    print(f"👁️ 조회수: {video_data['view_count']}")

    # Markdown 저장
    filepath = save_markdown(video_data, output_dir)
    print(f"\n📄 저장됨: {filepath}")

    # JSON으로도 출력 (Claude가 파싱하기 쉽게)
    print("\n--- JSON_DATA_START ---")
    json_output = {
        'title': video_data['title'],
        'channel': video_data['channel'],
        'duration': video_data['duration'],
        'view_count': video_data['view_count'],
        'description': video_data['description'][:500] + "..." if len(video_data['description']) > 500 else video_data['description'],
        'transcript_preview': video_data['transcript'][:1000] + "..." if video_data['transcript'] and len(video_data['transcript']) > 1000 else video_data['transcript'],
        'saved_file': str(filepath)
    }
    print(json.dumps(json_output, ensure_ascii=False, indent=2))
    print("--- JSON_DATA_END ---")


if __name__ == '__main__':
    main()
