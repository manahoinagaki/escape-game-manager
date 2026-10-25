// =====================================================
// src/Admin/hooks/ComputedData.ts — 計算済みデータフック
// =====================================================
//
// 📋 このファイルの役割
//
//   Firestoreから取得した生データ（registrations）を元に
//   画面表示・待ち時間計算に必要な値を計算して返すフック。
//
//   useMemo を使って「必要なときだけ再計算」するため、
//   パフォーマンスに優れている。
//
// 📦 返す値の一覧
//
//   todayRegistrations    : 今日の日付モードの登録のみ
//   isRoomStaffRole       : 「部屋○」役割かどうか
//   myRoomPlaying         : 自分の部屋でプレイ中のチーム
//   NextTeam              : 次に案内するチーム
//   averagePlayTimeMinutes: 平均プレイ時間（分）
//   finishedRegistrations : 終了済みデータ（時間あり）
//   waitingRegistrations  : 待機中データ
//   calledRegistrations   : 呼出中データ
//   guidingRegistrations  : 案内中データ
//   waitNextTeam          : 準備担当用・次の案内候補（最大3件）
//
// 🔧 よく変更する箇所
//   デフォルトプレイ時間 : constants.ts の DEFAULT_PLAY_TIME_MINUTES
//   平均計算サンプル数   : constants.ts の MINIMUM_SAMPLES_FOR_AVERAGE
//   waitNextTeam の件数  : .slice(0, 3) の数値
//
// =====================================================


import { useMemo } from "react";
import {
  MINIMUM_SAMPLES_FOR_AVERAGE,
  DEFAULT_PLAY_TIME_MINUTES
} from '../utils/constants';

import type { Registration } from '../types';

/**
 * 計算データフック
 * 
 * @description
 * 登録データから以下の情報を計算:
 * - 今日の登録一覧
 * - 部屋担当者の情報
 * - 平均プレイ時間
 * - ステータス別の登録一覧
 * 
 * @param registrations - 全登録データ
 * @param dayMode - 現在の日モード（1日目/2日目/テスト）
 * @param role - ユーザーの役割
 * @returns 計算済みデータ
 */
