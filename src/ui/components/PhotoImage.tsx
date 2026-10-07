import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../../data/db';
import type { Id } from '../../data/types';

export function useObjectUrl(blob: Blob | undefined | null): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    // 釋放記憶體，避免反覆切換頁面時累積
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

interface Props {
  photoId: Id | null;
  className: string;
  alt: string;
  placeholder?: string;
}

export function PhotoImage({ photoId, className, alt, placeholder }: Props) {
  const photo = useLiveQuery(() => (photoId ? db.photos.get(photoId) : undefined), [photoId]);
  const url = useObjectUrl(photo?.blob);
  if (!url) return placeholder === undefined ? null : <div className={className}>{placeholder}</div>;
  return <img className={className} src={url} alt={alt} loading="lazy" />;
}
