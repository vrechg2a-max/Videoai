import { useState } from "react";
import { Check, Copy, Download, Terminal, X } from "lucide-react";
import { PYTHON_REQUIREMENTS_TXT, PYTHON_SERVER_PY } from "../data/pythonWorkerCode";

interface PythonCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PythonCodeModal({ isOpen, onClose }: PythonCodeModalProps) {
  const [activeTab, setActiveTab] = useState<"server" | "requirements">("server");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentCode = activeTab === "server" ? PYTHON_SERVER_PY : PYTHON_REQUIREMENTS_TXT;
  const filename = activeTab === "server" ? "server.py" : "requirements.txt";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="python-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-[#12151F] border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div>
            <h2 id="python-modal-title" className="font-display text-lg font-bold text-white">
              Worker Auxiliar Python (FastAPI + yt-dlp + FFmpeg)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Rode localmente ou no Railway/Render para download, extração de áudio e renderização MP4 9:16 com legendas .ass
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Quick Run Guide */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#090A0F]/60 border-b border-white/10">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090A0F] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("server")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "server"
                  ? "bg-[#8B5CF6] text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              server.py
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("requirements")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "requirements"
                  ? "bg-[#8B5CF6] text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              requirements.txt
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : `Copiar ${filename}`}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar {filename}
            </button>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="flex-1 overflow-auto bg-[#090A0F] p-5">
          <pre className="text-xs leading-relaxed text-slate-300 font-mono whitespace-pre overflow-x-auto">
            <code>{currentCode}</code>
          </pre>
        </div>

        {/* Footer Command Hint */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-[#12151F] border-t border-white/10 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-mono">
            <Terminal className="w-4 h-4 text-[#8B5CF6] shrink-0" />
            <span>pip install -r requirements.txt && uvicorn server:app --host 0.0.0.0 --port 8000</span>
          </div>
          <span className="text-slate-400">Requer FFmpeg instalado no PATH do sistema</span>
        </div>
      </div>
    </div>
  );
}
