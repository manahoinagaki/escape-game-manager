// =====================================================
// src/Admin/hooks/CurrentTime.ts — 現在時刻フック
// =====================================================
//
// 📋 このファイルの役割
//
//   一定間隔で現在時刻を更新し続けるカスタムフックを定義する。
//   プレイ中の経過時間など、時間に応じた表示の更新に使用する。
//
// 使用箇所：Admin.tsx の currentTime
//
// 🔧 よく変更する箇所
//   更新間隔 : useCurrentTime() の引数（ミリ秒）で変更できる
//             デフォルトは 10000（10秒）
//             constants.ts の TIME_UPDATE_INTERVAL_MS も参照
//
// =====================================================

import { useEffect, useState } from 'react';

/**
 * 現在時刻を一定間隔で更新するフック
 *
 * @param intervalMs - 更新間隔（ミリ秒）。デフォルトは 10000（10秒）
 * @returns 現在時刻（Date オブジェクト）
 *
 * @example
 * const currentTime = useCurrentTime(10000); // 10秒ごとに更新
 */
export function useCurrentTime(intervalMs = 10000) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // intervalMs ごとに現在時刻を更新するタイマーをセット
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, intervalMs);

    // コンポーネントがアンマウントされたときにタイマーを止める（メモリリーク防止）
    return () => clearInterval(timer);
  }, [intervalMs]);

  return currentTime;
}