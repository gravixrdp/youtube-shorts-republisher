import { getConfig } from '../supabase/database';

function readEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value;
    }
  }
  return null;
}

// YouTube OAuth2 token refresh
async function getAccessToken(refreshTokenOverride?: string): Promise<string | null> {
  try {
    const clientId = (await getConfig('youtube_client_id')) || readEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = (await getConfig('youtube_client_secret')) || readEnv('YOUTUBE_CLIENT_SECRET');
    const refreshToken =
      refreshTokenOverride ||
      (await getConfig('youtube_refresh_token')) ||
      readEnv('YOUTUBE_REFRESH_TOKEN') ||
      null;
    
    if (!clientId || !clientSecret || !refreshToken) {
      console.error('YouTube OAuth credentials not configured');
      return null;
    }
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Token refresh failed:', error);
      return null;
    }
    
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

// Upload video to YouTube
export async function uploadVideo(
  filePath: string,
  title: string,
  description: string,
  tags: string[],
  visibility: 'public' | 'unlisted' | 'private' = 'public',
  options?: {
    refreshToken?: string;
  }
): Promise<{
  success: boolean;
  videoId?: string;
  error?: string;
}> {
  try {
    const accessToken = await getAccessToken(options?.refreshToken);
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }
    
    // Read video file
    const fs = await import('fs/promises');
    const videoData = await fs.readFile(filePath);
    
    // Prepare metadata
    const metadata = {
      snippet: {
        title: title.substring(0, 100), // YouTube title limit
        description: description.substring(0, 5000), // YouTube description limit
        tags: tags.slice(0, 500), // YouTube tag limit
        categoryId: '24', // Entertainment category
      },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: false,
      },
    };
    
    // Initial upload request
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );
    
    if (!initResponse.ok) {
      const error = await initResponse.text();
      console.error('Upload init failed:', error);
      return { success: false, error: `Upload initialization failed: ${error}` };
    }
    
    // Get upload URL from Location header
    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
      return { success: false, error: 'No upload URL received' };
    }
    
    // Upload video data
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/*',
      },
      body: videoData,
    });
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error('Video upload failed:', error);
      return { success: false, error: `Video upload failed: ${error}` };
    }
    
    const result = await uploadResponse.json();
    return { success: true, videoId: result.id };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

// Alternative upload using fetch with progress tracking
export async function uploadVideoWithProgress(
  filePath: string,
  title: string,
  description: string,
  tags: string[],
  visibility: 'public' | 'unlisted' | 'private' = 'public',
  onProgress?: (progress: number) => void,
  options?: {
    refreshToken?: string;
  }
): Promise<{
  success: boolean;
  videoId?: string;
  error?: string;
}> {
  try {
    const accessToken = await getAccessToken(options?.refreshToken);
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }
    
    const fs = await import('fs/promises');
    const videoData = await fs.readFile(filePath);
    const totalSize = videoData.length;
    
    const metadata = {
      snippet: {
        title: title.substring(0, 100),
        description: description.substring(0, 5000),
        tags: tags.slice(0, 500),
        categoryId: '24',
      },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: false,
      },
    };
    
    // Initial upload request
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );
    
    if (!initResponse.ok) {
      const error = await initResponse.text();
      return { success: false, error: `Upload initialization failed: ${error}` };
    }
    
    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
      return { success: false, error: 'No upload URL received' };
    }
    
    // Chunked upload for progress tracking
    const chunkSize = 1024 * 1024 * 8; // 8MB chunks
    let uploadedBytes = 0;
    
    // For simplicity, upload all at once (progress tracking would require more complex implementation)
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/*',
        'Content-Length': totalSize.toString(),
      },
      body: videoData,
    });
    
    if (onProgress) {
      onProgress(100);
    }
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      return { success: false, error: `Video upload failed: ${error}` };
    }
    
    const result = await uploadResponse.json();
    return { success: true, videoId: result.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

// Get video upload status
export async function getVideoStatus(videoId: string): Promise<{
  success: boolean;
  status?: {
    uploadStatus: string;
    privacyStatus: string;
    license: string;
    embeddable: boolean;
    publicStatsViewable: boolean;
  };
  error?: string;
}> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      return { success: false, error: 'Failed to get video status' };
    }
    
    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'Video not found' };
    }
    
    return { success: true, status: data.items[0].status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Status check failed'
    };
  }
}

// Delete uploaded video
export async function deleteUploadedVideo(videoId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    return { success: response.ok };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed'
    };
  }
}
