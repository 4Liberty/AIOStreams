import { RPDB } from './rpdb';
import { FanartTV } from './fanart';

export interface ArtworkConfig {
  rpdbApiKey?: string;
  fanartApiKey?: string;
  fanartEnabled?: boolean;
}

export class ArtworkProvider {
  private rpdb?: RPDB;
  private fanart?: FanartTV;
  private config: ArtworkConfig;

  constructor(config: ArtworkConfig) {
    this.config = config;

    if (config.rpdbApiKey) {
      try {
        this.rpdb = new RPDB(config.rpdbApiKey);
      } catch (error) {
        // RPDB API key invalid, continue without RPDB
      }
    }

    if (config.fanartApiKey && config.fanartEnabled) {
      try {
        this.fanart = new FanartTV(config.fanartApiKey);
      } catch (error) {
        // Fanart.tv API key invalid, continue without fanart.tv
      }
    }
  }

  /**
   * Get poster URL, trying RPDB first, then fanart.tv as fallback
   * @param type - The type of content (movie or series)
   * @param id - The ID of the item (supports various formats)
   * @returns Promise<string | null> - The poster URL or null if not available
   */
  public async getPosterUrl(type: string, id: string): Promise<string | null> {
    // Try RPDB first (synchronous)
    if (this.rpdb) {
      try {
        const rpdbPosterUrl = this.rpdb.getPosterUrl(type, id);
        if (rpdbPosterUrl) {
          return rpdbPosterUrl;
        }
      } catch (error) {
        // RPDB failed, continue to fanart.tv
      }
    }

    // Try fanart.tv as fallback (asynchronous)
    if (this.fanart) {
      try {
        const fanartPosterUrl = await this.fanart.getPosterUrl(type, id);
        if (fanartPosterUrl) {
          return fanartPosterUrl;
        }
      } catch (error) {
        // Fanart.tv failed, return null
      }
    }

    return null;
  }

  /**
   * Check if any poster provider is available
   * @returns boolean - True if at least one provider is configured
   */
  public hasProviders(): boolean {
    return !!(this.rpdb || this.fanart);
  }
}
