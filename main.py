import asyncio
import os
import re
import uuid
import time
from urllib.parse import urlparse
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import yt_dlp
import json
import secrets
from fastapi import Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
# Configuration
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024 # 1 GB

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Video Downloader")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, "admin")
    correct_password = secrets.compare_digest(credentials.password, "supervidxeno")
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

STATS_FILE = 'stats.json'

def update_stats(format_id, file_size, url):
    stats = {
        "total_downloads": 0,
        "total_bytes": 0,
        "mp4_downloads": 0,
        "mp3_downloads": 0,
        "youtube_downloads": 0,
        "tiktok_downloads": 0
    }
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, 'r') as f:
                stats = json.load(f)
        except:
            pass
            
    stats["total_downloads"] = stats.get("total_downloads", 0) + 1
    stats["total_bytes"] = stats.get("total_bytes", 0) + file_size
    
    if format_id == 'mp3':
        stats["mp3_downloads"] = stats.get("mp3_downloads", 0) + 1
    else:
        stats["mp4_downloads"] = stats.get("mp4_downloads", 0) + 1
        
    if 'youtube.com' in url or 'youtu.be' in url:
        stats["youtube_downloads"] = stats.get("youtube_downloads", 0) + 1
    elif 'tiktok.com' in url:
        stats["tiktok_downloads"] = stats.get("tiktok_downloads", 0) + 1
        
    with open(STATS_FILE, 'w') as f:
        json.dump(stats, f)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# Store queues for SSE
progress_queues = {}

def is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        # Allow youtube and tiktok domains
        allowed = ["youtube.com", "youtu.be", "tiktok.com", "v.tiktok.com", "vm.tiktok.com"]
        return domain in allowed
    except Exception:
        return False

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/admin", response_class=HTMLResponse)
def admin_page(username: str = Depends(get_current_username)):
    if os.path.exists("static/admin.html"):
        with open("static/admin.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="Admin page not found.")

@app.get("/api/stats")
def get_stats(username: str = Depends(get_current_username)):
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'r') as f:
            return json.load(f)
    return {
        "total_downloads": 0,
        "total_bytes": 0,
        "mp4_downloads": 0,
        "mp3_downloads": 0,
        "youtube_downloads": 0,
        "tiktok_downloads": 0
    }

