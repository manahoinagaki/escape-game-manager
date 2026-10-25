// =====================================================
// export-registrations.mjs — 登録データをCSVに書き出す
// =====================================================
//
// 何をするか:
//   Firestore の registrations コレクションを全件読み取り、
//   分析しやすい形（CSV）でファイルに保存する。
//   来年の計画のために、本番イベント終了後・全リセの前に
//   実行して、当日の生データを退避しておくためのスクリプト。
//
// 使い方:
//   node export-registrations.mjs
//   （UnFes1_23 直下、serviceAccountKey.json と同じ場所で実行してください）
//
// 出力:
//   registrations-export-<実行日時>.csv が同じフォルダに作成されます
//
// =====================================================

import admin from 'firebase-admin';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Firestore Timestamp / Date を読みやすい日本時間の文字列に変換する
function formatTimestamp(value) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

// CSVの値として安全な形にする（カンマ・改行・ダブルクォートを含む場合は囲む）
function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const COLUMNS = [
  'id', 'day', 'number', 'count', 'difficulty', 'status', 'room',
  'assignedTo', 'previousStatus', 'lastUpdatedBy',
  'createdAt', 'statusChangedAt', 'startTime', 'endTime',
];

async function main() {
  console.log('registrations コレクションを読み取っています...');
  const snapshot = await db.collection('registrations').get();
  console.log(`${snapshot.size} 件のデータを取得しました`);

  const rows = [COLUMNS.join(',')];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const row = COLUMNS.map((col) => {
      if (col === 'id') return csvEscape(doc.id);
      if (['createdAt', 'statusChangedAt', 'startTime', 'endTime'].includes(col)) {
        return csvEscape(formatTimestamp(data[col]));
      }
      return csvEscape(data[col]);
    });
    rows.push(row.join(','));
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `registrations-export-${timestamp}.csv`;
  // Excelで日本語が文字化けしないようBOM付きUTF-8で保存
  fs.writeFileSync(filename, '﻿' + rows.join('\n'), 'utf8');
  console.log(`✅ 書き出しました: ${filename}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
