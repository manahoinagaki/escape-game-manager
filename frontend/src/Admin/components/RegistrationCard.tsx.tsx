// =====================================================
// src/Admin/components/RegistrationCard.tsx — 登録カード
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   1組分の登録データを1枚のカードとして表示・操作する。
//   スクロールエリアに一覧で並んで表示される。
//
//   ┌──────────────────────────────────────┐
//   │ HEADER │ □ No.5  [A室] [担当中]       │
//   │        │              [2名] [普通]    │
//   ├──────────────────────────────────────┤
//   │ BODY   │ [↩️ 1つ戻す] [🔄 引き継ぐ]      │
//   │        │ [呼出][案内][準備][開始][終了][取消] │
//   │        │                   （更新者名）  │
//   └──────────────────────────────────────┘
//
//   「準備」ボタンを押すと、カード下部にピッカーが展開する：
//
//   ┌──────────────────────────────────────┐
//   │ 🏠 どの部屋に入りますか？            │
//   │ [A室]  [B室 使用中]  [C室 準備中]    │
//   │              [キャンセル]            │
//   └──────────────────────────────────────┘
//
// 🎨 ステータスによってカードの左枠の色が変わる（Admin.css）
//   待機:グレー / 呼出:黄 / 案内:緑 / 準備:赤 / 開始:青 / 終了:暗 / 取消:黒
//
// 🔧 ツールチップ文言の変更
//   STATUS_TOOLTIP の各値を編集する
//
// 使用箇所：Admin.tsx のカード一覧
//
// =====================================================

import React, { useState } from 'react';
import type { Registration } from '../types';
import Tooltip from '../../shared/components/Tooltip';
import { ROOM_IDS } from '../utils/constants';

// // ステータスボタンのツールチップ文言
// // 🔧 説明を変えたい場合はここを編集する
// const STATUS_TOOLTIP: Record<string, string> = {
//     呼出: 'お客様をお呼びします。呼出中の一覧に移動します。',
//     案内: 'ゲームルームへの案内を開始します。',
//     準備: 'ルームへの入室・準備を開始します。部屋が割り当てられます。',
//     開始: 'ゲームプレイを開始します。タイムの計測が始まります。',
//     終了: 'ゲームを終了します。プレイ時間が記録されます。',
//     取消: 'この整理券をキャンセルします。',
// };

interface RegistrationCardProps {
    // 表示する1組分の登録データ */
    reg: Registration;
    // 現在ログイン中のユーザー名（担当判定に使用） */
    userName: string;
    // 各部屋のプレイ中・準備中の状況（部屋ピッカーの活性制御に使用） */
    roomStatus: Array<{
        id: string;
        playing: Registration | undefined;
        preparing: Registration | undefined;
    }>;
    // ステータスを変更する関数 */
    updateRegistrationStatus: (id: string, currentStatus: string, clickedStatus: string, roomId?: string) => void;
    // ステータスを1つ前に戻す関数 */
    handleBackStatus: (reg: Registration) => void;
    // 特定フィールドの値を更新する関数（人数・難易度・担当者など） */
    updateValue: (id: string, field: string, value: string | number | null) => void;
    // 番号の表示形式変換関数（2周目は "2-1" 形式） */
    formatDisplayNumber: (num: number) => string;
    // チェックボックスで選択中のカードID一覧 */
    checkedIds: Set<string>;
    // チェック状態を更新する関数 */
    setCheckedIds: (newSet: Set<string>) => void;
    // 現在休憩中のスタッフ名の集合（担当者が休憩中の場合にバッジで警告表示するために使用） */
    onBreakSet: Set<string>;
}

