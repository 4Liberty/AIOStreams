import { Cache } from './cache';
import { makeRequest } from './http';
import { Env } from './env';
import { createLogger } from './logger';

const logger = createLogger('getLogo');

// Cache TTL for logo URLs (24 hours)
const LOGO_CACHE_TTL = 24 * 60 * 60;

export interface LogoResult {
  logo?: string | null;
}

export type MediaType = 'movie' | 'series' | 'tv';

interface ExternalId {
  type: 'imdb' | 'tmdb' | 'tvdb';
  value: string;
}

export class LogoService {
  private readonly logoCache: Cache<string, string | null>;
  private readonly tmdbAccessToken?: string;
  private readonly fanartApiKey?: string;
  private readonly TMDB_ID_REGEX = /^(?:tmdb)[-:](\d+)(?::\d+:\d+)?$/;
  private readonly TVDB_ID_REGEX = /^(?:tvdb)[-:](\d+)(?::\d+:\d+)?$/;
  private readonly IMDB_ID_REGEX = /^(?:tt)(\d+)(?::\d+:\d+)?$/;

  constructor(tmdbAccessToken?: string, fanartApiKey?: string) {
    this.logoCache = Cache.getInstance<string, string | null>('logo');
    this.tmdbAccessToken = tmdbAccessToken || Env.TMDB_ACCESS_TOKEN;
    this.fanartApiKey = fanartApiKey || Env.FANART_API_KEY;
  }

