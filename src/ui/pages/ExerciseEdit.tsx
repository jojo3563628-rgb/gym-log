import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { db } from '../../data/db';
import { getSettings, removeExercise, saveExercise, ValidationError, type PhotoInput } from '../../data/repos';
import type { ExerciseInput, ExerciseType, Id, WeightUnit } from '../../data/types';
import { TYPE_LABEL } from '../../domain/csv';
import { defaultStep, UNIT_LABEL } from '../../domain/units';
import { LIMITS } from '../../domain/validate';
import { formatMmSs, parseMmSs, parseYouTubeUrl, watchUrl } from '../../domain/youtube';
import { compressImage } from '../../platform/image';
import { BodyPartPicker } from '../components/BodyPartPicker';
import { IconDown, IconUp, IconX } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { useObjectUrl } from '../components/PhotoImage';

interface VideoDraft {
  key: string;
  url: string;
  start: string; // 'm:ss'
  title: string;
}

const TYPES: ExerciseType[] = ['machine', 'free', 'bodyweight'];
const UNITS: (WeightUnit | null)[] = ['kg', 'lb', 'notch', null];

const EMPTY: ExerciseInput = {
  name: '',
  type: 'machine',
  brand: '',
  bodyPartIds: [],
  defaultUnit: 'kg',
  step: null,
  restSec: null,
  instructions: '',
  cautions: '',
};

const newKey = () => crypto.randomUUID();

