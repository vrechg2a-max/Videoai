export type VideoPlatform = 'youtube' | 'twitch' | 'kick' | 'instagram' | 'local' | 'unknown';

export type ClipDurationRange = '15-30s' | '30-60s' | '60-90s';

export type LayoutMode = 'split_gamer' | 'vlog_blur';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  isHighlight?: boolean;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface TrendRadarData {
  topic: string;
  summary: string;
  trendingAngles: string[];
  selectionStrategy: string;
  searchQueries: string[];
  sources: GroundingSource[];
  groundedAt: string;
}

export interface ViralClip {
  id: string;
  title: string;
  hookReason: string;
  viralityScore: number;
  scoreJustification: string;
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
  hashtags: string[];
  transcriptExcerpt: string;
  highlightWords: string[];
  words: WordTimestamp[];
}

export interface AnalysisResponse {
  trendRadar: TrendRadarData;
  clips: ViralClip[];
  transcriptSource: 'groq' | 'gemini_audio' | 'worker' | 'url_context_preview';
}

export interface NormalizedBox {
  x: number; // 0 to 100 (%)
  y: number; // 0 to 100 (%)
  width: number; // 0 to 100 (%)
  height: number; // 0 to 100 (%)
}

export interface CropConfiguration {
  gameplay: NormalizedBox;
  facecam: NormalizedBox;
  vlogZoom: number; // 1.0 to 1.8
  vlogCenterX: number; // 0 to 100 (%)
  vlogBlur: number; // 10 to 40
}

export type HighlightColor = '#FFD700' | '#00FF66' | '#A855F7' | '#FFFFFF';

export interface SubtitleStyle {
  wordsPerChunk: 1 | 2 | 3;
  highlightColor: HighlightColor;
  fontSize: 'md' | 'lg' | 'xl';
  verticalPosition: 'bottom' | 'center' | 'top';
  thickOutline: boolean;
  popAnimation: boolean;
}

export interface ServerConfigStatus {
  geminiConfigured: boolean;
  groqConfigured: boolean;
}

export interface WorkerHealthStatus {
  online: boolean;
  latencyMs?: number;
  ffmpegAvailable?: boolean;
  ytdlpAvailable?: boolean;
  checkedAt?: string;
}
