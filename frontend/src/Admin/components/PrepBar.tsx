// =====================================================
// src/Admin/components/PrepBar.tsx — 準備担当者専用ナビ
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   準備担当スタッフ向けに、各部屋の状況と
//   次のチームの部屋割り当てを一画面で管理できるUIを提供する。
//
//   ┌──────────────────────────────────────┐
//   │ HEADER  全体指揮モード / 実績平均時間        │
//   ├──────────────────┬───────────────────┤
//   │ ROOM MONITOR     │ ASSIGN AREA       │
//   │ 各部屋の状況        │ 案内中・準備中チーム      │
//   │（プレイ中・準備中）         │ の部屋割り当て          │
//   └──────────────────┴───────────────────┘
//
// 🔧 よく変更する箇所
//   経過時間のアラート閾値 : parseInt(room.elapsed) >= 20 の "20" を変更
//   表示するチーム数上限   : ComputedData.ts の waitNextTeam の .slice(0, 3)
//
// 使用箇所：Admin.tsx の renderPart('prepNav')
//
// =====================================================

import React from 'react';
import type { Registration } from '../types';

interface PrepBar {
  // 実績平均プレイ時間（分）。ヘッダーに表示 */
  finishedWithTime: number;
  // 各部屋の状況（プレイ中・準備中・経過時間） */
  roomStatus: Array<{
    id: string;
    playing: Registration | undefined;
    preparing: Registration | undefined;
    elapsed: string;
  }>;
  // 次に案内するチームの一覧（案内中 + 準備中、最大3件） */
  waitNextTeam: Registration[];
  // 部屋IDの一覧（"部屋A" / "部屋B" / "部屋C"） */
  roomIds: string[];
  // ステータスを変更する関数 */
  updateRegistrationStatus: (
    id: string,
    currentStatus: string,
    clickedStatus: string,
    targetRoom?: string
  ) => void;
}

const SetupMonitor: React.FC<PrepBar> = ({
  finishedWithTime,
  roomStatus,
  waitNextTeam,
  roomIds,
  updateRegistrationStatus
}) => {
  return (
    <div className="prep-bar">

      {/* ===== HEADER ===== */}
      <div className="prep-header">
        <div className="prep-title">
          全体指揮モード（準備担当）
        </div>
        {/* 実績平均プレイ時間（部屋が空くまでの目安） */}
        <div className="prep-finishedWithTime">
          {finishedWithTime}<small>分</small>
        </div>
      </div>

      <div className="prep-grid">

        {/* ===== ROOM MONITOR:各部屋のリアルタイム状況 ===== */}
        <div className="room-view">
          {roomStatus.map(room => (
            <div
              key={room.id}
              className={`room-card ${room.playing
                ? 'is-playing'
                : room.preparing
                  ? 'is-preparing'
                  : 'is-empty'
                }`}
            >
              <div className="room-card-header">
                <div className="room-name">
                  {room.id}
                </div>
              </div>

              <div className="room-card-body">

                {room.playing ? (
                  // プレイ中
                  <div className="room-info playing">
                    <span className="s-label">プレイ中</span>
                    <span className="s-no">No.{room.playing.number}</span>
                  </div>
                ) : room.preparing ? (
                  // 準備中
                  <div className="room-info preparing">
                    <span className="s-label">準備中</span>
                    <span className="s-no">No.{room.preparing.number}</span>
                  </div>
                ) : (
                  // 空室
                  <div className="room-info empty">
                    空室
                  </div>
                )}

                {/* 経過時間（20分以上でアラート色に変わる） */}
                <div
                  className={`room-time ${parseInt(room.elapsed) >= 20 ? 'alert' : ''
                    }`}
                >
                  {room.elapsed}
                </div>

              </div>
            </div>
          ))}
        </div>

        {/* ===== ASSIGN AREA: 次のチームの部屋割り当て ===== */}
        <div className="prep-assign">

          <div className="assign-header">
            案内中・準備中のチーム状況
          </div>

          <div className="assign-list">

            {waitNextTeam.length > 0 ? (
              waitNextTeam.map(t => (
                <div
                  key={t.id}
                  className={`assign-card ${t.status === "準備" ? "is-assigned" : ""
                    }`}
                >

                  <div className="assign-info">

                    <div className="t-main">
                      <span className="t-no">
                        No.{t.number}
                      </span>

                      <span className="t-meta">
                        {t.difficulty}/{t.count}名
                      </span>
                    </div>
                    {/* すでに部屋が割り当てられている場合は案内中の部屋名を表示 */}

                    {t.room && (
                      <div className="assigned-room-name">
                        {t.room.replace("部屋", "")}室へ案内中
                      </div>
                    )}

                  </div>

                  {/* 各部屋への割り当てボタン（押すと「準備」ステータスに変更） */}
                  <div className="assign-actions">
                    {roomIds.map(rId => (
                      <button
                        key={rId}
                        className={`assign-btn ${t.room === rId ? "active" : ""
                          }`}
                        onClick={() =>
                          updateRegistrationStatus(t.id, t.status, "準備", rId)
                        }
                      >
                        {rId.replace("部屋", "")}
                      </button>
                    ))}
                  </div>

                </div>
              ))
            ) : (
              <div className="none-msg">
                対象のチームはありません
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default SetupMonitor;