/** 空字串 → null；非數字 → NaN，交給驗證層回報錯誤 */
function parseOptionalNumber(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

/** SCR-08 動作項目編輯 */
export function ExerciseEdit() {
  const { id } = useParams<{ id?: Id }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [form, setForm] = useState<ExerciseInput>(EMPTY);
  const [stepText, setStepText] = useState('');
  const [restText, setRestText] = useState('');
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  // undefined = 不變更、null = 移除、物件 = 換新照片
  const [photo, setPhoto] = useState<PhotoInput | null | undefined>(undefined);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [globalRest, setGlobalRest] = useState(90);
  const fileRef = useRef<HTMLInputElement>(null);

  const existing = useLiveQuery(() => (id ? db.exercises.get(id) : undefined), [id]);
  const existingPhoto = useLiveQuery(
    () => (existing?.photoId ? db.photos.get(existing.photoId) : undefined),
    [existing?.photoId],
  );
  const previewUrl = useObjectUrl(photo === undefined ? existingPhoto?.blob : photo?.blob);

  useEffect(() => {
    void getSettings().then((s) => {
      setGlobalRest(s.defaultRestSec);
      if (isNew) setForm((f) => ({ ...f, defaultUnit: s.defaultUnit }));
    });
  }, [isNew]);

  // 編輯模式：資料載入後只填一次表單，之後以使用者輸入為準
  useEffect(() => {
    if (!id || loaded || !existing) return;
    const { name, type, brand, bodyPartIds, defaultUnit, step, restSec, instructions, cautions } = existing;
    setForm({ name, type, brand, bodyPartIds, defaultUnit, step, restSec, instructions, cautions });
    setStepText(step === null ? '' : String(step));
    setRestText(restSec === null ? '' : String(restSec));
    void db.videos
      .where('exerciseId')
      .equals(id)
      .sortBy('order')
      .then((vs) =>
        setVideos(
          vs.map((v) => ({
            key: v.id,
            url: watchUrl(v.youtubeId, 0),
            start: formatMmSs(v.startSec),
            title: v.title,
          })),
        ),
      );
    setLoaded(true);
  }, [id, existing, loaded]);

  const set = <K extends keyof ExerciseInput>(key: K, value: ExerciseInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const changeType = (type: ExerciseType) => {
    // 新增時切到徒手，順手把單位設為「無」；已有資料時不主動改單位
    setForm((f) => ({ ...f, type, defaultUnit: isNew && type === 'bodyweight' ? null : f.defaultUnit }));
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch {
      setErrors(['照片讀取失敗，請換一張試試']);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateVideo = (key: string, patch: Partial<VideoDraft>) =>
    setVideos((vs) =>
      vs.map((v) => {
        if (v.key !== key) return v;
        const next = { ...v, ...patch };
        // 網址帶有 t= 時自動填入起始時間（SCR-08）
        if (patch.url !== undefined) {
          const parsed = parseYouTubeUrl(patch.url);
          if (parsed && parsed.startSec > 0) next.start = formatMmSs(parsed.startSec);
        }
        return next;
      }),
    );

  const moveVideo = (index: number, delta: number) =>
    setVideos((vs) => {
      const next = [...vs];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const save = async () => {
    const videoErrors: string[] = [];
    const videoInputs = videos
      .filter((v) => v.url.trim() !== '')
      .map((v, i) => {
        const parsed = parseYouTubeUrl(v.url);
        const start = v.start.trim() === '' ? 0 : parseMmSs(v.start);
        if (!parsed) videoErrors.push(`影片 ${i + 1}：無法辨識的 YouTube 網址`);
        if (start === null) videoErrors.push(`影片 ${i + 1}：起始時間請用「分:秒」，例如 1:30`);
        return { youtubeId: parsed?.videoId ?? '', startSec: start ?? 0, title: v.title };
      });
    if (videoErrors.length > 0) {
      setErrors(videoErrors);
      window.scrollTo({ top: 0 });
      return;
    }

    setBusy(true);
    try {
      const input: ExerciseInput = {
        ...form,
        step: form.defaultUnit === null ? null : parseOptionalNumber(stepText),
        restSec: parseOptionalNumber(restText),
      };
      const savedId = await saveExercise(input, videoInputs, photo, id);
      navigate(`/exercises/${savedId}`, { replace: true });
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.errors : ['存檔失敗，請再試一次']);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = window.confirm('確定要刪除這個動作嗎？\n如果已有訓練紀錄，會改為封存並保留紀錄。');
    if (!ok) return;
    const result = await removeExercise(id);
    if (result === 'archived') window.alert('這個動作已有訓練紀錄，已改為封存。歷史紀錄與趨勢圖都會保留。');
    navigate('/exercises', { replace: true });
  };

  if (!loaded) {
    return (
      <div className="page">
        <PageHeader title="編輯動作" back="/exercises" />
      </div>
    );
  }

  const unit = form.defaultUnit;

  return (
    <div className="page">
      <PageHeader
        title={isNew ? '新增動作' : '編輯動作'}
        back={isNew ? '/exercises' : `/exercises/${id}`}
        actions={
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            存檔
          </button>
        }
      />

      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <label className="field">
        <span className="label required">名稱</span>
        <input
          className="input"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={LIMITS.exerciseName}
          placeholder="例如：坐姿推胸機"
        />
      </label>

      <div className="field">
        <span className="label required">類型</span>
        <div className="segmented">
          {TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={form.type === t} onClick={() => changeType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">品牌</span>
        <input
          className="input"
          value={form.brand}
          onChange={(e) => set('brand', e.target.value)}
          maxLength={LIMITS.brand}
          placeholder="例如：Technogym"
        />
      </label>

      <div className="field">
        <span className="label">照片</span>
        {previewUrl && <img src={previewUrl} alt="照片預覽" style={{ width: '100%', borderRadius: 12, marginBottom: 8 }} />}
        <div className="row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            {previewUrl ? '換一張' : '拍照或選照片'}
          </button>
          {previewUrl && (
            <button type="button" className="btn danger" onClick={() => setPhoto(null)}>
              移除照片
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
      </div>

      <div className="field">
        <span className="label required">訓練部位</span>
        <BodyPartPicker value={form.bodyPartIds} onChange={(ids) => set('bodyPartIds', ids)} allowAdd />
      </div>

      <div className="field">
        <span className="label required">預設單位</span>
        <div className="segmented">
          {UNITS.map((u) => (
            <button key={u ?? 'none'} type="button" aria-pressed={unit === u} onClick={() => set('defaultUnit', u)}>
              {u ? UNIT_LABEL[u] : '無'}
            </button>
          ))}
        </div>
        <div className="hint">記錄時每一組仍可改單位。</div>
      </div>

      <div className="row">
        {unit !== null && (
          <label className="field grow">
            <span className="label">重量間距</span>
            <input
              className="input"
              inputMode="decimal"
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              placeholder={`預設 ${defaultStep(unit)}`}
            />
          </label>
        )}
        <label className="field grow">
          <span className="label">休息秒數</span>
          <input
            className="input"
            inputMode="numeric"
            value={restText}
            onChange={(e) => setRestText(e.target.value)}
            placeholder={`預設 ${globalRest}`}
          />
        </label>
      </div>

      <label className="field">
        <span className="label">使用說明</span>
        <textarea
          className="textarea"
          value={form.instructions}
          onChange={(e) => set('instructions', e.target.value)}
          maxLength={LIMITS.instructions}
          rows={5}
          placeholder="例如：座椅調到握把與胸口同高；背部貼緊椅背"
        />
      </label>

      <label className="field">
        <span className="label">注意事項</span>
        <textarea
          className="textarea"
          value={form.cautions}
          onChange={(e) => set('cautions', e.target.value)}
          maxLength={LIMITS.cautions}
          rows={3}
          placeholder="例如：手肘不要鎖死"
        />
      </label>

      <div className="field">
        <span className="label">教學影片</span>
        {videos.map((v, i) => (
          <div key={v.key} className="card" style={{ marginBottom: 8 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <strong className="grow">影片 {i + 1}</strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => moveVideo(i, -1)}
                disabled={i === 0}
                aria-label="上移"
              >
                <IconUp />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => moveVideo(i, 1)}
                disabled={i === videos.length - 1}
                aria-label="下移"
              >
                <IconDown />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setVideos((vs) => vs.filter((x) => x.key !== v.key))}
                aria-label="刪除影片"
              >
                <IconX />
              </button>
            </div>
            <input
              className="input"
              type="url"
              inputMode="url"
              value={v.url}
              onChange={(e) => updateVideo(v.key, { url: e.target.value })}
              placeholder="貼上 YouTube 網址"
              style={{ marginBottom: 8 }}
            />
            {v.url.trim() !== '' && !parseYouTubeUrl(v.url) && (
              <div className="hint" style={{ color: 'var(--danger)', marginTop: -4, marginBottom: 8 }}>
                無法辨識的 YouTube 網址
              </div>
            )}
            <div className="row">
              <input
                className="input"
                style={{ width: 100 }}
                inputMode="numeric"
                value={v.start}
                onChange={(e) => updateVideo(v.key, { start: e.target.value })}
                placeholder="0:00"
                aria-label="起始時間"
              />
              <input
                className="input grow"
                value={v.title}
                onChange={(e) => updateVideo(v.key, { title: e.target.value })}
                maxLength={LIMITS.videoTitle}
                placeholder="標題（選填）"
                aria-label="影片標題"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn block"
          onClick={() => setVideos((vs) => [...vs, { key: newKey(), url: '', start: '', title: '' }])}
        >
          ＋ 加入影片
        </button>
      </div>

      <button type="button" className="btn primary block" onClick={save} disabled={busy} style={{ marginTop: 8 }}>
        存檔
      </button>

      {!isNew && (
        <button type="button" className="btn danger block" onClick={remove} style={{ marginTop: 12 }}>
          刪除動作
        </button>
      )}
    </div>
  );
}
