// =====================================================
// src/Admin/components/SideMenu.tsx — 設定サイドメニュー
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   ハンバーガーボタンから開く設定メニューを表示する。
//   左からスライドインして表示される（背景タップで閉じる）。
//
//   ┌──────────────────────┐
//   │ HEADER               │
//   │ [アバター] 役割         │
//   │           ユーザー名   │
//   ├──────────────────────┤
//   │ BODY（スクロール可）      │
//   │ 🔃 並び順切替          │
//   │ 🧩 レイアウト設定（位置・並び順）│
//   ├──────────────────────┤
//   │ FOOTER               │
//   │ [❓ 操作ガイドを表示]        │
//   │ [設定を閉じる]          │
//   │ [🔄 レイアウト初期化]     │
//   └──────────────────────┘
//
// 🔧 よく変更する箇所
//   レイアウト設定の選択肢 : layoutItems 配列（コンポーネントの追加に合わせて変更）
//
// 使用箇所：Admin.tsx の <SideMenu>
//
// =====================================================

import React, { useState } from 'react';
import type { LayoutPosition } from '../hooks/useLayout';

type LayoutMap = Record<string, LayoutPosition>;

interface SideMenuProps {
  // メニューが開いているかどうか */
  isMenuOpen: boolean;
  // メニューの開閉を切り替える関数 */
  setIsMenuOpen: (open: boolean) => void;
  // 現在のユーザー名（アバター表示に使用） */
  userName: string;
  // 現在の役割 */
  role: string;
  // 現在の並び順（"number" / "time"） */
  sortType: 'number' | 'time';
  // 並び順を変更する関数 */
  setSortType: (type: 'number' | 'time') => void;
  // 現在のレイアウト設定 */
  layout: LayoutMap;
  // レイアウトを変更する関数 */
  setLayout: (layout: LayoutMap) => void;
  // レイアウトをデフォルトに戻す関数 */
  resetLayout: () => void;
  // 操作ガイドを再表示する関数
  onRestartGuide?: () => void;
}

/**
 * レイアウト設定に表示するコンポーネント一覧
 * 🔧 新しいコンポーネントを追加した場合はここにも追加する
 */
const layoutItems = [
  { id: 'stats', name: '詳細統計' },
  { id: 'roomNav', name: '部屋担当' },
  { id: 'focusBar', name: 'ステータス確認' },
  { id: 'issueCard', name: '新規発行カード' },
  { id: 'guideBar', name: '担当チーム' },
];

/**
 * 表示位置のグループ（この順番で設定画面に並ぶ）
 */
const layoutGroups: { position: LayoutPosition; label: string }[] = [
  { position: 'header', label: '上（固定）' },
  { position: 'tab', label: 'タブ' },
  { position: 'none', label: '非表示' },
];

