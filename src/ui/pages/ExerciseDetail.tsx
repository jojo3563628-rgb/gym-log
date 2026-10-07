import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { db } from '../../data/db';
import { unarchiveExercise } from '../../data/repos';
import type { Id } from '../../data/types';
import { TYPE_LABEL } from '../../domain/csv';
import { defaultStep, UNIT_LABEL } from '../../domain/units';
import { PageHeader } from '../components/PageHeader';
import { PhotoImage } from '../components/PhotoImage';
import { YouTubePlayer } from '../components/YouTubePlayer';

/** SCR-07 動作項目頁：1 次點擊即可看到說明與影片（KPI-3） */
export function ExerciseDetail() {
  const { id } = useParams<{ id: Id }>();
  const exercise = useLiveQuery(() => db.exercises.get(id!), [id]);
  const videos = useLiveQuery(() => db.videos.where('exerciseId').equals(id!).sortBy('order'), [id]) ?? [];
  const parts = useLiveQuery(() => db.bodyParts.toArray(), []) ?? [];
  const [playing, setPlaying] = useState<Id | null>(null);

  if (exercise === undefined) {
    return (
      <div className="page">
        <PageHeader title="" back="/exercises" />
      </div>
    );
  }

  const partNames = exercise.bodyPartIds.map((pid) => parts.find((p) => p.id === pid)?.name).filter(Boolean);
  const unit = exercise.defaultUnit;

  return (
    <div className="page">
      <PageHeader
        title={exercise.name}
        back="/exercises"
        actions={
          <Link className="btn ghost" to={`/exercises/${exercise.id}/edit`}>
            編輯
          </Link>
        }
      />

      <PhotoImage photoId={exercise.photoId} className="hero" alt={exercise.name} />

      {exercise.archived === 1 && (
        <div className="card row" style={{ marginBottom: 12 }}>
          <span className="grow muted">這個動作已封存，不會出現在清單與挑選畫面。</span>
          <button type="button" className="btn" onClick={() => void unarchiveExercise(exercise.id)}>
            取消封存
          </button>
        </div>
      )}

      <div className="muted">
        {[exercise.brand, TYPE_LABEL[exercise.type]].filter(Boolean).join('・')}
      </div>
      <div style={{ marginTop: 6 }}>
        {partNames.map((n) => (
          <span key={n} className="tag" style={{ marginRight: 4 }}>
            {n}
          </span>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        單位：{unit ? `${UNIT_LABEL[unit]}（每次 ±${exercise.step ?? defaultStep(unit)}）` : '徒手'}
        {exercise.restSec !== null && `・休息 ${exercise.restSec} 秒`}
      </div>

      <section className="section">
        <h2>使用說明</h2>
        <div className="prose">{exercise.instructions || <span className="muted">尚未填寫</span>}</div>
      </section>

      {exercise.cautions && (
        <section className="section">
          <h2>注意事項</h2>
          <div className="prose card">{exercise.cautions}</div>
        </section>
      )}

      <section className="section">
        <h2>教學影片</h2>
        {videos.length === 0 ? (
          <div className="muted">尚未加入影片</div>
        ) : (
          videos.map((v, i) => (
            <YouTubePlayer key={v.id} video={v} index={i} playing={playing === v.id} onPlay={() => setPlaying(v.id)} />
          ))
        )}
      </section>

      <Link className="btn block" to={`/trend/${exercise.id}`}>
        查看進步趨勢
      </Link>
    </div>
  );
}
