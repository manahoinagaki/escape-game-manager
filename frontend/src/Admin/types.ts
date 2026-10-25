// =====================================================
// src/Admin/types.ts — Admin側の型定義
// =====================================================
//
// 📋 このファイルの役割
//
//   Admin（スタッフ側）の画面・操作で使う
//   データの「型（かた）」を定義する。
//
//   shared/types.ts との関係：
//     shared/types.ts  ← Admin・Customer 両方で使う共通の型
//     Admin/types.ts   ← Admin側だけで使う型（+ shared を re-export）
//
//   re-export とは？
//     他のファイルが Admin/types.ts だけを見れば
//     Registration 型も使えるように、
//     shared から読み込んで「そのまま外に公開」している。
//
// 📦 このファイルで定義している型
//
//   Registration        ← shared から re-export（Admin側でも使えるように）
//   NewRegistrationData ← 整理券を新規発行するときのデータ
//   UpdateStatusParams  ← ステータスを変更するときのパラメータ
//   RevertStatusParams  ← ステータスを1つ前に戻すときのパラメータ
//   StatusUpdateData    ← Firestoreに書き込む際の内部データ形式
//
// =====================================================

// shared/types.ts から Registration 型を読み込んで
// Admin/types.ts からも使えるように公開する（re-export）
import type { FieldValue } from 'firebase/firestore';
import type { Registration } from '../shared/types';
export type { Registration };

// =====================================================
// NewRegistrationData — 整理券の新規発行データ
// =====================================================
// Registration 型の中から、発行時に必要な項目だけを抜き出した型。
// id・startTime・endTime などは自動生成されるため含まない。
//
// 使用箇所：operations/registration.ts の createRegistration()
//
export type NewRegistrationData = Pick<
    Registration,
    'number' | 'status' | 'count' | 'difficulty' | 'day'
    //  ↑整理番号   ↑ステータス  ↑人数   ↑難易度        ↑日付モード
>;

// =====================================================
// UpdateStatusParams — ステータス変更のパラメータ
// =====================================================
// handleUpdateStatus() に渡す引数をまとめた型。
// 誰が・どのカードを・どのステータスに変えるかを記述する。
//
// 使用箇所：operations/registration.ts の updateStatus()
//
export interface UpdateStatusParams {
    id: string;                //変更対象のドキュメントID
    currentStatus: string;     //現在のステータス（変更前）
    clickedStatus: string;     //変更後のステータス（ボタンでクリックされたもの）
    targetRoom?: string;       //割り当てる部屋ID（部屋への案内時のみ必要）
    isRoomStaffRole: boolean;  //部屋スタッフ役割かどうか（操作制限の判定に使用）
    role: string;              //操作したスタッフの役割（"受付" / "部屋" / "管理者" / "幹部"） 
    userName: string;          //操作したスタッフの名前（lastUpdatedBy / assignedTo に記録される）
}

// =====================================================
// RevertStatusParams — ステータスを1つ前に戻すパラメータ
// =====================================================
// handleBackStatus() に渡す引数をまとめた型。
// 誤操作などでステータスを巻き戻すときに使用する。
//
// 使用箇所：operations/registration.ts の revertStatus()
//
export interface RevertStatusParams {
    id: string;             //変更対象のドキュメントID
    currentStatus: string;  //現在のステータス（巻き戻し前）
    statusOrder: string[];  //ステータスの順序定義（utils/constants.ts の STATUS_ORDER）
    role: string;           //操作したスタッフの役割
    userName: string;       //操作したスタッフの名前
}

// =====================================================
// StatusUpdateData — Firestore書き込み用の内部データ
// =====================================================
// updateDoc() で Firestore に書き込む際のデータ形式。
// Admin側の内部処理でのみ使用する（画面には直接表示しない）。
//
// 使用箇所：operations/registration.ts の内部処理
//
export interface StatusUpdateData {
    status: string;               //更新後のステータス
    statusChangedAt: FieldValue;  //ステータスが変わった時刻（serverTimestamp() のセンチネル値）
    lastUpdatedBy: string;        //最後に操作したスタッフ名
    assignedTo?: string | null;   //担当スタッフ名（null = 担当なし・未割当）
    room?: string;                //割り当てた部屋ID（部屋への案内時のみ）
    startTime?: Date;             //ゲーム開始時刻（"開始"ステータスへの変更時に記録）
    endTime?: Date | null;        //ゲーム終了時刻（"終了"ステータスへの変更時に記録・取消時は null）
    previousStatus?: string;      //「取消」にする直前のステータス（取消からの復帰に使用）
}
