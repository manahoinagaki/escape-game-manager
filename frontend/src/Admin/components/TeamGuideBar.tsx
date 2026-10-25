// =====================================================
// src/Admin/components/TeamGuideBar.tsx — 担当チームバー
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   スタッフが自分の担当チームを選択・操作するUIを提供する。
//   担当チームの有無によって表示が切り替わる。
//
//   【担当チームあり・案内中】
//   ┌──────────────────────────────────┐
//   │ ○○さんの担当                          │
//   │ No.5  3名 / 普通  案内中             │
//   │ [入室・準備開始 →] [担当を外す]            │
//   │                                  │
//   │ ▼「入室・準備開始」を押したあと                   │
//   │ ┌──────────────────────────────┐ │
//   │ │ どの部屋に入りますか？                   │ │
//   │ │ [A室]  [B室 使用中]  [C室 準備中]│  ← 使用中・準備中は押せない
//   │              [キャンセル]        │
//   │ └──────────────────────────────┘ │
//   └──────────────────────────────────┘
//
//   【担当チームあり・それ以外】
//   ┌──────────────────────────────────┐
//   │ ○○さんの担当                          │
//   │ No.5  3名 / 普通  準備中  [A室]       │
//   │ [プレイ開始 →]      [担当を外す]          │
//   └──────────────────────────────────┘
//
//   【担当チームなし】
//   ┌──────────────────────────────────┐
//   │ ○○さん — 担当チームを選択                 │
//   │ [番号検索入力] [検索]                │
//   │ 呼出中（担当なし）                        │
//   │ [No.3 2名/普通] [No.7 1名/簡単]      │
//   └──────────────────────────────────┘
//
// 🔧 よく変更する箇所
//   部屋の一覧 : ROOM_IDS 配列（部屋を増減する場合）
//
// 使用箇所：Admin.tsx の renderPart('guideBar')
//
// =====================================================

import React, { useEffect, useState } from 'react';
import type { Registration } from '../types';

// 🔧 部屋を増減する場合はここを変更する
const ROOM_IDS = ['部屋A', '部屋B', '部屋C'];

/** 担当可能なステータスの一覧（取消・終了は除外） */
const ASSIGNABLE_STATUSES = ['待機', '呼出', '案内', '準備', '開始'];

/** 部屋の使用状況 */
interface RoomStatus {
    id:       string;               // 例: "部屋A"
    playing:  Registration | undefined; // プレイ中のチーム
    preparing: Registration | undefined; // 準備中のチーム
}

interface TeamGuideBarProps {
    // 現在ログイン中のユーザー名 */
    userName: string;
    // 自分が担当しているチーム（なければ null） */
    myAssignedTeam: Registration | null | undefined;
    // 今日の全登録データ（番号検索・呼出一覧に使用） */
    todayRegistrations: Registration[];
    // 各部屋のプレイ中・準備中の状況（部屋ピッカーの活性制御に使用） */
    roomStatus: RoomStatus[];
    // ステータスを変更する関数 */
    updateRegistrationStatus: (id: string, currentStatus: string, clickedStatus: string, targetRoom?: string) => void;
    // 特定フィールドを更新する関数（assignedTo に使用） */
    updateValue: (id: string, field: string, value: string | number | null) => void;
    // 番号の表示形式変換関数 */
    formatDisplayNumber: (num: number) => string;
}

