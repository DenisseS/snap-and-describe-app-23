// Queue types and helpers added for ADR Phase 1
const QUEUE_COALESCE_MS = 300;
const IDB_NAME = 'NS_QUEUE';
const IDB_STORE = 'events';

// In-memory state (ephemeral)
let SW_QUEUE_TOKEN = null; // access_token lives only during processing
let SW_QUEUE_PROCESSING = false;
let SW_QUEUE_STOP_REQUESTED = false;
const SW_COALESCE_TIMERS = new Map(); // key -> timeout id

// Utility: composite key
const makeKey = (queueName, resourceKey) => `${queueName}::${resourceKey}`;

// Broadcast helper
const postToAllClients = async (message) => {
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage(message));
};

// IDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(event) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(event);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Queue core
async function queueEnqueue(queueName, resourceKey, payload) {
  const id = makeKey(queueName, resourceKey);
  const now = Date.now();
  const coalesceUntil = now + QUEUE_COALESCE_MS;
  const entry = {
    id,
    queueName,
    resourceKey,
    payload,
    lastUpdatedAt: now,
    coalesceUntil,
    status: 'pending', // pending | processing | error
  };
  await idbPut(entry);
  // reset coalescing timer (not strictly needed for status, but we may emit a coalescing event)
  if (SW_COALESCE_TIMERS.has(id)) clearTimeout(SW_COALESCE_TIMERS.get(id));
  const t = setTimeout(() => {
    // notify ready state
    postToAllClients({ type: 'QUEUE_EVENT', event: 'ready', queueName, resourceKey });
    SW_COALESCE_TIMERS.delete(id);
  }, QUEUE_COALESCE_MS);
  SW_COALESCE_TIMERS.set(id, t);
  return true;
}

async function queueStatus(resourceKey) {
  const all = await idbGetAll();
  const processing = SW_QUEUE_PROCESSING;
  const items = all.map((e) => ({ id: e.id, queueName: e.queueName, resourceKey: e.resourceKey, status: e.status, lastUpdatedAt: e.lastUpdatedAt, coalesceUntil: e.coalesceUntil }));
  const byResource = resourceKey ? items.filter(i => i.resourceKey === resourceKey) : items;
  return { processing, items: byResource };
}

async function processQueue() {
  if (SW_QUEUE_PROCESSING) return;
  if (!SW_QUEUE_TOKEN) {
    console.log('SW Queue: No token set, cannot start');
    return;
  }
  SW_QUEUE_PROCESSING = true;
  SW_QUEUE_STOP_REQUESTED = false;
  await postToAllClients({ type: 'QUEUE_EVENT', event: 'processing-start' });
  try {
    // LIFO across ready items
    while (!SW_QUEUE_STOP_REQUESTED) {
      const all = await idbGetAll();
      const now = Date.now();
      const ready = all.filter(e => e.status === 'pending' && e.coalesceUntil <= now);
      if (ready.length === 0) break; // drain
      // pick latest lastUpdatedAt
      ready.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      const item = ready[0];
      // mark processing
      item.status = 'processing';
      await idbPut(item);
      await postToAllClients({ type: 'QUEUE_EVENT', event: 'processing', queueName: item.queueName, resourceKey: item.resourceKey });

      const ok = await processItem(item);
      if (!ok) {
        // mark error and stop
        item.status = 'error';
        await idbPut(item);
        await postToAllClients({ type: 'QUEUE_EVENT', event: 'error', queueName: item.queueName, resourceKey: item.resourceKey });
        break;
      }
      // delete processed
      await idbDelete(item.id);
      await postToAllClients({ type: 'QUEUE_EVENT', event: 'processed', queueName: item.queueName, resourceKey: item.resourceKey });
    }
  } catch (err) {
    console.error('SW Queue: Processing error', err);
  } finally {
    const drained = (await idbGetAll()).filter(e => e.status === 'pending').length === 0;
    SW_QUEUE_PROCESSING = false;
    SW_QUEUE_TOKEN = null; // clear token aggressively
    SW_QUEUE_STOP_REQUESTED = false;
    await postToAllClients({ type: 'QUEUE_EVENT', event: drained ? 'drained' : 'stopped' });
  }
}

