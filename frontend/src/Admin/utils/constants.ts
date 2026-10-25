// =====================================================
// src/Admin/utils/constants.ts — アプリ全体の定数
// =====================================================
//
// 📋 このファイルの役割
//
//   アプリ全体で使う「変わらない値」を一か所にまとめる。
//   定数を変えたい場合は、このファイルだけ変更すれば
//   アプリ全体に反映される。
//
// 🔧 よく変更する箇所（運用時に変えそうな設定）
//
//   ROOM_COUNT / ROOM_IDS  : 部屋の数・名前を変えるとき（shared/waitTime.ts を編集）
//   MAX_TEAM_NUMBER        : 1周の最大チーム数（現在80）
//   PASSWORDS              : 管理者・幹部のパスワードを変えるとき
//   DEFAULT_PLAY_TIME_MINUTES / MINIMUM_SAMPLES_FOR_AVERAGE : shared/waitTime.ts を編集
//
// ⚠️ ROOM_COUNT・ROOM_IDS・DEFAULT_PLAY_TIME_MINUTES・MINIMUM_SAMPLES_FOR_AVERAGE は
//    Customer側（お客様画面）の待ち時間計算でも同じ値を使う必要があるため、
//    shared/waitTime.ts で一元管理し、ここでは re-export しているだけ。
//    このファイルで直接書き換えないこと。
//
// =====================================================

export {
    ROOM_IDS,
    ROOM_COUNT,
    DEFAULT_PLAY_TIME_MINUTES,
    MINIMUM_SAMPLES_FOR_AVERAGE
} from '../../shared/waitTime';

// =====================================================
// ステータス
// =====================================================

// ステータスの順序
// １つ前に戻す機能で使用
// この順序を変えると戻す動作が変わるので注意
export const STATUS_ORDER = ["待機", "呼出", "案内", "準備", "開始", "終了"];

// 画面上部のステータスタブの一覧
// 並び順がそのままタブの表示順になる
// 🔧 タ ブを追加・削除・並べ替えたい場合はここを変更
export const STATUS_TABS = [
    "すべて",
    "アクティブ",   // 終了・取消以外をまとめて表示するタブ
    "ムーブ",
    "待機",
    "呼出",
    "案内",
    "準備",
    "開始",
    "終了"
];

// =====================================================
// チーム番号
// =====================================================

// 1周目の最大チーム数
// この番号を超えると2周目の発行（81 = 2-1 など）に切り替わる
// 🔧 整理券の枚数を変更する場合はここを変更
export const MAX_TEAM_NUMBER = 80;

// =====================================================
// 待ち時間・プレイ時間の計算設定
// =====================================================
// MINIMUM_SAMPLES_FOR_AVERAGE・DEFAULT_PLAY_TIME_MINUTES は
// ファイル冒頭で shared/waitTime.ts から re-export 済み

// 現在時刻の更新間隔（ミリ秒）
// CurrentTime フックで使用。10秒ごとに再計算される
export const TIME_UPDATE_INTERVAL_MS = 10000;

// =====================================================
// 認証・役割
// =====================================================

// 役割ごとのパスワード
// 管理者・幹部への切り替え時に入力を求める
// 🔧 パスワードを変更する場合はここを変更
// ⚠️ このファイルはGitで管理しているため、本番では環境変数化を推奨
export const PASSWORDS: { [key: string]: string } = {
    "管理者": "1234",
    "幹部": "5678"
};

// =====================================================
// 選択肢
// =====================================================

// 整理券発行時の人数選択肢
// 🔧 受け入れ可能な人数を変更する場合はここを変更
export const PLAYER_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6];

// 難易度の選択肢
// 🔧 難易度を追加・削除する場合は shared/types.ts の difficulty 型も合わせて変更
export const DIFFICULTY_OPTIONS = ["簡単", "普通", "難しい"];

// =====================================================
// レイアウト設定
// =====================================================

// デフォルトのレイアウト設定
// 各コンポーネントの初期表示位置を定義する
//
// @description
//  'header' : ヘッダーに常時表示
//  'tab'    : タブとして追加（クリックで表示）
//  'none'   : 非表示
//  ⚠️ useLayout.ts にも同じ DEFAULT_LAYOUT が定義されている（2重定義）
//    将来的にどちらか一方に統一することを推奨
export const DEFAULT_LAYOUT = {
    stats: 'tab',      // 統計ダッシュボード
    roomNav: 'tab',       // 部屋担当バー
    prepNav: 'tab',       // 準備担当バー
    focusBar: 'tab',   // フォーカスバー
    issueCard: 'tab',   // 新規発行カード
    guideBar: 'tab',  // 担当チームバー
};

// 役割ごとの初期レイアウト
// その役割で初めてログインしたとき・「レイアウトを初期化」したときに使われる
// ここにない役割は DEFAULT_LAYOUT を使う
// 🔧 役割ごとの初期配置を変えたい場合はここを変更
export const ROLE_DEFAULT_LAYOUTS: { [role: string]: typeof DEFAULT_LAYOUT } = {
    受付: { ...DEFAULT_LAYOUT, stats: 'header', focusBar: 'header' },
    担当: { ...DEFAULT_LAYOUT, focusBar: 'header', guideBar: 'header' },
    準備: { ...DEFAULT_LAYOUT, roomNav: 'header', focusBar: 'header' },
};

// 役割を変更したときに最初に開くタブ
// ステータスタブ名 または コンポーネントID（タブ配置のときのみ有効）
// ここにない役割はタブを切り替えない
export const ROLE_DEFAULT_TABS: { [role: string]: string } = {
    受付: 'guideBar',
    担当: 'アクティブ',
    準備: '準備',
};

// コンポーネントIDとタブ表示名のマッピング
// レイアウトで 'tab' に設定されたコンポーネントのタブ名として使用する
export const COMPONENT_TAB_LABELS: { [key: string]: string } = {
    stats: '統計',
    roomNav: '部屋',
    prepNav: '準備',
    focusBar: '確認',
    issueCard: '発行',
    guideBar: '担当',
};