@app.get("/api/info")
@limiter.limit("10/minute")
async def get_video_info(request: Request, url: str):
    if not is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL. Only YouTube and TikTok are supported.")

    ffmpeg_exec = './ffmpeg.exe' if os.name == 'nt' else 'ffmpeg'
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
        'ffmpeg_location': ffmpeg_exec,
    }
    
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    def fetch_info():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await asyncio.to_thread(fetch_info)
        
        if info.get('_type') == 'playlist':
            entries = []
            for e in info.get('entries', []):
                if e and e.get('id'):
                    video_url = e.get('url')
                    if not video_url and info.get('extractor_key') == 'Youtube':
                        video_url = f"https://www.youtube.com/watch?v={e.get('id')}"
                    elif not video_url:
                        continue
                    
                    entries.append({
                        "id": e.get('id'),
                        "title": e.get('title'),
                        "duration": e.get('duration'),
                        "thumbnail": e.get('thumbnails')[0]['url'] if e.get('thumbnails') else None,
                        "url": video_url
                    })
            return {
                "is_playlist": True,
                "title": info.get('title'),
                "entries": entries
            }

        return {
            "is_playlist": False,
            "id": info.get("id"),
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "extractor": info.get("extractor_key"),
            "formats": [
                {
                    "format_id": f.get("format_id"),
                    "resolution": f.get("resolution") or f"{f.get('width')}x{f.get('height')}",
                    "ext": f.get("ext"),
                    "vcodec": f.get("vcodec"),
                    "acodec": f.get("acodec"),
                    "filesize": f.get("filesize") or f.get("filesize_approx")
                }
                for f in info.get("formats", [])
                if f.get("vcodec") != "none" # Only video formats
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def download_video_sync(url: str, format_id: str, embed_subs: bool, start_time: float, end_time: float, task_id: str, loop: asyncio.AbstractEventLoop):
    # progress hook
    def hook(d):
        if task_id in progress_queues:
            if d['status'] == 'downloading':
                p = d.get('_percent_str', '0%').strip()
                s = d.get('_speed_str', '0KiB/s').strip()
                eta = d.get('_eta_str', '00:00').strip()
                asyncio.run_coroutine_threadsafe(
                    progress_queues[task_id].put({"status": "downloading", "percent": p, "speed": s, "eta": eta}),
                    loop
                )
            elif d['status'] == 'finished':
                asyncio.run_coroutine_threadsafe(
                    progress_queues[task_id].put({"status": "processing"}),
                    loop
                )

    file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.%(ext)s")
    
    import os
    ffmpeg_exec = './ffmpeg.exe' if os.name == 'nt' else 'ffmpeg'
    
    # Common opts
    opts = {
        'outtmpl': file_path,
        'progress_hooks': [hook],
        'ffmpeg_location': ffmpeg_exec,
        'max_filesize': MAX_FILE_SIZE,
        'noplaylist': True,
    }
    
    if start_time is not None or end_time is not None:
        s = start_time if start_time is not None else 0.0
        e = end_time if end_time is not None else 999999.0
        opts['download_ranges'] = lambda info, ydl: [{'start_time': s, 'end_time': e}]
        
        # ffmpeg doesn't emit progress hooks for download_ranges, so let the user know
        if task_id in progress_queues:
            asyncio.run_coroutine_threadsafe(
                progress_queues[task_id].put({"status": "downloading", "percent": "Trimming...", "speed": "", "eta": "Depends on length"}),
                loop
            )
    
    if format_id == 'mp3':
        ydl_opts = {
            **opts,
            'format': 'bestaudio/best',
            'writethumbnail': True,
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                },
                {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                },
                {
                    'key': 'EmbedThumbnail',
                    'already_have_thumbnail': False,
                }
            ],
            'postprocessor_args': {
                'default': [
                    '-metadata', 'encoded_by=Vidxeno',
                    '-metadata', 'publisher=Vidxeno'
                ]
            }
        }
    else:
        ydl_opts = {
            **opts,
            'format': f'{format_id}+bestaudio/best' if format_id else 'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'merge_output_format': 'mp4',
            'postprocessors': [
                {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                }
            ],
            'postprocessor_args': {
                'default': [
                    '-metadata', 'encoded_by=Vidxeno',
                    '-metadata', 'publisher=Vidxeno'
                ]
            }
        }
        if embed_subs:
            ydl_opts['writesubtitles'] = True
            ydl_opts['writeautomaticsub'] = False # Auto-subs trigger HTTP 429 very quickly
            ydl_opts['subtitleslangs'] = ['en', 'lt'] # Only manual subs
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegSubtitlesConvertor',
                'format': 'srt',
            })
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegEmbedSubtitle',
            })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        # Optional HEVC Transcoding check
        final_file = None
        for ext in ['.mp4', '.webm', '.mkv', '.mp3']:
            p = os.path.join(DOWNLOAD_DIR, f"{task_id}{ext}")
            if os.path.exists(p):
                final_file = p
                break
                
        if final_file and format_id != 'mp3':
            import subprocess
            import json
            import os
            
            ffmpeg_cmd = './ffmpeg.exe' if os.name == 'nt' else 'ffmpeg'
            ffprobe_cmd = './ffprobe.exe' if os.name == 'nt' else 'ffprobe'
            
            probe_cmd = [
                ffprobe_cmd, '-v', 'quiet', '-print_format', 'json', 
                '-show_streams', final_file
            ]
            try:
                probe_output = subprocess.check_output(probe_cmd)
                probe_data = json.loads(probe_output)
                video_codec = None
                for stream in probe_data.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        video_codec = stream.get('codec_name')
                        break
                        
                if video_codec and video_codec not in ['h264', 'vp9', 'av1']:
                    if task_id in progress_queues:
                        asyncio.run_coroutine_threadsafe(
                            progress_queues[task_id].put({"status": "processing", "detail": f"Converting {video_codec.upper()} to MP4 (H.264) for compatibility..."}),
                            loop
                        )
                    out_file = os.path.join(DOWNLOAD_DIR, f"{task_id}_h264.mp4")
                    convert_cmd = [
                        ffmpeg_cmd, '-y', '-i', final_file,
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                        '-c:a', 'copy',
                        '-metadata', 'encoded_by=Vidxeno',
                        '-metadata', 'publisher=Vidxeno',
                        out_file
                    ]
                    subprocess.run(convert_cmd, check=True)
                    os.remove(final_file)
                    os.rename(out_file, final_file)
            except Exception as e:
                pass

        if final_file and os.path.exists(final_file):
            try:
                size = os.path.getsize(final_file)
                update_stats(format_id, size, url)
            except:
                pass

        if task_id in progress_queues:
            asyncio.run_coroutine_threadsafe(
                progress_queues[task_id].put({"status": "completed"}),
                loop
            )
            
    except Exception as e:
        if task_id in progress_queues:
            asyncio.run_coroutine_threadsafe(
                progress_queues[task_id].put({"status": "error", "detail": str(e)}),
                loop
            )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Failed to download thumbnail: {str(e)}")

