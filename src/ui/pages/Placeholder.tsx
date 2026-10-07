import { PageHeader } from '../components/PageHeader';

/** 尚未實作的畫面，依 PIS 第 8 節排程逐週完成 */
export function Placeholder({ title, week }: { title: string; week: string }) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <div className="empty">此畫面預計在 {week} 完成</div>
    </div>
  );
}
