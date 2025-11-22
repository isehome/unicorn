// IndexedDB queue for pending photo uploads with file storage support

const DB_NAME = 'unicorn-offline'
const STORE = 'pending-uploads'
const DB_VERSION = 2 // Increment for new schema

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result

      // Delete old store if upgrading from version 1
      if (event.oldVersion < DB_VERSION && db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE)
      }

      // Create new store with proper schema
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        // Add indexes for efficient querying
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('type', 'type', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Add a photo upload to the queue
 *
 * @param {Object} params - Upload parameters
 * @param {string} params.type - 'issue_photo' or 'wire_drop_photo'
 * @param {string} params.projectId - Project UUID
 * @param {Blob} params.file - Image file blob
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<string>} Upload ID
 */
export async function enqueueUpload({ type, projectId, file, metadata }) {
  const db = await openDB()

  // Generate unique ID
  const id = crypto.randomUUID()

  const upload = {
    id,
    type, // 'issue_photo' or 'wire_drop_photo'
    projectId,
    issueId: metadata.issueId || null,
    wireDropId: metadata.wireDropId || null,
    stage: metadata.stage || null, // for wire drops: 'prewire', 'trim_out', 'commission'
    file, // Blob object
    metadata: {
      description: metadata.description || '',
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      uploadedBy: metadata.uploadedBy || null
    },
    timestamp: Date.now(),
    retryCount: 0,
    lastError: null,
    status: 'pending' // 'pending', 'uploading', 'failed', 'completed'
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => {
      // Notify listeners about queue update
      window.dispatchEvent(new CustomEvent('queue-updated', {
        detail: { action: 'added', uploadId: id }
      }))
      console.log(`[Offline Queue] Added ${type} to queue:`, id)
      resolve(id)
    }
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).add(upload)
  })
}

/**
 * Get all pending uploads from the queue
 * @returns {Promise<Array>} Array of upload records
 */
export async function listUploads() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const uploads = req.result || []
      // Sort by timestamp (oldest first)
      uploads.sort((a, b) => a.timestamp - b.timestamp)
      resolve(uploads)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Remove an upload from the queue
 * @param {string} id - Upload ID
 * @returns {Promise<void>}
 */
export async function removeUpload(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('queue-updated', {
        detail: { action: 'removed', uploadId: id }
      }))
      console.log('[Offline Queue] Removed upload:', id)
      resolve()
    }
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).delete(id)
  })
}

/**
 * Update upload status and metadata
 * @param {string} id - Upload ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateUpload(id, updates) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)

    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const upload = getReq.result
      if (!upload) {
        reject(new Error(`Upload not found: ${id}`))
        return
      }

      // Merge updates
      const updated = { ...upload, ...updates }
      const putReq = store.put(updated)

      putReq.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('queue-updated', {
          detail: { action: 'updated', uploadId: id, updates }
        }))
        console.log('[Offline Queue] Updated upload:', id, updates)
        resolve()
      }
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

/**
 * Get count of pending uploads
 * @returns {Promise<number>}
 */
export async function getQueueCount() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get a single upload by ID
 * @param {string} id - Upload ID
 * @returns {Promise<Object|null>}
 */
export async function getUpload(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Clear all completed uploads from queue
 * @returns {Promise<number>} Number of items cleared
 */
export async function clearCompleted() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const index = store.index('status')
    const req = index.getAllKeys('completed')

    req.onsuccess = () => {
      const keys = req.result
      let count = 0

      keys.forEach(key => {
        store.delete(key)
        count++
      })

      tx.oncomplete = () => {
        window.dispatchEvent(new CustomEvent('queue-updated', {
          detail: { action: 'cleared', count }
        }))
        console.log('[Offline Queue] Cleared completed uploads:', count)
        resolve(count)
      }
    }
    req.onerror = () => reject(req.error)
    tx.onerror = () => reject(tx.error)
  })
}