const GuideBar: React.FC<TeamGuideBarProps> = ({
    userName,
    myAssignedTeam,
    todayRegistrations,
    roomStatus,
    updateRegistrationStatus,
    updateValue,
    formatDisplayNumber
}) => {
    const [searchInput, setSearchInput] = useState('');// 番号検索の入力値
    const [searchResult, setSearchResult] = useState<Registration | null | undefined>(undefined);// 検索結果

    // 部屋選択ピッカーの表示状態
    // null = 非表示、'準備' = 案内→準備のとき表示
    const [roomPickerFor, setRoomPickerFor] = useState<string | null>(null);

    // 担当チームが変わったらピッカーを閉じる
    // （レンダー中に前回値と比較して更新することで、
    //   専用の effect を使わずに「値が変わったら state をリセットする」を実現する）
    const [prevAssignedTeamId, setPrevAssignedTeamId] = useState(myAssignedTeam?.id);
    if (myAssignedTeam?.id !== prevAssignedTeamId) {
        setPrevAssignedTeamId(myAssignedTeam?.id);
        setRoomPickerFor(null);
    }

    // --------------------------------------------------
    // 経過時間タイマー（開始中のみ30秒ごとに更新）
    // elapsed は state に保存せず、「現在時刻」と myAssignedTeam から
    // その都度算出する（30秒ごとに tick を更新して再計算のきっかけを作る）
    // --------------------------------------------------
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const elapsed = (() => {
        if (!myAssignedTeam || myAssignedTeam.status !== '開始') return '';
        const start = myAssignedTeam.startTime?.toDate
            ? myAssignedTeam.startTime.toDate()
            : myAssignedTeam.startTime ?
                new Date(myAssignedTeam.startTime)
                : null;
        if (!start) return '';
        return `${Math.floor((tick - start.getTime()) / 60000)}分経過`;
    })();

    // --------------------------------------------------
    // 番号検索
    // 入力した番号のチームをアクティブなステータスから検索する
    // --------------------------------------------------
    const handleSearch = () => {
        const num = Number(searchInput);
        if (!searchInput || isNaN(num)) return;
        const found = todayRegistrations.find(
            r => r.number === num && ASSIGNABLE_STATUSES.includes(r.status)
        );
        setSearchResult(found ?? null);
    };

    /// --------------------------------------------------
    // 担当をセットする（確認ダイアログ付き）
    // 他のスタッフが担当中の場合は確認を求める
    // --------------------------------------------------
    const handleAssign = (reg: Registration) => {
        if (reg.assignedTo && reg.assignedTo !== userName) {
            const confirmed = window.confirm(
                `⚠️ 担当変更の確認\n\n` +
                `No.${formatDisplayNumber(reg.number)} は現在「${reg.assignedTo}」が担当中です。\n` +
                `「${userName}」に変更しますか？`
            );
            if (!confirmed) return;
        }
        updateValue(reg.id, 'assignedTo', userName);
        setSearchInput('');
        setSearchResult(undefined);
    };

    // --------------------------------------------------
    // 担当を外す
    // --------------------------------------------------
    const handleRelease = (id: string, number: number) => {
        if (window.confirm(`No.${formatDisplayNumber(number)} の担当を外しますか？`)) {
            updateValue(id, 'assignedTo', null);
        }
    };

    // --------------------------------------------------
    // 部屋の使用状況を判定するヘルパー
    // 戻り値: null（空き）/ 'playing'（プレイ中）/ 'preparing'（準備中）
    // --------------------------------------------------
    const getRoomOccupancy = (roomId: string): null | 'preparing' => {
        const rs = roomStatus.find(r => r.id === roomId);
        if (!rs) return null;
        if (rs.preparing) return 'preparing';
        return null;
    };

    // ==================================================
    // 【担当チームあり】操作UI
    // ==================================================
    if (myAssignedTeam) {
        const { id, status, number, count, difficulty, room } = myAssignedTeam;

        /**
         * 現在のステータスに応じた次のアクションを返す
         * 表示ラベル・次のステータス・ボタンのCSSクラスを含む
         */
        const getAction = () => {
            switch (status) {
                case '待機': return { label: '呼出へ',         next: '呼出', btnClass: 'guide-btn-call',  needRoomPicker: false };
                case '呼出': return { label: '案内へ',         next: '案内', btnClass: 'guide-btn-guide', needRoomPicker: false };
                case '案内': return { label: '入室・準備開始', next: '準備', btnClass: 'guide-btn-prep',  needRoomPicker: true  };
                case '準備': return { label: 'プレイ開始',     next: '開始', btnClass: 'guide-btn-play',  needRoomPicker: false };
                // 開始中はメインボタンを出さない。
                // 「プレイ開始」と同じ位置が「終了」に変わると、連続タップで
                // 意図せず終了になってしまうため（終了は下の専用ボタン handleFinish から行う）
                default:     return null;
            }
        };

        const action = getAction();

        /**
         * メインボタンを押したときの処理
         * needRoomPicker が true なら部屋選択ピッカーを開く
         * false なら即座にステータス変更する
         */
        const handleMainBtn = () => {
            if (!action) return;
            if (action.needRoomPicker) {
                setRoomPickerFor(action.next); // ピッカーを開く（ステータスはまだ変わらない）
            } else {
                updateRegistrationStatus(id, status, action.next);
            }
        };
 
        /**
         * 終了ボタンを押したときの処理（確認ダイアログ付き）
         */
        const handleFinish = () => {
            if (window.confirm(`No.${formatDisplayNumber(number)} を終了してもよろしいですか？`)) {
                updateRegistrationStatus(id, status, '終了');
            }
        };

        /**
         * 部屋選択ピッカーで部屋を確定したときの処理
         * selectedRoom を targetRoom として渡してステータスを変更する
         */
        const handleRoomConfirm = (selectedRoom: string) => {
            updateRegistrationStatus(id, status, roomPickerFor!, selectedRoom);
            setRoomPickerFor(null);
        };

        return (
            <div className={`team-guide-bar status-${status}`}>

                {/* チーム情報 */}
                <div className="guide-info">
                    <div className="guide-user-tag">{userName}さんの担当</div>
                    <div className="guide-team-details">
                        <span className="guide-no">No.{formatDisplayNumber(number)}</span>

                        <span className="guide-meta">{count}名 / {difficulty}</span>
                        <span className="guide-status-badge">{status}中</span>
                        {/* 準備以降は割当済み部屋名をバッジで表示 */}
                        {room && (status === '準備' || status === '開始') && (
                            <span className={`guide-room-badge room-${room.replace('部屋', '')}`}>
                                {room.replace('部屋', '')}室
                            </span>
                        )}
                        {status === '開始' && elapsed && (
                            <span className="guide-elapsed">{elapsed}</span>
                        )}
                    </div>
                </div>

                {/* ===== 部屋選択ピッカー（案内→準備のときのみ表示） ===== */}
                {roomPickerFor && (
                    <div className="guide-room-picker">
                        <div className="guide-room-picker-title">
                            🏠 どの部屋に入りますか？
                        </div>
                        <div className="guide-room-picker-btns">
                            {ROOM_IDS.map(r => {
                                const occupancy = getRoomOccupancy(r);
                                const isOccupied = occupancy !== null;
                                const roomLabel  = r.replace('部屋', '');
 
                                // 使用状況のラベル文言
                                const occupancyLabel = occupancy === 'preparing' ? '準備中' : '';
 
                                return (
                                    <button
                                        key={r}
                                        className={`guide-room-picker-btn room-${roomLabel} ${isOccupied ? 'occupied' : ''}`}
                                        onClick={() => !isOccupied && handleRoomConfirm(r)}
                                        disabled={isOccupied}
                                        title={isOccupied ? `${r}は現在${occupancyLabel}です` : `${r}に案内する`}
                                    >
                                        <span className="picker-room-name">{roomLabel}室</span>
                                        {/* 使用中・準備中の場合は状況を小さく表示 */}
                                        {isOccupied && (
                                            <span className="picker-room-status">{occupancyLabel}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className="guide-room-picker-cancel"
                            onClick={() => setRoomPickerFor(null)}
                        >
                            キャンセル
                        </button>
                    </div>
                )}

                {/* 操作ボタン（ピッカーが開いている間は非表示） */}
                {!roomPickerFor && (
                    <div className="guide-actions">
                        {action && (
                            <button
                                className={`guide-main-button ${action.btnClass}`}
                                onClick={handleMainBtn}
                            >
                                {action.label} →
                            </button>
                        )}
                        <button
                            className="guide-release-btn"
                            onClick={() => handleRelease(id, number)}
                        >
                            担当を外す
                        </button>
                        {/* 終了ボタン（開始中のみ）
                            「プレイ開始」とは別の位置に置き、確認ダイアログも挟むことで
                            連続タップによる意図しない終了を防ぐ */}
                        {status === '開始' && (
                            <button
                                className="guide-main-button guide-btn-end"
                                onClick={handleFinish}
                            >
                                終了 →
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ==================================================
    // 【担当チームなし】番号検索 + 呼出中一覧
    // ==================================================

    /** 担当者が割り当てられていない呼出中チームの一覧（番号順） */
    const freeCalled = todayRegistrations
        .filter(r => r.status === '呼出' && !r.assignedTo)
        .sort((a, b) => a.number - b.number);

    return (
        <div className="team-guide-bar status-none">
            <div className="guide-user-tag">{userName}さん — 担当チームを選択</div>
 
            {/* 番号検索（Enter キーでも検索できる） */}
            <div className="guide-search-row">
                <input
                    type="number"
                    className="guide-search-input"
                    placeholder="番号で検索..."
                    value={searchInput}
                    onChange={(e) => {
                        setSearchInput(e.target.value);
                        setSearchResult(undefined);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button className="guide-search-btn" onClick={handleSearch}>検索</button>
            </div>

            {/* 検索結果：見つからなかった場合 */}
            {searchResult === null && (
                <div className="guide-search-notfound">該当する番号が見つかりません</div>
            )}
            {/* 検索結果：見つかった場合 */}
            {searchResult && (
                <div className="guide-search-result">
                    <div className="guide-search-result-info">
                        <span className="guide-select-no">No.{formatDisplayNumber(searchResult.number)}</span>
                        <span className="guide-select-meta">{searchResult.count}名 / {searchResult.difficulty}</span>
                        <span className="guide-search-status-badge">{searchResult.status}</span>
                        {/* 他者担当中の警告 */}
                        {searchResult.assignedTo && searchResult.assignedTo !== userName && (
                            <span className="guide-search-assigned-warn">
                                ⚠️ {searchResult.assignedTo}が担当中
                            </span>
                        )}
                    </div>
                    {/* 担当するボタン（他者担当中でも押せるが確認ダイアログが出る） */}
                    <button
                        className={`guide-select-btn assign ${
                            searchResult.assignedTo && searchResult.assignedTo !== userName ? 'warn' : ''
                        }`}
                        onClick={() => handleAssign(searchResult)}
                    >
                        {searchResult.assignedTo && searchResult.assignedTo !== userName
                            ? '⚠️ 引き継ぐ'
                            : '担当する'
                        }
                    </button>
                </div>
            )}

            {/* 担当なし呼出一覧 */}
            {freeCalled.length > 0 && (
                <>
                    <div className="guide-list-label">呼出中（担当なし）</div>
                    <div className="guide-select-list">
                        {freeCalled.map(reg => (
                            <button
                                key={reg.id}
                                className="guide-select-btn"
                                onClick={() => handleAssign(reg)}
                            >
                                <span className="guide-select-no">No.{formatDisplayNumber(reg.number)}</span>
                                <span className="guide-select-meta">{reg.count}名 / {reg.difficulty}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* 呼出中チームが0件かつ検索前の場合 */}
            {freeCalled.length === 0 && searchResult === undefined && (
                <div className="guide-no-team">呼出中の担当なしチームはありません</div>
            )}
        </div>
    );
};
 
export default GuideBar;