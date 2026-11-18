import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 24 * 1024 * 1024, // 24MB limit for direct audio/video upload
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente do servidor.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractJsonPayload(rawText: string): unknown {
  const trimmed = (rawText || "").trim();
  if (!trimmed) {
    throw new Error("Resposta vazia do modelo Gemini.");
  }

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Attempt to locate outer JSON object
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const sliced = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }
    throw new Error("Não foi possível interpretar o JSON retornado pelo Gemini.");
  }
}

function formatSecondsToTimestamp(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Health & engine configuration status (booleans only, never exposes secrets)
  app.get("/api/config/status", (_req, res) => {
    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
    });
  });

  // Transcription endpoint: uses Groq whisper-large-v3 if GROQ_API_KEY is configured,
  // otherwise falls back cleanly to Gemini multimodal transcription on the uploaded media.
  app.post("/api/transcribe", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Nenhum arquivo de áudio ou vídeo enviado." });
        return;
      }

      const groqApiKey = process.env.GROQ_API_KEY;
      if (groqApiKey) {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(file.buffer)], {
          type: file.mimetype || "audio/mpeg",
        });
        formData.append("file", blob, file.originalname || "media.mp4");
        formData.append("model", "whisper-large-v3");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");
        formData.append("timestamp_granularities[]", "segment");

        const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: formData,
        });

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          res.status(groqRes.status).json({
            error: `Erro na API Groq Whisper: ${errText}`,
          });
          return;
        }

        const groqData = (await groqRes.json()) as {
          text?: string;
          words?: Array<{ word: string; start: number; end: number }>;
          segments?: Array<{ id: number; start: number; end: number; text: string }>;
        };

        res.json({
          source: "groq",
          text: groqData.text ?? "",
          words: groqData.words ?? [],
          segments: groqData.segments ?? [],
        });
        return;
      }

      // Fallback: real transcription via Gemini Flash multimodal inlineData
      const ai = getGeminiClient();
      const base64Data = file.buffer.toString("base64");
      const mimeType = file.mimetype || "audio/mpeg";

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: [
                "Transcreva fielmente o áudio/vídeo enviado no idioma original (priorizando Português se falado em PT-BR).",
                "Retorne EXCLUSIVAMENTE um JSON válido com a estrutura:",
                '{',
                '  "text": "transcrição completa",',
                '  "segments": [{ "id": 0, "start": 0.0, "end": 4.5, "text": "frase..." }],',
                '  "words": [{ "word": "palavra", "start": 0.0, "end": 0.35 }]',
                '}',
              ].join("\n"),
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = extractJsonPayload(response.text ?? "{}") as {
        text?: string;
        segments?: Array<{ id: number; start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      res.json({
        source: "gemini_audio",
        text: parsed.text ?? "",
        segments: parsed.segments ?? [],
        words: parsed.words ?? [],
      });
    } catch (error) {
      console.error("Transcription error:", error);
      const message =
        error instanceof Error ? error.message : "Falha inesperada na transcrição.";
      res.status(500).json({ error: message });
    }
  });

  // Viral Radar & Clip Analysis via Gemini 2.5 Flash + Google Search Grounding
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const {
        videoUrl = "",
        platform = "youtube",
        topic = "",
        clipDuration = "30-60s",
        transcriptText = "",
        segments = [],
        words = [],
        transcriptSource = "url_context_preview",
        mediaDurationSeconds = 0,
      } = req.body as {
        videoUrl?: string;
        platform?: string;
        topic?: string;
        clipDuration?: string;
        transcriptText?: string;
        segments?: Array<{ id: number; start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
        transcriptSource?: "groq" | "gemini_audio" | "worker" | "url_context_preview";
        mediaDurationSeconds?: number;
      };

      if (!topic.trim() && !videoUrl.trim() && !transcriptText.trim()) {
        res.status(400).json({
          error: "Informe pelo menos uma URL, um tópico/jogo/streamer ou envie um arquivo.",
        });
        return;
      }

      const ai = getGeminiClient();
      const hasRealTranscript = Boolean(transcriptText && transcriptText.trim().length > 10);

      const durationBounds =
        clipDuration === "15-30s"
          ? { min: 15, max: 30 }
          : clipDuration === "60-90s"
            ? { min: 60, max: 90 }
            : { min: 30, max: 60 };

      const contextSection = hasRealTranscript
        ? `TRANSCRIÇÃO REAL EXTRAÍDA (com timestamps em segundos):\n${
            segments.length > 0
              ? segments
                  .slice(0, 120)
                  .map(
                    (s) =>
                      `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`
                  )
                  .join("\n")
              : transcriptText.slice(0, 12000)
          }`
        : `Nenhuma transcrição de áudio local foi enviada ainda (Modo Preview Inteligente para URL ${videoUrl || "não informada"} na plataforma ${platform}). Baseado no tópico "${topic}", nas buscas em tempo real no Google Search e no formato de cortes Shorts/Reels, crie 3 cenários de cortes altamente realistas e alinhados às trends atuais encontradas na busca.`;

      const maxTimeHint =
        mediaDurationSeconds > 20
          ? `O vídeo enviado tem duração total aproximada de ${Math.round(mediaDurationSeconds)}s. Os timestamps DEVEM estar dentro de 0s até ${Math.round(mediaDurationSeconds)}s.`
          : `Use timestamps realistas dentro do vídeo.`;

      const prompt = `Você é o motor de curadoria viral do ClipViper AI, especialista em Shorts, Reels e TikTok para o nicho Gamer (CS2, Valorant, FPS, Lives) e Vlogs.

CONTEXTO DO USUÁRIO:
- Tópico / Jogo / Streamer: "${topic || "Gaming e Entretenimento"}"
- Plataforma / URL: "${platform}" (${videoUrl || "Upload local"})
- Duração alvo de cada corte: ${clipDuration} (entre ${durationBounds.min}s e ${durationBounds.max}s)
- ${maxTimeHint}

${contextSection}

TAREFA OBRIGATÓRIA COM GOOGLE SEARCH GROUNDING:
1. Pesquise na web em tempo real usando a ferramenta Google Search o que está em alta AGORA sobre "${topic || videoUrl}" (campeonatos recentes, metas, polêmicas, memes da comunidade, jogadas famosas, patches ou tendências de vlog).
2. Explique no campo "selectionStrategy" como essas trends encontradas na web guiam a escolha dos ganchos (hooks), rages, clutches ou histórias engraçadas.
3. Selecione 3 cortes de alto potencial viral. Para cada corte:
   - Se houver transcrição real com timestamps, use os timestamps EXATOS da transcrição respeitando a duração alvo (ou o melhor trecho se o áudio enviado for curto).
   - Calcule um viralityScore (0 a 100) com justificativa explícita ligada às trends encontradas na busca.
   - Gere um título viral estilo Shorts/Reels (com forte gancho nos primeiros 3 segundos) e 4 a 5 hashtags relevantes.
   - Liste "highlightWords" (3 a 6 palavras impactantes do trecho para destaque estilo Hormozi).
   - Gere "words": array de timestamps palavra-por-palavra cobrindo os primeiros 12-18 segundos do corte (se houver words reais da transcrição dentro do intervalo, preserve-as e adapte; caso contrário, gere timestamps coerentes com cadência natural de fala a partir de startTime).

FORMATO DE RESPOSTA:
Responda EXCLUSIVAMENTE com um objeto JSON válido (sem texto antes ou depois, ou em bloco \`\`\`json\`\`\`), seguindo exatamente este schema:
{
  "trendRadar": {
    "topic": "Nome do tópico pesquisado",
    "summary": "Resumo objetivo de 2-3 frases sobre o que está bombando agora na internet segundo a busca em tempo real.",
    "trendingAngles": ["Ângulo/Assunto em alta 1", "Ângulo/Assunto em alta 2", "Ângulo/Assunto em alta 3"],
    "selectionStrategy": "Como o algoritmo usa esses assuntos quentes para priorizar hooks, clutches, rages ou storytelling."
  },
  "clips": [
    {
      "id": "clip-1",
      "title": "Título Viral com Hook Forte",
      "hookReason": "Por que os primeiros 3 segundos prendem retenção",
      "viralityScore": 94,
      "scoreJustification": "Justificativa conectando o trecho com as trends atuais encontradas no Google Search.",
      "startTime": 12.0,
      "endTime": 44.0,
      "hashtags": ["#CS2", "#Shorts", "#Clutch", "#GamingBR"],
      "transcriptExcerpt": "Texto completo do trecho selecionado...",
      "highlightWords": ["INSANO", "CLUTCH", "IMPOSSÍVEL"],
      "words": [
        { "word": "OLHA", "start": 12.0, "end": 12.3 },
        { "word": "O", "start": 12.3, "end": 12.4 }
      ]
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = response.text ?? "";
      const parsed = extractJsonPayload(rawText) as {
        trendRadar?: {
          topic?: string;
          summary?: string;
          trendingAngles?: string[];
          selectionStrategy?: string;
        };
        clips?: Array<{
          id?: string;
          title?: string;
          hookReason?: string;
          viralityScore?: number;
          scoreJustification?: string;
          startTime?: number;
          endTime?: number;
          hashtags?: string[];
          transcriptExcerpt?: string;
          highlightWords?: string[];
          words?: Array<{ word: string; start: number; end: number }>;
        }>;
      };

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const groundingChunks = groundingMetadata?.groundingChunks ?? [];
      const webSearchQueries = groundingMetadata?.webSearchQueries ?? [];

      const sources = groundingChunks
        .map((chunk) => {
          if (chunk.web?.uri) {
            return {
              title: chunk.web.title || chunk.web.uri,
              uri: chunk.web.uri,
            };
          }
          return null;
        })
        .filter((item): item is { title: string; uri: string } => item !== null)
        .slice(0, 8);

      const normalizedClips = (parsed.clips ?? []).map((clip, index) => {
        const startTime = Number(clip.startTime ?? index * 45);
        const endTime = Math.max(startTime + 5, Number(clip.endTime ?? startTime + 32));
        const highlightSet = new Set(
          (clip.highlightWords ?? []).map((w) => w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, ""))
        );

        // If real word-level timestamps were provided (e.g. from Groq/Gemini audio), slice them for this clip
        let clipWords =
          words.length > 0
            ? words
                .filter((w) => w.start >= startTime - 0.2 && w.end <= endTime + 0.5)
                .map((w) => ({
                  word: w.word.trim(),
                  start: w.start,
                  end: w.end,
                  isHighlight: highlightSet.has(
                    w.word.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "")
                  ),
                }))
            : [];

        if (clipWords.length === 0) {
          if (clip.words && clip.words.length > 0) {
            clipWords = clip.words.map((w) => ({
              word: w.word.trim(),
              start: Number(w.start),
              end: Number(w.end),
              isHighlight: highlightSet.has(
                w.word.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "")
              ),
            }));
          } else {
            const tokens = (clip.transcriptExcerpt || clip.title || "MOMENTO VIRAL INSANO")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 32);
            let cursor = startTime;
            clipWords = tokens.map((tok) => {
              const dur = Math.min(0.45, Math.max(0.18, tok.length * 0.055));
              const item = {
                word: tok,
                start: Number(cursor.toFixed(2)),
                end: Number((cursor + dur).toFixed(2)),
                isHighlight: highlightSet.has(
                  tok.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "")
                ),
              };
              cursor += dur + 0.04;
              return item;
            });
          }
        }

        return {
          id: clip.id || `clip-${index + 1}`,
          title: clip.title || `Corte Viral #${index + 1}`,
          hookReason: clip.hookReason || "Abertura com alta retenção nos primeiros 3 segundos.",
          viralityScore: Math.min(100, Math.max(1, Math.round(Number(clip.viralityScore ?? 85)))),
          scoreJustification:
            clip.scoreJustification || "Alinhado às buscas e discussões recentes sobre o tema.",
          startTime,
          endTime,
          startLabel: formatSecondsToTimestamp(startTime),
          endLabel: formatSecondsToTimestamp(endTime),
          hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : ["#Shorts", "#Viral"],
          transcriptExcerpt: clip.transcriptExcerpt || "",
          highlightWords: clip.highlightWords ?? [],
          words: clipWords,
        };
      });

      res.json({
        trendRadar: {
          topic: parsed.trendRadar?.topic || topic || "Tópico Analisado",
          summary:
            parsed.trendRadar?.summary ||
            "Análise concluída com Google Search Grounding em tempo real.",
          trendingAngles: parsed.trendRadar?.trendingAngles ?? [],
          selectionStrategy:
            parsed.trendRadar?.selectionStrategy ||
            "Priorização de picos de emoção, hooks rápidos e contexto alinhado às trends.",
          searchQueries: webSearchQueries,
          sources,
          groundedAt: new Date().toISOString(),
        },
        clips: normalizedClips,
        transcriptSource,
      });
    } catch (error) {
      console.error("Gemini analyze error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao analisar cortes com Gemini Search Grounding.";
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClipViper AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
