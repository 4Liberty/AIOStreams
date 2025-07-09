import { Cache } from './cache';
import { makeRequest } from './http';
import { Env } from './env';

const apiKeyValidationCache = Cache.getInstance('fanartApiKey');

export class FanartTV {
  private readonly apiKey: string;
  private readonly IMDB_ID_REGEX = /^(?:tt)?(\d+)(?::\d+:\d+)?$/;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (!this.apiKey) {
      throw new Error('Fanart.tv API key is not set');
    }
  }

  public async validateApiKey(): Promise<boolean> {
    const cached = apiKeyValidationCache.get(this.apiKey);
    if (cached !== undefined && cached !== null) {
      return Boolean(cached);
    }

    try {
      // Test the API key by making a simple request
      const response = await makeRequest(
        `https://webservice.fanart.tv/v3/movies/tt0111161?api_key=${this.apiKey}`,
        5000,
        undefined,
        undefined,
        true
      );

      if (response.ok) {
        apiKeyValidationCache.set(
          this.apiKey,
          true,
          Env.RPDB_API_KEY_VALIDITY_CACHE_TTL // Reuse same TTL as RPDB
        );
        return true;
      } else if (response.status === 401) {
        apiKeyValidationCache.set(
          this.apiKey,
          false,
          Env.RPDB_API_KEY_VALIDITY_CACHE_TTL
        );
        return false;
      } else {
        // For other errors, don't cache and return false
        return false;
      }
    } catch (error) {
      // Network or other errors - don't cache, return false
      return false;
    }
  }

  /**
   * Get poster URL from fanart.tv based on IMDb ID
   * @param type - The type of content (movie or series)
   * @param id - The IMDb ID of the item
   * @returns The poster URL or null if not available
   */
  public async getPosterUrl(type: string, id: string): Promise<string | null> {
    const imdbId = this.parseImdbId(id);
    if (!imdbId) {
      return null;
    }

    try {
      let endpoint: string;
      if (type === 'movie') {
        endpoint = `https://webservice.fanart.tv/v3/movies/${imdbId}?api_key=${this.apiKey}`;
      } else if (type === 'series') {
        endpoint = `https://webservice.fanart.tv/v3/tv/${imdbId}?api_key=${this.apiKey}`;
      } else {
        return null;
      }

      const response = await makeRequest(
        endpoint,
        5000,
        undefined,
        undefined,
        true
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as any;

      // Extract poster from fanart.tv response
      // For movies: look for movieposter, for TV: look for tvposter
      let posters: any[] = [];

      if (type === 'movie' && data?.movieposter) {
        posters = data.movieposter;
      } else if (type === 'series' && data?.tvposter) {
        posters = data.tvposter;
      }

      // Find the poster with highest likes or first available
      if (posters && posters.length > 0) {
        // Sort by likes (descending) and take the first one
        const sortedPosters = posters.sort(
          (a, b) => (b.likes || 0) - (a.likes || 0)
        );
        return sortedPosters[0].url || null;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private parseImdbId(id: string): string | null {
    const match = id.match(this.IMDB_ID_REGEX);
    if (match) {
      return `tt${match[1]}`;
    }
    return null;
  }
}
