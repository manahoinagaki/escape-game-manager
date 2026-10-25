// =====================================================
// src/shared/components/Tooltip.tsx — ツールチップ
// =====================================================
//
// 📋 使い方
//
//   説明を付けたい要素を <Tooltip> で包むだけ。
//
//   <Tooltip text="担当チームを別スタッフに引き継ぎます">
//     <button>🔄 引き継ぐ</button>
//   </Tooltip>
//
// ⚙️ Props
//
//   text      : 表示するテキスト（必須）
//   position  : 表示方向 'top' | 'bottom' | 'left' | 'right'（省略時: 'top'）
//   disabled  : true にすると表示しない（ボタンが disabled の時に渡す）
//   children  : ツールチップを付ける要素
//
// 🎯 動作
//
//   PC    : ホバーで表示、マウスを離すと非表示
//   スマホ : タップで表示、外側タップで非表示（300ms 後に自動非表示）
//
// 🔧 カスタマイズ
//   見た目は Tooltip.css で変更
//   自動非表示の秒数 : AUTO_HIDE_MS の値を変更
//
// =====================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import './Tooltip.css';

// スマホでタップ後に自動で消えるまでの時間（ミリ秒）
const AUTO_HIDE_MS = 2000;

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
    text: string;
    position?: TooltipPosition;
    disabled?: boolean;
    children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({
    text,
    position = 'top',
    disabled = false,
    children,
}) => {
    const [visible, setVisible]         = useState(false);
    // 実際の表示位置（画面端での自動調整後）
    const [actualPos, setActualPos]     = useState<TooltipPosition>(position);
    const wrapRef                       = useRef<HTMLDivElement>(null);
    const tooltipRef                    = useRef<HTMLDivElement>(null);
    const autoHideTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --------------------------------------------------
    // 画面端チェック → 表示位置を自動調整
    // ツールチップが画面外にはみ出る場合、反対側に表示する
    // --------------------------------------------------
    const adjustPosition = useCallback(() => {
        if (!wrapRef.current || !tooltipRef.current) return;

        const wrapRect    = wrapRef.current.getBoundingClientRect();
        const tipRect     = tooltipRef.current.getBoundingClientRect();
        const vpW         = window.innerWidth;
        const vpH         = window.innerHeight;
        let   adjusted    = position;

        if (position === 'top'    && wrapRect.top    < tipRect.height + 8) adjusted = 'bottom';
        if (position === 'bottom' && wrapRect.bottom > vpH - tipRect.height - 8) adjusted = 'top';
        if (position === 'left'   && wrapRect.left   < tipRect.width  + 8) adjusted = 'right';
        if (position === 'right'  && wrapRect.right  > vpW - tipRect.width  - 8) adjusted = 'left';

        setActualPos(adjusted);
    }, [position]);

    const show = useCallback(() => {
        if (disabled) return;
        setActualPos(position); // 一旦デフォルト位置でレンダリング
        setVisible(true);
    }, [disabled, position]);

    const hide = useCallback(() => {
        setVisible(false);
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    }, []);

    // ツールチップが表示されたら位置を調整する
    // （tooltipRef の DOM 要素がマウントされた瞬間に呼びたいので、
    //   useEffect ではなく callback ref で adjustPosition を呼ぶ）
    const setTooltipRef = useCallback((el: HTMLDivElement | null) => {
        tooltipRef.current = el;
        if (el) adjustPosition();
    }, [adjustPosition]);

    // --------------------------------------------------
    // スマホ向け：外側タップで閉じる
    // --------------------------------------------------
    useEffect(() => {
        if (!visible) return;

        const handleOutsideClick = (e: TouchEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                hide();
            }
        };
        document.addEventListener('touchstart', handleOutsideClick);
        return () => document.removeEventListener('touchstart', handleOutsideClick);
    }, [visible, hide]);

    // --------------------------------------------------
    // スマホ向け：タップ後に AUTO_HIDE_MS で自動非表示
    // --------------------------------------------------
    const handleTouchStart = useCallback(() => {
        if (disabled) return;
        if (visible) {
            hide();
            return;
        }
        show();
        autoHideTimerRef.current = setTimeout(hide, AUTO_HIDE_MS);
    }, [disabled, visible, show, hide]);

    return (
        <div
            ref={wrapRef}
            className="tooltip-wrap"
            // PC：ホバー
            onMouseEnter={show}
            onMouseLeave={hide}
            // スマホ：タップ
            onTouchStart={handleTouchStart}
        >
            {children}

            {visible && (
                <div
                    ref={setTooltipRef}
                    className={`tooltip-bubble tooltip-${actualPos}`}
                    role="tooltip"
                >
                    {text}
                    {/* 吹き出しの三角 */}
                    <span className="tooltip-arrow" />
                </div>
            )}
        </div>
    );
};

export default Tooltip;