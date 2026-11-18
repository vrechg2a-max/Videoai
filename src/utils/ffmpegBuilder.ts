import { CropConfiguration, LayoutMode, SubtitleStyle, VideoPlatform } from "../types";

export function detectPlatformFromUrl(url: string): VideoPlatform {
  const lower = url.trim().toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("kick.com")) return "kick";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "instagram";
  return "unknown";
}

export function getPlatformLabel(platform: VideoPlatform): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "twitch":
      return "Twitch";
    case "kick":
      return "Kick";
    case "instagram":
      return "Instagram Reels";
    case "local":
      return "Arquivo Local";
    default:
      return "Link de Vídeo";
  }
}

export interface FfmpegCropParams {
  sourceWidth: number;
  sourceHeight: number;
  gameplay: { x: number; y: number; w: number; h: number };
  facecam: { x: number; y: number; w: number; h: number };
  vlogCrop: { x: number; y: number; w: number; h: number };
  filterComplex: string;
  cliPreview: string;
}

function makeEven(val: number): number {
  const rounded = Math.round(val);
  return rounded % 2 === 0 ? rounded : Math.max(2, rounded - 1);
}

export function computeFfmpegParams(
  layoutMode: LayoutMode,
  crop: CropConfiguration,
  subtitleStyle: SubtitleStyle,
  sourceWidth = 1920,
  sourceHeight = 1080
): FfmpegCropParams {
  const gw = makeEven(Math.max(120, (crop.gameplay.width / 100) * sourceWidth));
  const gh = makeEven(Math.max(120, (crop.gameplay.height / 100) * sourceHeight));
  const gx = makeEven(Math.min(sourceWidth - gw, Math.max(0, (crop.gameplay.x / 100) * sourceWidth)));
  const gy = makeEven(Math.min(sourceHeight - gh, Math.max(0, (crop.gameplay.y / 100) * sourceHeight)));

  const fw = makeEven(Math.max(80, (crop.facecam.width / 100) * sourceWidth));
  const fh = makeEven(Math.max(80, (crop.facecam.height / 100) * sourceHeight));
  const fx = makeEven(Math.min(sourceWidth - fw, Math.max(0, (crop.facecam.x / 100) * sourceWidth)));
  const fy = makeEven(Math.min(sourceHeight - fh, Math.max(0, (crop.facecam.y / 100) * sourceHeight)));

  // Vlog zoomed foreground crop
  const zoom = Math.max(1, Math.min(2, crop.vlogZoom));
  const vw = makeEven(sourceWidth / zoom);
  const vh = makeEven(sourceHeight / zoom);
  const maxVx = sourceWidth - vw;
  const vx = makeEven(Math.min(maxVx, Math.max(0, (crop.vlogCenterX / 100) * sourceWidth - vw / 2)));
  const vy = makeEven((sourceHeight - vh) / 2);

  const assFilter = subtitleStyle.popAnimation ? "ass=hormozi_captions.ass" : "ass=hormozi_captions.ass";

  let filterComplex = "";
  if (layoutMode === "split_gamer") {
    filterComplex = [
      `[0:v]crop=${gw}:${gh}:${gx}:${gy},scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344[game]`,
      `[0:v]crop=${fw}:${fh}:${fx}:${fy},scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576[cam]`,
      `[game][cam]vstack=inputs=2,${assFilter}[vout]`,
    ].join("; ");
  } else {
    const blur = Math.round(crop.vlogBlur);
    filterComplex = [
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=${blur}:5[bg]`,
      `[0:v]crop=${vw}:${vh}:${vx}:${vy},scale=1080:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,${assFilter}[vout]`,
    ].join("; ");
  }

  const cliPreview = `ffmpeg -ss START -to END -i input.mp4 -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k output_9x16.mp4`;

  return {
    sourceWidth,
    sourceHeight,
    gameplay: { x: gx, y: gy, w: gw, h: gh },
    facecam: { x: fx, y: fy, w: fw, h: fh },
    vlogCrop: { x: vx, y: vy, w: vw, h: vh },
    filterComplex,
    cliPreview,
  };
}