export function useComputedData(
  registrations: Registration[],
  dayMode: string,
  role: string,
) {

  // --------------------------------------------------
  // 今日の登録データのみに絞り込む
  // --------------------------------------------------
  const todayRegistrations = useMemo(
    () => registrations.filter(registration => registration.day === dayMode),
    [registrations, dayMode]
  );

  // --------------------------------------------------
  // 部屋スタッフ役割かどうか（"部屋A" / "部屋B" / "部屋C" など）
  // 部屋スタッフは自分の部屋のみ操作できる
  // --------------------------------------------------
  const isRoomStaffRole = useMemo(
    () => role.startsWith("部屋"),
    [role]
  );

  // --------------------------------------------------
  // 自分の部屋でプレイ中のチーム
  // 部屋スタッフ役割のときに自分の担当部屋を特定するために使用
  // --------------------------------------------------
  const myRoomPlaying = useMemo(
    () => todayRegistrations.filter(
      registration => registration.status === "開始" && registration.room === role
    ),
    [todayRegistrations, role]
  );

  // --------------------------------------------------
  // 自分の部屋で準備中のチーム（次に開始するチーム）
  // --------------------------------------------------
  const myNextTeam = useMemo(
    () => todayRegistrations.find(
      registration => registration.status === "準備" && registration.room === role
    ),
    [todayRegistrations, role]
  );

  // --------------------------------------------------
  // 全体の中で最も番号が若い案内中のチーム（部屋未割り当て）
  // 受付スタッフが次に案内するチームの目安として使用
  // --------------------------------------------------
  const publicNextTeam = useMemo(
    () =>
      todayRegistrations
        .filter(registration => registration.status === "案内" && !registration.room)
        .reduce<Registration | null>((minTeam, registration) =>
          !minTeam || registration.number < minTeam.number ? registration : minTeam,
          null
        ),
    [todayRegistrations]
  );

  // --------------------------------------------------
  // 最終的な「次のチーム」
  // 自分の部屋の準備中チームを優先、なければ全体の案内中チーム
  // --------------------------------------------------
  const NextTeam = useMemo(
    () => myNextTeam || publicNextTeam,
    [myNextTeam, publicNextTeam]
  );

  // --------------------------------------------------
  // 終了済みデータ（開始時刻・終了時刻の両方がある組のみ）
  // 平均プレイ時間の計算に使用する
  // --------------------------------------------------
  const finishedRegistrations = useMemo(
    () => todayRegistrations.filter(
      registration => registration.status === "終了" && registration.startTime && registration.endTime
    ),
    [todayRegistrations]
  );

  // --------------------------------------------------
  // 平均プレイ時間（分）の計算
  // サンプル数が MINIMUM_SAMPLES_FOR_AVERAGE 未満の場合は
  // DEFAULT_PLAY_TIME_MINUTES をデフォルト値として使用する
  // --------------------------------------------------
  const averagePlayTimeMinutes = useMemo(() => {
    // サンプル数が不足している場合はデフォルト値
    if (finishedRegistrations.length < MINIMUM_SAMPLES_FOR_AVERAGE) {
      return DEFAULT_PLAY_TIME_MINUTES;// 実績が少ない場合はデフォルト値
    }

    // 各登録のプレイ時間を合計
    const totalMinutes = finishedRegistrations.reduce((accumulator, registration) => {
      // Firestoreのタイムスタンプ形式と通常のDateの両方に対応
      const startTime = registration.startTime.toDate
        ? registration.startTime.toDate()
        : new Date(registration.startTime);
      const endTime = registration.endTime.toDate
        ? registration.endTime.toDate()
        : new Date(registration.endTime);

      const playTimeMs = endTime.getTime() - startTime.getTime();
      const playTimeMinutes = playTimeMs / (1000 * 60);

      return accumulator + playTimeMinutes;
    }, 0);

    // 平均を計算して四捨五入
    return Math.round(totalMinutes / finishedRegistrations.length);
  }, [finishedRegistrations]);

  // --------------------------------------------------
  // ステータス別データ（待ち時間計算・統計表示に使用）
  // --------------------------------------------------
  // 待機中のチーム一覧 
  const waitingRegistrations = useMemo(
    () => todayRegistrations.filter(registration => registration.status === '待機'),
    [todayRegistrations]
  );
  // 呼出中のチーム一覧 
  const calledRegistrations = useMemo(
    () => todayRegistrations.filter(registration => registration.status === '呼出'),
    [todayRegistrations]
  );
  // 案内中のチーム一覧
  const guidingRegistrations = useMemo(
    () => todayRegistrations.filter(registration => registration.status === '案内'),
    [todayRegistrations]
  );

  // --------------------------------------------------
  // 準備担当者用：次に案内する候補チーム（最大3件）
  // 部屋未割り当ての案内中 + 準備中を番号順で取得する
  // --------------------------------------------------
  const waitNextTeam = useMemo(
    () =>
      todayRegistrations
        .filter(registration =>
          (registration.status === "案内" && !registration.room) ||  // 部屋未割り当ての案内中
          (registration.status === "準備")                           // 準備中（部屋割り当て済み）
        )
        .sort((a, b) => {
          const aTime = a.statusChangedAt?.seconds ?? 0;
          const bTime = b.statusChangedAt?.seconds ?? 0;
          return aTime - bTime;
        })
        .slice(0, 3), // 最大3件表示
    [todayRegistrations]
  );

  return {
    todayRegistrations,
    isRoomStaffRole,
    myRoomPlaying,
    NextTeam,
    averagePlayTimeMinutes,
    finishedRegistrations,
    waitingRegistrations,
    calledRegistrations,
    guidingRegistrations,
    waitNextTeam
  };
}