// Dropbox-specific processor(s) for the Service Worker queue
// Registers processors on global NSQueue

(function(){
  if (!self.NSQueue) {
    console.error('NSQueue not found. Ensure queue.js is imported before dropbox.js');
    return;
  }

  // Processor for shopping lists → uploads to Dropbox overwrite
  self.NSQueue.registerProcessor('shopping-lists', async (item, ctx) => {
    const token = ctx && ctx.token;
    if (!token) return false;
    try {
      const path = `/shopping-list-${item.resourceKey}.json`;
      const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false }),
          'Content-Type': 'application/octet-stream',
        },
        body: JSON.stringify(item.payload, null, 2),
      });
      return resp.ok;
    } catch (e) {
      console.error('SW Queue: Dropbox upload error', e);
      return false;
    }
  });
})();
