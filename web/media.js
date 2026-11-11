import { parseTime, measured } from './metrics.js';
import { safeUrl } from './ui.js';

export const rates = [.1, .25, .5, .75, 1, 1.25, 1.5, 2, 3, 4];

function youtubeId(url) {
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'youtu.be') return url.pathname.split('/')[1];
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
  return /^\/(?:embed|live|shorts)\/([^/]+)/.exec(url.pathname)?.[1] ?? '';
}

function linkTime(value, youtube) {
  const raw = value.trim().replace(/\.$/, '');
  const compact = youtube && /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i.exec(raw);
  return compact && raw ? Number(compact[1] ?? 0) * 3600 + Number(compact[2] ?? 0) * 60
    + Number(compact[3] ?? 0) : parseTime(raw);
}

export function videoLink(raw) {
  const safe = safeUrl(raw.trim());
  if (!safe) throw new Error('Enter a valid HTTP or HTTPS video URL.');
  const url = new URL(safe);
  const cmas = url.hostname === 'tv.cmas.org';
  const youtube = youtubeId(url);
  if (youtube !== null) {
    if (!/^[\w-]{11}$/.test(youtube)) throw new Error('Enter a link to a YouTube video.');
    const rawTime = url.searchParams.get('t') ?? url.searchParams.get('start') ?? /^#t=([^,]+)/.exec(url.hash)?.[1] ?? '';
    const position = linkTime(rawTime, true);
    if (rawTime && !measured(position)) throw new Error('Use a valid YouTube start time.');
    return { url: 'https://www.youtube.com/watch?v=' + youtube, youtube, position, title: 'YouTube · ' + youtube };
  }
  if (!cmas && !/\.(mp4|m4v|webm|mov|ogv|m3u8)$/i.test(url.pathname)) {
    throw new Error('Use a YouTube or CMAS TV video, or a direct MP4, WebM or HLS link.');
  }
  const rawTime = url.searchParams.get('currenttime') ?? /^#t=([^,]+)/.exec(url.hash)?.[1] ?? '';
  const position = linkTime(rawTime, false);
  if (rawTime && !measured(position)) throw new Error('Use a valid start time in seconds.');
  url.searchParams.delete('currenttime');
  url.hash = '';
  return { url: url.href, cmas, position, title: cmas ? 'CMAS TV' : decodeURIComponent(url.pathname.split('/').at(-1)) };
}

export function timedLink(raw, position) {
  const safe = safeUrl(raw);
  if (!safe) return '';
  const url = new URL(safe);
  if (measured(position)) {
    if (youtubeId(url)) url.searchParams.set('t', Math.floor(position));
    else if (url.hostname === 'tv.cmas.org') url.searchParams.set('currenttime', position);
    else url.hash = 't=' + position;
  }
  return url.href;
}

export function videoFingerprint(file) {
  return [file.name, file.size, file.lastModified].join('|');
}

async function handles(mode, operation) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dnf-local-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('videos');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('videos', mode);
      const query = operation(transaction.objectStore('videos'));
      transaction.oncomplete = () => { db.close(); resolve(query.result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  });
}
export function rememberFile(file, handle) {
  return handles('readwrite', store => store.put(handle, videoFingerprint(file)));
}
export function rememberedHandle(record) {
  if (!record.videoSize || !record.videoModified) return Promise.resolve(null);
  return handles('readonly', store => store.get([record.videoName, record.videoSize, record.videoModified].join('|')));
}

let hlsLoader;
export async function hlsPlayer() {
  if (!hlsLoader) hlsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/hls.light.min.js';
    script.onload = () => resolve(window.Hls);
    script.onerror = () => { hlsLoader = null; script.remove(); reject(new Error('HLS player failed to load.')); };
    document.head.append(script);
  });
  return hlsLoader;
}
