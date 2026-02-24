import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const TEMP_DIR = process.env.TEMP_VIDEO_DIR || path.join('/tmp', 'youtube-shorts-republisher');
const DOWNLOAD_TIMEOUT_MS = 300000;
const COMMAND_BUFFER_SIZE = 1024 * 1024 * 12;
const YT_DLP_BIN = process.env.YT_DLP_BIN || (process.env.HOME ? path.join(process.env.HOME, '.local', 'bin', 'yt-dlp') : 'yt-dlp');

interface ExecFailure extends Error {
  stderr?: string;
  stdout?: string;
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

async function runShellCommand(command: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(command, {
      timeout: DOWNLOAD_TIMEOUT_MS,
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
    
    // Primary strategy: high-quality MP4 with Android/Web clients.
    const ytDlpBin = resolveYtDlpBinary();
    const primaryCommand = `"${ytDlpBin}" --no-playlist --retries 3 --fragment-retries 3 --extractor-args "youtube:player_client=android,web" -f "bv*[ext=mp4][height<=2160]+ba[ext=m4a]/b[ext=mp4][height<=2160]/b" --merge-output-format mp4 --force-overwrites -o "${outputPath}" "${videoUrl}"`;
    const primaryResult = await runShellCommand(primaryCommand);

    if (!primaryResult.success) {
      // Fallback strategy: less strict format to reduce 403/nsig failures.
      const fallbackCommand = `"${ytDlpBin}" --no-playlist --retries 3 --fragment-retries 3 --extractor-args "youtube:player_client=android" -f "best[ext=mp4][height<=1080]/best[height<=1080]/best" --merge-output-format mp4 --force-overwrites -o "${outputPath}" "${videoUrl}"`;
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
