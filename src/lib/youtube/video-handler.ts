import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const TEMP_DIR = process.env.TEMP_VIDEO_DIR || path.join('/tmp', 'youtube-shorts-republisher');
const DOWNLOAD_TIMEOUT_MS = 300000;
const ENHANCE_TIMEOUT_MS = resolveTimeoutMs(900000, process.env.SHORTS_ENHANCE_TIMEOUT_MS, process.env.VIDEO_ENHANCE_TIMEOUT_MS);
const COMMAND_BUFFER_SIZE = 1024 * 1024 * 12;
const YT_DLP_BIN = process.env.YT_DLP_BIN || (process.env.HOME ? path.join(process.env.HOME, '.local', 'bin', 'yt-dlp') : 'yt-dlp');
const QUALITY_PROFILE_ENV_KEYS = ['SHORTS_ENHANCE_PROFILE', 'VIDEO_ENHANCE_PROFILE', 'SHORTS_UPLOAD_QUALITY_PROFILE'] as const;
const QUALITY_PRESET_ENV_KEYS = ['SHORTS_ENHANCE_PRESET', 'VIDEO_ENHANCE_PRESET'] as const;
const VALID_ENHANCEMENT_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
  'placebo',
]);

export type VideoQualityProfile = 'source' | 'fullhd' | '4k' | '8k';

interface VideoEnhancementTarget {
  width: number;
  height: number;
  crf: number;
}

const VIDEO_QUALITY_TARGETS: Record<Exclude<VideoQualityProfile, 'source'>, VideoEnhancementTarget> = {
  fullhd: {
    width: 1080,
    height: 1920,
    crf: 17,
  },
  '4k': {
    width: 2160,
    height: 3840,
    crf: 18,
  },
  '8k': {
    width: 4320,
    height: 7680,
    crf: 20,
  },
};

interface ExecFailure extends Error {
  stderr?: string;
  stdout?: string;
}

interface PrepareVideoFailure {
  success: false;
  usedProfile: VideoQualityProfile;
  error: string;
}

interface PrepareVideoSuccess {
  success: true;
  filePath: string;
  usedProfile: VideoQualityProfile;
  enhanced: boolean;
  warning?: string;
}

export type PrepareVideoResult = PrepareVideoFailure | PrepareVideoSuccess;

function resolveTimeoutMs(fallbackMs: number, ...rawValues: Array<string | undefined>): number {
  for (const raw of rawValues) {
    if (!raw) {
      continue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallbackMs;
}

function readEnvValue(...keys: string[]): string | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) {
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function parseBooleanEnv(raw: string | null): boolean {
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeQualityProfile(raw: string | null | undefined): VideoQualityProfile | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'source' || normalized === 'original' || normalized === 'off' || normalized === 'none') {
    return 'source';
  }

  if (normalized === '4k' || normalized === '2160p' || normalized === 'uhd') {
    return '4k';
  }

  if (
    normalized === 'fullhd' ||
    normalized === 'fhd' ||
    normalized === '1080p' ||
    normalized === '1080x1920' ||
    normalized === 'hd'
  ) {
    return 'fullhd';
  }

  if (normalized === '8k' || normalized === '4320p') {
    return '8k';
  }

  return null;
}

function resolveQualityProfile(profileOverride?: VideoQualityProfile | string | null): VideoQualityProfile {
  const fromOverride = normalizeQualityProfile(
    typeof profileOverride === 'string' ? profileOverride : profileOverride || null
  );
  if (fromOverride) {
    return fromOverride;
  }

  const fromEnv = normalizeQualityProfile(readEnvValue(...QUALITY_PROFILE_ENV_KEYS));
  if (fromEnv) {
    return fromEnv;
  }

  return 'source';
}

function resolveEnhancementStrictMode(): boolean {
  return parseBooleanEnv(readEnvValue('SHORTS_ENHANCE_STRICT', 'VIDEO_ENHANCE_STRICT'));
}

function resolveEnhancementPreset(): string {
  const raw = readEnvValue(...QUALITY_PRESET_ENV_KEYS);
  const normalized = raw ? raw.trim().toLowerCase() : '';
  if (!normalized) {
    return 'faster';
  }

  return VALID_ENHANCEMENT_PRESETS.has(normalized) ? normalized : 'faster';
}

function resolveEnhancementThreads(): number {
  const raw = readEnvValue('SHORTS_ENHANCE_THREADS', 'VIDEO_ENHANCE_THREADS');
  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.min(8, Math.max(1, Math.floor(parsed)));
}

function sanitizeFileToken(raw: string): string {
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, '_').trim();
  return sanitized || 'video';
}

