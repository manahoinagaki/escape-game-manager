// =====================================================
// src/Admin/Admin.tsx — スタッフ向け管理画面
// =====================================================
//
// 📱 この画面の構成
//
//   ┌──────────────────────────────────┐
//   │  ヘッダー（固定）                 │
//   │  ├─ AdminHeader（ツールバー）     │
//   │  ├─ ResultBar（統計バー）        │
//   │  └─ RoomBar（部屋状況）          │
//   ├──────────────────────────────────┤
//   │  スクロールエリア                 │
//   │  ├─ FocusBar（注目チーム）       │
//   │  ├─ 検索・絞り込みバー           │
//   │  └─ RegistrationCard 一覧       │
//   ├──────────────────────────────────┤
//   │  SideMenu（設定メニュー・overlay）│
//   └──────────────────────────────────┘
//
// 🔧 よく変更する箇所
//   役割・パスワード : utils/constants.ts の PASSWORDS
//   部屋数・部屋ID  : utils/constants.ts の ROOM_COUNT / ROOM_IDS
//   タブの種類      : utils/constants.ts の STATUS_TABS
//   人数・難易度の選択肢 : utils/constants.ts の PLAYER_COUNT_OPTIONS / DIFFICULTY_OPTIONS
//
// 👥 役割（role）の種類
//   "受付"  : 整理券の発行・ステータス変更
//   "部屋"  : 自分の担当部屋のみ操作
//   "管理者": 全操作 + 日付モード変更（パスワード必要）
//   "幹部"  : 管理者と同等 + 特別表示（パスワード必要）
//
// =====================================================

// =====================================================
// IMPORT — 使用するライブラリ・ファイルの読み込み
// =====================================================
// React本体
import React, { useEffect, useState, type ReactNode } from 'react';

// ユーザー設定（名前・パスワードの一覧）
import { USER_LIST } from './hooks/User';
import type { UserConfig } from './hooks/User';

// カスタムフック（データ取得・計算ロジック）
import { useComputedData } from './hooks/ComputedData';  // 計算済みデータ
import { useCurrentTime } from './hooks/CurretTime';     // 現在時刻（定期更新）
import { useAdminFirestore } from './hooks/Firestore';   // Firestoreリアルタイム同期
import { useStaffBreaks } from './hooks/StaffBreak';     // スタッフ休憩状態の同期
import { useLayout, loadLayout } from './hooks/useLayout'; // レイアウト設定

// Firestore操作関数
import {
    createRegistration,       // 整理券を新規発行
    updateStatus,             // ステータスを変更
    deleteAll,                // 全データ削除
    revertStatus,             // ステータスを1つ前に戻す
    updateField,              // 特定フィールドを更新
    setDayMode as setDayModeOperation  // 日付モードを変更
} from './operations/registration';

//  --------UTILS--------
// 定数（設定値）
import {
    STATUS_ORDER,             // ステータスの順序定義
    PASSWORDS,                // 役割別パスワード
    ROOM_COUNT,               // 部屋数
    ROOM_IDS,                 // 部屋IDの一覧
    STATUS_TABS,              // タブの種類（待機・呼出・案内など）
    PLAYER_COUNT_OPTIONS,     // 人数の選択肢
    DIFFICULTY_OPTIONS,       // 難易度の選択肢
    ROLE_DEFAULT_TABS,        // 役割ごとに最初に開くタブ
} from './utils/constants';

// フォーマット・計算ユーティリティ
import {
    formatDisplayNumber,      // 整理番号の表示形式変換（81→"2-1"など）
    calculateWaitTimeRange    // 待ち時間の上限・下限を計算
} from './utils/formatters';

import {
    calcNextNumber          // 次の発行番号を計算
} from './utils/nextNumber';

// UIコンポーネント（各パーツ）
import AdminHeader from './components/AdminHeader';       // ヘッダーツールバー
import SideMenu from './components/SideMenu';             // 設定サイドメニュー
import RoomStaffBar from './components/RoomBar';          // 部屋状況バー
import RegistrationCard from './components/RegistrationCard.tsx'; // 登録カード
import ResultBar from './components/ResultBar';           // 統計バー
import FocusBar from './components/FocusBar';             // 注目チームバー
import GuideBar from './components/TeamGuideBar';         // 案内バー

// スタイル
import './Admin.css';

