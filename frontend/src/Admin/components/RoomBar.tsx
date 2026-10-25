// =====================================================
// src/Admin/components/RoomBar.tsx — 全部屋状況バー
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   全部屋のプレイ状況をリアルタイムで確認・操作できるバーを表示する。
//   各部屋ごとに「プレイ中」「次の組（準備中）」を表示し、
//   終了・開始ボタンで操作できる。
//
//   ┌──────────────────────────────────────┐
//   │ 🏠 全部屋状況                          │
//   ├───────────┬───────────┬──────────────┤
//   │ 部屋A      │ 部屋B     │ 部屋C         │
//   │ プレイ中    │ プレイ中    │ プレイ中       │
//   │ No.5 2名   │ No.12 3名 │ 待機中        │
//   │ [終了]     │ [終了]     │             │
//   │ 次の組     │ 次の組     │ 次の組        │
//   │ No.8      │ -         │ -            │
//   │ [開始]     │           │              │
//   ├──────────────────────────────────────┤
//   │ 案内中・準備中のチーム状況                 │  ← PrepBarから統合
//   │ [No.5 3名/普通] [A] [B] [C]           │     ← 経過順で最大3件表示、部屋割り当てボタン付き
//   │ [No.8 2名/簡単  A室へ案内中] [A] [B] [C]│
//   └──────────────────────────────────────┘
//
// 🔧 よく変更する箇所
//   経過時間のアラート閾値 : parseInt(elapsed) >= 20 の "20" を変更
//
// 使用箇所：Admin.tsx の renderPart('roomNav')
//
// =====================================================

import React from 'react';
import type { Registration } from '../types';
import { ROOM_IDS } from '../utils/constants';

interface RoomBarProps {
    // ステータスを変更する関数 */
    updateRegistrationStatus: (
        id: string,
        currentStatus: string,
        clickedStatus: string,
        targetRoom?: string
    ) => void;
    // 番号の表示形式変換関数 */
    formatDisplayNumber: (n: number) => string;
    // 各部屋の状況（プレイ中・準備中・経過時間） */
    roomStatus: Array<{
        id: string;
        playing: Registration | undefined; // プレイ中のチーム
        preparing: Registration | undefined; // 準備中のチーム（次の組）
        elapsed: string;                   // 経過時間（"X分経過"）
    }>;
    // 案内中・準備中のチーム一覧（PrepBar から統合）
    //  * 案内中（部屋未割当） + 準備中 を番号昇順で最大3件
    waitNextTeam: Registration[];
}

const RoomStaffBar: React.FC<RoomBarProps> = ({
    updateRegistrationStatus,
    formatDisplayNumber,
    roomStatus,
    waitNextTeam,
}) => {

    return (
        <div className="room-bar">
            <div className="room-bar-title">
                🏠 全部屋状況
            </div>

            {/* ===== 各部屋のプレイ状況 ===== */}
            <div className="all-rooms-container">
                {roomStatus.map(room => {
                    const { id: roomId, playing, preparing, elapsed } = room;

                    return (
                        <div key={roomId} className="single-room-section">

                            {/* 部屋名 + 経過時間 */}
                            <div className="room-header">
                                <span className="room-icon">🏠</span>
                                <span className="room-name">{roomId}</span>
                                {/* 経過時間：プレイ中のみ表示 */}
                                {elapsed && (
                                    // 20分以上でアラート色に変わる
                                    <span className={`room-elapsed-inline ${parseInt(elapsed) >= 20 ? 'alert' : ''}`}>
                                        {elapsed}
                                    </span>
                                )}
                            </div>

                            {/* プレイ中の組 */}
                            <div className="room-status-row">
                                <div className="status-label">プレイ中</div>
                                {playing ? (
                                    <div className="room-info-box">
                                        <div className="room-team-info">
                                            <span className="team-no">No.{formatDisplayNumber(playing.number)}</span>
                                            <span className="team-meta">{playing.count}名・{playing.difficulty}</span>
                                        </div>
                                        {/* 終了ボタン */}
                                        <button
                                            className="room-btn finish"
                                            onClick={() => updateRegistrationStatus(playing.id, playing.status, "終了")}
                                        >
                                            終了
                                        </button>
                                    </div>
                                ) : (
                                    <div className="room-info-box empty">
                                        <span className="empty-text">待機中</span>
                                    </div>
                                )}
                            </div>

                            {/* 次の組（準備中） */}
                            <div className="room-status-row">
                                <div className="status-label">次の組</div>
                                {preparing ? (
                                    <div className="room-info-box">
                                        <div className="room-team-info">
                                            <span className="team-no">No.{formatDisplayNumber(preparing.number)}</span>
                                            <span className="team-meta">{preparing.count}名・{preparing.difficulty}</span>
                                        </div>
                                        {/* 開始ボタン */}
                                        <button
                                            className="room-btn start"
                                            onClick={() => updateRegistrationStatus(preparing.id, preparing.status, "開始")}
                                        >
                                            開始
                                        </button>
                                    </div>
                                ) : (
                                    <div className="room-info-box empty">
                                        <span className="empty-text">-</span>
                                    </div>
                                )}
                            </div>

                        </div>
                    );
                })}
            </div>

            {/* ===== 案内中・準備中のチーム割り当てエリア（PrepBarから統合） ===== */}
            <div className="room-bar-assign">
                <div className="room-bar-assign-title">案内中・準備中のチーム状況</div>

                {waitNextTeam.length > 0 ? (
                    <div className="assign-list">
                        {[...waitNextTeam]
                            
                            .map(t => (
                                <div
                                    key={t.id}
                                    className={`assign-card ${t.status === "準備" ? "is-assigned" : ""}`}
                                >
                                    {/* チーム情報 */}
                                    <div className="assign-info">
                                        <div className="t-main">
                                            <span className="t-no">No.{formatDisplayNumber(t.number)}</span>
                                            <span className="t-meta">{t.difficulty}/{t.count}名</span>
                                        </div>
                                        {/* 部屋割り当て済みの場合は部屋名を表示 */}
                                        {t.room && (
                                            <div className="assigned-room-name">
                                                {t.room.replace("部屋", "")}室へ案内中
                                            </div>
                                        )}
                                    </div>

                                    {/* 部屋割り当てボタン（押すと「準備」ステータスに変更） */}
                                    <div className="assign-actions">
                                        {ROOM_IDS.map(rId => (
                                            <button
                                                key={rId}
                                                className={`assign-btn ${t.room === rId ? "active" : ""}`}
                                                onClick={() =>
                                                    updateRegistrationStatus(t.id, t.status, "準備", rId)
                                                }
                                            >
                                                {rId.replace("部屋", "")}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                ) : (
                    <div className="none-msg">案内中・準備中のチームはありません</div>
                )}
            </div>

        </div>
    );
};

export default RoomStaffBar;
