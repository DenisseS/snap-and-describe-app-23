// Queue core extracted for maintainability
// Exposes global NSQueue on the Service Worker scope

(function(){
  const QUEUE_COALESCE_MS = 300;
  const IDB_NAME = 'NS_QUEUE';
  const IDB_STORE = 'events';

  // In-memory state
  let TOKEN = null; // access_token only during processing
  let PROCESSING = false;
  let STOP_REQUESTED = false;
  const COALESCE_TIMERS = new Map(); // id -> timeout
  const PROCESSORS = new Map(); // queueName -> (item, ctx) => Promise<boolean>

  // Helpers
  const makeKey = (queueName, resourceKey) => `${queueName}::${resourceKey}`;
  const postToAllClients = async (message) => {
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'QUEUE_EVENT', ...message }));
  };

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

  async function idbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
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

  async function clearAll() {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve(true);
    });
  }

  async function enqueue(queueName, resourceKey, payload) {
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
    // reset coalescing timer
    if (COALESCE_TIMERS.has(id)) clearTimeout(COALESCE_TIMERS.get(id));
    const t = setTimeout(() => {
      postToAllClients({ event: 'ready', queueName, resourceKey });
      COALESCE_TIMERS.delete(id);
    }, QUEUE_COALESCE_MS);
    COALESCE_TIMERS.set(id, t);
    return true;
  }

  async function status(resourceKey) {
    const all = await idbGetAll();
    const items = all.map((e) => ({ id: e.id, queueName: e.queueName, resourceKey: e.resourceKey, status: e.status, lastUpdatedAt: e.lastUpdatedAt, coalesceUntil: e.coalesceUntil }));
    const byResource = resourceKey ? items.filter(i => i.resourceKey === resourceKey) : items;
    return { processing: PROCESSING, items: byResource };
  }

  async function processLoop() {
    if (PROCESSING) return;
    if (!TOKEN) {
      console.log('SW Queue: No token set, cannot start');
      return;
    }
    PROCESSING = true;
    STOP_REQUESTED = false;
    await postToAllClients({ event: 'processing-start' });
    try {
      while (!STOP_REQUESTED) {
        const all = await idbGetAll();
        const now = Date.now();
        const ready = all.filter(e => e.status === 'pending' && e.coalesceUntil <= now);
        if (ready.length === 0) break; // drain
        ready.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
        const item = ready[0];
        item.status = 'processing';
        await idbPut(item);
        await postToAllClients({ event: 'processing', queueName: item.queueName, resourceKey: item.resourceKey });

        const processor = PROCESSORS.get(item.queueName);
        let ok = false;
        if (processor) {
          try {
            ok = await processor(item, { token: TOKEN });
          } catch (e) {
            console.error('SW Queue: Processor error', e);
            ok = false;
          }
        } else {
          console.warn('SW Queue: No processor for queue', item.queueName);
        }

        if (!ok) {
          item.status = 'error';
          await idbPut(item);
          await postToAllClients({ event: 'error', queueName: item.queueName, resourceKey: item.resourceKey });
          break;
        }

        await idbDelete(item.id);
        await postToAllClients({ event: 'processed', queueName: item.queueName, resourceKey: item.resourceKey });
      }
    } finally {
      const drained = (await idbGetAll()).filter(e => e.status === 'pending').length === 0;
      PROCESSING = false;
      TOKEN = null; // clear token aggressively
      STOP_REQUESTED = false;
      await postToAllClients({ event: drained ? 'drained' : 'stopped' });
    }
  }

  function setToken(token) { TOKEN = token || null; }
  function start() { return processLoop(); }
  function stop() { STOP_REQUESTED = true; TOKEN = null; }

  function registerProcessor(queueName, fn) { PROCESSORS.set(queueName, fn); }
  function purgeResource(queueName, resourceKey) { return idbDelete(makeKey(queueName, resourceKey)); }

  // Expose API
  self.NSQueue = {
    enqueue,
    status,
    setToken,
    start,
    stop,
    registerProcessor,
    purgeResource,
    clearAll,
  };
})();
