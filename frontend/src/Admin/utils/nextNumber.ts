// =====================================================
// src/Admin/utils/nextNumber.ts — 次の発行番号を計算
// =====================================================
//
// 📋 このファイルの役割
//
//   整理券の「次の発行番号」を計算する関数を定義する。
//
//   1周目（1〜80番）と2周目（81番〜）で
//   それぞれ異なるルールで番号を決定する。
//
// 🔢 発行ルール
//
//   【1周目】1 → 2 → 3 → ... → 80 と順番に発行
//
//   【2周目】80を超えたら、1周目で「終了」「取消」に
//            なった番号を再利用する。
//            ただし、発行済み最大番号の「次」から順に探す。
//            （例：2-5が取消でも、2-6を飛ばして2-5には戻らない）
//
//   【発行不可】1周目がすべて終了・取消になっていない場合は
//              null を返す。
//
// 🔧 よく変更する箇所
//   MAX_TEAM_NUMBER : utils/constants.ts で変更（デフォルト80）
//
// =====================================================
import { MAX_TEAM_NUMBER } from './constants';
import type { Registration } from '../types';

// 次に発行する番号を計算する
// 使用箇所：Admin.tsx の nextNo
// @param todayRegistrations - 今日の全登録データ
// @returns 次の発行番号（発行不可の場合は null）
// @example
// 1周目：発行済み最大が5 → 6を返す
// calcNextNumber(registrations) // => 6
// 2周目：2-6まで発行済み、7番が終了済み → 87（=2-7）を返す
// calcNextNumber(registrations) // => 87
export const calcNextNumber = (
    todayRegistrations: Registration[]
): number | null => {

    // 発行済み番号の Set（高速検索用）
    const issuedNumbers = new Set(todayRegistrations.map(r => r.number));
    // 発行済みの最大番号（未発行なら 0）
    const maxIssued = issuedNumbers.size > 0
        ? Math.max(...issuedNumbers)
        : 0;

    // -------------------------------------------------------
    // 1周目（1〜MAX_TEAM_NUMBER）
    // まだ MAX_TEAM_NUMBER に達していなければ、単純に次の番号
    // -------------------------------------------------------
    if (maxIssued < MAX_TEAM_NUMBER) {
        return maxIssued + 1;
    }

    // -------------------------------------------------------
    // 2周目（MAX_TEAM_NUMBER+1 以降）
    // 1周目の番号のうち「終了 or 取消」になったものを再利用する
    // -------------------------------------------------------

    // 2周目で発行済みの番号の最大値
    const maxSecondRound = Math.max(
        ...[...issuedNumbers].filter(n => n > MAX_TEAM_NUMBER),
        MAX_TEAM_NUMBER // 2周目未発行の場合のフォールバック
    );

    // 次の候補番号（発行済み最大 + 1）
    const candidate = maxSecondRound + 1;

    // 候補に対応する1周目の番号（例：87 → 7）
    const candidateFirst = candidate - MAX_TEAM_NUMBER;

    // candidateFirst から順に、発行可能な番号を探す
    for (let first = candidateFirst; first <= MAX_TEAM_NUMBER; first++) {
        const reg = todayRegistrations.find(r => r.number === first);
        const isFinished = reg && ['終了', '取消'].includes(reg.status);
        const alreadyIssued = issuedNumbers.has(first + MAX_TEAM_NUMBER);

        // 終了・取消済み かつ 2周目未発行 → この番号を返す
        if (isFinished && !alreadyIssued) {
            return first + MAX_TEAM_NUMBER;
        }
    }

    // 発行可能な番号がない
    return null;
};
