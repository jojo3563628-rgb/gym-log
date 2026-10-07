export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 縮到長邊 maxEdge 並轉成 JPEG（PES SCR-08、Arch 6.5） */
export async function compressImage(file: Blob, maxEdge = 1280, quality = 0.8): Promise<CompressedImage> {
  // from-image：依照片的 EXIF 方向轉正，避免直拍照片變橫的
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法處理照片');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('照片壓縮失敗'))), 'image/jpeg', quality),
    );
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
