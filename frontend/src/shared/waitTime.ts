// =====================================================
// src/shared/waitTime.ts — 待ち時間計算の共通ロジック
// =====================================================
//
// 📋 このファイルの役割
//
//   部屋数・平均プレイ時間のデフォルト値・待ち時間のレンジ計算など、
//   Admin側（スタッフ画面）とCustomer側（お客様画面）の両方で
//   同じ値・同じ計算式を使うための共通定義。
//
//   以前は Admin と Customer がそれぞれ別々に ROOM_COUNT や
//   レンジ計算ロジックを持っていたため、部屋数を変更しても
//   お客様画面に反映されない、お客様画面の待ち時間表示が
//   スタッフ画面と異なる基準で計算される、といった不整合があった。
//   このファイルを唯一の情報源（single source of truth）とする。
//
// 🔧 よく変更する箇所
//   ROOM_IDS                    : 部屋の数・名前を変えるとき（ROOM_COUNTは自動追従）
//   DEFAULT_PLAY_TIME_MINUTES   : 実績がない時のデフォルトプレイ時間
//   MINIMUM_SAMPLES_FOR_AVERAGE : 平均計算に使う最低サンプル数
//
// =====================================================

// 部屋のIDリスト（Admin側の部屋割り当て・表示に使用）
export const ROOM_IDS = ["部屋A", "部屋B", "部屋C"];

// 同時プレイできる部屋の数。ROOM_IDS の数から自動的に決まる
// （ROOM_IDS と別に数値を持たないことで、数の不一致を防ぐ）
export const ROOM_COUNT = ROOM_IDS.length;

// デフォルトのプレイ時間（分）
// 実績データが少ない時（MINIMUM_SAMPLES_FOR_AVERAGE 未満）に使用する
export const DEFAULT_PLAY_TIME_MINUTES = 10;

// 平均プレイ時間の計算に使う最低サンプル数
// 終了済みチームがこの数未満の場合は DEFAULT_PLAY_TIME_MINUTES を使用する
export const MINIMUM_SAMPLES_FOR_AVERAGE = 5;

// 推定待ち時間から「下限〜上限」の範囲を計算する
//
// 5分単位に丸めた下限と、下限+5分を上限として返す。
// 例: 推定23分 → 下限20分、上限25分 → [20, 25]
//
// 使用箇所：Admin側 ResultBar、Customer側の待ち時間表示
//
// @param estimatedMinutes - 推定待ち時間（分）
// @returns [下限, 上限] の配列
export const calculateWaitTimeRange = (estimatedMinutes: number): [number, number] => {
    const lowerBound = Math.floor(estimatedMinutes / 5) * 5;  // 5分単位に切り捨て
    const upperBound = lowerBound + 5;                        // 上限は下限+5分

    return [lowerBound, upperBound];
};