async function processItem(item) {
  if (!SW_QUEUE_TOKEN) return false;
  if (item.queueName === 'shopping-lists') {
    try {
      const path = `/shopping-list-${item.resourceKey}.json`;
      const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SW_QUEUE_TOKEN}`,
          'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false }),
          'Content-Type': 'application/octet-stream',
        },
        body: JSON.stringify(item.payload, null, 2),
      });
      return resp.ok;
    } catch (e) {
      console.error('SW Queue: Upload error', e);
      return false;
    }
  }
  // Unknown processor
  console.warn('SW Queue: No processor for queue', item.queueName);
  return false;
}

// original minimal PWA shell caching and fetch strategies

const CACHE_VERSION = 'v7-minimal';
const APP_SHELL_CACHE = `nutriscan-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nutriscan-runtime-${CACHE_VERSION}`;

// Minimal essential resources for PWA recognition
const APP_SHELL_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/tray.png',
  '/splash.png'
];

// Install event - cache only essential app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(APP_SHELL_RESOURCES);
      })
      .catch((error) => {
        console.log('Service Worker: App shell cache failed', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating version', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('nutriscan-') && !cacheName.includes(CACHE_VERSION)) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
  
  // Notify clients that SW has been updated
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_UPDATED',
        version: CACHE_VERSION
      });
    });
  });
});

// Network-first fetch strategy with minimal caching
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppShellResource = APP_SHELL_RESOURCES.some(resource => 
    url.pathname === resource || 
    (resource === '/' && url.pathname === '/index.html')
  );

  // Handle app shell resources (network-first with cache fallback)
  if (isAppShellResource) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            console.log('Service Worker: Network success for app shell:', url.pathname);
            // Update cache with fresh content
            const responseClone = response.clone();
            caches.open(APP_SHELL_CACHE)
              .then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          console.log('Service Worker: Network failed, serving from cache:', url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  // Handle JavaScript/CSS assets (network-first with runtime cache)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            console.log('Service Worker: Network success for asset:', url.pathname);
            // Cache successful responses in runtime cache
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          console.log('Service Worker: Network failed for asset, checking cache:', url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  // For all other requests, try network first, no caching
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // If it's a navigation request and network fails, serve index.html from cache
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // For other requests, just let them fail
        throw error;
      })
  );
});

// Message handling for debugging and version info
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION_RESPONSE',
      version: CACHE_VERSION
    });
  }

  if (event.data && event.data.type === 'HEALTH_CHECK') {
    Promise.all([
      caches.keys(),
      caches.open(APP_SHELL_CACHE).then(cache => cache.keys()),
      caches.open(RUNTIME_CACHE).then(cache => cache.keys())
    ]).then(([cacheNames, shellCacheKeys, runtimeCacheKeys]) => {
      event.ports[0].postMessage({
        type: 'HEALTH_RESPONSE',
        data: {
          version: CACHE_VERSION,
          isActive: true,
          cacheNames: cacheNames.filter(name => name.startsWith('nutriscan-')),
          shellCacheSize: shellCacheKeys.length,
          runtimeCacheSize: runtimeCacheKeys.length
        }
      });
    });
  }

  if (event.data && event.data.type === 'FORCE_UPDATE') {
    // Force update by clearing caches and reloading
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('nutriscan-')) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    });
  }
});

// Queue message handling (separate listener for clarity)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (!data || !data.type) return;

  switch (data.type) {
    case 'QUEUE_ENQUEUE': {
      const { queueName, resourceKey, payload } = data;
      queueEnqueue(queueName, resourceKey, payload).then(() => {
        if (port) port.postMessage({ ok: true });
      });
      break;
    }
    case 'QUEUE_STATUS': {
      const { resourceKey } = data;
      queueStatus(resourceKey).then((status) => {
        if (port) port.postMessage({ ok: true, status });
      });
      break;
    }
    case 'QUEUE_START': {
      const { access_token } = data;
      SW_QUEUE_TOKEN = access_token || null;
      processQueue();
      if (port) port.postMessage({ ok: true });
      break;
    }
    case 'QUEUE_STOP': {
      SW_QUEUE_STOP_REQUESTED = true;
      SW_QUEUE_TOKEN = null;
      if (port) port.postMessage({ ok: true });
      break;
    }
    case 'QUEUE_PURGE_RESOURCE': {
      const { queueName, resourceKey } = data;
      idbDelete(makeKey(queueName, resourceKey)).then(() => {
        if (port) port.postMessage({ ok: true });
      });
      break;
    }
    case 'QUEUE_CLEAR_ALL': {
      openDB().then(db => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => { if (port) port.postMessage({ ok: true }); };
      });
      break;
    }
  }
});

// Background sync for offline actions (minimal implementation)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Service Worker: Background sync triggered');
    // Minimal sync implementation - just log for now
  }
});
