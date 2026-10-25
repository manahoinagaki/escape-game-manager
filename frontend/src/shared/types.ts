// =====================================================
// src/shared/types.ts — 共通の型定義
// =====================================================
//
// 📋 このファイルの役割
//
//   Admin（スタッフ側）と Customer（お客様側）の
//   両方で使うデータの「型（かた）」を定義する。
//
//   「型」とは、そのデータに何の情報が入っているかを
//   あらかじめ決めておくもの。
//   例）「registrations には number（数字）と status（文字）が入る」
//
//   これを定義しておくと、入力ミスをコンパイル時に
//   自動で教えてくれる。
//
// 📦 Firestoreのデータ構造との対応
//
//   Registration  ← "registrations" コレクションの各ドキュメント
//   SystemInfo    ← "system_info/Waiting" ドキュメント
//
// ⚠️ フィールドを追加・削除するときは
//   Firestore側のデータ構造と必ず合わせること
//
// =====================================================

// =====================================================
// Registration — 1組分の登録データ
// Firestore: "registrations" コレクションの各ドキュメント
// =====================================================
import type { Timestamp } from 'firebase/firestore';

export interface Registration {
    // ----- 基本情報 -----

    // ドキュメントID（Firestoreが自動生成）。通常は変更しない 
    id: string;
    // 整理番号（1〜MAX_TEAM_NUMBERの整数）
    number: number;
    // ステータス（現在の状態）
    //  待機 → 呼出 → 案内 → 準備 → 開始 → 終了
    //                                        ↓
    //                               取消（キャンセル）
    status: '待機' | '呼出' | '案内' | '準備' | '開始' | '終了' | '取消';
    // 人数（何名のグループか）
    count: number;
    // 難易度（お客様が選んだ難しさ）
    difficulty: '簡単' | '普通' | '難しい';
    // 日付モード（"1日目" / "2日目" / "テスト"）
    day: string;

    // ----- 時間情報（任意：なくてもエラーにならない） -----
    // ゲーム開始時刻（Firestoreのタイムスタンプ形式）
    startTime?: Timestamp | Date;       // Firestore Timestamp
    // ゲーム終了時刻（Firestoreのタイムスタンプ形式）
    endTime?: Timestamp | Date | null;  // Firestore Timestamp
    // ステータスが最後に変わった時刻（Firestoreのタイムスタンプ形式）
    statusChangedAt?: Timestamp;        // Firestore Timestamp

    // ----- 管理情報（任意） -----
    // 割り当てられた部屋番号（"room1" / "room2" など）
    room?: string;
    // 最後に操作したスタッフの名前
    lastUpdatedBy?: string;
    // 担当スタッフ（null = 未割当）
    assignedTo?: string | null;
    // 「取消」にする直前のステータス（誤操作で取消した際に元へ戻すために使用）
    previousStatus?: string;
}

// =====================================================
// SystemInfo — システム全体の設定情報
// Firestore: "system_info/Waiting" ドキュメント
// =====================================================
export interface SystemInfo {
    // 現在の日付モード（"1日目" / "2日目" / "テスト"）
    Day: string;

    // 実績ベースの平均プレイ時間（分）
    // 終了データが少ない場合のデフォルト値として使われる
    // Admin側で更新される
    finishedWithTime?: number;
    // 待ち時間の下限（分）※現在は計算で求めているため参照のみ
    estimatedWaitLowerBound?: number;
    // 待ち時間の上限（分）※現在は計算で求めているため参照のみ
    estimatedWaitUpperBound?: number;
}
