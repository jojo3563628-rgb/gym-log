const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseTimeParam(t: string | null): number {
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYouTubeUrl(input: string): { videoId: string; startSec: number } | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const segments = url.pathname.split('/').filter(Boolean);

  let id: string | undefined;
  if (host === 'youtu.be') {
    id = segments[0];
  } else if (host === 'youtube.com') {
    if (segments[0] === 'watch') id = url.searchParams.get('v') ?? undefined;
    else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') id = segments[1];
  }
  if (!id || !ID_RE.test(id)) return null;
  return { videoId: id, startSec: parseTimeParam(url.searchParams.get('t') ?? url.searchParams.get('start')) };
}

export function embedUrl(videoId: string, startSec: number): string {
  const start = Math.max(0, Math.floor(startSec));
  return `https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&playsinline=1&rel=0`;
}

export function watchUrl(videoId: string, startSec: number): string {
  const t = Math.max(0, Math.floor(startSec));
  return `https://www.youtube.com/watch?v=${videoId}${t > 0 ? `&t=${t}s` : ''}`;
}

/** '1:30' → 90、'90' → 90、'1:02:03' → 3723；格式錯誤回傳 null */
export function parseMmSs(s: string): number | null {
  const v = s.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (sec >= 60 || (m[1] !== undefined && min >= 60)) return null;
  return h * 3600 + min * 60 + sec;
}

export function formatMmSs(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
