// =====================================================
// src/shared/components/CoachMark.tsx — コーチマーク
// =====================================================
//
// 📋 使い方
//
//   // 1. ステップを定義する
//   const ADMIN_GUIDE_STEPS: CoachMarkStep[] = [
//     {
//       targetId:    'tab-呼出',         // ← ハイライトする要素の id
//       title:       '呼出タブ',
//       description: '呼出中のお客様一覧が表示されます。',
//       position:    'bottom',
//     },
//     {
//       targetId:    'menu-trigger',
//       title:       'メニュー',
//       description: 'レイアウトや並び順の設定ができます。',
//       position:    'bottom',
//     },
//     {
//       // targetId を省略すると中央にポップアップが出る
//       title:       'ガイド完了！',
//       description: '困ったらメニューから再度ガイドを開けます。',
//       position:    'center',
//     },
//   ];
//
//   // 2. コンポーネントを配置する（画面の最下部に1行追加するだけ）
//   <CoachMark
//     steps={ADMIN_GUIDE_STEPS}
//     storageKey="admin-guide-v1"   // ← 変更するとガイドが再表示される
//   />
//
// 🔧 ガイドを手動で再開したい場合
//   useCoachMark の restart() を呼ぶ（SideMenu からトリガーするのがおすすめ）
//   または localStorage から storageKey を削除してリロード
//
// 🎨 ポップアップのボタン構成
//
//   ┌─────────────────────────────────┐
//   │ ● ● ● ● ● ●   [全てスキップ]  │
//   │ タイトル                        │
//   │ 説明文                          │
//   │ [← 前へ]           [次へ →]    │
//   └─────────────────────────────────┘
//
// 🔧 調整ポイント
//   HEADER_HEIGHT : fixed ヘッダーの高さ（px）。
//                   ここを合わせないとハイライト枠がヘッダー下に隠れる。
//   SCROLL_AREA_ID: スクロールエリアのid。
//                   ここを合わせるとターゲット要素を自動スクロールで表示できる。
//   POPUP_MARGIN  : ポップアップが画面端に近いときの最小余白（px）。
//
// =====================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useCoachMark } from '../hooks/useCoachMark';
import type { CoachMarkStep } from '../hooks/useCoachMark';
import './CoachMark.css';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 プロジェクトに合わせて調整する定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** fixed ヘッダーの高さ（px）。ハイライト枠がヘッダーの下にある場合はこの値を増やす */
const HEADER_HEIGHT = 300;

/** スクロールエリアの id。ここに指定するとターゲット要素が自動スクロールで表示される */
const SCROLL_AREA_ID = 'scroll-area';

/** ハイライト枠のパディング（px） */
const PADDING = 8;

/** ポップアップが画面端に近いときの最小余白（px） */
const POPUP_MARGIN = 10;

/** ポップアップの横幅（px）。CoachMark.css の width と合わせること */
const POPUP_WIDTH = 272;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface CoachMarkProps {
    steps: CoachMarkStep[];
    storageKey: string;
    /** 外部から restart を制御したい場合に ref を渡す（省略可） */
    onReady?: (restart: () => void) => void;
}

