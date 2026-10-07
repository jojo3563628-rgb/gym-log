import { useRegisterSW } from 'virtual:pwa-register/react';

/** 有新版本時提示，不自動重新載入，避免訓練中途被打斷（Arch 6.4） */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span className="grow">有新版本</span>
      <button type="button" className="btn primary" onClick={() => void updateServiceWorker(true)}>
        更新
      </button>
      <button type="button" className="btn ghost" style={{ color: 'inherit' }} onClick={() => setNeedRefresh(false)}>
        稍後
      </button>
    </div>
  );
}