function resolveEnhancedOutputPath(inputPath: string, videoId: string, profile: Exclude<VideoQualityProfile, 'source'>): string {
  const token = sanitizeFileToken(videoId || path.basename(inputPath, path.extname(inputPath)));
  return path.join(path.dirname(inputPath), `${token}.${profile}.enhanced.mp4`);
}

function buildUpscaleFilter(target: VideoEnhancementTarget): string {
  return `scale=${target.width}:${target.height}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
}

function compactMultiline(value: string, maxLength: number = 1500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function formatExecError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const execError = error as ExecFailure;
  const stderr = typeof execError.stderr === 'string' ? execError.stderr : '';
  const stdout = typeof execError.stdout === 'string' ? execError.stdout : '';
  const message = typeof execError.message === 'string' ? execError.message : fallback;

  const details = stderr || stdout;
  if (!details) {
    return compactMultiline(message);
  }

  return compactMultiline(`${message}\n${details}`);
}

async function runShellCommand(
  command: string,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS
): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: COMMAND_BUFFER_SIZE,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: formatExecError(error, 'Command execution failed'),
    };
  }
}

function resolveYtDlpBinary(): string {
  if (YT_DLP_BIN.includes('/') && fsSync.existsSync(YT_DLP_BIN)) {
    return YT_DLP_BIN;
  }
  return 'yt-dlp';
}

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Download video using yt-dlp
export async function downloadVideo(
  videoUrl: string,
  videoId: string
): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
}> {
  try {
    await ensureTempDir();
    
    const outputPath = path.join(TEMP_DIR, `${videoId}.mp4`);
    
    // Check if file already exists
    try {
      await fs.access(outputPath);
      return { success: true, filePath: outputPath };
    } catch {
      // File doesn't exist, proceed with download
    }

    await fs.rm(outputPath, { force: true });
    
    // Primary strategy: fetch the highest-quality stream first, then remux to MP4.
    const ytDlpBin = resolveYtDlpBinary();
    const primaryCommand = `"${ytDlpBin}" --no-playlist --retries 6 --fragment-retries 6 --extractor-args "youtube:player_client=android,web" -f "bv*+ba/best" -S "res,fps" --merge-output-format mp4 --remux-video mp4 --force-overwrites -o "${outputPath}" "${videoUrl}"`;
    const primaryResult = await runShellCommand(primaryCommand);

    if (!primaryResult.success) {
      // Fallback strategy: still quality-first, but with fewer sort constraints.
      const fallbackCommand = `"${ytDlpBin}" --no-playlist --retries 6 --fragment-retries 6 --extractor-args "youtube:player_client=android" -f "bestvideo*+bestaudio/best" --merge-output-format mp4 --remux-video mp4 --force-overwrites -o "${outputPath}" "${videoUrl}"`;
      const fallbackResult = await runShellCommand(fallbackCommand);

      if (!fallbackResult.success) {
        return {
          success: false,
          error: compactMultiline(
            `Download failed (primary + fallback). Primary: ${primaryResult.error || 'Unknown error'} | Fallback: ${fallbackResult.error || 'Unknown error'}`,
          ),
        };
      }
    }
    
    // Verify file exists
    try {
      await fs.access(outputPath);
      return { success: true, filePath: outputPath };
    } catch {
      return { success: false, error: 'Downloaded file not found' };
    }
  } catch (error) {
    console.error('Download error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    };
  }
}

export async function prepareVideoForUpload(
  filePath: string,
  videoId: string,
  profileOverride?: VideoQualityProfile | string | null
): Promise<PrepareVideoResult> {
  const profile = resolveQualityProfile(profileOverride);
  if (profile === 'source') {
    return {
      success: true,
      filePath,
      usedProfile: profile,
      enhanced: false,
    };
  }

  const strictMode = resolveEnhancementStrictMode();
  const outputPath = resolveEnhancedOutputPath(filePath, videoId, profile);
  if (outputPath === filePath) {
    return {
      success: true,
      filePath,
      usedProfile: profile,
      enhanced: false,
      warning: `Enhancement skipped because source file already matches ${profile.toUpperCase()} output path`,
    };
  }

  const target = VIDEO_QUALITY_TARGETS[profile];
  const preset = resolveEnhancementPreset();
  const threads = resolveEnhancementThreads();
  const filter = buildUpscaleFilter(target);
  const command = `ffmpeg -y -threads ${threads} -i "${filePath}" -vf "${filter}" -c:v libx264 -preset ${preset} -crf ${target.crf} -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`;

  try {
    await fs.rm(outputPath, { force: true });

    const enhancementResult = await runShellCommand(command, ENHANCE_TIMEOUT_MS);
    if (!enhancementResult.success) {
      const baseError = `Video enhancement failed for ${profile.toUpperCase()}: ${enhancementResult.error || 'unknown ffmpeg error'}`;
      if (strictMode) {
        return {
          success: false,
          usedProfile: profile,
          error: compactMultiline(baseError),
        };
      }

      return {
        success: true,
        filePath,
        usedProfile: profile,
        enhanced: false,
        warning: compactMultiline(`${baseError}. Uploading original source file instead.`),
      };
    }

    await fs.access(outputPath);
    return {
      success: true,
      filePath: outputPath,
      usedProfile: profile,
      enhanced: true,
    };
  } catch (error) {
    const message = formatExecError(error, `Video enhancement failed for ${profile.toUpperCase()}`);
    if (strictMode) {
      return {
        success: false,
        usedProfile: profile,
        error: message,
      };
    }

    return {
      success: true,
      filePath,
      usedProfile: profile,
      enhanced: false,
      warning: compactMultiline(`${message}. Uploading original source file instead.`),
    };
  }
}

// Validate video file
export async function validateVideo(filePath: string): Promise<{
  valid: boolean;
  width?: number;
  height?: number;
  duration?: number;
  error?: string;
}> {
  try {
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${filePath}"`;
    
    const { stdout } = await execAsync(command);
    const data = JSON.parse(stdout);
    
    if (!data.streams || data.streams.length === 0) {
      return { valid: false, error: 'No video stream found' };
    }
    
    const stream = data.streams[0];
    const width = stream.width;
    const height = stream.height;
    const duration = parseFloat(stream.duration);
    
    // Check if vertical (9:16 aspect ratio with some tolerance)
    const aspectRatio = height / width;
    const isVertical = aspectRatio >= 1.5 && aspectRatio <= 2.0;
    
    if (!isVertical) {
      return { valid: false, error: 'Video is not vertical (9:16 format)', width, height, duration };
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      return { valid: false, error: 'Invalid video duration', width, height, duration };
    }
    
    return { valid: true, width, height, duration };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    };
  }
}

// Delete video file
export async function deleteVideo(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}

// Clean up old temp files
export async function cleanupTempFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch {
        // Ignore errors for individual files
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Cleanup error:', error);
    return 0;
  }
}

// Get video file size
export async function getVideoFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}
