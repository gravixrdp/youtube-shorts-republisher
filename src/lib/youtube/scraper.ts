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

// YouTube API Types
interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    tags?: string[];
  };
  contentDetails: {
    duration: string;
  };
  statistics?: {
    viewCount: string;
    likeCount: string;
  };
}

interface YouTubeSearchResponse {
  kind: string;
  items: YouTubeVideo[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

// Parse ISO 8601 duration to seconds
export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

// Check if video is a Short (≤ 60 seconds and vertical)
export function isShort(duration: number, title: string, description: string): boolean {
  // Duration must be ≤ 60 seconds
  if (duration > 60 || duration === 0) return false;
  
  // Check for #shorts in title or description
  const shortKeywords = ['#shorts', '#short', '#ytshorts', 'shorts'];
  const textToCheck = `${title} ${description}`.toLowerCase();
  
  return shortKeywords.some(keyword => textToCheck.includes(keyword));
}

// Extract channel ID from URL
export function extractChannelId(urlOrId: string): string {
  // If it's already an ID (starts with UC)
  if (urlOrId.startsWith('UC') && urlOrId.length === 24) {
    return urlOrId;
  }
  
  // Extract from URL
  const patterns = [
    /youtube\.com\/channel\/([^/?&]+)/,
    /youtube\.com\/@([^/?&]+)/,
    /youtube\.com\/c\/([^/?&]+)/,
    /youtube\.com\/user\/([^/?&]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match) {
      // For @username, we need to resolve to channel ID
      if (urlOrId.includes('/@')) {
        return match[1]; // Return username, will need resolution
      }
      return match[1];
    }
  }
  
  return urlOrId;
}

// Fetch channel ID from username/handle
async function resolveChannelId(identifier: string, apiKey: string): Promise<string | null> {
  try {
    // Try as handle (@username)
    const handleUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${identifier}&key=${apiKey}`;
    const handleResponse = await fetch(handleUrl);
    const handleData = await handleResponse.json();
    
    if (handleData.items && handleData.items.length > 0) {
      return handleData.items[0].id;
    }
    
    // Try as username
    const userUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${identifier}&key=${apiKey}`;
    const userResponse = await fetch(userUrl);
    const userData = await userResponse.json();
    
    if (userData.items && userData.items.length > 0) {
      return userData.items[0].id;
    }
    
    return null;
  } catch (error) {
    console.error('Error resolving channel ID:', error);
    return null;
  }
}

// Fetch videos from a channel
export async function fetchChannelVideos(
  channelUrlOrId: string,
  maxResults: number = 50
): Promise<{
  success: boolean;
  videos: YouTubeVideo[];
  error?: string;
}> {
  try {
    const apiKey = (await getConfig('youtube_api_key')) || readEnv('YT_API_KEY', 'YOUTUBE_API_KEY');
    if (!apiKey) {
      return { success: false, videos: [], error: 'YouTube API key not configured' };
    }
    
    // Resolve channel ID
    let channelId = extractChannelId(channelUrlOrId);
    
    // If not a valid channel ID, try to resolve
    if (!channelId.startsWith('UC')) {
      const resolvedId = await resolveChannelId(channelId, apiKey);
      if (resolvedId) {
        channelId = resolvedId;
      } else {
        return { success: false, videos: [], error: 'Could not resolve channel ID' };
      }
    }
    
    // Get uploads playlist ID
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
    const channelResponse = await fetch(channelUrl);
    const channelData = await channelResponse.json();
    
    if (!channelData.items || channelData.items.length === 0) {
      return { success: false, videos: [], error: 'Channel not found' };
    }
    
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    
    // Get videos from uploads playlist
    const videos: YouTubeVideo[] = [];
    let nextPageToken = '';
    
    while (videos.length < maxResults) {
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${nextPageToken}&key=${apiKey}`;
      const playlistResponse = await fetch(playlistUrl);
      const playlistData = await playlistResponse.json();
      
      if (!playlistData.items || playlistData.items.length === 0) {
        break;
      }
      
      // Get video IDs
      const videoIds = playlistData.items.map((item: any) => item.snippet.resourceId.videoId).join(',');
      
      // Get video details
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
      const videosResponse = await fetch(videosUrl);
      const videosData = await videosResponse.json();
      
      if (videosData.items) {
        videos.push(...videosData.items);
      }
      
      nextPageToken = playlistData.nextPageToken;
      if (!nextPageToken) break;
    }
    
    return { success: true, videos: videos.slice(0, maxResults) };
  } catch (error) {
    console.error('Error fetching channel videos:', error);
    return { 
      success: false, 
      videos: [], 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Filter and process shorts from videos
export async function fetchShortsFromChannel(
  channelUrlOrId: string,
  maxResults: number = 500
): Promise<{
  success: boolean;
  shorts: Array<{
    videoId: string;
    videoUrl: string;
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl: string;
    duration: number;
    publishedDate: string;
  }>;
  error?: string;
}> {
  const result = await fetchChannelVideos(channelUrlOrId, maxResults * 2); // Fetch more to account for filtering
  
  if (!result.success) {
    return { success: false, shorts: [], error: result.error };
  }
  
  const shorts = result.videos
    .filter(video => {
      const duration = parseDuration(video.contentDetails.duration);
      return isShort(
        duration,
        video.snippet.title,
        video.snippet.description
      );
    })
    .slice(0, maxResults)
    .map(video => ({
      videoId: video.id,
      videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.snippet.title,
      description: video.snippet.description,
      tags: video.snippet.tags || [],
      thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
      duration: parseDuration(video.contentDetails.duration),
      publishedDate: video.snippet.publishedAt
    }));
  
  return { success: true, shorts };
}

// Alternative: Use YouTube Scraper API (if configured)
export async function fetchShortsWithScraperApi(
  channelUrl: string,
  apiKey: string
): Promise<{
  success: boolean;
  shorts: any[];
  error?: string;
}> {
  try {
    // This would use a third-party scraper API
    // Implementation depends on the specific API being used
    const response = await fetch(`https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(channelUrl)}`);
    
    if (!response.ok) {
      return { success: false, shorts: [], error: 'Failed to fetch with scraper API' };
    }
    
    // Parse the response based on the API format
    // This is a placeholder - actual implementation depends on the API
    return { success: true, shorts: [] };
  } catch (error) {
    return { 
      success: false, 
      shorts: [], 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
