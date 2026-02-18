import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const TEMP_DIR = path.join(process.cwd(), 'temp');

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
    
    // Download with yt-dlp
    // Using format for best quality vertical video under 100MB
    const command = `yt-dlp -f "best[height<=1080][ext=mp4][filesize<100M]/best[height<=720][ext=mp4]" -o "${outputPath}" --no-playlist "${videoUrl}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 300000, // 5 minutes timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
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
    
    // Check duration ≤ 60 seconds
    const isShortDuration = duration <= 60;
    
    if (!isVertical) {
      return { valid: false, error: 'Video is not vertical (9:16 format)', width, height, duration };
    }
    
    if (!isShortDuration) {
      return { valid: false, error: 'Video duration exceeds 60 seconds', width, height, duration };
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
