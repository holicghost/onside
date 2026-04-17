// Save room data to localStorage for offline access
export function cacheRoomData(code, data) {
  if (!code || !data) return;
  try {
    localStorage.setItem(`room_cache_${code}`, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch { /* storage full — ignore */ }
}

// Read cached room data
export function getCachedRoomData(code) {
  try {
    const raw = localStorage.getItem(`room_cache_${code}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Pre-fetch and cache all hero portraits via service worker
export async function precacheHeroPortraits(portraitCache) {
  if (!portraitCache || !('caches' in window)) return;
  try {
    const cache = await caches.open('onside-auction-v1');
    const urls = Object.values(portraitCache).filter(Boolean);
    await Promise.allSettled(urls.map((url) =>
      cache.match(url).then((cached) => {
        if (!cached) return cache.add(url);
      })
    ));
  } catch { /* ignore */ }
}
