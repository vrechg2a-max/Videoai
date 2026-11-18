import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Download,
  Film,
  Layers,
  Move,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Type as TypeIcon,
} from "lucide-react";
import {
  CropConfiguration,
  HighlightColor,
  LayoutMode,
  NormalizedBox,
  SubtitleStyle,
  ViralClip,
  WorkerHealthStatus,
} from "../types";
import { computeFfmpegParams } from "../utils/ffmpegBuilder";

const GAMER_FRAME_URL = "/src/assets/images/gamer_frame_preview_1794997210039.jpg";
const VLOG_FRAME_URL = "/src/assets/images/vlog_frame_preview_1794997209570.jpg";

interface Step3StudioProps {
  clip: ViralClip;
  videoUrl: string;
  localMediaUrl: string | null;
  localIsVideo: boolean;
  workerUrl: string;
  workerHealth: WorkerHealthStatus;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  cropConfig: CropConfiguration;
  onCropConfigChange: (config: CropConfiguration) => void;
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (style: SubtitleStyle) => void;
  onBackToRadar: () => void;
  onOpenPythonModal: () => void;
}

type DragTarget =
  | { kind: "move"; boxKey: "gameplay" | "facecam"; startX: number; startY: number; initial: NormalizedBox }
  | { kind: "resize"; boxKey: "gameplay" | "facecam"; startX: number; startY: number; initial: NormalizedBox }
  | null;

const HIGHLIGHT_SWATCHES: Array<{ label: string; color: HighlightColor }> = [
  { label: "Amarelo Hormozi", color: "#FFD700" },
  { label: "Verde Neon", color: "#00FF66" },
  { label: "Roxo Neon", color: "#A855F7" },
  { label: "Branco Puro", color: "#FFFFFF" },
];

/**
 * Computes CSS positioning for an inner 16:9 image/video inside a target slot
 * so the selected NormalizedBox fills the target slot with aspect-preserving cover fit
 * (matching FFmpeg crop + scale=...,force_original_aspect_ratio=increase + crop).
 */
