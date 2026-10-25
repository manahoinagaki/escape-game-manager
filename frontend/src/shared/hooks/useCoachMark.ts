// =====================================================
// src/shared/hooks/useCoachMark.ts — コーチマーク管理フック
// =====================================================
//
// 📋 このフックの役割
//
//   コーチマークのステップ進行と localStorage による
//   「初回表示済み」管理を担う。
//
// 使い方（CoachMark.tsx 内部で使用）
//
//   const { step, isActive, next, skip, restart } = useCoachMark({
//     steps,
//     storageKey: 'admin-guide-v1',  ← ここを変えると再表示される
//     autoStart: true,               ← 初回アクセス時に自動で開始
//   });
//
// 🔧 ガイドを強制的に再表示させたい場合
//   storageKey を変更するか、ブラウザの localStorage を削除する
//   （DevTools → Application → Local Storage → 該当キーを削除）
//
// =====================================================

import { useState, useEffect, useCallback } from 'react';

export interface CoachMarkStep {
    /** ハイライトしたい要素の id 属性（省略時はハイライトなし） */
    targetId?: string;
    /** ポップアップのタイトル */
    title: string;
    /** 説明文 */
    description: string;
    /** ポップアップの表示位置（省略時: 'bottom'） */
    position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface UseCoachMarkOptions {
    steps: CoachMarkStep[];
    /** localStorage のキー。変更すると初回扱いになり再表示される */
    storageKey: string;
    /** true にすると初回アクセス時に自動でガイドを開始する（デフォルト: true） */
    autoStart?: boolean;
}

interface UseCoachMarkReturn {
    /** 現在のステップインデックス（0 始まり）。-1 は非表示 */
    step: number;
    /** ガイドが表示中かどうか */
    isActive: boolean;
    /** 現在のステップの定義 */
    currentStep: CoachMarkStep | null;
    /** 次のステップへ進む（最後のステップでは終了する） */
    next: () => void;
    /** 前のステップに戻る */
    prev: () => void;
    /** ガイドをスキップ（終了）する */
    skip: () => void;
    /** ガイドを最初から再開する */
    restart: () => void;
    /** 全ステップ数 */
    totalSteps: number;
}

export function useCoachMark({
    steps,
    storageKey,
    autoStart = true,
}: UseCoachMarkOptions): UseCoachMarkReturn {

    // -1 = 非表示、0以上 = 表示中のステップ番号
    const [step, setStep] = useState<number>(-1);

    // --------------------------------------------------
    // 初回アクセス判定
    // localStorage に storageKey が存在しなければ初回とみなす
    // --------------------------------------------------
    useEffect(() => {
        if (!autoStart) return;
        const alreadySeen = localStorage.getItem(storageKey);
        if (!alreadySeen) {
            // 少し遅らせて画面が描画されてからガイドを開始する
            const timer = setTimeout(() => setStep(0), 600);
            return () => clearTimeout(timer);
        }
    }, [storageKey, autoStart]);

    // --------------------------------------------------
    // ガイドを終了して「済み」を localStorage に記録する
    // --------------------------------------------------
    const finish = useCallback(() => {
        setStep(-1);
        localStorage.setItem(storageKey, 'done');
    }, [storageKey]);

    const next = useCallback(() => {
        setStep(prev => {
            if (prev >= steps.length - 1) {
                finish();
                return -1;
            }
            return prev + 1;
        });
    }, [steps.length, finish]);

    const prev = useCallback(() => {
        setStep(prev => Math.max(0, prev - 1));
    }, []);

    const skip = useCallback(() => {
        finish();
    }, [finish]);

    // ガイドを最初から再開（localStorage の記録も消す）
    const restart = useCallback(() => {
        localStorage.removeItem(storageKey);
        setStep(0);
    }, [storageKey]);

    const isActive    = step >= 0;
    const currentStep = isActive ? steps[step] : null;

    return {
        step,
        isActive,
        currentStep,
        next,
        prev,
        skip,
        restart,
        totalSteps: steps.length,
    };
}