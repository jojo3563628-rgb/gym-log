import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../data/db';
import { addBodyPart, ValidationError } from '../../data/repos';
import type { Id } from '../../data/types';

interface Props {
  value: Id[];
  onChange: (ids: Id[]) => void;
  /** 編輯頁可新增自訂部位（MRS-007）；篩選列不需要 */
  allowAdd?: boolean;
  scroll?: boolean;
}

export function BodyPartPicker({ value, onChange, allowAdd = false, scroll = false }: Props) {
  const parts = useLiveQuery(() => db.bodyParts.orderBy('order').toArray(), []) ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: Id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const submit = async () => {
    try {
      const id = await addBodyPart(name);
      onChange([...value, id]);
      setName('');
      setAdding(false);
      setError(null);
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : '新增失敗');
    }
  };

  return (
    <div>
      <div className={scroll ? 'chips scroll' : 'chips'}>
        {parts.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={value.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.name}
          </button>
        ))}
        {allowAdd && !adding && (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            ＋ 自訂
          </button>
        )}
      </div>
      {adding && (
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="input grow"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="部位名稱，例如：上胸"
            maxLength={10}
            autoFocus
          />
          <button type="button" className="btn primary" onClick={submit}>
            新增
          </button>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
            取消
          </button>
        </div>
      )}
      {error && <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}
