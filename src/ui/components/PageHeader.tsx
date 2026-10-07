import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconBack } from './icons';

interface Props {
  title: string;
  /** 有值時顯示返回鍵；無上一頁可回時改為導向此路徑 */
  back?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, back, actions }: Props) {
  const navigate = useNavigate();
  const goBack = () => {
    // 從外部直接開啟子頁時沒有上一頁，改走指定路徑
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(back!, { replace: true });
  };
  return (
    <header className="page-header">
      {back ? (
        <button type="button" className="icon-btn" onClick={goBack} aria-label="返回">
          <IconBack />
        </button>
      ) : (
        <span className="spacer" />
      )}
      <h1>{title}</h1>
      {actions}
    </header>
  );
}