// CoachMark
import CoachMark from '../shared/components/CoachMark';
import type { CoachMarkStep } from '../shared/components/CoachMark';

// 型定義
import type { Registration } from './types';

// =====================================================
// メインコンポーネント
// =====================================================
function Admin() {
    // --------------------------------------------------
    // 状態管理（画面の状態を保持する変数）
    // --------------------------------------------------
    // データ同期
    useCurrentTime(10000);  //現在時刻を10秒ごとに更新し、経過時間の表示を再計算させる（戻り値自体は使用しない）
    const { registrations, dayMode } = useAdminFirestore();  //Firestoreからリアルタイムで取得した登録データと日付モード
    const { staffBreaks, setBreak } = useStaffBreaks();  //スタッフの休憩状態（全端末で共有）

    // ユーザー
    const [role, setRole] = useState(localStorage.getItem("adminRole") || "受付");  //現在ログイン中の役割（LocalStorageに保存・復元される）
    const [userName, setUserName] = useState(localStorage.getItem("adminName") || "脱出");  //現在ログイン中のユーザー名（LocalStorageに保存・復元される)

    // UI
    const [isMenuOpen, setIsMenuOpen] = useState(false);                    //サイドメニューが開いているかどうか
    const [sortType, setSortType] = useState<'number' | 'time'>('number');  //カードの並び順（"number"=番号順 / "time"=時間順）
    const [activeTab, setActiveTab] = useState("アクティブ");                 //現在選択中のタブ（"アクティブ" / "待機" / "呼出" など）
    const [playerCount, setPlayerCount] = useState(2);                      //整理券発行時の人数
    const [Level, setLevel] = useState<Registration['difficulty']>("普通");  //整理券発行時の難易度
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());   //チェックボックスで選択中のカードID一覧

    // レイアウト
    const { layout, setLayout, resetLayout } = useLayout(userName, role);  //レイアウト設定（どのコンポーネントをどこに表示するか・ユーザー × 役割ごと）

    // 検索・絞り込み条件
    const [searchNumber, setSearchNumber] = useState('');             //番号で絞り込む文字列
    const [filterCount, setFilterCount] = useState<number | ''>('');  //人数で絞り込む値（空文字 = 絞り込みなし）
    const [filterDifficulty, setFilterDifficulty] = useState('');     //難易度で絞り込む文字列（空文字 = 絞り込みなし）

    // =====================================================
    // 外部データ同期：FIREBASE / STORAGE SYNC
    // 副作用：ログイン情報をLocalStorageに保存
    // role または userName が変わるたびに保存される
    // =====================================================
    // 役職と名前をLocalStorageに保存
    useEffect(() => {
        localStorage.setItem("adminRole", role);
        localStorage.setItem("adminName", userName);
    }, [role, userName]);

    // =====================================================
    // 計算済みデータ（useComputedData フックから取得）
    // =====================================================
    const {
        todayRegistrations,       // 今日の登録データのみ
        isRoomStaffRole,          // 部屋スタッフ役割かどうか
        averagePlayTimeMinutes,   // 平均プレイ時間（分）
        finishedRegistrations,    // 終了済みのデータ
        waitingRegistrations,     // 待機中のデータ
        calledRegistrations,      // 呼出中のデータ
        guidingRegistrations,     // 案内中のデータ
        waitNextTeam              // 次の待機チーム
    } = useComputedData(registrations, dayMode, role);

    // 終了済みの総人数
    const totalFinishedPlayers = finishedRegistrations.reduce(
        (acc: number, curr: Registration) => acc + (curr.count || 0), 0
    );

    // 推定待ち時間の計算
    const estimatedWaitMinutes = (waitingRegistrations.length / ROOM_COUNT) * averagePlayTimeMinutes;
    const [estimatedWaitLowerBound, estimatedWaitUpperBound] = calculateWaitTimeRange(estimatedWaitMinutes);
    // 管理者・幹部用：各ステータスの組が全員案内されるまでの累計時間（分）
    const FinishGuidingTime = Math.round((guidingRegistrations.length / ROOM_COUNT) * averagePlayTimeMinutes);
    const FinishCallingTime = Math.round(((guidingRegistrations.length + calledRegistrations.length) / ROOM_COUNT) * averagePlayTimeMinutes);
    const FinishWaitingTime = Math.round(((guidingRegistrations.length + calledRegistrations.length + waitingRegistrations.length) / ROOM_COUNT) * averagePlayTimeMinutes);
    // 次に発行する整理番号
    const nextNo = calcNextNumber(todayRegistrations);

    //自分（userName）が担当しているチーム（呼出・案内・準備・開始のいずれか）
    const myAssignedTeam = todayRegistrations.find((r: Registration) =>
        ['呼出', '案内', '準備', '開始'].includes(r.status) &&
        r.assignedTo === userName
    );

    const preparingRegistrations = todayRegistrations.filter(
        (r: Registration) => r.status === '準備'
    );

    // =====================================================
    // 動的タブの生成
    // レイアウト設定で 'tab' に設定されているコンポーネントを
    // タブとして追加する
    // =====================================================

    // レイアウトで 'tab' に設定されているコンポーネントIDの一覧
    const componentTabIds = Object.entries(layout)
        .filter(([, pos]) => pos === 'tab')
        .map(([id]) => id);

    // 全タブリスト = ステータスタブ + コンポーネントタブ
    const allTabs = [...STATUS_TABS, ...componentTabIds];

    // 現在選択中のタブがコンポーネントタブかどうか
    const isComponentTab = componentTabIds.includes(activeTab);

    // =====================================================
    // イベントハンドラー
    // =====================================================
    // 日付モードを変更する（管理者・幹部のみ）
    const handleSetDayMode = (newDay: string) => {
        setDayModeOperation(newDay, role);
    };

    // 役割をパスワード認証付きで変更する
    // 管理者・幹部はパスワードが必要
    const handleRoleUnlock = (targetRole: string) => {
        const pass = window.prompt(`${targetRole}用のパスワードを入力してください`);
        if (pass === PASSWORDS[targetRole]) {
            setRole(targetRole);
            if (targetRole === "幹部") setUserName("幹部");
            return true;
        } else {
            if (pass !== null) alert("パスワードが違います");
            return false;
        }
    };

    // 役割ごとの最初に開くタブ（ROLE_DEFAULT_TABS）に切り替える
    // コンポーネントタブの場合、そのコンポーネントがタブ配置でなければ「アクティブ」を開く
    const openRoleDefaultTab = (newRole: string, newUserName: string) => {
        const tab = ROLE_DEFAULT_TABS[newRole];
        if (!tab) return;
        const isValid = STATUS_TABS.includes(tab) || loadLayout(newUserName, newRole)[tab] === 'tab';
        setActiveTab(isValid ? tab : "アクティブ");
    };

    // 役割変更のハンドラー
    const handleRoleChange = (newRole: string) => {
        if (newRole === "管理者" || newRole === "幹部") {
            const success = handleRoleUnlock(newRole);
            if (!success) setRole(localStorage.getItem("adminRole") || "受付");
        } else {
            const newUserName = userName === "幹部" ? "脱出" : userName;
            setRole(newRole);
            setUserName(newUserName);
            openRoleDefaultTab(newRole, newUserName);
        }
    };

    // ユーザー名変更のハンドラー（パスワード認証付き）
    //  幹部ロールの場合は名前変更不可
    const handleNameChange = (newName: string) => {
        if (role === "幹部") {
            setUserName("幹部");
            return;
        }
        const targetUser = USER_LIST.find((u: UserConfig) => u.name === newName);
        if (!targetUser) return;
        const inputPass = window.prompt(`${newName}としてログインするにはパスワードを入力してください`);
        if (inputPass === targetUser.pass) {
            setUserName(newName);
        } else {
            if (inputPass !== null) alert("パスワードが違います。変更できません。");
        }
    };

    // --------------------------------------------------
    // Firestore操作ハンドラー
    // -------------------------------------------------

    // 整理券を新規発行する
    const handleAddRegistration = () => {
        if (nextNo === null) return; // 発行可能な番号がない場合は何もしない
        createRegistration({
            number: nextNo,
            status: "待機",
            count: playerCount,
            difficulty: Level,
            day: dayMode
        }, todayRegistrations);
    };

    // ステータスを変更する（待機→呼出→案内→準備→開始→終了）
    const handleUpdateStatus = async (
        id: string,
        currentStatus: string,
        clickedStatus: string,
        targetRoom?: string
    ) => {
        try {
            await updateStatus({
                id,
                currentStatus,
                clickedStatus,
                targetRoom,
                isRoomStaffRole,
                role,
                userName
            }, todayRegistrations);
        } catch (error) {
            if (error instanceof Error && error.message === 'ROOM_TAKEN') {
                window.alert('ちょうど他のスタッフがこの部屋を確保しました。別の部屋を選んでください。');
            } else if (error instanceof Error && error.message === 'ROOM_PLAYING') {
                window.alert('この部屋は前の組がまだプレイ中です。前の組を「終了」にしてから開始してください。');
            } else {
                throw error;
            }
        }
    };

    // ステータスを1つ前に戻す
    const handleBackStatus = (reg: Registration) => {
        revertStatus({
            id: reg.id,
            currentStatus: reg.status,
            statusOrder: STATUS_ORDER,
            role,
            userName
        }, todayRegistrations);
    };

    // 今日の全データを削除する（管理者・幹部のみ）
    const handleDeleteAll = () => {
        deleteAll(todayRegistrations);
    };

    // 特定フィールドの値を更新する（人数・難易度・部屋など）
    const handleUpdateValue = (id: string, field: string, value: string | number | null) => {
        updateField(id, field, value);
    };

    // --------------------------------------------------
    // スタッフ休憩状態
    // --------------------------------------------------
    // 自分が休憩中かどうか
    const isOnBreak = !!staffBreaks[userName]?.onBreak;
    // 現在休憩中のスタッフ名一覧（ヘッダーへの表示・担当バッジの警告表示に使用）
    const onBreakNames = Object.keys(staffBreaks).filter(name => staffBreaks[name]?.onBreak);
    const onBreakSet = new Set(onBreakNames);
    // 休憩ボタンを押したときの処理（自分の休憩状態をトグルする）
    const handleToggleBreak = () => {
        setBreak(userName, !isOnBreak);
    };

    // --------------------------------------------------
    // 部屋ごとの状態を計算
    // 各部屋の「プレイ中」「準備中」「経過時間」を集計する
    // --------------------------------------------------
    const roomStatus = ROOM_IDS.map(roomId => {
        const playing = todayRegistrations.find(r => r.status === "開始" && r.room === roomId);
        const preparing = todayRegistrations.find(r => r.status === "準備" && r.room === roomId);

        // プレイ中の場合、開始からの経過時間を計算
        let elapsed = "";
        if (playing && playing.startTime) {
            const start = playing.startTime.toDate ? playing.startTime.toDate() : new Date(playing.startTime);
            const diff = Math.floor((new Date().getTime() - start.getTime()) / (1000 * 60));
            elapsed = `${diff}分経過`;
        }

        return { id: roomId, playing, preparing, elapsed };
    });

    // --------------------------------------------------
    // 検索・絞り込み・ソート
    // --------------------------------------------------
    const MOVE_STATUS_ORDER = ["開始", "準備", "案内", "呼出", "待機"];

    const filteredData = todayRegistrations
        .filter((r: Registration) => {
            // 終了・取消以外
            if (activeTab === "アクティブ") return !['終了', '取消'].includes(r.status);
            // 全件
            if (activeTab === "すべて") return true;
            if (activeTab === "ムーブ") return MOVE_STATUS_ORDER.includes(r.status);
            // 指定ステータスのみ
            return r.status === activeTab;
        })
        // 番号で絞り込み
        .filter((r: Registration) => {
            if (searchNumber === '') return true;
            return String(r.number).startsWith(searchNumber);
        })
        // 人数で絞り込み
        .filter((r: Registration) => {
            if (filterCount === '') return true;
            return r.count === filterCount;
        })
        // 難易度で絞り込み
        .filter((r: Registration) => {
            if (filterDifficulty === '') return true;
            return r.difficulty === filterDifficulty;
        })
        // ソート（番号順 or 時間順)
        .sort((a: Registration, b: Registration) => {
            // ムーブタブはステータスグループ優先、その中でsortTypeに従う
            if (activeTab === "ムーブ") {                                          // ← 追加
                const aOrder = MOVE_STATUS_ORDER.indexOf(a.status);
                const bOrder = MOVE_STATUS_ORDER.indexOf(b.status);
                if (aOrder !== bOrder) return aOrder - bOrder;
                // 同じステータス内はsortTypeに従う
                if (sortType === 'time')
                    return (a.statusChangedAt?.seconds || 0) - (b.statusChangedAt?.seconds || 0);
                return a.number - b.number;
            }
            if (sortType === 'time')
                return (a.statusChangedAt?.seconds || 0) - (b.statusChangedAt?.seconds || 0);
            return a.number - b.number;
        });

    // 現在有効な絞り込み条件の数（クリアボタンに表示）
    const activeFilterCount = [
        searchNumber !== '',
        filterCount !== '',
        filterDifficulty !== ''
    ].filter(Boolean).length;

    // 全絞り込みをリセットする
    const handleClearFilters = () => {
        setSearchNumber('');
        setFilterCount('');
        setFilterDifficulty('');
    };

    // --------------------------------------------------
    // パーツ描画エンジン
    // ID を渡すと対応するコンポーネントを返す
    // レイアウト設定に応じて、ヘッダー・タブ・スクロール内のどこにでも配置できる
    // --------------------------------------------------
    const renderPart = (id: string): ReactNode => {
        switch (id) {
            // 統計バー（終了数・待ち時間・完了予測時間）
            case 'stats':
                return (
                    <ResultBar
                        key="stats"
                        role={role}
                        finishedRegistrations={finishedRegistrations}
                        totalFinishedPlayers={totalFinishedPlayers}
                        estimatedWaitLowerBound={estimatedWaitLowerBound}
                        estimatedWaitUpperBound={estimatedWaitUpperBound}
                        finishedWithTime={averagePlayTimeMinutes}
                        guidingRegistrations={guidingRegistrations}
                        preparingRegistrations={preparingRegistrations}
                        calledRegistrations={calledRegistrations}
                        waitingRegistrations={waitingRegistrations}
                        FinishGuidingTime={FinishGuidingTime}
                        FinishCallingTime={FinishCallingTime}
                        FinishWaitingTime={FinishWaitingTime}
                    />
                );

            // 部屋状況バー（各部屋のプレイ状況・次のチーム)
            case 'roomNav':
                return (
                    <RoomStaffBar
                        key="roomNav"
                        roomStatus={roomStatus}
                        waitNextTeam={waitNextTeam}
                        updateRegistrationStatus={handleUpdateStatus}
                        formatDisplayNumber={(n) => n.toString()}
                    />
                );

            // 確認バー（呼出中・案内中のチームを強調表示）
            case 'focusBar':
                return (
                    <FocusBar
                        key="focusBar"
                        registrations={registrations}
                        dayMode={dayMode}
                        formatDisplayNumber={formatDisplayNumber}
                    />
                );

            // 案内バー（自分が担当しているチームの操作）
            case 'guideBar':
                return (
                    <GuideBar
                        key="guideBar"
                        userName={userName}
                        myAssignedTeam={myAssignedTeam ?? null}
                        todayRegistrations={todayRegistrations}
                        roomStatus={roomStatus}
                        updateRegistrationStatus={handleUpdateStatus}
                        updateValue={handleUpdateValue}
                        formatDisplayNumber={formatDisplayNumber}
                    />
                );

            // 整理券発行カード（番号・人数・難易度を選んで発行）
            case 'issueCard':
                return (
                    <section className="new-cord" key="issueCard">
                        <div className="issue-settings">
                            <div className="issue-target">
                                <span className="next-label">次の発行</span>
                                <span className="next-number">
                                    {nextNo !== null
                                        ? `No.${formatDisplayNumber(nextNo)}`
                                        : '発行不可'
                                    }
                                </span>
                                {/* 81番以上の場合は「2周目」と表示 */}
                                {nextNo !== null && nextNo > 80 && (
                                    <span className="next-cycle-note">2周目</span>
                                )}
                            </div>
                            <div className="issue-selectors">
                                <div className="select-level">
                                    <label>人数</label>
                                    <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
                                        {PLAYER_COUNT_OPTIONS.map(n => <option key={n} value={n}>{n}名</option>)}
                                    </select>
                                </div>
                                <div className="select-level">
                                    <label>難易度</label>
                                    <select
                                        value={Level}
                                        onChange={(e) => setLevel(e.target.value as Registration['difficulty'])}
                                    >
                                        {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {/* 発行ボタン（発行可能な番号がない場合は非活性） */}
                        <button
                            className="add-btn"
                            onClick={handleAddRegistration}
                            disabled={nextNo === null}
                            style={nextNo === null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                        >
                            {nextNo !== null ? '発行' : '発行可能な番号なし'}
                        </button>
                    </section>
                );

            default:
                return null;
        }
    };

    //-----------------------------------------------
    //  CoachMark
    //-----------------------------------------------
    const ADMIN_GUIDE_STEPS: CoachMarkStep[] = [
    // 導入
    {
        title: 'ようこそ！管理画面へ',
        description: 'この画面ではお客様の整理券を管理します。簡単にガイドします。',
        position: 'center',
    },
    // AdminHeader
    {
        targetId: 'menu-trigger',
        title: 'メニュー',
        description: 'レイアウト・並び順・テーマの設定を開きます。',
        position: 'bottom',
    },
    {
        targetId: 'day-select',
        title: '日付モード',
        description: '全端末の日付モードを切り替えます。変更は管理者・幹部のみ操作できます。',
        position: 'bottom',
    },
    {
        targetId: 'role-select',
        title: '役割',
        description: '自分の役割を切り替えます。管理者・幹部への変更はパスワードが必要です。',
        position: 'bottom',
    },
    {
        targetId: 'name-select',
        title: '名前',
        description: '自分の名前を選択します。変更にはパスワードが必要です。',
        position: 'bottom',
    },
    {
        targetId: 'break-toggle-btn',
        title: '休憩する',
        description: '休憩に入るときに押します。他のスタッフの画面に「☕ 休憩中」と表示され、対応できないことが伝わります。戻ったらもう一度押して解除してください。',
        position: 'bottom',
    },
    {
        targetId: 'delete-all-btn',
        title: '⚠️ 全リセ（全データ削除）',
        description: 'registrations・部屋の使用状況などを全て削除し、まっさらな状態に戻します。元に戻せません。イベント終了後、CSVエクスポートが終わってから最後に1回だけ押してください。それ以外のタイミングでは絶対に押さないでください。',
        position: 'bottom',
    },
    // タブ
    {
        targetId: 'tab-待機',
        title: '待機タブ',
        description: '整理券を持ち、呼ばれるのを待っているお客様の一覧です。',
        position: 'bottom',
    },
    {
        targetId: 'tab-呼出',
        title: '呼出タブ',
        description: 'まもなく順番のお客様の一覧です。受付前に集まってもらう段階で、お客様の画面には「まもなくご案内」と表示されます。',
        position: 'bottom',
    },
    {
        targetId: 'tab-案内',
        title: '案内タブ',
        description: 'ゲームルームへ案内中のお客様の一覧です。部屋を割り当てて準備へ進めます。',
        position: 'bottom',
    },
    {
        targetId: 'tab-準備',
        title: '準備タブ',
        description: 'ルームで準備中のお客様の一覧です。準備が整ったら開始ボタンを押します。',
        position: 'bottom',
    },
    {
        targetId: 'tab-開始',
        title: '開始タブ',
        description: '現在プレイ中のお客様の一覧です。',
        position: 'bottom',
    },
    {
        targetId: 'tab-終了',
        title: '終了タブ',
        description: '本日ゲームを終了したお客様の一覧です。',
        position: 'bottom',
    },
    // RegistrationCard
    {
        targetId: 'status-btn-呼出',
        title: '呼出ボタン',
        description: 'お客様に受付前へ集まってもらいます。順番が近い組は自動でも呼出になります。担当はまだ付きません。',
        position: 'top',
    },
    {
        targetId: 'status-btn-案内',
        title: '案内ボタン',
        description: 'ゲームルームへの案内を開始します。担当がいない組は、押した人が担当になります。',
        position: 'top',
    },
    {
        targetId: 'status-btn-準備',
        title: '準備ボタン',
        description: 'ルームへの入室・準備を開始します。部屋が割り当てられます。',
        position: 'top',
    },
    {
        targetId: 'status-btn-開始',
        title: '開始ボタン',
        description: 'ゲームプレイを開始します。タイムの計測が始まります。',
        position: 'top',
    },
    {
        targetId: 'status-btn-終了',
        title: '終了ボタン',
        description: 'ゲームを終了します。プレイ時間が記録されます。',
        position: 'top',
    },
    // 完了
    {
        title: 'ガイド完了！',
        description: '困ったときはメニューの「操作ガイドを表示」から再度確認できます。',
        position: 'center',
    },
];

    // restartを受け取るstate
    const [restartGuide, setRestartGuide] = useState<(() => void) | null>(null);

    //-----------------------------------------------
    //  RENDER（画面描画）
    //-----------------------------------------------
    return (
        // header-mode-${dayMode} クラスでモード別の色テーマをCSSに伝える
        <div className={`admin-page header-mode-${dayMode}`}>

            {/* ===== ヘッダー（固定） ===== */}
            <header className={`header-admin header-mode-${dayMode}`}>

                {/* ===== 基本ツールバー ===== */}
                <AdminHeader
                    role={role}
                    userName={userName}
                    dayMode={dayMode}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    setDayMode={handleSetDayMode}
                    setRole={handleRoleChange}
                    NameChange={handleNameChange}
                    setIsMenuOpen={setIsMenuOpen}
                    onDeleteAll={handleDeleteAll}
                    renderPart={renderPart}
                    layout={layout}
                    allTabs={allTabs}
                    isComponentTab={(tab: string) => componentTabIds.includes(tab)}
                    isOnBreak={isOnBreak}
                    onBreakNames={onBreakNames}
                    onToggleBreak={handleToggleBreak}
                />
            </header>

            {/* ===== スクロールエリア（メインコンテンツ） ===== */}
            <main id="scroll-area" className="scroll-area">

                {isComponentTab ? (
                    /* コンポーネントタブの場合：該当コンポーネントを表示 */
                    <div className="tab-content">
                        {renderPart(activeTab)}
                    </div>
                ) : (
                    /* ステータスタブ選択時：検索バー + カード一覧を表示 */
                    <>
                        {/* 検索・絞り込みバー */}
                        <div className="search-bar">
                            {/* 番号検索 */}
                            <div className="search-input-wrap">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="number"
                                    className="search-input"
                                    placeholder="番号..."
                                    value={searchNumber}
                                    onChange={(e) => setSearchNumber(e.target.value)}
                                />
                            </div>

                            {/* 人数フィルター */}
                            <select
                                className="search-select"
                                value={filterCount}
                                onChange={(e) =>
                                    setFilterCount(e.target.value === '' ? '' : Number(e.target.value))
                                }
                            >
                                <option value="">人数</option>
                                {PLAYER_COUNT_OPTIONS.map(n => (
                                    <option key={n} value={n}>{n}名</option>
                                ))}
                            </select>

                            {/* 難易度フィルター */}
                            <select
                                className="search-select"
                                value={filterDifficulty}
                                onChange={(e) => setFilterDifficulty(e.target.value)}
                            >
                                <option value="">難易度</option>
                                {DIFFICULTY_OPTIONS.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>

                            {/* 絞り込みクリアボタン（1つ以上有効な場合に表示） */}
                            {activeFilterCount > 0 && (
                                <button className="search-clear-btn" onClick={handleClearFilters}>
                                    ✕ {activeFilterCount}
                                </button>
                            )}
                        </div>

                        {/* 登録カード一覧 */}
                        <section className="card-list">
                            {filteredData.map((reg: Registration) => (
                                <RegistrationCard
                                    key={reg.id}
                                    reg={reg}
                                    userName={userName}
                                    roomStatus={roomStatus}
                                    updateRegistrationStatus={handleUpdateStatus}
                                    handleBackStatus={handleBackStatus}
                                    updateValue={handleUpdateValue}
                                    formatDisplayNumber={formatDisplayNumber}
                                    checkedIds={checkedIds}
                                    setCheckedIds={setCheckedIds}
                                    onBreakSet={onBreakSet}
                                />
                            ))}
                        </section>
                    </>
                )}
            </main>

            {/* ===== サイドメニュー（設定・レイアウト変更） ===== */}
            <SideMenu
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                role={role}
                userName={userName}
                sortType={sortType}
                setSortType={setSortType}
                layout={layout}
                setLayout={setLayout}
                resetLayout={resetLayout}
                onRestartGuide={restartGuide ?? undefined}
            />

            {/* ===== CoachMark ===== */}
            <CoachMark
                steps={ADMIN_GUIDE_STEPS}
                storageKey="admin-guide-v2"
                onReady={(restart) => setRestartGuide(() => restart)}
            />
        </div>
    );
}

export default Admin;