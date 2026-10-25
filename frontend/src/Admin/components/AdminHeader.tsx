// =====================================================
// src/Admin/components/AdminHeader.tsx — ヘッダーツールバー
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   管理画面のヘッダー全体を描画する。
//   以下の4つのエリアで構成される。
//
//   ┌─────────────────────────────────────┐
//   │ TOP BAR  │ メニュー・日付・役割・名前  │
//   ├─────────────────────────────────────┤
//   │ TITLE    │ 運営管理（1日目）           │
//   ├─────────────────────────────────────┤
//   │ DYNAMIC  │ レイアウト設定で 'header' に│
//   │ PARTS    │ 設定されたコンポーネント    │
//   ├─────────────────────────────────────┤
//   │ TABS     │ ステータスタブ + コンポーネ │
//   │          │ ントタブ（横スクロール可）  │
//   └─────────────────────────────────────┘
//
// 🔧 よく変更する箇所
//   日付モードの選択肢 : <select> の <option> を変更
//   役割の選択肢      : ROLES（hooks/User.ts）を変更
//   名前の選択肢      : USER_NAMES（hooks/User.ts）を変更
//
// 🔧 ツールチップ文言の変更
//   TAB_TOOLTIP の各値を編集する
//
// 使用箇所：Admin.tsx の <header> 内
//
// =====================================================

import React from 'react';
import { ROLES, USER_NAMES } from '../hooks/User';
import { STATUS_TABS, COMPONENT_TAB_LABELS } from '../utils/constants';
// import Tooltip from '../../shared/components/Tooltip';

// タブごとのツールチップ文言
// 🔧 説明を変えたい場合はここを編集する
// const TAB_TOOLTIP: Record<string, string> = {
//     待機: '整理券を持ち、呼ばれるのを待っているお客様の一覧です。',
//     呼出: 'スタッフが呼び出し中のお客様の一覧です。担当を決めて案内しましょう。',
//     案内: 'ゲームルームへ案内中のお客様の一覧です。部屋を割り当てて準備へ進めます。',
//     準備: 'ルームで準備中のお客様の一覧です。準備が整ったら開始ボタンを押します。',
//     開始: '現在プレイ中のお客様の一覧です。',
//     終了: '本日ゲームを終了したお客様の一覧です。',
//     取消: 'キャンセルされた整理券の一覧です。',
// };

