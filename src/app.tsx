import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { requestPersist } from './platform/storage';
import { TabBar } from './ui/components/TabBar';
import { UpdatePrompt } from './ui/components/UpdatePrompt';
import { ExerciseDetail } from './ui/pages/ExerciseDetail';
import { ExerciseEdit } from './ui/pages/ExerciseEdit';
import { ExerciseList } from './ui/pages/ExerciseList';
import { Placeholder } from './ui/pages/Placeholder';
import './ui/styles.css';

export function App() {
  useEffect(() => {
    // Arch 6.1：開啟時就申請持久儲存
    void requestPersist();
  }, []);

  return (
    // Hash 路由：GitHub Pages 重新整理子頁面時不會 404（Arch 第 2 節）
    <HashRouter>
      <Routes>
        <Route path="/" element={<Placeholder title="今天" week="W3" />} />
        <Route path="/calendar" element={<Placeholder title="行事曆" week="W4" />} />
        <Route path="/exercises" element={<ExerciseList />} />
        <Route path="/exercises/new" element={<ExerciseEdit />} />
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/exercises/:id/edit" element={<ExerciseEdit />} />
        <Route path="/trend/:exerciseId" element={<Placeholder title="進步趨勢" week="W5" />} />
        <Route path="/history" element={<Placeholder title="歷史" week="W5" />} />
        <Route path="/settings" element={<Placeholder title="設定" week="W5" />} />
        <Route path="*" element={<Placeholder title="找不到頁面" week="—" />} />
      </Routes>
      <TabBar />
      <UpdatePrompt />
    </HashRouter>
  );
}
