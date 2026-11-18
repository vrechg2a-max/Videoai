import { useCallback, useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import { ConfigSidebar } from "./components/ConfigSidebar";
import { PythonCodeModal } from "./components/PythonCodeModal";
import { Step1Input } from "./components/Step1Input";
import { Step2Radar } from "./components/Step2Radar";
import { Step3Studio } from "./components/Step3Studio";
import {
  AnalysisResponse,
  ClipDurationRange,
  CropConfiguration,
  LayoutMode,
  ServerConfigStatus,
  SubtitleStyle,
  TranscriptSegment,
  ViralClip,
  WordTimestamp,
  WorkerHealthStatus,
} from "./types";
import { detectPlatformFromUrl } from "./utils/ffmpegBuilder";

const WORKER_URL_STORAGE_KEY = "clipviper_python_worker_url";

export default function App() {
  const [workerUrl, setWorkerUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(WORKER_URL_STORAGE_KEY) || "http://localhost:8000";
    } catch {
      return "http://localhost:8000";
    }
  });

  const [workerHealth, setWorkerHealth] = useState<WorkerHealthStatus>({ online: false });
  const [checkingWorker, setCheckingWorker] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerConfigStatus>({
    geminiConfigured: true,
    groqConfigured: false,
  });

  const [isPythonModalOpen, setIsPythonModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [videoUrl, setVideoUrl] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localMediaUrl, setLocalMediaUrl] = useState<string | null>(null);
  const [localMediaDuration, setLocalMediaDuration] = useState(0);
  const [topic, setTopic] = useState("CS2 Major, Gaules, Clutch na Mirage");
  const [clipDuration, setClipDuration] = useState<ClipDurationRange>("30-60s");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 2 & 3 state
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [selectedClip, setSelectedClip] = useState<ViralClip | null>(null);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split_gamer");
  const [cropConfig, setCropConfig] = useState<CropConfiguration>({
    gameplay: { x: 24, y: 6, width: 52, height: 84 },
    facecam: { x: 1, y: 39, width: 25, height: 30 },
    vlogZoom: 1.25,
    vlogCenterX: 50,
    vlogBlur: 24,
  });
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    wordsPerChunk: 2,
    highlightColor: "#FFD700",
    fontSize: "lg",
    verticalPosition: "bottom",
    thickOutline: true,
    popAnimation: true,
  });

  // Persist worker URL in localStorage
  const handleWorkerUrlChange = (value: string) => {
    setWorkerUrl(value);
    try {
      localStorage.setItem(WORKER_URL_STORAGE_KEY, value);
    } catch {
      // Ignore storage quota errors
    }
  };

  // Probe Worker Python /health endpoint
  const testWorkerConnection = useCallback(async () => {
    const clean = workerUrl.trim().replace(/\/+$/, "");
    if (!clean) {
      setWorkerHealth({ online: false });
      return;
    }

    setCheckingWorker(true);
    const start = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(`${clean}/health`, { signal: controller.signal });
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) {
        setWorkerHealth({ online: false });
        return;
      }
      const data = (await res.json()) as { ffmpeg?: boolean; yt_dlp?: boolean };
      setWorkerHealth({
        online: true,
        latencyMs,
        ffmpegAvailable: Boolean(data.ffmpeg),
        ytdlpAvailable: Boolean(data.yt_dlp),
        checkedAt: new Date().toISOString(),
      });
    } catch {
      setWorkerHealth({ online: false });
    } finally {
      window.clearTimeout(timeout);
      setCheckingWorker(false);
    }
  }, [workerUrl]);

  // Initial engine status + worker health check
  useEffect(() => {
    fetch("/api/config/status")
      .then((r) => r.json())
      .then((data: ServerConfigStatus) => setServerStatus(data))
      .catch(() => {});
    testWorkerConnection();
  }, [testWorkerConnection]);

  // Handle local media ObjectURL & duration metadata
  const handleSelectLocalFile = (file: File | null) => {
    if (localMediaUrl) {
      URL.revokeObjectURL(localMediaUrl);
    }
    setLocalFile(file);
    setLocalMediaDuration(0);

    if (!file) {
      setLocalMediaUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalMediaUrl(objectUrl);

    const probe = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    probe.preload = "metadata";
    probe.src = objectUrl;
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration)) {
        setLocalMediaDuration(probe.duration);
      }
    };
  };

  useEffect(() => {
    return () => {
      if (localMediaUrl) {
        URL.revokeObjectURL(localMediaUrl);
      }
    };
  }, [localMediaUrl]);

  // Main pipeline: Transcribe (if file or online worker) -> Analyze with Gemini Search Grounding
  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    setIsAnalyzing(true);

    try {
      let transcriptText = "";
      let segments: TranscriptSegment[] = [];
      let words: WordTimestamp[] = [];
      let transcriptSource: AnalysisResponse["transcriptSource"] = "url_context_preview";

      if (localFile) {
        setAnalysisStage("Transcrevendo mídia local com timestamps...");
        const formData = new FormData();
        formData.append("file", localFile);

        const trRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const trData = (await trRes.json()) as {
          error?: string;
          source?: "groq" | "gemini_audio";
          text?: string;
          segments?: TranscriptSegment[];
          words?: WordTimestamp[];
        };

        if (!trRes.ok) {
          throw new Error(trData.error || "Falha ao transcrever arquivo local.");
        }

        transcriptText = trData.text ?? "";
        segments = trData.segments ?? [];
        words = trData.words ?? [];
        transcriptSource = trData.source ?? "gemini_audio";
      } else if (videoUrl.trim() && workerHealth.online) {
        setAnalysisStage("Extraindo áudio via Worker Python...");
        const cleanWorker = workerUrl.trim().replace(/\/+$/, "");
        const extRes = await fetch(`${cleanWorker}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: videoUrl.trim(), language: "pt" }),
        });

        if (extRes.ok) {
          const extData = (await extRes.json()) as {
            status?: string;
            text?: string;
            segments?: TranscriptSegment[];
            words?: WordTimestamp[];
          };
          if (extData.text) {
            transcriptText = extData.text;
            segments = extData.segments ?? [];
            words = extData.words ?? [];
            transcriptSource = "worker";
          }
        }
      }

      setAnalysisStage("Pesquisando trends no Google Search + ranqueando cortes...");
      const platform = localFile ? "local" : detectPlatformFromUrl(videoUrl);

      const analyzeRes = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          platform,
          topic: topic.trim(),
          clipDuration,
          transcriptText,
          segments,
          words,
          transcriptSource,
          mediaDurationSeconds: localMediaDuration,
        }),
      });

      const analyzeData = (await analyzeRes.json()) as AnalysisResponse & { error?: string };
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || "Erro na análise viral com Gemini.");
      }

      setAnalysis(analyzeData);
      if (analyzeData.clips.length > 0) {
        setSelectedClip(analyzeData.clips[0]);
      }

      // Smart default layout based on topic keywords
      const lowerTopic = topic.toLowerCase();
      if (lowerTopic.includes("vlog") || lowerTopic.includes("podcast") || lowerTopic.includes("viagem")) {
        setLayoutMode("vlog_blur");
      } else {
        setLayoutMode("split_gamer");
      }

      setCurrentStep(2);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erro inesperado durante o processamento."
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisStage("");
    }
  };

  const handleSelectClipForStudio = (clip: ViralClip) => {
    setSelectedClip(clip);
    setCurrentStep(3);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-[#F1F5F9]">
      {/* Top Bar Contract: [Brand title] — [Nav links] — [1 Primary action] */}
      <header className="h-16 px-6 border-b border-white/8 bg-[#090A0F] flex items-center justify-between gap-8 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setCurrentStep(1);
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ClipViper AI
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentStep === 1 ? "text-white underline decoration-[#8B5CF6] underline-offset-8" : ""
            }`}
          >
            Entrada
          </button>
          <button
            type="button"
            disabled={!analysis}
            onClick={() => analysis && setCurrentStep(2)}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              !analysis
                ? "text-slate-600 cursor-not-allowed"
                : currentStep === 2
                  ? "text-white underline decoration-[#8B5CF6] underline-offset-8"
                  : "hover:text-white"
            }`}
          >
            Radar & Cortes
          </button>
          <button
            type="button"
            disabled={!selectedClip}
            onClick={() => selectedClip && setCurrentStep(3)}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              !selectedClip
                ? "text-slate-600 cursor-not-allowed"
                : currentStep === 3
                  ? "text-white underline decoration-[#8B5CF6] underline-offset-8"
                  : "hover:text-white"
            }`}
          >
            Estúdio 9:16
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsPythonModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Code2 className="w-4 h-4" />
            Código do Servidor Python
          </button>
        </div>
      </header>

      {/* Workspace Body: Config Sidebar + Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <ConfigSidebar
          workerUrl={workerUrl}
          onWorkerUrlChange={handleWorkerUrlChange}
          workerHealth={workerHealth}
          checkingWorker={checkingWorker}
          onTestWorker={testWorkerConnection}
          serverStatus={serverStatus}
          currentStep={currentStep}
          canAccessStep2={Boolean(analysis)}
          canAccessStep3={Boolean(selectedClip)}
          onSelectStep={setCurrentStep}
          onOpenPythonModal={() => setIsPythonModalOpen(true)}
        />

        <main className="flex-1 p-5 sm:p-8 overflow-y-auto">
          {currentStep === 1 && (
            <Step1Input
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              localFile={localFile}
              localMediaUrl={localMediaUrl}
              localMediaDuration={localMediaDuration}
              onSelectLocalFile={handleSelectLocalFile}
              topic={topic}
              onTopicChange={setTopic}
              clipDuration={clipDuration}
              onClipDurationChange={setClipDuration}
              isAnalyzing={isAnalyzing}
              analysisStage={analysisStage}
              errorMessage={errorMessage}
              onStartAnalysis={handleStartAnalysis}
            />
          )}

          {currentStep === 2 && analysis && (
            <Step2Radar
              analysis={analysis}
              selectedClipId={selectedClip?.id ?? null}
              onSelectClipForStudio={handleSelectClipForStudio}
              onBackToInput={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && selectedClip && (
            <Step3Studio
              clip={selectedClip}
              videoUrl={videoUrl}
              localMediaUrl={localMediaUrl}
              localIsVideo={Boolean(localFile?.type.startsWith("video/"))}
              workerUrl={workerUrl}
              workerHealth={workerHealth}
              layoutMode={layoutMode}
              onLayoutModeChange={setLayoutMode}
              cropConfig={cropConfig}
              onCropConfigChange={setCropConfig}
              subtitleStyle={subtitleStyle}
              onSubtitleStyleChange={setSubtitleStyle}
              onBackToRadar={() => setCurrentStep(2)}
              onOpenPythonModal={() => setIsPythonModalOpen(true)}
            />
          )}
        </main>
      </div>

      <PythonCodeModal
        isOpen={isPythonModalOpen}
        onClose={() => setIsPythonModalOpen(false)}
      />
    </div>
  );
}
