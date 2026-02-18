import ZAI from 'z-ai-web-dev-sdk';

interface EnhancementResult {
  title: string;
  description: string;
  hashtags: string[];
}

// AI-enhanced title and description generation
export async function enhanceContent(
  originalTitle: string,
  originalDescription: string,
  tags: string[] = []
): Promise<EnhancementResult> {
  try {
    const zai = await ZAI.create();
    
    const prompt = `You are a YouTube Shorts SEO expert. Enhance the following YouTube Short content for maximum engagement and discoverability.

Original Title: ${originalTitle}
Original Description: ${originalDescription}
Original Tags: ${tags.join(', ')}

Rules:
1. Create a catchy, engaging title (under 60 characters for better mobile display)
2. Add relevant emojis to the title if appropriate
3. Write an engaging description (under 200 characters)
4. Generate 5-10 relevant hashtags including #shorts #ytshorts
5. Focus on viral potential and SEO optimization

Respond in JSON format:
{
  "title": "Your enhanced title here",
  "description": "Your enhanced description here",
  "hashtags": ["#hashtag1", "#hashtag2", ...]
}`;

    const result = await zai.functions.invoke('chat', {
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 500
    });

    // Parse the JSON response
    let parsed: EnhancementResult;
    try {
      // Extract JSON from the response
      const content = result.data?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback to original content with basic enhancements
      parsed = {
        title: originalTitle,
        description: originalDescription,
        hashtags: ['#shorts', '#ytshorts', ...tags.slice(0, 5).map(t => `#${t.replace(/\s+/g, '')}`)]
      };
    }

    return {
      title: parsed.title || originalTitle,
      description: parsed.description || originalDescription,
      hashtags: parsed.hashtags || ['#shorts', '#ytshorts']
    };
  } catch (error) {
    console.error('AI enhancement error:', error);
    // Return original content with basic hashtags on error
    return {
      title: originalTitle,
      description: originalDescription,
      hashtags: ['#shorts', '#ytshorts', ...tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, '')}`)]
    };
  }
}

// Generate hashtags from content
export async function generateHashtags(
  title: string,
  description: string,
  tags: string[] = []
): Promise<string[]> {
  try {
    const zai = await ZAI.create();
    
    const prompt = `Generate 10 viral hashtags for a YouTube Short with the following content:

Title: ${title}
Description: ${description}
Keywords: ${tags.join(', ')}

Rules:
- Include #shorts and #ytshorts
- Make hashtags relevant and trending
- Focus on discoverability

Respond with only the hashtags, comma-separated, starting with #`;

    const result = await zai.functions.invoke('chat', {
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 200
    });

    const content = result.data?.choices?.[0]?.message?.content || '';
    
    // Parse hashtags from response
    const hashtags = content
      .split(/[,\n]/)
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.startsWith('#'))
      .slice(0, 10);

    return hashtags.length > 0 ? hashtags : ['#shorts', '#ytshorts'];
  } catch (error) {
    console.error('Hashtag generation error:', error);
    return ['#shorts', '#ytshorts'];
  }
}

// Rewrite title for better engagement
export async function rewriteTitle(originalTitle: string): Promise<string> {
  try {
    const zai = await ZAI.create();
    
    const prompt = `Rewrite this YouTube Short title to be more engaging and viral-friendly. Keep it under 60 characters. Add emojis if appropriate.

Original: ${originalTitle}

Respond with only the new title, nothing else.`;

    const result = await zai.functions.invoke('chat', {
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.8,
      max_tokens: 100
    });

    const newTitle = result.data?.choices?.[0]?.message?.content?.trim() || originalTitle;
    
    // Ensure title is not too long
    return newTitle.length > 60 ? newTitle.substring(0, 57) + '...' : newTitle;
  } catch (error) {
    console.error('Title rewrite error:', error);
    return originalTitle;
  }
}
