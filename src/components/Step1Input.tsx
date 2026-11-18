import { ChangeEvent, useRef } from "react";
import {
  Clock,
  FileAudio,
  Flame,
  Instagram,
  Link2,
  Play,
  Radio,
  Trash2,
  Tv,
  Upload,
  Youtube,
} from "lucide-react";
import { ClipDurationRange, VideoPlatform } from "../types";
import { detectPlatformFromUrl, getPlatformLabel } from "../utils/ffmpegBuilder";

interface Step1InputProps {
  videoUrl: string;
  onVideoUrlChange: (val: string) => void;
  localFile: File | null;
  localMediaUrl: string | null;
  localMediaDuration: number;
  onSelectLocalFile: (file: File | null) => void;
  topic: string;
  onTopicChange: (val: string) => void;
  clipDuration: ClipDurationRange;
  onClipDurationChange: (val: ClipDurationRange) => void;
  isAnalyzing: boolean;
  analysisStage: string;
  errorMessage: string | null;
  onStartAnalysis: () => void;
}

const TOPIC_PRESETS = [
  "CS2 Major, Gaules, Clutch na Mirage",
  "Valorant Ranked, Rage e Outplay",
  "Vlog de Viagem Japão e Gastronomia",
  "Podcast Tech e Bastidores",
];

function PlatformIcon({ platform }: { platform: VideoPlatform }) {
  switch (platform) {
    case "youtube":
      return <Youtube className="w-4 h-4 text-red-400" />;
    case "twitch":
      return <Tv className="w-4 h-4 text-[#A855F7]" />;
    case "kick":
      return <Radio className="w-4 h-4 text-[#10B981]" />;
    case "instagram":
      return <Instagram className="w-4 h-4 text-pink-400" />;
    case "local":
      return <FileAudio className="w-4 h-4 text-[#10B981]" />;
    default:
      return <Link2 className="w-4 h-4 text-slate-400" />;
  }
}

export function Step1Input({
  videoUrl,
  onVideoUrlChange,
  localFile,
  localMediaUrl,
  localMediaDuration,
  onSelectLocalFile,
  topic,
  onTopicChange,
  clipDuration,
  onClipDurationChange,
  isAnalyzing,
  analysisStage,
  errorMessage,
  onStartAnalysis,
}: Step1InputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detectedPlatform: VideoPlatform = localFile ? "local" : detectPlatformFromUrl(videoUrl);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      onSelectLocalFile(file);
    }
  };

  const canSubmit = !isAnalyzing && (Boolean(videoUrl.trim()) || Boolean(localFile) || Boolean(topic.trim()));

  return (
    <section className="max-w-4xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Entrada de Vídeo e Contexto Viral
        </h1>
        <p className="text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
          Cole o link de uma live ou vídeo longo, ou suba um arquivo local. O Gemini analisa o contexto com busca na web em tempo real para pinçar os trechos com maior potencial de retenção.
        </p>
      </div>

      {/* Main Input Card */}
      <div className="rounded-xl bg-[#12151F] border border-white/8 p-6 flex flex-col gap-6">
        {/* Video URL Field */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="video-url-input" className="text-sm font-semibold text-white">
              Link do Vídeo ou Live (YouTube, Twitch, Kick, Instagram)
            </label>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <PlatformIcon platform={detectedPlatform} />
              <span>{getPlatformLabel(detectedPlatform)}</span>
            </div>
          </div>

          <div className="relative">
            <input
              id="video-url-input"
              type="url"
              value={videoUrl}
              onChange={(e) => onVideoUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... ou https://twitch.tv/videos/..."
              className="w-full pl-4 pr-11 py-3 rounded-lg bg-[#090A0F] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <PlatformIcon platform={detectedPlatform} />
            </div>
          </div>
        </div>

        {/* Local File Upload Alternative */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-400">
            Ou faça upload de vídeo/áudio local para transcrição direta e preview em tempo real (até 24 MB)
          </span>

          {!localFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-5 px-4 rounded-lg border border-dashed border-white/15 bg-[#090A0F]/60 hover:bg-[#090A0F] hover:border-[#8B5CF6]/60 transition-colors flex flex-col sm:flex-row items-center justify-center gap-3 text-center"
            >
              <Upload className="w-5 h-5 text-[#8B5CF6]" />
              <div className="text-left">
                <p className="text-sm font-medium text-slate-200">
                  Selecionar MP4, WebM, MP3 ou WAV do computador
                </p>
                <p className="text-xs text-slate-500">
                  Ideal para testar transcrição Groq/Gemini e sincronização de legendas no navegador
                </p>
              </div>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg bg-[#090A0F] border border-[#10B981]/30">
              <div className="flex items-center gap-3 min-w-0">
                <FileAudio className="w-5 h-5 text-[#10B981] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{localFile.name}</p>
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    {(localFile.size / (1024 * 1024)).toFixed(2)} MB
                    {localMediaDuration > 0 ? ` · ${Math.round(localMediaDuration)}s de mídia` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectLocalFile(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors shrink-0"
                aria-label="Remover arquivo local"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {localMediaUrl && localFile?.type.startsWith("video/") && (
            <video
              src={localMediaUrl}
              controls
              className="mt-2 w-full max-h-52 rounded-lg bg-black border border-white/10 object-contain"
            />
          )}
        </div>

        <div className="h-px bg-white/8" />

        {/* Topic / Search Grounding Guide */}
        <div className="flex flex-col gap-2.5">
          <label htmlFor="topic-input" className="text-sm font-semibold text-white">
            Tópico / Jogo / Streamer (Guia o Google Search Grounding)
          </label>
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="Ex: CS2 Major, Gaules, Clutch insano ou Vlog de viagem"
            className="w-full px-4 py-3 rounded-lg bg-[#090A0F] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#8B5CF6] transition-colors"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500">Sugestões rápidas:</span>
            {TOPIC_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onTopicChange(preset)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap ${
                  topic === preset
                    ? "bg-[#8B5CF6]/20 text-white border border-[#8B5CF6]/50"
                    : "bg-[#090A0F] text-slate-400 hover:text-white border border-white/10"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Duration Range Selector */}
        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#8B5CF6]" />
            Duração Alvo dos Cortes
          </span>
          <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-[#090A0F] border border-white/10 max-w-md">
            {(["15-30s", "30-60s", "60-90s"] as ClipDurationRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => onClipDurationChange(range)}
                className={`py-2 px-3 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                  clipDuration === range
                    ? "bg-[#8B5CF6] text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {errorMessage && (
          <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Submit CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#10B981]" />
            <span>
              {localFile
                ? "Arquivo local será transcrito com timestamps antes da análise viral."
                : "Usa Google Search em tempo real + Whisper (se worker online) ou Preview Inteligente."}
            </span>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={onStartAnalysis}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            {isAnalyzing ? analysisStage || "Processando..." : "Analisar Trends e Gerar Cortes"}
          </button>
        </div>
      </div>
    </section>
  );
}
