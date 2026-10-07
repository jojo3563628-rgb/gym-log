import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { db } from '../../data/db';
import type { Exercise, ExerciseType, Id } from '../../data/types';
import { TYPE_LABEL } from '../../domain/csv';
import { BodyPartPicker } from '../components/BodyPartPicker';
import { PageHeader } from '../components/PageHeader';
import { PhotoImage } from '../components/PhotoImage';

type Sort = 'recent' | 'name';
const TYPES: (ExerciseType | 'all')[] = ['all', 'machine', 'free', 'bodyweight'];

/** 最近使用的排前面；從沒用過的依名稱排在後面 */
function byRecent(a: Exercise, b: Exercise): number {
  return (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || a.name.localeCompare(b.name, 'zh-Hant');
}

/** SCR-06 動作庫清單 */
export function ExerciseList() {
  const navigate = useNavigate();
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const parts = useLiveQuery(() => db.bodyParts.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ExerciseType | 'all'>('all');
  const [partFilter, setPartFilter] = useState<Id[]>([]);
  const [sort, setSort] = useState<Sort>('recent');
  const [showArchived, setShowArchived] = useState(false);

  const partName = useMemo(() => new Map(parts.map((p) => [p.id, p.name])), [parts]);

  const visible = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => (showArchived ? e.archived === 1 : e.archived === 0))
      .filter((e) => type === 'all' || e.type === type)
      .filter((e) => partFilter.length === 0 || e.bodyPartIds.some((id) => partFilter.includes(id)))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.brand.toLowerCase().includes(q))
      .sort(sort === 'recent' ? byRecent : (a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [exercises, query, type, partFilter, sort, showArchived]);

  const archivedCount = exercises?.filter((e) => e.archived === 1).length ?? 0;

  return (
    <div className="page">
      <PageHeader
        title={showArchived ? '已封存的動作' : '動作庫'}
        back={showArchived ? '/exercises' : undefined}
        actions={
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')}
            aria-label="切換排序"
          >
            {sort === 'recent' ? '最近使用' : '依名稱'}
          </button>
        }
      />

      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋名稱或品牌"
        aria-label="搜尋"
      />

      <div className="segmented" style={{ margin: '12px 0' }}>
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
            {t === 'all' ? '全部' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <BodyPartPicker value={partFilter} onChange={setPartFilter} scroll />

      {exercises === undefined ? null : visible.length === 0 ? (
        <div className="empty">
          {exercises.length === 0 ? (
            <>
              還沒有任何動作。
              <br />
              點右下角「＋」建立第一台器材。
            </>
          ) : (
            '沒有符合條件的動作'
          )}
        </div>
      ) : (
        <ul className="list" style={{ marginTop: 8 }}>
          {visible.map((e) => (
            <li key={e.id}>
              <Link className="list-item" to={`/exercises/${e.id}`}>
                <PhotoImage photoId={e.photoId} className="thumb" alt="" placeholder={e.name.slice(0, 1)} />
                <div className="body">
                  <div className="title">{e.name}</div>
                  <div className="sub">
                    {[e.brand, TYPE_LABEL[e.type]].filter(Boolean).join('・')}
                  </div>
                  <div>
                    {e.bodyPartIds.map((id) => (
                      <span key={id} className="tag" style={{ marginRight: 4 }}>
                        {partName.get(id)}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!showArchived && archivedCount > 0 && (
        <button type="button" className="btn ghost block small muted" onClick={() => setShowArchived(true)}>
          查看已封存的動作（{archivedCount}）
        </button>
      )}

      {!showArchived && (
        <button type="button" className="fab" onClick={() => navigate('/exercises/new')} aria-label="新增動作">
          ＋
        </button>
      )}
    </div>
  );
}