function getCoverCropStyle(
  box: NormalizedBox,
  slotAspect: number,
  sourceAspect = 16 / 9
): CSSProperties {
  const boxPixelAspect = (box.width / Math.max(1, box.height)) * sourceAspect;

  let widthPct: number;
  let heightPct: number;

  if (boxPixelAspect > slotAspect) {
    // Box is wider than slot -> match height, overflow width equally
    heightPct = (100 / Math.max(5, box.height)) * 100;
    widthPct = heightPct * (sourceAspect / slotAspect);
  } else {
    // Box is taller/narrower than slot -> match width, overflow height equally
    widthPct = (100 / Math.max(5, box.width)) * 100;
    heightPct = widthPct * (slotAspect / sourceAspect);
  }

  const centerXFrac = (box.x + box.width / 2) / 100;
  const centerYFrac = (box.y + box.height / 2) / 100;

  const leftPct = 50 - centerXFrac * widthPct;
  const topPct = 50 - centerYFrac * heightPct;

  return {
    position: "absolute",
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${leftPct}%`,
    top: `${topPct}%`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

export function Step3Studio({
  clip,
  videoUrl,
  localMediaUrl,
  localIsVideo,
  workerUrl,
  workerHealth,
  layoutMode,
  onLayoutModeChange,
  cropConfig,
  onCropConfigChange,
  subtitleStyle,
  onSubtitleStyleChange,
  onBackToRadar,
  onOpenPythonModal,
}: Step3StudioProps) {
  const calibratorRef = useRef<HTMLDivElement | null>(null);
  const topVideoRef = useRef<HTMLVideoElement | null>(null);
  const bottomVideoRef = useRef<HTMLVideoElement | null>(null);
  const calibratorVideoRef = useRef<HTMLVideoElement | null>(null);

  const [dragState, setDragState] = useState<DragTarget>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackTime, setPlaybackTime] = useState(clip.startTime);
  const [copiedFfmpeg, setCopiedFfmpeg] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderSuccessMsg, setRenderSuccessMsg] = useState<string | null>(null);
  const [showOfflinePayload, setShowOfflinePayload] = useState(false);
  const [imageError, setImageError] = useState(false);

  const words = clip.words;
  const loopStart = words.length > 0 ? words[0].start : clip.startTime;
  const loopEnd =
    words.length > 0
      ? Math.max(loopStart + 4, words[words.length - 1].end + 0.4)
      : clip.startTime + 12;

  // Reset playback clock when switching clips
  useEffect(() => {
    setPlaybackTime(loopStart);
    setRenderError(null);
    setRenderSuccessMsg(null);
    setShowOfflinePayload(false);
  }, [clip.id, loopStart]);

  // Synchronized playback timer for real-time Hormozi caption preview
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setPlaybackTime((prev) => {
        const next = prev + 0.08;
        return next >= loopEnd ? loopStart : next;
      });
    }, 80);
    return () => window.clearInterval(interval);
  }, [isPlaying, loopStart, loopEnd]);

  // Sync local video elements when user uploads a local video
  useEffect(() => {
    if (!localIsVideo || !localMediaUrl) return;
    const refs = [topVideoRef.current, bottomVideoRef.current, calibratorVideoRef.current];
    refs.forEach((vid) => {
      if (!vid) return;
      if (isPlaying) {
        if (vid.paused) {
          vid.play().catch(() => {});
        }
        if (Math.abs(vid.currentTime - playbackTime) > 0.65) {
          vid.currentTime = playbackTime;
        }
      } else {
        if (!vid.paused) vid.pause();
        if (Math.abs(vid.currentTime - playbackTime) > 0.15) {
          vid.currentTime = playbackTime;
        }
      }
    });
  }, [isPlaying, playbackTime, localIsVideo, localMediaUrl]);

  // Pointer drag/resize for 16:9 interactive calibrator boxes
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const container = calibratorRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dxPct = ((e.clientX - dragState.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragState.startY) / rect.height) * 100;

      const init = dragState.initial;
      let nextBox: NormalizedBox;

      if (dragState.kind === "move") {
        nextBox = {
          ...init,
          x: Math.max(0, Math.min(100 - init.width, init.x + dxPct)),
          y: Math.max(0, Math.min(100 - init.height, init.y + dyPct)),
        };
      } else {
        nextBox = {
          ...init,
          width: Math.max(14, Math.min(100 - init.x, init.width + dxPct)),
          height: Math.max(14, Math.min(100 - init.y, init.height + dyPct)),
        };
      }

      onCropConfigChange({
        ...cropConfig,
        [dragState.boxKey]: {
          x: Number(nextBox.x.toFixed(1)),
          y: Number(nextBox.y.toFixed(1)),
          width: Number(nextBox.width.toFixed(1)),
          height: Number(nextBox.height.toFixed(1)),
        },
      });
    };

    const handlePointerUp = () => setDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, cropConfig, onCropConfigChange]);

  const startDrag = (
    e: ReactPointerEvent,
    kind: "move" | "resize",
    boxKey: "gameplay" | "facecam"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      kind,
      boxKey,
      startX: e.clientX,
      startY: e.clientY,
      initial: { ...cropConfig[boxKey] },
    });
  };

  // Compute exact FFmpeg parameters from current calibrator coordinates
  const ffmpegParams = useMemo(
    () => computeFfmpegParams(layoutMode, cropConfig, subtitleStyle),
    [layoutMode, cropConfig, subtitleStyle]
  );

  // Build Hormozi chunks (1-3 words per chunk) and detect active chunk + active word
  const activeCaptionChunk = useMemo(() => {
    if (words.length === 0) return null;
    const size = subtitleStyle.wordsPerChunk;
    const chunks: Array<{ id: string; items: typeof words; start: number; end: number }> = [];

    for (let i = 0; i < words.length; i += size) {
      const slice = words.slice(i, i + size);
      chunks.push({
        id: `chunk-${i}`,
        items: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
      });
    }

    const found =
      chunks.find((c) => playbackTime >= c.start - 0.05 && playbackTime <= c.end + 0.15) ??
      chunks[0];

    const activeWordIdx = found.items.findIndex(
      (w) => playbackTime >= w.start - 0.05 && playbackTime <= w.end + 0.15
    );

    return {
      chunkId: found.id,
      items: found.items,
      activeIndex: activeWordIdx >= 0 ? activeWordIdx : 0,
    };
  }, [words, subtitleStyle.wordsPerChunk, playbackTime]);

  const previewSourceUrl =
    localIsVideo && localMediaUrl
      ? localMediaUrl
      : layoutMode === "split_gamer"
        ? GAMER_FRAME_URL
        : VLOG_FRAME_URL;

  const renderPayload = useMemo(
    () => ({
      url: videoUrl || "LOCAL_UPLOAD",
      start_time: clip.startTime,
      end_time: clip.endTime,
      layout_mode: layoutMode,
      crop_coords: {
        sourceWidth: ffmpegParams.sourceWidth,
        sourceHeight: ffmpegParams.sourceHeight,
        gameplay: ffmpegParams.gameplay,
        facecam: ffmpegParams.facecam,
        vlogCrop: ffmpegParams.vlogCrop,
        vlogBlur: cropConfig.vlogBlur,
      },
      subtitle_style: subtitleStyle,
      word_timestamps: clip.words,
    }),
    [videoUrl, clip, layoutMode, ffmpegParams, cropConfig.vlogBlur, subtitleStyle]
  );

  const handleRenderFinal = async () => {
    setRenderError(null);
    setRenderSuccessMsg(null);

    if (!workerHealth.online || !videoUrl.trim()) {
      setShowOfflinePayload(true);
      return;
    }

    setIsRendering(true);
    try {
      const cleanWorker = workerUrl.replace(/\/+$/, "");
      const res = await fetch(`${cleanWorker}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renderPayload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Worker retornou HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `clipviper_${clip.id}_9x16.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
      setRenderSuccessMsg("MP4 9:16 renderizado e baixado com sucesso.");
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : "Falha ao renderizar no Worker Python.");
    } finally {
      setIsRendering(false);
    }
  };

  const handleCopyText = async (text: string, target: "ffmpeg" | "payload") => {
    try {
      await navigator.clipboard.writeText(text);
      if (target === "ffmpeg") {
        setCopiedFfmpeg(true);
        setTimeout(() => setCopiedFfmpeg(false), 1800);
      } else {
        setCopiedPayload(true);
        setTimeout(() => setCopiedPayload(false), 1800);
      }
    } catch {
      // Ignore clipboard failure
    }
  };

  const subtitleFontSizeClass =
    subtitleStyle.fontSize === "xl"
      ? "text-[26px]"
      : subtitleStyle.fontSize === "md"
        ? "text-[18px]"
        : "text-[22px]";

  const subtitlePositionClass =
    subtitleStyle.verticalPosition === "top"
      ? "top-8"
      : subtitleStyle.verticalPosition === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-12";

  return (
    <section className="max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBackToRadar}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar aos Cortes Sugeridos
          </button>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Estúdio de Edição 9:16 — {clip.title}
          </h1>
        </div>

        <div className="text-xs font-mono text-slate-400 tabular-nums">
          Trecho: {clip.startLabel} → {clip.endLabel} ({Math.round(clip.endTime - clip.startTime)}s)
        </div>
      </div>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): Calibrador 16:9 + Legendas Hormozi */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Layout Mode Selector */}
          <div className="rounded-xl bg-[#12151F] border border-white/8 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#8B5CF6]" />
                Modo de Enquadramento Vertical (1080×1920)
              </h2>
              <button
                type="button"
                onClick={() =>
                  onCropConfigChange({
                    gameplay: { x: 24, y: 6, width: 52, height: 84 },
                    facecam: { x: 1, y: 39, width: 25, height: 30 },
                    vlogZoom: 1.25,
                    vlogCenterX: 50,
                    vlogBlur: 24,
                  })
                }
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resetar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onLayoutModeChange("split_gamer")}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  layoutMode === "split_gamer"
                    ? "bg-[#8B5CF6]/15 border-[#8B5CF6] text-white"
                    : "bg-[#090A0F] border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                <div className="text-xs font-semibold">Modo 1: Split-Screen Gamer</div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  70% Gameplay no topo + 30% Facecam na base
                </div>
              </button>

              <button
                type="button"
                onClick={() => onLayoutModeChange("vlog_blur")}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  layoutMode === "vlog_blur"
                    ? "bg-[#8B5CF6]/15 border-[#8B5CF6] text-white"
                    : "bg-[#090A0F] border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                <div className="text-xs font-semibold">Modo 2: Vlog / Zoom com Blur</div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Fundo 9:16 desfocado (boxblur) + cena central
                </div>
              </button>
            </div>

            {/* Interactive 16:9 Frame Calibrator */}
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-[#10B981]" />
                  {layoutMode === "split_gamer"
                    ? "Arraste e redimensione os quadros sobre o frame 16:9"
                    : "Ajuste o foco horizontal e zoom sobre o frame 16:9"}
                </span>

                {layoutMode === "split_gamer" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onCropConfigChange({
                          ...cropConfig,
                          facecam: { x: 1, y: 39, width: 25, height: 30 },
                        })
                      }
                      className="text-[11px] text-slate-300 hover:text-white underline decoration-white/20"
                    >
                      Cam Inf. Esq.
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        onCropConfigChange({
                          ...cropConfig,
                          facecam: { x: 74, y: 66, width: 24, height: 31 },
                        })
                      }
                      className="text-[11px] text-slate-300 hover:text-white underline decoration-white/20"
                    >
                      Cam Inf. Dir.
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        onCropConfigChange({
                          ...cropConfig,
                          facecam: { x: 2, y: 4, width: 24, height: 30 },
                        })
                      }
                      className="text-[11px] text-slate-300 hover:text-white underline decoration-white/20"
                    >
                      Cam Sup. Esq.
                    </button>
                  </div>
                )}
              </div>

              {/* 16:9 Canvas */}
              <div
                ref={calibratorRef}
                className="relative w-full aspect-video rounded-lg overflow-hidden bg-[#090A0F] border border-white/15 select-none touch-none"
              >
                {localIsVideo && localMediaUrl ? (
                  <video
                    ref={calibratorVideoRef}
                    src={localMediaUrl}
                    muted
                    playsInline
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : !imageError ? (
                  <img
                    src={previewSourceUrl}
                    alt="Frame 16:9 para calibragem de corte"
                    referrerPolicy="no-referrer"
                    onError={() => setImageError(true)}
                    className="w-full h-full object-cover opacity-85"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#161925] to-[#090A0F] flex items-center justify-center text-xs text-slate-500">
                    Frame 16:9 (1920×1080)
                  </div>
                )}

                {layoutMode === "split_gamer" ? (
                  <>
                    {/* Gameplay Crop Box (Purple) */}
                    <div
                      onPointerDown={(e) => startDrag(e, "move", "gameplay")}
                      style={{
                        left: `${cropConfig.gameplay.x}%`,
                        top: `${cropConfig.gameplay.y}%`,
                        width: `${cropConfig.gameplay.width}%`,
                        height: `${cropConfig.gameplay.height}%`,
                      }}
                      className="absolute border-2 border-[#8B5CF6] bg-[#8B5CF6]/15 cursor-move"
                    >
                      <span className="inline-block px-1.5 py-0.5 bg-[#8B5CF6] text-[10px] font-semibold text-white">
                        Gameplay 70%
                      </span>
                      <div
                        onPointerDown={(e) => startDrag(e, "resize", "gameplay")}
                        className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-sm bg-[#8B5CF6] border border-white cursor-nwse-resize"
                        title="Redimensionar Gameplay"
                      />
                    </div>

                    {/* Facecam Crop Box (Emerald) */}
                    <div
                      onPointerDown={(e) => startDrag(e, "move", "facecam")}
                      style={{
                        left: `${cropConfig.facecam.x}%`,
                        top: `${cropConfig.facecam.y}%`,
                        width: `${cropConfig.facecam.width}%`,
                        height: `${cropConfig.facecam.height}%`,
                      }}
                      className="absolute border-2 border-[#10B981] bg-[#10B981]/20 cursor-move"
                    >
                      <span className="inline-block px-1.5 py-0.5 bg-[#10B981] text-[10px] font-semibold text-[#090A0F]">
                        Facecam 30%
                      </span>
                      <div
                        onPointerDown={(e) => startDrag(e, "resize", "facecam")}
                        className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-sm bg-[#10B981] border border-white cursor-nwse-resize"
                        title="Redimensionar Facecam"
                      />
                    </div>
                  </>
                ) : (
                  /* Vlog Focal Box */
                  <div
                    style={{
                      left: `${Math.max(0, Math.min(100 - 100 / cropConfig.vlogZoom, cropConfig.vlogCenterX - 50 / cropConfig.vlogZoom))}%`,
                      top: `${(100 - 100 / cropConfig.vlogZoom) / 2}%`,
                      width: `${100 / cropConfig.vlogZoom}%`,
                      height: `${100 / cropConfig.vlogZoom}%`,
                    }}
                    className="absolute border-2 border-[#8B5CF6] bg-[#8B5CF6]/10 pointer-events-none"
                  >
                    <span className="inline-block px-1.5 py-0.5 bg-[#8B5CF6] text-[10px] font-semibold text-white">
                      Foco Principal ({cropConfig.vlogZoom.toFixed(2)}x)
                    </span>
                  </div>
                )}
              </div>

              {/* Vlog Sliders */}
              {layoutMode === "vlog_blur" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <label className="flex flex-col gap-1.5 text-xs text-slate-300">
                    <span className="flex justify-between font-mono tabular-nums">
                      <span>Zoom Central</span>
                      <span className="text-[#C4B5FD]">{cropConfig.vlogZoom.toFixed(2)}x</span>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={1.8}
                      step={0.05}
                      value={cropConfig.vlogZoom}
                      onChange={(e) =>
                        onCropConfigChange({ ...cropConfig, vlogZoom: Number(e.target.value) })
                      }
                      className="accent-[#8B5CF6]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs text-slate-300">
                    <span className="flex justify-between font-mono tabular-nums">
                      <span>Centro Horizontal</span>
                      <span className="text-[#C4B5FD]">{cropConfig.vlogCenterX}%</span>
                    </span>
                    <input
                      type="range"
                      min={15}
                      max={85}
                      step={1}
                      value={cropConfig.vlogCenterX}
                      onChange={(e) =>
                        onCropConfigChange({ ...cropConfig, vlogCenterX: Number(e.target.value) })
                      }
                      className="accent-[#8B5CF6]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs text-slate-300">
                    <span className="flex justify-between font-mono tabular-nums">
                      <span>BoxBlur Fundo</span>
                      <span className="text-[#10B981]">{cropConfig.vlogBlur}px</span>
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      step={1}
                      value={cropConfig.vlogBlur}
                      onChange={(e) =>
                        onCropConfigChange({ ...cropConfig, vlogBlur: Number(e.target.value) })
                      }
                      className="accent-[#10B981]"
                    />
                  </label>
                </div>
              )}

              {/* Generated FFmpeg Filter Output */}
              <div className="mt-2 p-3 rounded-lg bg-[#090A0F] border border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">
                    Parâmetros FFmpeg Gerados (1920×1080 → 1080×1920)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(ffmpegParams.filterComplex, "ffmpeg")}
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
                  >
                    {copiedFfmpeg ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                    {copiedFfmpeg ? "Copiado" : "Copiar filtro"}
                  </button>
                </div>
                <code className="text-[11px] font-mono text-[#10B981] break-all leading-relaxed">
                  {ffmpegParams.filterComplex}
                </code>
              </div>
            </div>
          </div>

          {/* Hormozi Subtitle Customizer */}
          <div className="rounded-xl bg-[#12151F] border border-white/8 p-5 flex flex-col gap-4">
            <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
              <TypeIcon className="w-4 h-4 text-[#FFD700]" />
              Customizador de Legendas Dinâmicas (Estilo Hormozi)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Words per chunk */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Palavras por bloco</span>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#090A0F] border border-white/10">
                  {([1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onSubtitleStyleChange({ ...subtitleStyle, wordsPerChunk: count })}
                      className={`py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                        subtitleStyle.wordsPerChunk === count
                          ? "bg-[#8B5CF6] text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {count} {count === 1 ? "palavra" : "palavras"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vertical Position */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Posição vertical</span>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#090A0F] border border-white/10">
                  {(
                    [
                      { id: "bottom", label: "Base" },
                      { id: "center", label: "Centro" },
                      { id: "top", label: "Topo" },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() =>
                        onSubtitleStyleChange({ ...subtitleStyle, verticalPosition: pos.id })
                      }
                      className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                        subtitleStyle.verticalPosition === pos.id
                          ? "bg-[#8B5CF6] text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Highlight Color Swatches */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Cor de destaque na palavra ativa</span>
                <div className="flex items-center gap-2">
                  {HIGHLIGHT_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.color}
                      type="button"
                      onClick={() =>
                        onSubtitleStyleChange({ ...subtitleStyle, highlightColor: swatch.color })
                      }
                      title={swatch.label}
                      className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                        subtitleStyle.highlightColor === swatch.color
                          ? "border-white scale-105"
                          : "border-white/15 opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: swatch.color }}
                    />
                  ))}
                  <span className="text-xs font-mono text-slate-300 ml-1">
                    {subtitleStyle.highlightColor}
                  </span>
                </div>
              </div>

              {/* Font Size + Toggles */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Tamanho e efeitos</span>
                <div className="flex flex-wrap items-center gap-2">
                  {(["md", "lg", "xl"] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onSubtitleStyleChange({ ...subtitleStyle, fontSize: sz })}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-mono uppercase transition-colors border ${
                        subtitleStyle.fontSize === sz
                          ? "bg-[#8B5CF6]/20 border-[#8B5CF6] text-white"
                          : "bg-[#090A0F] border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      onSubtitleStyleChange({
                        ...subtitleStyle,
                        thickOutline: !subtitleStyle.thickOutline,
                      })
                    }
                    className={`px-2.5 py-1.5 rounded-md text-xs transition-colors border ${
                      subtitleStyle.thickOutline
                        ? "bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]"
                        : "bg-[#090A0F] border-white/10 text-slate-400"
                    }`}
                  >
                    Borda Grossa
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onSubtitleStyleChange({
                        ...subtitleStyle,
                        popAnimation: !subtitleStyle.popAnimation,
                      })
                    }
                    className={`px-2.5 py-1.5 rounded-md text-xs transition-colors border ${
                      subtitleStyle.popAnimation
                        ? "bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]"
                        : "bg-[#090A0F] border-white/10 text-slate-400"
                    }`}
                  >
                    Pop-In
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): 9:16 Live Preview Player + Render Button */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          <div className="rounded-xl bg-[#12151F] border border-white/8 p-5 flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#8B5CF6]" />
                Preview 9:16 em Tempo Real
              </span>
              <span className="font-mono tabular-nums">1080×1920</span>
            </div>

            {/* 9:16 Vertical Viewport */}
            <div className="relative w-full max-w-[320px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-white/15 shadow-2xl">
              {layoutMode === "split_gamer" ? (
                <div className="w-full h-full flex flex-col">
                  {/* Top 70%: Gameplay */}
                  <div className="relative w-full h-[70%] overflow-hidden bg-[#090A0F]">
                    {localIsVideo && localMediaUrl ? (
                      <video
                        ref={topVideoRef}
                        src={localMediaUrl}
                        muted
                        playsInline
                        style={getCoverCropStyle(cropConfig.gameplay, 9 / (16 * 0.7))}
                      />
                    ) : !imageError ? (
                      <img
                        src={GAMER_FRAME_URL}
                        alt="Preview Gameplay 70%"
                        referrerPolicy="no-referrer"
                        style={getCoverCropStyle(cropConfig.gameplay, 9 / (16 * 0.7))}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#141826]" />
                    )}
                  </div>

                  {/* Subtle hairline divider between gameplay & facecam */}
                  <div className="h-[2px] w-full bg-black/90 shrink-0" />

                  {/* Bottom 30%: Facecam */}
                  <div className="relative w-full h-[30%] overflow-hidden bg-[#090A0F]">
                    {localIsVideo && localMediaUrl ? (
                      <video
                        ref={bottomVideoRef}
                        src={localMediaUrl}
                        muted
                        playsInline
                        style={getCoverCropStyle(cropConfig.facecam, 9 / (16 * 0.3))}
                      />
                    ) : !imageError ? (
                      <img
                        src={GAMER_FRAME_URL}
                        alt="Preview Facecam 30%"
                        referrerPolicy="no-referrer"
                        style={getCoverCropStyle(cropConfig.facecam, 9 / (16 * 0.3))}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#10141F]" />
                    )}
                  </div>
                </div>
              ) : (
                /* Vlog Blur Mode */
                <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                  {/* Blurred 9:16 Background */}
                  {localIsVideo && localMediaUrl ? (
                    <video
                      ref={bottomVideoRef}
                      src={localMediaUrl}
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover scale-110"
                      style={{ filter: `blur(${Math.round(cropConfig.vlogBlur * 0.6)}px) brightness(0.65)` }}
                    />
                  ) : !imageError ? (
                    <img
                      src={VLOG_FRAME_URL}
                      alt="Fundo Blur 9:16"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover scale-110"
                      style={{ filter: `blur(${Math.round(cropConfig.vlogBlur * 0.6)}px) brightness(0.65)` }}
                    />
                  ) : null}

                  {/* Centered Foreground */}
                  <div className="relative w-full aspect-video overflow-hidden shadow-2xl z-10">
                    {localIsVideo && localMediaUrl ? (
                      <video
                        ref={topVideoRef}
                        src={localMediaUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        style={{
                          transform: `scale(${cropConfig.vlogZoom})`,
                          transformOrigin: `${cropConfig.vlogCenterX}% 50%`,
                        }}
                      />
                    ) : !imageError ? (
                      <img
                        src={VLOG_FRAME_URL}
                        alt="Cena Principal Centralizada"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        style={{
                          transform: `scale(${cropConfig.vlogZoom})`,
                          transformOrigin: `${cropConfig.vlogCenterX}% 50%`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {/* Live Hormozi Subtitle Overlay */}
              {activeCaptionChunk && (
                <div
                  key={
                    subtitleStyle.popAnimation
                      ? `${activeCaptionChunk.chunkId}-${activeCaptionChunk.activeIndex}`
                      : activeCaptionChunk.chunkId
                  }
                  className={`absolute inset-x-3 z-20 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center pointer-events-none ${subtitlePositionClass} ${
                    subtitleStyle.popAnimation ? "animate-hormozi-pop" : ""
                  }`}
                >
                  {activeCaptionChunk.items.map((w, idx) => {
                    const isActive = idx === activeCaptionChunk.activeIndex;
                    return (
                      <span
                        key={`${w.word}-${idx}`}
                        className={`font-hormozi uppercase leading-none tracking-tight ${subtitleFontSizeClass}`}
                        style={{
                          color: isActive ? subtitleStyle.highlightColor : "#FFFFFF",
                          WebkitTextStroke: subtitleStyle.thickOutline ? "2.5px #000000" : "1px #000000",
                          paintOrder: "stroke fill",
                          textShadow: subtitleStyle.thickOutline
                            ? "0 4px 10px rgba(0,0,0,0.95), 2px 2px 0 #000, -2px -2px 0 #000"
                            : "0 2px 6px rgba(0,0,0,0.85)",
                        }}
                      >
                        {w.word}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Playback Transport Controls */}
            <div className="w-full max-w-[320px] flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="p-2 rounded-lg bg-[#090A0F] border border-white/10 text-white hover:border-[#8B5CF6] transition-colors shrink-0"
                aria-label={isPlaying ? "Pausar preview" : "Reproduzir preview"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min={loopStart}
                max={loopEnd}
                step={0.05}
                value={playbackTime}
                onChange={(e) => setPlaybackTime(Number(e.target.value))}
                className="flex-1 accent-[#8B5CF6]"
                aria-label="Linha do tempo do corte"
              />

              <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                {playbackTime.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Render Final MP4 CTA Card */}
          <div className="rounded-xl bg-[#12151F] border border-white/8 p-5 flex flex-col gap-3">
            <button
              type="button"
              disabled={isRendering}
              onClick={handleRenderFinal}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg text-sm font-semibold bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-[#090A0F] transition-colors"
            >
              <Download className="w-4 h-4" />
              {isRendering ? "Renderizando MP4 9:16 no Worker..." : "Renderizar MP4 Final"}
            </button>

            <p className="text-xs text-slate-400 leading-relaxed">
              {workerHealth.online
                ? `Envia o payload completo para ${workerUrl}/render e baixa o .mp4 1080×1920 com legendas .ass.`
                : "Worker Python offline: clique acima para inspecionar o JSON de renderização ou copie o server.py."}
            </p>

            {renderSuccessMsg && (
              <div className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-xs text-[#10B981]">
                {renderSuccessMsg}
              </div>
            )}

            {renderError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {renderError}
              </div>
            )}

            {showOfflinePayload && (
              <div className="mt-1 p-3.5 rounded-lg bg-[#090A0F] border border-white/10 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Modo Preview · Worker Python Offline
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(JSON.stringify(renderPayload, null, 2), "payload")}
                      className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1"
                    >
                      {copiedPayload ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
                      {copiedPayload ? "Copiado" : "Copiar JSON"}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPythonModal}
                      className="text-xs text-[#C4B5FD] hover:text-white inline-flex items-center gap-1"
                    >
                      <Code2 className="w-3 h-3" />
                      Ver server.py
                    </button>
                  </div>
                </div>
                <pre className="max-h-40 overflow-auto text-[10px] font-mono text-slate-300 leading-relaxed">
                  {JSON.stringify(renderPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
