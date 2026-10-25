// =====================================================
// src/Admin/hooks/StaffBreak.ts — スタッフ休憩状態の同期フック
// =====================================================
//
// 📋 このファイルの役割
//
//   スタッフの「休憩中かどうか」を Firestore の
//   "staff_breaks" コレクションでリアルタイム共有する。
//   誰か1人が休憩ボタンを押すと、全端末に即時反映される。
//
// 📦 返す値
//
//   staffBreaks : { ユーザー名: { onBreak, since } } の一覧
//   setBreak    : 指定したユーザーの休憩状態を変更する関数
//
// 使用箇所：Admin.tsx
//
// =====================================================

import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
    collection,
    onSnapshot,
    doc,
    setDoc,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';

// スタッフ1人分の休憩状態
export interface StaffBreakStatus {
    // 休憩中かどうか
    onBreak: boolean;
    // 休憩を開始した時刻（Firestoreのタイムスタンプ形式・休憩中でない場合は null）
    since: Timestamp | null;
}

/**
 * スタッフ休憩状態フック
 *
 * @description
 * "staff_breaks" コレクション（ドキュメントID = スタッフ名）を
 * リアルタイム監視し、誰が今休憩中かを全端末で共有する。
 *
 * @returns staffBreaks（ユーザー名ごとの休憩状態）、setBreak（休憩状態を変更する関数）
 */
export function useStaffBreaks() {
    const [staffBreaks, setStaffBreaks] = useState<Record<string, StaffBreakStatus>>({});

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'staff_breaks'), (snapshot) => {
            const next: Record<string, StaffBreakStatus> = {};
            snapshot.docs.forEach(docSnapshot => {
                next[docSnapshot.id] = docSnapshot.data() as StaffBreakStatus;
            });
            setStaffBreaks(next);
        });
        // アンマウント時に監視を解除（メモリリーク防止）
        return () => unsubscribe();
    }, []);

    /**
     * 指定したスタッフの休憩状態を変更する
     *
     * @param userName - 対象のスタッフ名
     * @param onBreak   - true = 休憩開始 / false = 休憩終了
     */
    const setBreak = async (userName: string, onBreak: boolean): Promise<void> => {
        await setDoc(doc(db, 'staff_breaks', userName), {
            onBreak,
            since: onBreak ? serverTimestamp() : null
        });
    };

    return { staffBreaks, setBreak };
}