import urllib.request
import urllib.parse
from fastapi.responses import Response

@app.get("/api/thumbnail")
def download_thumbnail(url: str, name: str = "thumbnail.jpg"):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            content = response.read()
            # Determine content type (usually jpeg or webp)
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            # Support unicode filenames properly
            encoded_name = urllib.parse.quote(name)
            headers = {
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"
            }
            return Response(content=content, media_type=content_type, headers=headers)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Failed to download thumbnail: {str(e)}")

@app.post("/api/download")
@limiter.limit("5/minute")
async def start_download(request: Request, body: dict, background_tasks: BackgroundTasks):
    url = body.get("url")
    format_id = body.get("format_id")
    embed_subs = body.get("embed_subs", False)
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    
    if not url or not is_valid_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL.")

    task_id = str(uuid.uuid4())
    progress_queues[task_id] = asyncio.Queue()
    
    loop = asyncio.get_running_loop()
    # Run in executor to not block the event loop
    asyncio.get_running_loop().run_in_executor(None, download_video_sync, url, format_id, embed_subs, start_time, end_time, task_id, loop)
    
    return {"task_id": task_id}

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    if task_id not in progress_queues:
        raise HTTPException(status_code=404, detail="Task not found")
        
    async def event_generator():
        import json
        try:
            while True:
                data = await progress_queues[task_id].get()
                yield {"data": json.dumps(data)}
                if data.get("status") in ["completed", "error"]:
                    break
        finally:
            if task_id in progress_queues:
                del progress_queues[task_id]
                
    return EventSourceResponse(event_generator())

@app.get("/api/file/{task_id}")
async def get_file(task_id: str, name: str = None):
    # Find the file that exactly matches task_id.ext
    for ext in ["mp4", "webm", "mkv", "mp3"]:
        filename = f"{task_id}.{ext}"
        file_path = os.path.join(DOWNLOAD_DIR, filename)
        if os.path.exists(file_path):
            media_type = 'audio/mpeg' if ext == 'mp3' else 'video/mp4'
            dl_name = name if name else filename
            return FileResponse(file_path, filename=dl_name, media_type=media_type)
            
    # Fallback to any file starting with task_id but not containing .f (temp files) or .part
    for filename in os.listdir(DOWNLOAD_DIR):
        if filename.startswith(task_id) and ".f" not in filename and ".part" not in filename:
            if filename.endswith(('.jpg', '.webp', '.png')):
                continue
            file_path = os.path.join(DOWNLOAD_DIR, filename)
            media_type = 'audio/mpeg' if filename.endswith('.mp3') else 'video/mp4'
            dl_name = name if name else filename
            return FileResponse(file_path, filename=dl_name, media_type=media_type)
            
    raise HTTPException(status_code=404, detail="File not found")

# Background task for cleanup
async def cleanup_old_files():
    while True:
        try:
            now = time.time()
            for filename in os.listdir(DOWNLOAD_DIR):
                file_path = os.path.join(DOWNLOAD_DIR, filename)
                # If older than 1 hour (3600 seconds)
                if os.path.isfile(file_path) and os.stat(file_path).st_mtime < now - 3600:
                    os.remove(file_path)
        except Exception:
            pass
        await asyncio.sleep(600) # Check every 10 minutes

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_old_files())
