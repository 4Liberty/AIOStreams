import { Cache } from './cache';
import { makeRequest } from './http';
import { Env } from './env';

export type IdType = 'imdb' | 'tmdb' | 'tvdb';

interface Id {
  type: IdType;
  value: string;
}

const apiKeyValidationCache = Cache.getInstance('fanartApiKey');

export class FanartTV {
  private readonly apiKey: string;
  private readonly TMDB_ID_REGEX = /^(?:tmdb)[-:](\d+)(?::\d+:\d+)?$/;
  private readonly TVDB_ID_REGEX = /^(?:tvdb)[-:](\d+)(?::\d+:\d+)?$/;
  private readonly IMDB_ID_REGEX = /^(?:tt)(\d+)(?::\d+:\d+)?$/;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (!this.apiKey) {
      throw new Error('Fanart.tv API key is not set');
    }
  }

  public async validateApiKey() {
    const cached = apiKeyValidationCache.get(this.apiKey);
    if (cached) {
      return cached;
    }

    // Test the API key by making a simple request
    try {
      const response = await makeRequest(
        `https://webservice.fanart.tv/v3/movies/123456?api_key=${this.apiKey}`,
        5000,
        undefined,
        undefined,
        true
      );
      // fanart.tv returns 200 even for non-existent items when API key is valid
      // and 401 when API key is invalid
      const isValid = response.status !== 401;
      
      apiKeyValidationCache.set(
        this.apiKey,
        isValid,
        Env.RPDB_API_KEY_VALIDITY_CACHE_TTL // Reuse RPDB cache TTL
      );
      
      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   *
   * @param id - the id of the item to get the poster for, if it is of a supported type, the fanart.tv poster will be returned, otherwise null
   */
  public getPosterUrl(type: string, id: string): string | null {
    const parsedId = this.getParsedId(id, type);
    if (!parsedId) {
      return null;
    }

    // Fanart.tv API endpoints
    if (type === 'movie' && parsedId.type === 'tmdb') {
      return `https://webservice.fanart.tv/v3/movies/${parsedId.value}?api_key=${this.apiKey}`;
    }
    if (type === 'series' && parsedId.type === 'tvdb') {
      return `https://webservice.fanart.tv/v3/tv/${parsedId.value}?api_key=${this.apiKey}`;
    }
    
    return null;
  }

  /**
   * Extract poster URL from fanart.tv API response
   */
  public async extractPosterFromResponse(response: any): Promise<string | null> {
    try {
      // For movies, look for movieposter
      if (response.movieposter && response.movieposter.length > 0) {
        // Sort by likes and take the most popular one
        const sorted = response.movieposter.sort((a: any, b: any) => 
          parseInt(b.likes || '0') - parseInt(a.likes || '0')
        );
        return sorted[0].url;
      }
      
      // For TV shows, look for tvposter
      if (response.tvposter && response.tvposter.length > 0) {
        const sorted = response.tvposter.sort((a: any, b: any) => 
          parseInt(b.likes || '0') - parseInt(a.likes || '0')
        );
        return sorted[0].url;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private getParsedId(id: string, type: string): Id | null {
    if (this.TMDB_ID_REGEX.test(id)) {
      const match = id.match(this.TMDB_ID_REGEX);
      if (type === 'movie') {
        return match ? { type: 'tmdb', value: match[1] } : null;
      }
      return null;
    }
    if (this.IMDB_ID_REGEX.test(id)) {
      const match = id.match(this.IMDB_ID_REGEX);
      return match ? { type: 'imdb', value: `tt${match[1]}` } : null;
    }
    if (this.TVDB_ID_REGEX.test(id)) {
      const match = id.match(this.TVDB_ID_REGEX);
      if (type === 'series') {
        return match ? { type: 'tvdb', value: match[1] } : null;
      }
      return null;
    }
    return null;
  }
}