import { ArrowLeft, ArrowRight, ExternalLink, Globe, Scissors, Search, Sparkles, TrendingUp } from "lucide-react";
import { AnalysisResponse, ViralClip } from "../types";

interface Step2RadarProps {
  analysis: AnalysisResponse;
  selectedClipId: string | null;
  onSelectClipForStudio: (clip: ViralClip) => void;
  onBackToInput: () => void;
}

function renderHighlightedExcerpt(excerpt: string, highlightWords: string[]) {
  if (!excerpt) return null;
  const cleanTargets = highlightWords
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 1);

  if (cleanTargets.length === 0) {
    return <span>{excerpt}</span>;
  }

  const parts = excerpt.split(/(\s+)/);
  return (
    <>
      {parts.map((part, idx) => {
        const normalized = part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        const isHit = cleanTargets.includes(normalized);
        if (isHit) {
          return (
            <span key={idx} className="text-[#FFD700] font-semibold">
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

export function Step2Radar({
  analysis,
  selectedClipId,
  onSelectClipForStudio,
  onBackToInput,
}: Step2RadarProps) {
  const { trendRadar, clips, transcriptSource } = analysis;

  const sourceLabel =
    transcriptSource === "groq"
      ? "Transcrição Groq Whisper v3"
      : transcriptSource === "gemini_audio"
        ? "Transcrição Gemini Áudio"
        : transcriptSource === "worker"
          ? "Extração Worker Python"
          : "Modo Preview Inteligente (URL + Grounding)";

  return (
    <section className="max-w-5xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
            <button
              type="button"
              onClick={onBackToInput}
              className="inline-flex items-center gap-1 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar à entrada
            </button>
            <span aria-hidden="true">·</span>
            <span>{sourceLabel}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Radar de Trends e Cortes Virais
          </h1>
        </div>

        {clips.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectClipForStudio(clips.find((c) => c.id === selectedClipId) ?? clips[0])}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white transition-colors whitespace-nowrap shrink-0"
          >
            Abrir Melhor Corte no Estúdio
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Radar de Trends Atualizado */}
      <div className="rounded-xl bg-[#12151F] border border-white/8 p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-[#10B981]" />
            <h2 className="font-display text-lg font-bold text-white">
              Radar de Trends Atualizado — {trendRadar.topic}
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#8B5CF6]" />
            Google Search Grounding ativo
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{trendRadar.summary}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-white/8">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-2.5">
              O que está em alta agora
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-slate-200">
              {trendRadar.trendingAngles.map((angle, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-[#10B981] mt-0.5 tabular-nums">
                    0{i + 1}.
                  </span>
                  <span>{angle}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
              Como o algoritmo selecionou os cortes
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {trendRadar.selectionStrategy}
            </p>
          </div>
        </div>

        {/* Grounding Queries & Verified Web Sources */}
        {(trendRadar.searchQueries.length > 0 || trendRadar.sources.length > 0) && (
          <div className="pt-4 border-t border-white/8 flex flex-col gap-3">
            {trendRadar.searchQueries.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Consultas executadas:</span>
                {trendRadar.searchQueries.map((q, idx) => (
                  <span key={idx} className="font-mono text-slate-300">
                    "{q}"{idx < trendRadar.searchQueries.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </div>
            )}

            {trendRadar.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="text-slate-400">Fontes verificadas:</span>
                {trendRadar.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#C4B5FD] hover:text-white underline decoration-white/20 underline-offset-4 transition-colors max-w-[260px] truncate"
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggested Clips List */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[#8B5CF6]" />
            Cortes Sugeridos ({clips.length})
          </h2>
          <span className="text-xs text-slate-400">
            Selecione um corte para calibrar o enquadramento 9:16 e legendas
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {clips.map((clip, index) => {
            const isSelected = clip.id === selectedClipId;
            const duration = Math.max(1, Math.round(clip.endTime - clip.startTime));

            return (
              <article
                key={clip.id}
                className={`rounded-xl bg-[#12151F] border p-5 sm:p-6 flex flex-col gap-4 transition-colors ${
                  isSelected ? "border-[#8B5CF6]/60" : "border-white/8 hover:border-white/15"
                }`}
              >
                {/* Top metadata line + Score */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                      <span className="text-[#C4B5FD] font-semibold">Corte 0{index + 1}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {clip.startLabel} – {clip.endLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{duration}s</span>
                    </div>

                    <h3 className="font-display text-lg font-bold text-white leading-snug">
                      {clip.title}
                    </h3>
                  </div>

                  {/* Virality Score */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-slate-400">Score Viral</span>
                      <span className="font-mono text-xl font-bold text-[#10B981] tabular-nums">
                        {clip.viralityScore}
                      </span>
                      <span className="font-mono text-xs text-slate-500">/100</span>
                    </div>
                    <div className="w-28 h-1.5 rounded-full bg-[#090A0F] overflow-hidden">
                      <div
                        className="h-full bg-[#10B981] rounded-full"
                        style={{ width: `${clip.viralityScore}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Trend Justification & Hook */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Justificativa de Trend:</span>
                    {clip.scoreJustification}
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Gancho de Retenção (3s):</span>
                    {clip.hookReason}
                  </div>
                </div>

                {/* Transcript Excerpt */}
                {clip.transcriptExcerpt && (
                  <div className="p-3.5 rounded-lg bg-[#090A0F] border border-white/8 text-sm text-slate-300 leading-relaxed">
                    "{renderHighlightedExcerpt(clip.transcriptExcerpt, clip.highlightWords)}"
                  </div>
                )}

                {/* Hashtags + CTA */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                    {clip.hashtags.map((tag, i) => (
                      <span key={i}>
                        {tag.startsWith("#") ? tag : `#${tag}`}
                        {i < clip.hashtags.length - 1 ? " ·" : ""}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectClipForStudio(clip)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Abrir no Estúdio 9:16
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
