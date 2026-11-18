export const PYTHON_REQUIREMENTS_TXT = `fastapi==0.115.0
uvicorn[standard]==0.30.6
yt-dlp>=2024.10.22
httpx==0.27.2
pydantic==2.9.2
python-multipart==0.0.12
`;

export const PYTHON_SERVER_PY = `"""
ClipViper AI - Worker Auxiliar de Download, Extração e Renderização 9:16
Stack: FastAPI + yt-dlp + FFmpeg + Groq Whisper (whisper-large-v3)

Execução local:
  pip install -r requirements.txt
  export GROQ_API_KEY="gsk_..."   # Opcional (para extração direta via /extract)
  uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Literal, Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="ClipViper AI Worker", version="1.0.0")

# Permite requisições do Front-end (Vercel, localhost ou preview)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORK_DIR = Path(tempfile.gettempdir()) / "clipviper_worker"
WORK_DIR.mkdir(parents=True, exist_ok=True)


# -----------------------------
# Schemas
# -----------------------------
class ExtractRequest(BaseModel):
    url: str
    groq_api_key: Optional[str] = None
    language: str = "pt"


class CropRect(BaseModel):
    x: int
    y: int
    w: int
    h: int


class CropCoordsPayload(BaseModel):
    sourceWidth: int = 1920
    sourceHeight: int = 1080
    gameplay: CropRect
    facecam: CropRect
    vlogCrop: CropRect
    vlogBlur: int = 24


class SubtitleStylePayload(BaseModel):
    wordsPerChunk: int = 2
    highlightColor: str = "#FFD700"
    fontSize: Literal["md", "lg", "xl"] = "lg"
    verticalPosition: Literal["bottom", "center", "top"] = "bottom"
    thickOutline: bool = True
    popAnimation: bool = True


class WordTimestampPayload(BaseModel):
    word: str
    start: float
    end: float
    isHighlight: Optional[bool] = False


class RenderRequest(BaseModel):
    url: str
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., gt=0)
    layout_mode: Literal["split_gamer", "vlog_blur"] = "split_gamer"
    crop_coords: CropCoordsPayload
    subtitle_style: SubtitleStylePayload
    word_timestamps: List[WordTimestampPayload] = []


# -----------------------------
# Helpers
# -----------------------------
def run_cmd(cmd: List[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Comando falhou ({' '.join(cmd[:3])}): {proc.stderr[-1200:]}")
    return proc.stdout


def hex_to_ass_bgr(hex_color: str) -> str:
    """Converte #RRGGBB para formato ASS &H00BBGGRR&"""
    cleaned = hex_color.lstrip("#")
    if len(cleaned) != 6:
        return "&H0000D7FF&"
    r, g, b = cleaned[0:2], cleaned[2:4], cleaned[4:6]
    return f"&H00{b}{g}{r}&".upper()


def format_ass_time(seconds: float) -> str:
    s = max(0.0, seconds)
    hrs = int(s // 3600)
    mins = int((s % 3600) // 60)
    secs = int(s % 60)
    cs = int(round((s - int(s)) * 100))
    if cs >= 100:
        cs = 99
    return f"{hrs}:{mins:02d}:{secs:02d}.{cs:02d}"


def build_hormozi_ass(
    words: List[WordTimestampPayload],
    clip_start: float,
    style: SubtitleStylePayload,
    out_path: Path,
) -> None:
    font_size_map = {"md": 66, "lg": 82, "xl": 98}
    font_size = font_size_map.get(style.fontSize, 82)
    outline_w = 8 if style.thickOutline else 3

    # Alinhamento ASS: 2=bottom-center, 5=middle-center, 8=top-center
    align_map = {"bottom": 2, "center": 5, "top": 8}
    alignment = align_map.get(style.verticalPosition, 2)
    margin_v = 280 if style.verticalPosition == "bottom" else (180 if style.verticalPosition == "top" else 0)
    highlight_ass = hex_to_ass_bgr(style.highlightColor)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,Montserrat Black,{font_size},&H00FFFFFF&,&H000000FF&,&H00000000&,&H80000000&,-1,0,0,0,100,100,0,0,1,{outline_w},4,{alignment},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: List[str] = []
    chunk_size = max(1, min(3, style.wordsPerChunk))

    for i in range(0, len(words), chunk_size):
        chunk = words[i : i + chunk_size]
        if not chunk:
            continue
        for active_idx, active_word in enumerate(chunk):
            rel_start = max(0.0, active_word.start - clip_start)
            rel_end = max(rel_start + 0.12, active_word.end - clip_start)

            styled_tokens = []
            for j, w in enumerate(chunk):
                clean_txt = w.word.upper().replace("{", "").replace("}", "")
                if j == active_idx:
                    pop_tag = r"\\fscx114\\fscy114\\t(0,85,\\fscx100\\fscy100)" if style.popAnimation else ""
                    styled_tokens.append(f"{{{pop_tag}\\c{highlight_ass}}}{clean_txt}{{\\c&H00FFFFFF&}}")
                else:
                    styled_tokens.append(clean_txt)

            line_text = " ".join(styled_tokens)
            events.append(
                f"Dialogue: 0,{format_ass_time(rel_start)},{format_ass_time(rel_end)},Hormozi,,0,0,0,,{line_text}"
            )

    out_path.write_text(header + "\\n".join(events), encoding="utf-8")


def cleanup_dir(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


# -----------------------------
# Endpoints
# -----------------------------
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "yt_dlp": shutil.which("yt-dlp") is not None,
    }


@app.post("/extract")
async def extract_audio_and_transcribe(payload: ExtractRequest):
    job_dir = WORK_DIR / f"extract_{uuid.uuid4().hex[:10]}"
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        video_tpl = str(job_dir / "source.%(ext)s")
        run_cmd([
            "yt-dlp",
            "-f", "bv*[height<=1080]+ba/b[height<=1080]/best",
            "--no-playlist",
            "-o", video_tpl,
            payload.url,
        ])
        downloaded = next(job_dir.glob("source.*"), None)
        if not downloaded:
            raise HTTPException(status_code=500, detail="Download concluído mas arquivo não encontrado.")

        audio_path = job_dir / "audio_16k.mp3"
        run_cmd([
            "ffmpeg", "-y", "-i", str(downloaded),
            "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
            str(audio_path),
        ])

        groq_key = payload.groq_api_key or os.getenv("GROQ_API_KEY")
        if not groq_key:
            return {
                "status": "audio_ready",
                "message": "Áudio extraído com sucesso. Configure GROQ_API_KEY para transcrição automática no worker.",
            }

        async with httpx.AsyncClient(timeout=180.0) as client:
            with audio_path.open("rb") as f:
                files = {"file": ("audio_16k.mp3", f, "audio/mpeg")}
                data = [
                    ("model", "whisper-large-v3"),
                    ("language", payload.language),
                    ("response_format", "verbose_json"),
                    ("timestamp_granularities[]", "word"),
                    ("timestamp_granularities[]", "segment"),
                ]
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {groq_key}"},
                    files=files,
                    data=data,
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                transcription = resp.json()

        return {
            "status": "transcribed",
            "text": transcription.get("text", ""),
            "words": transcription.get("words", []),
            "segments": transcription.get("segments", []),
        }
    finally:
        cleanup_dir(job_dir)


@app.post("/render")
def render_vertical_clip(payload: RenderRequest, background_tasks: BackgroundTasks):
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="end_time deve ser maior que start_time.")

    job_dir = WORK_DIR / f"render_{uuid.uuid4().hex[:10]}"
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        raw_clip = job_dir / "segment.mp4"
        duration = payload.end_time - payload.start_time

        # 1. Download apenas do trecho exato com yt-dlp --download-sections
        section_arg = f"*{payload.start_time:.2f}-{payload.end_time:.2f}"
        run_cmd([
            "yt-dlp",
            "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
            "--download-sections", section_arg,
            "--force-keyframes-at-cuts",
            "--no-playlist",
            "-o", str(raw_clip),
            payload.url,
        ])

        if not raw_clip.exists():
            raise HTTPException(status_code=500, detail="Falha ao baixar segmento de vídeo.")

        # 2. Gerar arquivo .ass estilo Hormozi
        ass_path = job_dir / "captions.ass"
        build_hormozi_ass(payload.word_timestamps, payload.start_time, payload.subtitle_style, ass_path)
        ass_escaped = str(ass_path).replace("\\\\", "/").replace(":", "\\\\:")

        # 3. Montar filtro FFmpeg 9:16 (1080x1920)
        c = payload.crop_coords
        if payload.layout_mode == "split_gamer":
            g, f = c.gameplay, c.facecam
            filter_complex = (
                f"[0:v]crop={g.w}:{g.h}:{g.x}:{g.y},scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344[game];"
                f"[0:v]crop={f.w}:{f.h}:{f.x}:{f.y},scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576[cam];"
                f"[game][cam]vstack=inputs=2,ass='{ass_escaped}'[vout]"
            )
        else:
            vc = c.vlogCrop
            blur = max(8, min(45, c.vlogBlur))
            filter_complex = (
                f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur={blur}:5[bg];"
                f"[0:v]crop={vc.w}:{vc.h}:{vc.x}:{vc.y},scale=1080:-2[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2,ass='{ass_escaped}'[vout]"
            )

        output_mp4 = job_dir / f"clipviper_{uuid.uuid4().hex[:8]}.mp4"
        run_cmd([
            "ffmpeg", "-y",
            "-i", str(raw_clip),
            "-t", f"{duration:.2f}",
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "19",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(output_mp4),
        ])

        background_tasks.add_task(cleanup_dir, job_dir)
        return FileResponse(
            path=str(output_mp4),
            media_type="video/mp4",
            filename=output_mp4.name,
        )
    except Exception as exc:
        cleanup_dir(job_dir)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
`;
