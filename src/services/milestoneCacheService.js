/**
 * Milestone Cache Service
 * Provides fast, localStorage-based caching for milestone percentages
 * Implements stale-while-revalidate pattern for optimal UX
 */

const CACHE_PREFIX = 'milestone_cache_';
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class MilestoneCacheService {
  /**
   * Get cached milestone data for a project
   * @param {string} projectId
   * @returns {Object|null} Cached milestone data or null if not found/expired
   */
  getCached(projectId) {
    try {
      const key = `${CACHE_PREFIX}${projectId}`;
      const cached = localStorage.getItem(key);

      if (!cached) return null;

      const parsed = JSON.parse(cached);

      // Check version compatibility
      if (parsed.version !== CACHE_VERSION) {
        this.invalidate(projectId);
        return null;
      }

      return {
        data: parsed.data,
        timestamp: parsed.timestamp,
        isStale: Date.now() - parsed.timestamp > CACHE_TTL_MS
      };
    } catch (error) {
      console.error('Error reading milestone cache:', error);
      return null;
    }
  }

  /**
   * Get cached data for multiple projects
   * @param {Array<string>} projectIds
   * @returns {Object} Map of projectId -> cached data
   */
  getCachedBatch(projectIds) {
    const results = {};

    projectIds.forEach(projectId => {
      const cached = this.getCached(projectId);
      if (cached) {
        results[projectId] = cached;
      }
    });

    return results;
  }

  /**
   * Set cached milestone data for a project
   * @param {string} projectId
   * @param {Object} milestoneData - Milestone percentages object
   */
  setCached(projectId, milestoneData) {
    try {
      const key = `${CACHE_PREFIX}${projectId}`;
      const cacheEntry = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        data: milestoneData
      };

      localStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('Error setting milestone cache:', error);

      // If quota exceeded, clear old cache entries
      if (error.name === 'QuotaExceededError') {
        this.clearOldEntries();

        // Try again after clearing
        try {
          const key = `${CACHE_PREFIX}${projectId}`;
          const cacheEntry = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            data: milestoneData
          };
          localStorage.setItem(key, JSON.stringify(cacheEntry));
        } catch (retryError) {
          console.error('Failed to cache after clearing old entries:', retryError);
        }
      }
    }
  }

  /**
   * Set cached data for multiple projects
   * @param {Object} projectDataMap - Map of projectId -> milestone data
   */
  setCachedBatch(projectDataMap) {
    Object.entries(projectDataMap).forEach(([projectId, data]) => {
      this.setCached(projectId, data);
    });
  }

  /**
   * Invalidate cache for a specific project
   * @param {string} projectId
   */
  invalidate(projectId) {
    try {
      const key = `${CACHE_PREFIX}${projectId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Error invalidating milestone cache:', error);
    }
  }

  /**
   * Invalidate cache for multiple projects
   * @param {Array<string>} projectIds
   */
  invalidateBatch(projectIds) {
    projectIds.forEach(projectId => this.invalidate(projectId));
  }

  /**
   * Clear all milestone cache entries
   */
  clearAll() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Error clearing milestone cache:', error);
    }
  }

  /**
   * Clear cache entries older than TTL
   */
  clearOldEntries() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();

      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            if (now - cached.timestamp > CACHE_TTL_MS * 2) { // 10 minutes
              localStorage.removeItem(key);
            }
          } catch (error) {
            // If parsing fails, remove the entry
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.error('Error clearing old cache entries:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    try {
      const keys = Object.keys(localStorage);
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      const now = Date.now();

      let fresh = 0;
      let stale = 0;

      cacheKeys.forEach(key => {
        try {
          const cached = JSON.parse(localStorage.getItem(key));
          if (now - cached.timestamp <= CACHE_TTL_MS) {
            fresh++;
          } else {
            stale++;
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      return {
        total: cacheKeys.length,
        fresh,
        stale,
        ttl: CACHE_TTL_MS
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { total: 0, fresh: 0, stale: 0, ttl: CACHE_TTL_MS };
    }
  }

  /**
   * Check if cache should be refreshed for a project
   * @param {string} projectId
   * @returns {boolean} True if cache is missing or stale
   */
  shouldRefresh(projectId) {
    const cached = this.getCached(projectId);
    return !cached || cached.isStale;
  }

  /**
   * Warm up cache by preloading data for multiple projects
   * Returns projects that need fresh data
   * @param {Array<string>} projectIds
   * @returns {Array<string>} Project IDs that need refresh
   */
  warmUp(projectIds) {
    const needsRefresh = [];

    projectIds.forEach(projectId => {
      if (this.shouldRefresh(projectId)) {
        needsRefresh.push(projectId);
      }
    });

    return needsRefresh;
  }
}

export const milestoneCacheService = new MilestoneCacheService();