  /**
   * Get logo for a media item, trying Fanart.tv first, then TMDB as fallback
   */
  public async getLogo(
    id: string,
    type: MediaType,
    language: string = 'en'
  ): Promise<string | null> {
    try {
      // Check cache first
      const cacheKey = `${id}-${type}-${language}`;
      const cachedLogo = this.logoCache.get(cacheKey);
      if (cachedLogo !== undefined) {
        logger.debug(`Cache hit for logo: ${id}`);
        return cachedLogo;
      }

      const externalId = this.parseExternalId(id);
      if (!externalId) {
        logger.debug(`Unable to parse ID: ${id}`);
        this.logoCache.set(cacheKey, null, LOGO_CACHE_TTL);
        return null;
      }

      let logo: string | null = null;

      // Try Fanart.tv first if API key is available
      if (this.fanartApiKey) {
        logo = await this.getFanartLogo(externalId, type, language);
        if (logo) {
          logger.debug(`Found logo from Fanart.tv for ${id}: ${logo}`);
          this.logoCache.set(cacheKey, logo, LOGO_CACHE_TTL);
          return logo;
        }
      }

      // Fallback to TMDB if available
      if (this.tmdbAccessToken) {
        logo = await this.getTmdbLogo(externalId, type, language);
        if (logo) {
          logger.debug(`Found logo from TMDB for ${id}: ${logo}`);
          this.logoCache.set(cacheKey, logo, LOGO_CACHE_TTL);
          return logo;
        }
      }

      logger.debug(`No logo found for ${id}`);
      this.logoCache.set(cacheKey, null, LOGO_CACHE_TTL);
      return null;
    } catch (error) {
      logger.error('Error fetching logo:', {
        id,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private parseExternalId(id: string): ExternalId | null {
    if (this.TMDB_ID_REGEX.test(id)) {
      const match = id.match(this.TMDB_ID_REGEX);
      return match ? { type: 'tmdb', value: match[1] } : null;
    }
    if (this.IMDB_ID_REGEX.test(id)) {
      const match = id.match(this.IMDB_ID_REGEX);
      return match ? { type: 'imdb', value: `tt${match[1]}` } : null;
    }
    if (this.TVDB_ID_REGEX.test(id)) {
      const match = id.match(this.TVDB_ID_REGEX);
      return match ? { type: 'tvdb', value: match[1] } : null;
    }
    return null;
  }

  private async getFanartLogo(
    externalId: ExternalId,
    type: MediaType,
    language: string
  ): Promise<string | null> {
    try {
      let endpoint = '';
      let logoKey = '';

      if (type === 'movie' && externalId.type === 'tmdb') {
        endpoint = `https://webservice.fanart.tv/v3/movies/${externalId.value}?api_key=${this.fanartApiKey}`;
        logoKey = 'movielogo';
      } else if ((type === 'series' || type === 'tv') && externalId.type === 'tvdb') {
        endpoint = `https://webservice.fanart.tv/v3/tv/${externalId.value}?api_key=${this.fanartApiKey}`;
        logoKey = 'clearlogo';
      } else {
        return null;
      }

      const response = await makeRequest(endpoint, 10000);
      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      const logos = data[logoKey];

      if (!logos || !Array.isArray(logos) || logos.length === 0) {
        return null;
      }

      // Find logo by language preference
      let selectedLogo = this.selectBestLogo(logos, language);
      
      return selectedLogo?.url || null;
    } catch (error) {
      logger.debug('Fanart.tv logo fetch failed:', error);
      return null;
    }
  }

  private async getTmdbLogo(
    externalId: ExternalId,
    type: MediaType,
    language: string
  ): Promise<string | null> {
    try {
      // Convert to TMDB ID if needed
      let tmdbId: string | null = externalId.value;
      
      if (externalId.type !== 'tmdb') {
        tmdbId = await this.convertToTmdbId(externalId, type);
        if (!tmdbId) {
          return null;
        }
      }

      const endpoint = type === 'movie' 
        ? `https://api.themoviedb.org/3/movie/${tmdbId}/images`
        : `https://api.themoviedb.org/3/tv/${tmdbId}/images`;

      const response = await makeRequest(endpoint, 10000, {
        'Authorization': `Bearer ${this.tmdbAccessToken}`,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      const logos = data.logos;

      if (!logos || !Array.isArray(logos) || logos.length === 0) {
        return null;
      }

      // Find logo by language preference
      const selectedLogo = this.selectBestLogo(logos, language, 'iso_639_1');
      
      if (selectedLogo) {
        return `https://image.tmdb.org/t/p/original${selectedLogo.file_path}`;
      }

      return null;
    } catch (error) {
      logger.debug('TMDB logo fetch failed:', error);
      return null;
    }
  }

  private async convertToTmdbId(externalId: ExternalId, type: MediaType): Promise<string | null> {
    try {
      const endpoint = `https://api.themoviedb.org/3/find/${externalId.value}?external_source=${externalId.type}_id`;
      
      const response = await makeRequest(endpoint, 10000, {
        'Authorization': `Bearer ${this.tmdbAccessToken}`,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      const results = type === 'movie' ? data.movie_results : data.tv_results;
      
      if (!results || results.length === 0) {
        return null;
      }

      return results[0].id.toString();
    } catch (error) {
      logger.debug('TMDB ID conversion failed:', error);
      return null;
    }
  }

  private selectBestLogo(
    logos: any[],
    preferredLanguage: string,
    languageKey: string = 'lang'
  ): any | null {
    if (!logos || logos.length === 0) {
      return null;
    }

    // Sort by priority: 
    // 1. Exact language match
    // 2. English 
    // 3. No language (null)
    // 4. Any other language
    // Within each group, sort by vote_average (TMDB) or likes (Fanart.tv) descending
    
    const sortedLogos = logos.sort((a, b) => {
      const aLang = a[languageKey];
      const bLang = b[languageKey];
      
      // Language priority scoring
      const getLanguagePriority = (lang: string | null) => {
        if (lang === preferredLanguage) return 4;
        if (lang === 'en') return 3;
        if (lang === null || lang === '') return 2;
        return 1;
      };
      
      const aPriority = getLanguagePriority(aLang);
      const bPriority = getLanguagePriority(bLang);
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Within same priority, sort by rating
      const aRating = parseFloat(a.vote_average || a.likes || '0');
      const bRating = parseFloat(b.vote_average || b.likes || '0');
      
      return bRating - aRating;
    });

    return sortedLogos[0];
  }
}

// Convenience functions for backward compatibility
export async function getLogo(
  id: string,
  type: MediaType,
  language: string = 'en'
): Promise<string | null> {
  const service = new LogoService();
  return service.getLogo(id, type, language);
}

export async function getTvLogo(
  id: string,
  language: string = 'en'
): Promise<string | null> {
  return getLogo(id, 'tv', language);
}