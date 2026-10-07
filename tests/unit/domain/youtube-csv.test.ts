import { toCsv, type CsvRow } from '../../../src/domain/csv';
import { embedUrl, formatMmSs, parseMmSs, parseYouTubeUrl, watchUrl } from '../../../src/domain/youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl（SCR-08）', () => {
  test.each([
    [`https://www.youtube.com/watch?v=${ID}`, 0],
    [`https://m.youtube.com/watch?v=${ID}&feature=share`, 0],
    [`youtube.com/watch?v=${ID}`, 0],
    [`https://youtu.be/${ID}`, 0],
    [`https://youtu.be/${ID}?si=abc&t=90`, 90],
    [`https://www.youtube.com/shorts/${ID}`, 0],
    [`https://www.youtube.com/watch?v=${ID}&t=1m30s`, 90],
    [`https://www.youtube.com/watch?v=${ID}&t=95s`, 95],
    [`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`, 3723],
    [`  https://youtu.be/${ID}  `, 0],
  ])('%s → 起始 %i 秒', (url, start) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: ID, startSec: start });
  });

  test.each([
    '',
    'not a url',
    'https://vimeo.com/123456',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/abc',
    `https://evil.example.com/watch?v=${ID}`,
  ])('無法辨識：%s', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  test('embedUrl 使用 nocookie 網域並帶起始秒數（Arch 6.2）', () => {
    expect(embedUrl(ID, 75)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=75&playsinline=1&rel=0`);
  });

  test('watchUrl', () => {
    expect(watchUrl(ID, 0)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(watchUrl(ID, 30)).toBe(`https://www.youtube.com/watch?v=${ID}&t=30s`);
  });
});

describe('分:秒 轉換', () => {
  test('parseMmSs', () => {
    expect(parseMmSs('1:30')).toBe(90);
    expect(parseMmSs('90')).toBe(90);
    expect(parseMmSs('0:05')).toBe(5);
    expect(parseMmSs('1:02:03')).toBe(3723);
    expect(parseMmSs('1:75')).toBeNull();
    expect(parseMmSs('abc')).toBeNull();
  });

  test('formatMmSs', () => {
    expect(formatMmSs(90)).toBe('1:30');
    expect(formatMmSs(5)).toBe('0:05');
    expect(formatMmSs(3723)).toBe('1:02:03');
  });
});

describe('toCsv（PES 7.1）', () => {
  const row: CsvRow = {
    date: '2026-10-07',
    groupName: '推日',
    exerciseName: '坐姿推胸機',
    type: 'machine',
    order: 1,
    weight: 40,
    unit: 'kg',
    reps: 10,
    note: '',
  };

  test('UTF-8 BOM、表頭、CRLF', () => {
    const csv = toCsv([row]);
    expect(csv.startsWith('﻿日期,群組,動作名稱,類型,組序,重量,單位,次數,備註\r\n')).toBe(true);
    expect(csv).toContain('2026-10-07,推日,坐姿推胸機,機台,1,40,kg,10,\r\n');
  });

  test('徒手與格數', () => {
    const csv = toCsv([
      { ...row, type: 'bodyweight', weight: null, unit: null, groupName: null },
      { ...row, weight: 7, unit: 'notch' },
    ]);
    expect(csv).toContain('2026-10-07,,坐姿推胸機,徒手,1,,,10,');
    expect(csv).toContain(',7,格,');
  });

  test('含逗號、引號、換行的欄位要加引號', () => {
    const csv = toCsv([{ ...row, note: '座椅第3格, 握把"寬"\n下次加重' }]);
    expect(csv).toContain('"座椅第3格, 握把""寬""\n下次加重"');
  });

  test('防公式注入（PIS C3）', () => {
    expect(toCsv([{ ...row, note: '=HYPERLINK("x")' }])).toContain(`"'=HYPERLINK(""x"")"`);
    expect(toCsv([{ ...row, note: '+1組' }])).toContain(",'+1組");
    expect(toCsv([{ ...row, exerciseName: '@機台' }])).toContain(",'@機台,");
    expect(toCsv([{ ...row, note: '-左手' }])).toContain(",'-左手");
  });
});