const RegistrationCard: React.FC<RegistrationCardProps> = ({
    reg,
    userName,
    roomStatus,
    updateRegistrationStatus,
    handleBackStatus,
    updateValue,
    formatDisplayNumber,
    checkedIds,
    setCheckedIds,
    onBreakSet
}) => {
    // 自分が担当しているかどうか
    const isAssignedToMe = reg.assignedTo === userName;
    // 他のスタッフが担当しているかどうか
    const isAssignedToOther = reg.assignedTo && reg.assignedTo !== userName;
    // 担当スタッフが休憩中かどうか（休憩中に呼出・案内が滞留していないか気づけるようにする）
    const isAssigneeOnBreak = !!reg.assignedTo && onBreakSet.has(reg.assignedTo);

    // 部屋選択ピッカーの表示状態（true = 準備ボタンを押してピッカーが開いている）
    const [showRoomPicker, setShowRoomPicker] = useState(false);

    // --------------------------------------------------
    // 部屋の使用状況を判定するヘルパー
    // --------------------------------------------------
    const getRoomOccupancy = (roomId: string): null | 'preparing' | 'playing' => {
        const rs = roomStatus.find(r => r.id === roomId);
        if (!rs) return null;
        if (rs.playing) return 'playing';
        if (rs.preparing) return 'preparing';
        return null;
    };

    // --------------------------------------------------
    // 引き継ぎ処理 確認ダイアログを表示してから担当者を自分に変更する
    // --------------------------------------------------
    const handleTakeover = () => {
        // 現在の担当者名を含む確認ダイアログ
        const confirmed = window.confirm(
            `⚠️ 担当変更の確認\n\n` +
            `No.${formatDisplayNumber(reg.number)} は現在「${reg.assignedTo}」が担当中です。\n` +
            `「${userName}」に変更しますか？`
        );
        if (confirmed) {
            updateValue(reg.id, 'assignedTo', userName);
        }
    };

    // --------------------------------------------------
    // ステータスボタンを押したときの処理
    // 「準備」だけピッカーを開く、他は即時変更
    // --------------------------------------------------
    const handleStatusBtn = (s: string) => {
        // 現在のステータスと同じなら何もしない
        if (reg.status === s) return;

        if (s === '準備') {
            setShowRoomPicker(true);
        } else if (s === '取消') {
            if (window.confirm(`No.${formatDisplayNumber(reg.number)} を取り消してもよろしいですか？`)) {
                updateRegistrationStatus(reg.id, reg.status, s);
            }
        } else {
            updateRegistrationStatus(reg.id, reg.status, s);
            setShowRoomPicker(false);
        }
    };

    // --------------------------------------------------
    // 部屋を選んで確定
    // --------------------------------------------------
    const handleRoomConfirm = (roomId: string) => {
        updateRegistrationStatus(reg.id, reg.status, '準備', roomId);
        setShowRoomPicker(false);
    };
    return (
        // row-status-${status} クラスでステータス別の左枠色をCSSに伝える
        <div className={`reg-card row-status-${reg.status}`}>

            {/* ===== カードヘッダー ===== */}
            <div className="reg-card-header">
                <div className="reg-main">
                    {/* チェックボックス（一括操作用・現在は表示のみ） */}
                    <input
                        type="checkbox"
                        className="custom-check"
                        checked={checkedIds.has(reg.id)}
                        onChange={() => {
                            const newSet = new Set(checkedIds);
                            if (newSet.has(reg.id)) {
                                newSet.delete(reg.id);
                            } else {
                                newSet.add(reg.id);
                            }
                            setCheckedIds(newSet);
                        }}
                    />
                    {/* 整理番号 */}
                    <div className="reg-no">No.{formatDisplayNumber(reg.number)}</div>

                    {/* 部屋タグ（準備中・開始中のみ表示） */}
                    {(reg.status === "準備" || reg.status === "開始") && reg.room && (
                        <div className={`room-tag room-${reg.room.replace("部屋", "")}`}>
                            {reg.room.replace("部屋", "")}
                        </div>
                    )}

                    {/* 担当バッジ：自分が担当中 → 緑 / 他スタッフが担当中 → 黄 */}
                    {isAssignedToMe && (
                        <span className="assigned-badge mine">担当中</span>
                    )}
                    {isAssignedToOther && (
                        <span className={`assigned-badge other ${isAssigneeOnBreak ? 'assignee-on-break' : ''}`}>
                            {reg.assignedTo}{isAssigneeOnBreak ? ' ☕休憩中' : ''}
                        </span>
                    )}
                </div>

                {/* 人数・難易度セレクト（ツールチップあり） */}
                <div className="reg-settings">
                    <Tooltip text="参加人数を変更できます" position="top">
                        <select
                            className="inline-select"
                            value={reg.count}
                            onChange={(e) => updateValue(reg.id, "count", Number(e.target.value))}
                        >
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <option key={n} value={n}>{n}名</option>
                            ))}
                        </select>
                    </Tooltip>
                    <Tooltip text="難易度を変更できます" position="top">
                        <select
                            className="inline-select"
                            value={reg.difficulty}
                            onChange={(e) => updateValue(reg.id, "difficulty", e.target.value)}
                        >
                            <option value="簡単">簡単</option>
                            <option value="普通">普通</option>
                            <option value="難しい">難しい</option>
                        </select>
                    </Tooltip>
                </div>
            </div>

            {/* ===== カードボディ（操作ボタン） ===== */}
            <div className="reg-card-body">
                <div className="reg-actions-left">

                    {/* ステータスを1つ前に戻すボタン（待機中は非活性）（待機中は disabled なのでツールチップも無効化） */}
                    <Tooltip
                        text="ステータスを1つ前に戻します"
                        position="right"
                        disabled={reg.status === "待機"}
                    >
                        <button
                            className="back-status-btn"
                            onClick={() => handleBackStatus(reg)}
                            disabled={reg.status === "待機"}
                        >
                            ↩️ 1つ戻す
                        </button>
                    </Tooltip>

                    {/* 他スタッフ担当中の場合のみ引き継ぎボタンを表示 */}
                    {isAssignedToOther && (
                        // <Tooltip
                        //     text={`${reg.assignedTo} の担当を自分に引き継ぎます`}
                        //     position="right"
                        // >
                        <button className="takeover-btn" onClick={handleTakeover}>
                            🔄 引き継ぐ
                        </button>
                        // </Tooltip>
                    )}
                </div>

                {/* ===== 部屋選択ピッカー（準備ボタン押下時に展開） ===== */}
                {showRoomPicker && (
                    <div className="reg-room-picker">
                        <div className="reg-room-picker-title">🏠 どの部屋に入りますか？</div>
                        <div className="reg-room-picker-btns">
                            {ROOM_IDS.map(r => {
                                const occupancy = getRoomOccupancy(r);
                                // プレイ中の部屋でも次の組を1組だけ準備に入れられる。
                                // すでに準備中の組がいる部屋だけ押せなくする。
                                const isOccupied = occupancy === 'preparing';
                                const roomLabel = r.replace('部屋', '');
                                const occupancyLabel = occupancy === 'playing' ? 'プレイ中' : occupancy === 'preparing' ? '準備中' : '';

                                return (
                                    <button
                                        key={r}
                                        className={`reg-room-picker-btn room-${roomLabel} ${isOccupied ? 'occupied' : ''}`}
                                        onClick={() => !isOccupied && handleRoomConfirm(r)}
                                        disabled={isOccupied}
                                        title={isOccupied ? `${r}は現在${occupancyLabel}です` : `${r}に案内する`}
                                    >
                                        <span className="picker-room-name">{roomLabel}室</span>
                                        {occupancyLabel && (
                                            <span className="picker-room-status">{occupancyLabel}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className="reg-room-picker-cancel"
                            onClick={() => setShowRoomPicker(false)}
                        >
                            キャンセル
                        </button>
                    </div>
                )}

                {/* ステータス変更ボタン群（現在のステータスは強調表示）（各ボタンにツールチップあり） */}
                <div className="reg-actions-main">
                    {["呼出", "案内", "準備", "開始", "終了", "取消"].map(s => {
                        // バリデーション例: 部屋が決まっていない(reg.roomがない)時は「開始」「終了」を押せなくする
                        const isRoomRequired = (s === '開始' || s === '終了');
                        const isDisabled = isRoomRequired && !reg.room;

                        return (
                            // <Tooltip
                            //     key={s}
                            //     text={isDisabled ? "先に部屋を割り当ててください" : STATUS_TOOLTIP[s]}
                            //     position="bottom"
                            // >
                            <button
                                key={s}
                                id={`status-btn-${s}`}
                                className={`status-btn btn-${s} ${reg.status === s ? 'btn-active' : ''}`}
                                onClick={() => handleStatusBtn(s)} // handleStatusBtnを通すように修正
                                disabled={isDisabled}
                            >
                                {s}
                            </button>
                            // </Tooltip>
                        );
                    })}
                </div>

                {/* 最終更新者名（右下に小さく表示） */}
                {reg.lastUpdatedBy && (
                    <div className="reg-updated-by">{reg.lastUpdatedBy}</div>
                )}
            </div>
        </div>
    );
};

export default RegistrationCard;
