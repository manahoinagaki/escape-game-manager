// =====================================================
// src/Admin/utils/formatters.ts — 表示用フォーマット関数
// =====================================================
//
// 📋 このファイルの役割
//
//   画面に表示するテキストの「変換・整形」をする関数を定義する。
//   データ自体は変えず、見せ方だけを変える。
//
// 📦 このファイルで定義している関数
//
//   formatDisplayNumber  ← 整理番号を表示用に変換（2周目は "2-1" 形式）
//   formatElapsedTime    ← 開始時刻から経過時間を計算して文字列に変換
//   calculateWaitTimeRange ← 推定待ち時間から「○〜○分」の範囲を計算
//
// 🔧 よく変更する箇所
//   MAX_TEAM_NUMBER : utils/constants.ts で変更（デフォルト80）
//   待ち時間の丸め幅 : calculateWaitTimeRange 内の 5（5分単位）
//
// =====================================================

import type { Timestamp } from 'firebase/firestore';
import { MAX_TEAM_NUMBER } from './constants';

// 待ち時間レンジ計算はCustomer側（お客様画面）とも共有するため
// shared/waitTime.ts に一元化し、ここでは re-export しているだけ
export { calculateWaitTimeRange } from '../../shared/waitTime';

// 整理番号を表示用にフォーマットする
//  *
// 80番以内 → そのまま文字列で返す（例: "5"）
// 81番以上 → 周回表示（例: 81 → "2-1"、87 → "2-7"）
//  *
// 使用箇所：RegistrationCard、RoomBar、FocusBar など各コンポーネント
//  *
// @param num - 整理番号（数値）
// @returns 表示用の文字列
export const formatDisplayNumber = (num: number): string => {
    if (!num) return "?";
    // 1周目はそのまま返す
    if (num <= MAX_TEAM_NUMBER) {
        return `${num}`;
    }
    // 2周目：何周目かと余りを計算
    const cycle = Math.ceil(num / MAX_TEAM_NUMBER);
    const remain = num % MAX_TEAM_NUMBER === 0 
    ? MAX_TEAM_NUMBER 
    : num % MAX_TEAM_NUMBER;
    
    return `${cycle}-${remain}`;
};

// 経過時間を計算して文字列に変換する
//  *
// プレイ中のチームの経過時間表示に使用。
// 例: 開始から23分経過 → "23分経過"
//  *
// 使用箇所：Admin.tsx の roomStatus 計算、RoomBar
//  *
// @param startTime - 開始時刻（Firestoreのタイムスタンプ or Date）
// @param currentTime - 現在時刻（省略時は new Date()）
// @returns "X分経過" の形式の文字列（startTime がなければ空文字）
export const formatElapsedTime = (startTime: Timestamp | Date, currentTime: Date = new Date()): string => {
    if (!startTime) return "";

    const start = 'toDate' in startTime ? startTime.toDate() : startTime;
    const diffMs = currentTime.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    return `${diffMins}分経過`;
};