const SideMenu: React.FC<SideMenuProps> = ({
  isMenuOpen,
  setIsMenuOpen,
  userName,
  role,
  sortType,
  setSortType,
  layout,
  setLayout,
  resetLayout,
  onRestartGuide,
}) => {
  // ドラッグ中の項目（id と、指に追従させるための座標）
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  // ドロップ先（どのグループの、どの項目の手前に入れるか。beforeId が null なら末尾）
  const [drop, setDrop] = useState<{ position: LayoutPosition; beforeId: string | null } | null>(null);

  // メニューが閉じている場合は何もレンダリングしない
  if (!isMenuOpen) return null;

  // --------------------------------------------------
  // レイアウトの並び順
  // layout オブジェクトのキーの並び順 = 画面上の表示順
  // （AdminHeader / Admin.tsx は Object.keys の順に描画する）
  // --------------------------------------------------

  // 指定した表示位置にあるコンポーネントIDを表示順で返す
  // layout に未登録のID（古い保存データなど）は非表示扱いにする
  const idsByPosition = (position: LayoutPosition) => {
    const known = layoutItems.map(item => item.id);
    const ordered = [
      ...Object.keys(layout).filter(id => known.includes(id)),
      ...known.filter(id => !(id in layout)),
    ];
    return ordered.filter(id => (layout[id] ?? 'none') === position);
  };

  // --------------------------------------------------
  // ドラッグ&ドロップ（Pointer Events：マウス・タッチ共通）
  // --------------------------------------------------

  // 指の位置からドロップ先を求める
  const findDrop = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const groupEl = el?.closest<HTMLElement>('[data-layout-group]');
    if (!groupEl) return null;

    const position = groupEl.dataset.layoutGroup as LayoutPosition;
    const itemEl = el?.closest<HTMLElement>('[data-layout-id]');
    // グループ内の余白の上 → 末尾に追加
    if (!itemEl) return { position, beforeId: null };

    // 項目の上 → 前半なら手前、後半なら次の項目の手前
    // 非表示は横並びなので左右、それ以外は縦並びなので上下で判定する
    const rect = itemEl.getBoundingClientRect();
    const isBefore = position === 'none'
      ? x < rect.left + rect.width / 2
      : y < rect.top + rect.height / 2;
    const ids = idsByPosition(position);
    const overId = itemEl.dataset.layoutId as string;
    const beforeId = isBefore ? overId : ids[ids.indexOf(overId) + 1] ?? null;
    return { position, beforeId };
  };

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, x: e.clientX, y: e.clientY });
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    setDrop(findDrop(e.clientX, e.clientY));
  };

  // ドロップ：ドラッグした項目を移動先の位置・順番に入れ直す
  const handleDragEnd = () => {
    // 自分自身の手前 = 元の場所なので何もしない
    if (drag && drop && drop.beforeId !== drag.id) {
      const entries = Object.entries(layout).filter(([key]) => key !== drag.id);
      const index = entries.findIndex(([key]) => key === drop.beforeId);
      entries.splice(index === -1 ? entries.length : index, 0, [drag.id, drop.position]);
      setLayout(Object.fromEntries(entries));
    }
    setDrag(null);
    setDrop(null);
  };

  const handleDragCancel = () => {
    setDrag(null);
    setDrop(null);
  };

  //ガイドを再表示してメニューを閉じる
  const handleRestartGuide = () => {
    setIsMenuOpen(false);         // メニューを先に閉じる
    setTimeout(() => {            // 閉じるアニメーション後にガイド起動
      onRestartGuide?.();
    }, 200);
  };

  return (
    // 背景の暗い幕（クリックでメニューを閉じる）
    <div
      className="side-menu"
      onClick={() => setIsMenuOpen(false)}
    >
      {/* メニュー本体（クリックイベントが背景に伝わらないよう stopPropagation） */}
      <div
        className="side-menu-panel"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ===== HEADER：ユーザー情報 ===== */}
        <div className="side-menu-header">
          <div className="profile-block">
            {/* アバター（ユーザー名の頭文字を表示） */}
            <div className="user-avatar">
              {userName.charAt(0)}
            </div>

            <div className="user-meta">
              <div className="user-role">
                {role}
              </div>
              <div className="user-name">
                {userName} さん
              </div>
            </div>
          </div>

        </div>

        {/* ===== BODY：設定項目（スクロール可） ===== */}
        <div className="side-menu-body">

          {/* 並び順（番号順 / 経過時間順） */}
          <div className="menu-group">

            <div className="menu-label">
              🔃 リストの並び順
            </div>
            <div className="menu-label">
              ※ 並び順は全てとアクティブに反映されます。
            </div>

            <div className="toggle-row">
              <button
                className={sortType === 'number' ? 'active' : ''}
                onClick={() => setSortType('number')}
              >
                番号順
              </button>

              <button
                className={sortType === 'time' ? 'active' : ''}
                onClick={() => setSortType('time')}
              >
                経過時間順
              </button>
            </div>
          </div>

          {/* レイアウト設定 */}
          <div className="menu-group">

            <div className="menu-label">
              🧩 レイアウト・パーツ設定
            </div>

            <div className="layout-description">
              <small>
                ・<strong>上（固定）</strong>: ヘッダーに常に表示<br />
                ・<strong>タブ</strong>: タブとして追加<br />
                ・<strong>非表示</strong>: 表示しない<br />
                ・項目を<strong>ドラッグ</strong>して順番や表示位置を変更
              </small>
            </div>

            {/* 表示位置ごとにグループ分けし、ドラッグ&ドロップで
                グループ内の順番入れ替え・グループ間の移動ができる
                上（固定）・タブ: 縦一列（上下に移動） / 非表示: 横並び
                タブは上から順に、タブバーの左から右へ並ぶ */}
            {layoutGroups.map(group => {
              const ids = idsByPosition(group.position);
              const isDropGroup = drop?.position === group.position;
              return (
                <div
                  key={group.position}
                  data-layout-group={group.position}
                  className={`layout-group ${isDropGroup ? 'drop-active' : ''}`}
                >
                  <div className="layout-group-title">{group.label}</div>

                  <div className={`layout-list layout-list-${group.position}`}>
                    {ids.length === 0 && (
                      <div className="layout-empty">ここにドラッグ</div>
                    )}

                    {ids.map((id, index) => {
                      // ドロップ位置の目印（手前 or 末尾）
                      const dropClass = !isDropGroup || drop.beforeId === drag?.id
                        ? ''
                        : drop.beforeId === id
                          ? 'drop-before'
                          : drop.beforeId === null && index === ids.length - 1
                            ? 'drop-after'
                            : '';
                      return (
                        <div
                          key={id}
                          data-layout-id={id}
                          className={`layout-row ${drag?.id === id ? 'dragging' : ''} ${dropClass}`}
                          onPointerDown={(e) => handleDragStart(e, id)}
                          onPointerMove={handleDragMove}
                          onPointerUp={handleDragEnd}
                          onPointerCancel={handleDragCancel}
                        >
                          <span className="layout-grip">⠿</span>
                          <div className="layout-name">
                            {layoutItems.find(item => item.id === id)?.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* ドラッグ中、指に追従して表示する項目 */}
            {drag && (
              <div
                className="layout-row layout-ghost"
                style={{ left: drag.x, top: drag.y }}
              >
                <span className="layout-grip">⠿</span>
                <div className="layout-name">
                  {layoutItems.find(item => item.id === drag.id)?.name}
                </div>
              </div>
            )}

            <div className="layout-note">
              <small>
                💡 タブバーは常にヘッダーに固定表示されます
              </small>
            </div>
          </div>

        </div>

        {/* ===== FOOTER：閉じる・初期化ボタン ===== */}
        <div className="side-menu-footer">

          {/* 操作ガイドを再表示（onRestartGuide が渡された場合のみ表示） */}
          {onRestartGuide && (
            <button className="btn-guide" onClick={handleRestartGuide}>
              ❓ 操作ガイドを表示
            </button>
          )}

          <button
            className="btn-close"
            onClick={() => setIsMenuOpen(false)}
          >
            設定を閉じる
          </button>

          <button
            className="btn-reset"
            onClick={resetLayout}
          >
            🔄 レイアウトを初期化
          </button>

        </div>

      </div>
    </div>
  );
};

export default SideMenu;