interface AdminHeaderProps {
    //  現在の日付モード（"1日目" / "2日目" / "テスト"） */
    dayMode: string;
    //  現在の役割 */
    role: string;
    //  現在のユーザー名 */
    userName: string;
    //  現在選択中のタブ */
    activeTab: string;
    //  タブを切り替える関数 */
    setActiveTab: (tab: string) => void;
    //  日付モードを変更する関数 */
    setDayMode: (day: string) => void;
    //  役割を変更する関数（パスワード認証付き） */
    setRole: (role: string) => void;
    // ユーザー名を変更する関数（パスワード認証付き） */
    NameChange: (name: string) => void;
    // サイドメニューの開閉を切り替える関数 */
    setIsMenuOpen: (open: boolean) => void;
    // 全データ削除を実行する関数（管理者のみ） */
    onDeleteAll: () => void;
    // 自分が休憩中かどうか */
    isOnBreak: boolean;
    // 現在休憩中のスタッフ名一覧 */
    onBreakNames: string[];
    // 休憩ボタンを押したときの処理（自分の休憩状態をトグル） */
    onToggleBreak: () => void;
    // コンポーネントIDを渡すと対応するReactノードを返す描画エンジン */
    renderPart: (id: string) => React.ReactNode;
    // 現在のレイアウト設定 */
    layout: Record<string, 'header' | 'tab' | 'none'>;
    // 全タブ一覧（ステータスタブ + コンポーネントタブ） */
    allTabs: string[];
    // 指定したタブがコンポーネントタブかどうか判定する関数 */
    isComponentTab: (tab: string) => boolean;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({
    dayMode,
    role,
    userName,
    activeTab,
    setActiveTab,
    setDayMode,
    setRole,
    NameChange,
    setIsMenuOpen,
    onDeleteAll,
    renderPart,
    layout,
    isComponentTab,
    isOnBreak,
    onBreakNames,
    onToggleBreak,
}) => {

    // --------------------------------------------------
    // 動的タブリストの生成
    // レイアウトで 'tab' に設定されているコンポーネントIDを取得して
    // ステータスタブに追加する
    // --------------------------------------------------
    const componentTabIds = Object.entries(layout)
        .filter(([, pos]) => pos === 'tab')
        .map(([id]) => id);

    // 全タブリスト = ステータスタブ + コンポーネントタブ
    const allTabs = [...STATUS_TABS, ...componentTabIds];

    // --------------------------------------------------
    // ヘッダーに配置するコンポーネントのIDリスト
    // レイアウトで 'header' に設定されているものを取得
    // --------------------------------------------------
    // header位置に配置されたパーツのIDリストを取得
    const headerParts = Object.keys(layout).filter(id => layout[id] === 'header');

    // 権限チェック
    const canChangeDay = role === "管理者" || role === "幹部"; // 日付変更は管理者・幹部のみ
    const canDeleteAll = role === "管理者";                   // 全削除は管理者のみ

    // =====================================================
    // 描画
    // =====================================================
    return (
        <header className={`header-admin header-mode-${dayMode}`}>

            {/* ===== TOP BAR（1段目：操作バー） ===== */}
            <div className="top-bar">

                {/* 左側グループ：メニュー・日付・全削除 */}
                <div className="top-group left">

                    {/* ハンバーガーメニューボタン → SideMenu を開く */}
                    {/* <Tooltip text="レイアウト・並び順・テーマの設定を開きます" position="bottom"> */}
                    <button
                        id="menu-trigger"
                        className="menu-trigger"
                        onClick={() => setIsMenuOpen(true)}
                        aria-label="menu"
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                    {/* </Tooltip> */}

                    {/* 日付モード選択（管理者・幹部のみ変更可） */}
                    {/* <Tooltip
                        text={canChangeDay
                            ? '全端末の日付モードを切り替えます'
                            : '日付の変更は管理者・幹部のみ操作できます'}
                        position="bottom"
                    > */}
                    <select
                        id="day-select"
                        value={dayMode}
                        onChange={(e) => setDayMode(e.target.value)}
                        disabled={!canChangeDay}
                        className={`day-select ${!canChangeDay ? "disabled" : ""}`}
                    >
                        <option value="1日目">1日目</option>
                        <option value="2日目">2日目</option>
                        <option value="リハーサル">リハーサル</option>
                        <option value="テスト">テスト</option>
                    </select>
                    {/* </Tooltip> */}

                    {/* 全データ削除ボタン（管理者のみ有効） */}
                    <button
                        id="delete-all-btn"
                        className="reset"
                        onClick={onDeleteAll}
                        disabled={!canDeleteAll}
                    >
                        全リセ
                    </button>
                </div>

                {/* 右側グループ：役割・名前 */}
                <div className="top-group right">
                    {/* 役割選択（管理者・幹部への変更はパスワード必要） */}
                    {/* <Tooltip text="自分の役割を切り替えます。管理者・幹部への変更はパスワードが必要です。" position="bottom"> */}
                    <select
                        id="role-select"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        {[...ROLES, "幹部"].map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                    {/* </Tooltip> */}

                    {/* 名前選択（変更にはパスワード必要） */}
                    {/* <Tooltip text="自分の名前を選択します。変更にはパスワードが必要です。" position="bottom"> */}
                    <select
                        id="name-select"
                        value={userName}
                        onChange={(e) => NameChange(e.target.value)}
                    >
                        {USER_NAMES.map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                        {role === "幹部" && <option value="幹部">幹部</option>}
                    </select>
                    {/* </Tooltip> */}

                    {/* 休憩トグルボタン：自分の休憩状態を切り替える */}
                    <button
                        id="break-toggle-btn"
                        className={`break-toggle ${isOnBreak ? "on-break" : ""}`}
                        onClick={onToggleBreak}
                    >
                        {isOnBreak ? "☕ 休憩中" : "休憩する"}
                    </button>
                </div>
            </div>

            {/* ===== TITLE BAR（2段目：タイトル） ===== */}
            <div className="title-bar">
                <h2 className="title">🏰 運営管理 ({dayMode})</h2>
            </div>

            {/* ===== 休憩中スタッフの通知（1人以上休憩中の場合のみ表示） =====
                誰が今対応できないかを一目で分かるようにする */}
            {onBreakNames.length > 0 && (
                <div className="break-notice">
                    ☕ 休憩中：{onBreakNames.join("、")}
                </div>
            )}

            {/* ===== DYNAMIC HEADER PARTS（3段目：動的コンポーネント） =====
                レイアウト設定で 'header' に設定されたコンポーネントをここに表示する
                （ResultBar・RoomBar・FocusBar など） */}
            {headerParts.length > 0 && (
                <div className="header-dynamic">
                    {headerParts.map(id => (
                        <section key={id} className="header-part">
                            {renderPart(id)}
                        </section>
                    ))}
                </div>
            )}

            {/* ===== STATUS TABS（4段目：タブバー） =====
                ステータスタブ（待機・呼出など）と
                コンポーネントタブ（設定でタブに変更したもの）を横並びで表示 */}
            <nav className="status-tabs">
                {allTabs.map(tab => {
                    // コンポーネントタブは COMPONENT_TAB_LABELS で短縮表示
                    const displayLabel = isComponentTab(tab)
                        ? (COMPONENT_TAB_LABELS[tab] || tab)
                        : tab;
                    // const tooltipText = TAB_TOOLTIP[tab] || "";

                    return (
                        // <Tooltip key={tab} text={tooltipText} position="bottom">
                        <button
                            id={`tab-${tab}`}
                            key={tab}
                            className={activeTab === tab ? "active" : ""}
                            onClick={() => setActiveTab(tab)}
                        >
                            {displayLabel}
                        </button>
                        // </Tooltip>
                    );
                })}
            </nav>

        </header>
    );
};

export default AdminHeader;
