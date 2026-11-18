import { Code2, Cpu, RefreshCw, Server, Sparkles } from "lucide-react";
import { ServerConfigStatus, WorkerHealthStatus } from "../types";

interface ConfigSidebarProps {
  workerUrl: string;
  onWorkerUrlChange: (value: string) => void;
  workerHealth: WorkerHealthStatus;
  checkingWorker: boolean;
  onTestWorker: () => void;
  serverStatus: ServerConfigStatus;
  currentStep: 1 | 2 | 3;
  canAccessStep2: boolean;
  canAccessStep3: boolean;
  onSelectStep: (step: 1 | 2 | 3) => void;
  onOpenPythonModal: () => void;
}

export function ConfigSidebar({
  workerUrl,
  onWorkerUrlChange,
  workerHealth,
  checkingWorker,
  onTestWorker,
  serverStatus,
  currentStep,
  canAccessStep2,
  canAccessStep3,
  onSelectStep,
  onOpenPythonModal,
}: ConfigSidebarProps) {
  return (
    <aside className="w-full lg:w-[272px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/8 bg-[#0D0F16] p-5 flex flex-col gap-6">
      {/* Pipeline Steps */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 mb-3">Fluxo de Produção</h2>
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible" aria-label="Etapas do pipeline">
          <button
            type="button"
            onClick={() => onSelectStep(1)}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-left ${
              currentStep === 1
                ? "bg-[#8B5CF6]/15 text-white border border-[#8B5CF6]/40"
                : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <span>01. Entrada e Contexto</span>
          </button>

          <button
            type="button"
            disabled={!canAccessStep2}
            onClick={() => canAccessStep2 && onSelectStep(2)}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-left ${
              currentStep === 2
                ? "bg-[#8B5CF6]/15 text-white border border-[#8B5CF6]/40"
                : canAccessStep2
                  ? "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  : "text-slate-600 cursor-not-allowed border border-transparent"
            }`}
          >
            <span>02. Radar e Cortes</span>
          </button>

          <button
            type="button"
            disabled={!canAccessStep3}
            onClick={() => canAccessStep3 && onSelectStep(3)}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-left ${
              currentStep === 3
                ? "bg-[#8B5CF6]/15 text-white border border-[#8B5CF6]/40"
                : canAccessStep3
                  ? "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  : "text-slate-600 cursor-not-allowed border border-transparent"
            }`}
          >
            <span>03. Estúdio 9:16</span>
          </button>
        </nav>
      </div>

      <div className="h-px bg-white/8" />

      {/* Worker Python Config */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-[#8B5CF6]" />
            Worker Python (FFmpeg)
          </span>
          <span
            className={`text-xs font-medium tabular-nums ${
              workerHealth.online ? "text-[#10B981]" : "text-amber-400"
            }`}
          >
            {workerHealth.online
              ? `Online (${workerHealth.latencyMs ?? 0}ms)`
              : "Offline · Preview"}
          </span>
        </div>

        <label className="block">
          <span className="sr-only">URL do Worker Python</span>
          <input
            type="url"
            value={workerUrl}
            onChange={(e) => onWorkerUrlChange(e.target.value)}
            placeholder="http://localhost:8000"
            className="w-full px-3 py-2 rounded-lg bg-[#090A0F] border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#8B5CF6]"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTestWorker}
            disabled={checkingWorker}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingWorker ? "animate-spin" : ""}`} />
            {checkingWorker ? "Testando..." : "Testar Conexão"}
          </button>
          <button
            type="button"
            onClick={onOpenPythonModal}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 text-[#C4B5FD] border border-[#8B5CF6]/30 transition-colors whitespace-nowrap"
            title="Abrir código server.py"
          >
            <Code2 className="w-3.5 h-3.5" />
            server.py
          </button>
        </div>

        {!workerHealth.online && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            Modo Preview ativo no navegador. Conecte o worker local ou Ngrok para baixar links e exportar MP4 final.
          </p>
        )}
        {workerHealth.online && (
          <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono">
            <span>FFmpeg: {workerHealth.ffmpegAvailable ? "OK" : "Ausente"}</span>
            <span aria-hidden="true">·</span>
            <span>yt-dlp: {workerHealth.ytdlpAvailable ? "OK" : "Ausente"}</span>
          </div>
        )}
      </div>

      <div className="h-px bg-white/8" />

      {/* Server AI Engines Status */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-[#10B981]" />
          Motores de IA (Server Proxy)
        </span>

        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
              Gemini Flash
            </span>
            <span className={serverStatus.geminiConfigured ? "text-[#10B981] font-medium" : "text-amber-400"}>
              {serverStatus.geminiConfigured ? "Conectado" : "Sem chave"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-slate-400">Groq Whisper v3</span>
            <span className={serverStatus.groqConfigured ? "text-[#10B981] font-medium" : "text-slate-400"}>
              {serverStatus.groqConfigured ? "Ativo" : "Fallback Gemini"}
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Chaves gerenciadas com segurança via variáveis de ambiente no servidor.
        </p>
      </div>
    </aside>
  );
}
