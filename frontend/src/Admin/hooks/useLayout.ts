// =====================================================
// src/Admin/hooks/useLayout.ts — レイアウト管理フック
// =====================================================
//
// 📋 このファイルの役割
//
//   各コンポーネント（統計バー・部屋バーなど）を
//   「ヘッダー」「タブ」「非表示」のどこに表示するかを
//   ユーザー × 役割ごとに保存・管理する。
//   初めて使う役割では constants.ts の ROLE_DEFAULT_LAYOUTS が初期配置になる。
//
//   設定は LocalStorage に保存されるため、
//   ブラウザを閉じても次回ログイン時に復元される。
//
// 📦 戻り値
//
//   layout      : 現在のレイアウト設定（全コンポーネントの表示位置）
//   setLayout   : レイアウトを変更する関数（SideMenu から呼ばれる）
//   resetLayout : レイアウトをデフォルトに戻す関数
//
// ⚠️ 注意：DEFAULT_LAYOUT が constants.ts にも存在する（2重定義）
//    将来的にどちらか一方に統一することを推奨
//
// =====================================================

import { useEffect, useState } from 'react';
import { DEFAULT_LAYOUT as DEFAULT_LAYOUT_BASE, ROLE_DEFAULT_LAYOUTS } from '../utils/constants';

// =====================================================
// 型定義
// =====================================================

// レイアウト位置の型

// 'header' : ヘッダーに常時表示（スクロールしても見える）
// 'tab'    : タブとして追加（選択時のみ表示）
// 'none'   : 非表示
type LayoutPosition = 'header' | 'tab' | 'none';

// デフォルトのレイアウト設定（constants.ts の定義を型付けして使う）
const DEFAULT_LAYOUT = DEFAULT_LAYOUT_BASE as Record<string, LayoutPosition>;

// レイアウト設定に使えるコンポーネントIDの型
// 新しいコンポーネントを追加する場合はここにも追加する
type LayoutKey =
    | 'stats'     // 統計ダッシュボード
    | 'roomNav'   // 部屋担当バー
    | 'focusBar'  // ステータス確認バー
    | 'issueCard' // 新規発行カード
    | 'guideBar'; // 担当チームバー


// =====================================================
// レイアウトの読み込み
// =====================================================

// 役割ごとの初期レイアウト（ROLE_DEFAULT_LAYOUTS になければ DEFAULT_LAYOUT）
export function getRoleDefaultLayout(role: string): Record<string, LayoutPosition> {
    return (ROLE_DEFAULT_LAYOUTS[role] ?? DEFAULT_LAYOUT) as Record<string, LayoutPosition>;
}

// ユーザー × 役割ごとに保存されたレイアウトを読み込む
// 保存がなければ役割ごとの初期レイアウトを返す
// （役割別の初期レイアウトがない役割は、旧形式 layout_${userName} の設定を引き継ぐ）
export function loadLayout(userName: string, role: string): Record<string, LayoutPosition> {
    const saved = localStorage.getItem(`layout_${userName}_${role}`);
    if (saved) return JSON.parse(saved);
    if (!ROLE_DEFAULT_LAYOUTS[role]) {
        const legacy = localStorage.getItem(`layout_${userName}`);
        if (legacy) return JSON.parse(legacy);
    }
    return getRoleDefaultLayout(role);
}


// =====================================================
// useLayout フック
// =====================================================


// レイアウト管理フック

// ユーザー × 役割ごとに独立したレイアウト設定を管理する。
// userName または role が変わると、その組み合わせの設定を LocalStorage から読み込む。
// （役割を切り替えると役割ごとの初期配置になり、自分で変更した配置はその役割に保存される）

// @param userName - 現在ログイン中のユーザー名（設定の保存キーに使用）
// @param role     - 現在の役割（設定の保存キー・初期レイアウトの決定に使用）
export function useLayout(userName: string, role: string) {

    // LocalStorage からユーザー × 役割ごとの設定を読み込む（初回のみ）
    const [layout, setLayout] = useState<Record<string, LayoutPosition>>(
        () => loadLayout(userName, role)
    );

    // ユーザー名・役割が変わったとき → その組み合わせのレイアウト設定を読み込む
    // （effect ではなく、レンダー中に前回の値と比較して
    //   変化していれば即座に state を更新する。React公式が推奨する
    //   「props/引数の変化に応じて state をリセットする」パターン）
    const storageKey = `layout_${userName}_${role}`;
    const [prevKey, setPrevKey] = useState(storageKey);
    if (storageKey !== prevKey) {
        setPrevKey(storageKey);
        setLayout(loadLayout(userName, role));
    }

    // レイアウトが変わったとき → LocalStorage に保存する
    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(layout));
    }, [layout, storageKey]);

    /**
     * レイアウトを現在の役割の初期設定に戻す
     * 確認ダイアログが表示される
     */
    const resetLayout = () => {
        if (window.confirm("レイアウト設定を初期状態に戻しますか？")) {
            const initial = getRoleDefaultLayout(role);
            setLayout(initial);
            localStorage.setItem(storageKey, JSON.stringify(initial));
        }
    };

    return {
        layout,
        setLayout,
        resetLayout,
        DEFAULT_LAYOUT
    };
}

// 型をエクスポート
export type { LayoutPosition };
