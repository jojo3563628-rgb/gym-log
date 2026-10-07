import { useEffect, useState } from 'react';
import type { Video } from '../../data/types';
import { embedUrl, formatMmSs, watchUrl } from '../../domain/youtube';
import { IconPlay } from './icons';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

interface Props {
  video: Video;
  index: number;
  playing: boolean;
  onPlay: () => void;
}

/** 點擊後才載入 iframe，開啟動作頁時不必等 YouTube（Arch 6.2） */
export function YouTubePlayer({ video, index, playing, onPlay }: Props) {
  const online = useOnline();
  const title = video.title || `影片 ${index + 1}`;
  const start = video.startSec > 0 ? `從 ${formatMmSs(video.startSec)} 開始` : '';

  if (playing && online) {
    return (
      <div className="video">
        <div className="video-frame">
          <iframe
            src={`${embedUrl(video.youtubeId, video.startSec)}&autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>
          {title} {start}
        </div>
      </div>
    );
  }

  return (
    <div className="video">
      <button type="button" className="video-row" onClick={onPlay} disabled={!online}>
        <span className="play">
          <IconPlay width={20} height={20} />
        </span>
        <span className="grow">
          <div>{title}</div>
          <div className="small muted">{online ? start || '從頭播放' : '需要網路連線才能播放'}</div>
        </span>
      </button>
      {!online && (
        <a className="small" href={watchUrl(video.youtubeId, video.startSec)} target="_blank" rel="noreferrer">
          在 YouTube 開啟
        </a>
      )}
    </div>
  );
}
