/**
 * IndexedDB Thumbnail Cache Manager
 * 
 * Manages cached SharePoint thumbnail images with automatic cleanup
 * and size management
 */

const DB_NAME = 'sharepoint_thumbnails';
const STORE_NAME = 'thumbnails';
const DB_VERSION = 1;
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
const CACHE_EXPIRY_DAYS = 7;

class ThumbnailCache {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          
          // Create indexes for efficient queries
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('size', 'size', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  async ensureDb() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  /**
   * Get cached thumbnail
   * @param {string} url - SharePoint URL
   * @param {string} size - Thumbnail size ('small', 'medium', 'large')
   * @returns {Promise<{thumbnailData: string, type: string}|null>}
   */
  async get(url, size = 'medium') {
    try {
      const db = await this.ensureDb();
      const cacheKey = this.getCacheKey(url, size);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(cacheKey);

        request.onsuccess = () => {
          const result = request.result;
          
          // Check if expired
          if (result && this.isExpired(result.timestamp)) {
            // Delete expired entry
            this.delete(cacheKey).catch(console.error);
            resolve(null);
            return;
          }

          resolve(result);
        };

        request.onerror = () => {
          console.error('Failed to get from cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store thumbnail in cache
   * @param {string} url - SharePoint URL
   * @param {string} thumbnailData - Base64 encoded thumbnail
   * @param {string} size - Thumbnail size
   * @param {string} type - Image MIME type
   */
  async set(url, thumbnailData, size = 'medium', type = 'image/jpeg') {
    try {
      const db = await this.ensureDb();
      const cacheKey = this.getCacheKey(url, size);

      // Calculate approximate size (base64 is ~1.37x original)
      const dataSize = thumbnailData.length;

      // Check total cache size before adding
      const currentSize = await this.getTotalSize();
      if (currentSize + dataSize > MAX_CACHE_SIZE) {
        // Clear oldest entries to make space
        await this.clearOldest(dataSize);
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const entry = {
          url: cacheKey,
          originalUrl: url,
          thumbnailData,
          size,
          type,
          timestamp: Date.now(),
          dataSize
        };

        const request = store.put(entry);

        request.onsuccess = () => resolve(true);
        request.onerror = () => {
          console.error('Failed to set cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete cached entry
   * @param {string} cacheKey - Cache key
   */
  async delete(cacheKey) {
    try {
      const db = await this.ensureDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(cacheKey);

        request.onsuccess = () => resolve(true);
        request.onerror = () => {
          console.error('Failed to delete from cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear all cached entries
   */
  async clear() {
    try {
      const db = await this.ensureDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('Thumbnail cache cleared');
          resolve(true);
        };

        request.onerror = () => {
          console.error('Failed to clear cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup() {
    try {
      const db = await this.ensureDb();
      const expiredKeys = [];

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            if (this.isExpired(cursor.value.timestamp)) {
              expiredKeys.push(cursor.value.url);
              cursor.delete();
            }
            cursor.continue();
          } else {
            console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
            resolve(expiredKeys.length);
          }
        };

        request.onerror = () => {
          console.error('Failed to cleanup cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get total cache size
   */
  async getTotalSize() {
    try {
      const db = await this.ensureDb();
      let totalSize = 0;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            totalSize += cursor.value.dataSize || 0;
            cursor.continue();
          } else {
            resolve(totalSize);
          }
        };

        request.onerror = () => {
          console.error('Failed to get total size:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  }

  /**
   * Clear oldest entries to make space
   */
  async clearOldest(spaceNeeded) {
    try {
      const db = await this.ensureDb();
      const entries = [];

      // First, collect all entries with timestamps
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            entries.push({
              url: cursor.value.url,
              timestamp: cursor.value.timestamp,
              dataSize: cursor.value.dataSize
            });
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });

      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);

      // Delete oldest entries until we have enough space
      let freedSpace = 0;
      const toDelete = [];

      for (const entry of entries) {
        toDelete.push(entry.url);
        freedSpace += entry.dataSize;
        if (freedSpace >= spaceNeeded) break;
      }

      // Delete the entries
      if (toDelete.length > 0) {
        await new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);

          toDelete.forEach(url => store.delete(url));

          transaction.oncomplete = () => {
            console.log(`Cleared ${toDelete.length} oldest cache entries (${freedSpace} bytes)`);
            resolve();
          };

          transaction.onerror = () => reject(transaction.error);
        });
      }
    } catch (error) {
      console.error('Error clearing oldest entries:', error);
    }
  }

  /**
   * Batch prefetch thumbnails
   * @param {Array<{url: string, size: string}>} items
   * @param {Function} fetchFn - Function to fetch thumbnail (url, size) => Promise<{data, type}>
   */
  async prefetchBatch(items, fetchFn) {
    const results = [];

    for (const item of items) {
      try {
        // Check if already cached
        const cached = await this.get(item.url, item.size);
        if (cached) {
          results.push({ url: item.url, cached: true });
          continue;
        }

        // Fetch and cache
        const { data, type } = await fetchFn(item.url, item.size);
        if (data) {
          await this.set(item.url, data, item.size, type);
          results.push({ url: item.url, cached: true, fresh: true });
        } else {
          results.push({ url: item.url, cached: false, error: 'No data' });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to prefetch ${item.url}:`, error);
        results.push({ url: item.url, cached: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Generate cache key from URL and size
   */
  getCacheKey(url, size) {
    return `${url}|${size}`;
  }

  /**
   * Check if timestamp is expired
   */
  isExpired(timestamp) {
    const age = Date.now() - timestamp;
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return age > maxAge;
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const db = await this.ensureDb();
      let count = 0;
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;

      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            count++;
            totalSize += cursor.value.dataSize || 0;
            if (cursor.value.timestamp < oldestTimestamp) {
              oldestTimestamp = cursor.value.timestamp;
            }
            if (cursor.value.timestamp > newestTimestamp) {
              newestTimestamp = cursor.value.timestamp;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });

      return {
        count,
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        oldestEntry: count > 0 ? new Date(oldestTimestamp) : null,
        newestEntry: count > 0 ? new Date(newestTimestamp) : null,
        maxSize: MAX_CACHE_SIZE,
        maxSizeMB: (MAX_CACHE_SIZE / (1024 * 1024)).toFixed(2),
        expiryDays: CACHE_EXPIRY_DAYS
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const thumbnailCache = new ThumbnailCache();
export default thumbnailCache;