const CoachMark: React.FC<CoachMarkProps> = ({ steps, storageKey, onReady }) => {
    const { step, isActive, currentStep, next, prev, skip, restart, totalSteps }
        = useCoachMark({ steps, storageKey });

    const [rect, setRect] = useState<HighlightRect | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    // 外部から restart を使えるように渡す（SideMenuなどでガイドを再開するため）
    useEffect(() => {
        if (onReady) onReady(restart);
    }, [onReady, restart]);

    // ① スクロール無効化
    useEffect(() => {
        const scrollArea = document.getElementById(SCROLL_AREA_ID);
        if (isActive) {
            document.body.style.overflow = 'hidden';
            if (scrollArea) scrollArea.style.overflowY = 'hidden';
        } else {
            document.body.style.overflow = '';
            if (scrollArea) scrollArea.style.overflowY = '';
        }
        return () => {
            document.body.style.overflow = '';
            if (scrollArea) scrollArea.style.overflowY = '';
        };
    }, [isActive]);

    // --------------------------------------------------
    // ① ターゲット要素をスクロールエリア内でスクロールして見えるようにする
    //    window.scrollIntoView だとヘッダーに隠れるため、
    //    スクロールエリアの scrollTop を直接操作する
    // --------------------------------------------------
    const scrollToTarget = useCallback((el: HTMLElement) => {
        const scrollArea = document.getElementById(SCROLL_AREA_ID);

        // スクロールエリアを一時的に有効にしてスクロール後また無効化
        if (scrollArea) {
            const areaRect = scrollArea.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const isAbove = elRect.top < areaRect.top + HEADER_HEIGHT;
            const isBelow = elRect.bottom > areaRect.bottom - 20;

            if (isAbove || isBelow) {
                const offset = elRect.top - areaRect.top
                    - (areaRect.height / 2)
                    + (elRect.height / 2);
                scrollArea.scrollTop += offset;
            }
        } else {
            const top = el.getBoundingClientRect().top
                + window.scrollY
                - HEADER_HEIGHT - 20;
            window.scrollTo({ top, behavior: 'instant' });
        }
    }, []);

    // --------------------------------------------------
    // ② ハイライト枠の位置を計算する
    //    getBoundingClientRect() は viewport 基準のため
    //    position:fixed のオーバーレイにそのまま使える
    // --------------------------------------------------
    // updateRect は自分自身を setTimeout で再帰的に呼び出すため、
    // 定義中の変数を直接参照できない（TDZ）。常に最新の関数を
    // ref に入れておき、再帰呼び出しは ref 経由で行う。
    const updateRectRef = useRef<() => void>(() => {});

    const updateRect = useCallback(() => {
        if (!currentStep?.targetId) {
            setRect(null);
            return;
        }

        const el = document.getElementById(currentStep.targetId);
        if (!el) { setRect(null); return; }

        const r = el.getBoundingClientRect();

        // ヘッダーに完全に隠れている場合はスクロールして表示
        if (r.bottom < HEADER_HEIGHT) {
            scrollToTarget(el);
            // スクロール後に再計算（少し待つ）
            setTimeout(() => updateRectRef.current(), 500);
            return;
        }

        // ハイライト枠は viewport 基準の fixed 座標で設定
        setRect({
            top: r.top - PADDING,
            left: r.left - PADDING,
            width: r.width + PADDING * 2,
            height: r.height + PADDING * 2,
        });
    }, [currentStep, scrollToTarget]);

    // updateRect が更新されるたびに ref の中身も最新化する
    useEffect(() => {
        updateRectRef.current = updateRect;
    }, [updateRect]);

    // --------------------------------------------------
    // ③ ポップアップの表示位置を計算する
    //    画面端にはみ出さないようにクランプ処理を行う
    // --------------------------------------------------
    const computePopupStyle = useCallback((): React.CSSProperties => {
        if (!currentStep) return {};

        const pos = currentStep.position ?? 'bottom';
        const isCenter = pos === 'center' || !currentStep.targetId;

        if (isCenter || !rect) {
            return {};  // CSS の .coach-popup-center が適用される
        }

        const GAP = 12;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;

        // ポップアップの左端（中央揃え、画面端クランプ）
        const rawLeft = rect.left + rect.width / 2 - POPUP_WIDTH / 2;
        const clampedLeft = Math.min(
            Math.max(POPUP_MARGIN, rawLeft),
            vpW - POPUP_WIDTH - POPUP_MARGIN
        );

        let style: React.CSSProperties = { position: 'fixed' };

        switch (pos) {
            case 'bottom': {
                const top = rect.top + rect.height + GAP;
                const finalTop = top + 220 > vpH ? rect.top - GAP - 220 : top;
                style = { ...style, top: Math.max(HEADER_HEIGHT + 8, finalTop), left: clampedLeft };
                break;
            }
            case 'top': {
                const top = rect.top - GAP - 220;  // 160 → 220
                const finalTop = top < HEADER_HEIGHT ? rect.top + rect.height + GAP : top;
                style = { ...style, top: finalTop, left: clampedLeft };
                break;
            }
            case 'right': {
                const left = rect.left + rect.width + GAP;
                // 画面右端を超える場合は左に表示
                const finalLeft = left + POPUP_WIDTH > vpW
                    ? rect.left - GAP - POPUP_WIDTH
                    : left;
                style = {
                    ...style,
                    top: Math.max(HEADER_HEIGHT + 8, rect.top + rect.height / 2 - 80),
                    left: Math.max(POPUP_MARGIN, finalLeft),
                };
                break;
            }
            case 'left': {
                const left = rect.left - GAP - POPUP_WIDTH;
                const finalLeft = left < POPUP_MARGIN
                    ? rect.left + rect.width + GAP
                    : left;
                style = {
                    ...style,
                    top: Math.max(HEADER_HEIGHT + 8, rect.top + rect.height / 2 - 80),
                    left: finalLeft,
                };
                break;
            }
        }

        return style;
    }, [rect, currentStep]);

    // rect が確定したら popup 位置を算出する（state に持たず、その都度算出する）
    const popupStyle = computePopupStyle();

    // isActive が false になったタイミングで rect をリセットする
    // （専用の effect を使わず、レンダー中に前回値と比較して更新する）
    const [prevIsActive, setPrevIsActive] = useState(isActive);
    if (isActive !== prevIsActive) {
        setPrevIsActive(isActive);
        if (!isActive) setRect(null);
    }

    // ステップが変わったら rect を更新する（アクティブなときのみ）
    useEffect(() => {
        if (!isActive) return;

        const timer = setTimeout(() => {
            updateRect();
        }, 100);

        window.addEventListener('resize', updateRect);
        const scrollArea = document.getElementById(SCROLL_AREA_ID);
        if (scrollArea) scrollArea.addEventListener('scroll', updateRect);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateRect);
            if (scrollArea) scrollArea.removeEventListener('scroll', updateRect);
        };
    }, [isActive, step, updateRect]);

    if (!isActive || !currentStep) return null;

    const pos = currentStep.position ?? 'bottom';
    const isCenter = pos === 'center' || !currentStep.targetId;
    const isLast = step >= totalSteps - 1;

    return (
        <div className="coach-overlay" aria-modal="true" role="dialog">

            {/* ハイライト枠 */}
            {rect && (
                <div
                    className="coach-highlight"
                    style={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                    }}
                />
            )}

            {/* ポップアップ */}
            <div
                ref={popupRef}
                className={`coach-popup${isCenter ? ' coach-popup-center' : ''}`}
                style={isCenter ? undefined : popupStyle}
            >
                {/* 上段：ドットインジケーター + 全スキップ */}
                <div className="coach-header-row">
                    <div className="coach-dots">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <span key={i} className={`coach-dot ${i === step ? 'active' : ''}`} />
                        ))}
                    </div>
                    {!isLast && (
                        <button
                            className="coach-btn-skip-all"
                            onClick={skip}
                            aria-label="ガイドを全てスキップ"
                        >
                            全てスキップ ✕
                        </button>
                    )}
                </div>

                {/* 中段：タイトル・説明文 */}
                <div className="coach-title">{currentStep.title}</div>
                <div className="coach-description">{currentStep.description}</div>

                {/* 下段：前へ・次へ / 完了 */}
                <div className="coach-actions">
                    {step > 0 && (
                        <button className="coach-btn coach-btn-prev" onClick={prev}>
                            ← 前へ
                        </button>
                    )}
                    <button className="coach-btn coach-btn-next" onClick={next}>
                        {isLast ? '完了 ✓' : '次へ →'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CoachMark;
export type { CoachMarkStep };
