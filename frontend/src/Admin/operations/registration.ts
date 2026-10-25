// =====================================================
// src/Admin/operations/registration.ts — Firestore操作
// =====================================================
//
// 📋 このファイルの役割
//
//   登録データに関するFirestore操作を集約する。
//   データの作成・更新・削除・日付モード変更を担う。
//
//   コンポーネント（Admin.tsx など）はこのファイルの
//   関数を呼ぶだけで Firestore を操作できる。
//
// 📦 このファイルで定義している関数
//
//   createRegistration  : 整理券を新規発行
//   updateStatus        : ステータスを変更（オートコール補充あり）
//   deleteAll           : 今日の全データを削除
//   revertStatus        : ステータスを1つ前に戻す
//   updateField         : 特定フィールドのみ更新
//   setDayMode          : 日付モードを変更（管理者・幹部のみ）
//
// 🔧 よく変更する箇所
//   MIN_CALLED_COUNT : 常に維持する呼出件数（現在4件）
//   ドキュメントID形式 : createRegistration の setDoc の第2引数
//   部屋の数・名前     : このファイルでは直接持たず、
//                        ../../shared/waitTime.ts の ROOM_IDS を参照している
//
// ⚠️ deleteAll() は不可逆（元に戻せない）
//   実行するとFirestore上の登録データが本当に消える。
//   イベント終了後に使う場合は、必ず export-registrations.mjs で
//   CSVに書き出した後に呼ぶこと（詳しくは運営マニュアル参照）。
//
// =====================================================

import { db } from '../../firebase';
import { ROOM_IDS } from '../../shared/waitTime';
import {
    doc,
    updateDoc,
    setDoc,
    deleteDoc,
    serverTimestamp,
    runTransaction
} from 'firebase/firestore';

// =====================================================
// TYPES
// =====================================================
import type {
    NewRegistrationData, /*新規登録データ*/
    UpdateStatusParams, /* ステータス更新パラメータ */
    RevertStatusParams, /* ステータス戻すパラメータ */
    StatusUpdateData, /* ステータス更新データ */
    Registration /* 登録データ */
} from '../types';

// =====================================================
// 内部定数
// =====================================================

/**
 * 常に維持する「呼出」の最低件数
 * ステータス変更後に呼出が不足していれば自動補充する
 * 🔧 呼出を常に何件維持するか変更したい場合はここを変更
 */

const MIN_CALLED_COUNT = 4;

// =====================================================
// 内部ヘルパー（このファイル内でのみ使用）
// =====================================================

/**
 * オートコール補充
 *
 * 案内中の最大番号 N に対して、N+1 から順番に確認し
 * 「待機中」の整理券が MIN_CALLED_COUNT 件呼出になるまで番号を増やす。
 *
 * 動作例（N=8、MIN_CALLED_COUNT=4）：
 *   N+1=9  → 呼出済み   → カウント1件目（変更なし）
 *   N+2=10 → 待機中    → 呼出へ ✅ カウント2件目
 *   N+3=11 → 呼出済み   → カウント3件目（変更なし）
 *   N+4=12 → 取消済み   → スキップ（カウントしない）
 *   N+5=13 → 存在しない → スキップ（カウントしない）
 *   N+6=14 → 案内済み   → スキップ（カウントしない）
 *   N+7=15 → 待機中    → 呼出へ ✅ カウント4件目 → 完了
 *
 * ※ N より前の待機中は対象外
 * ※ 候補が尽きた場合はそこで終了（4件未満でも無限ループしない）
 *
 * 案内中が0件の場合は番号の若い順から補充する（初期状態向け）。
 *
 * 🔧 補充件数を変えたい場合は MIN_CALLED_COUNT を変更する
 * 
 * @description
 * 現在の呼出件数が MIN_CALLED_COUNT を下回っている場合、
 * 待機中の番号が若い順に補充して呼出状態にする。
 * ステータス変更後に毎回呼び出すことで、常に最低4件の
 * 呼出を維持する。
 *
 * @param todayRegistrations - 今日の全登録（最新状態を渡すこと）
 */
const fillCalledQueue = async (todayRegistrations: Registration[]): Promise<void> => {

    // --------------------------------------------------
    // 案内中の最大番号を取得する
    // --------------------------------------------------
    const guidingNumbers = todayRegistrations
        .filter(r => r.status === "案内")
        .map(r => r.number);

    // 案内中が0件の場合は従来通り番号の若い順から補充
    if (guidingNumbers.length === 0) {
        const currentCalledCount = todayRegistrations.filter(r => r.status === "呼出").length;
        if (currentCalledCount >= MIN_CALLED_COUNT) return;
        const shortage = MIN_CALLED_COUNT - currentCalledCount;
        const waitingList = todayRegistrations
            .filter(r => r.status === "待機")
            .sort((a, b) => a.number - b.number)
            .slice(0, shortage);
        if (waitingList.length === 0) return;
        await Promise.all(
            waitingList.map(reg =>
                updateDoc(doc(db, "registrations", reg.id), {
                    status: "呼出",
                    statusChangedAt: serverTimestamp(),
                    lastUpdatedBy: "システム(自動)"
                })
            )
        );
        return;
    }

    const maxGuidingNumber = Math.max(...guidingNumbers);

    // --------------------------------------------------
    // N+1 以降を順番に確認し、呼出中・待機中をカウントして
    // 合計が MIN_CALLED_COUNT になるまで続ける
    //
    // カウント対象  : 呼出中（変更なし） / 待機中（→ 呼出へ変更）
    // スキップのみ  : 取消済み / 存在しない / 案内以降のステータス
    // --------------------------------------------------
    const regByNumber = new Map<number, Registration>(
        todayRegistrations.map(r => [r.number, r])
    );

    let count = 0;
    const toCall: Registration[] = [];
 
    const MAX_SEARCH = 200; // 無限ループ防止の上限
    for (let offset = 1; offset <= MAX_SEARCH && count < MIN_CALLED_COUNT; offset++) {
        const candidate = regByNumber.get(maxGuidingNumber + offset);
 
        if (!candidate) continue; // 存在しない番号 → スキップ（カウントしない）
 
        if (candidate.status === "呼出") {
            // 呼出済み → カウントするが変更不要
            count++;
            continue;
        }
 
        if (candidate.status === "待機") {
            // 待機中 → 呼出へ変更してカウント
            toCall.push(candidate);
            count++;
            continue;
        }
 
        // 取消・案内・準備・開始・終了 → スキップ（カウントしない）
    }
 
    if (toCall.length === 0) return;
 
    await Promise.all(
        toCall.map(reg =>
            updateDoc(doc(db, "registrations", reg.id), {
                status: "呼出",
                statusChangedAt: serverTimestamp(),
                lastUpdatedBy: "システム(自動)"
            })
        )
    );
};

/**
 * 部屋の排他ロックを取得する
 *
 * @description
 * "room_locks/{部屋名}" ドキュメントをFirestoreトランザクションで
 * 読み書きすることで、2人のスタッフがほぼ同時に同じ部屋を選んでも
 * どちらか一方だけが成功するようにする（表示上の空き判定だけでは
 * 2人が同時に確認すると両方とも「空いている」と見えてしまうため）。
 * 既に自分自身が保持している場合は成功扱いにする。
 *
 * ロックは1部屋につき2枠ある：
 *   occupiedBy  : プレイ中の組（「開始」）
 *   preparingBy : 次の組（「準備」）
 * 前の組がプレイ中でも、次の組を1組だけ「準備」として確保できる。
 * 「開始」にするときは preparingBy から occupiedBy へ移る。
 *
 * @returns 取得前のロック状態（直後の書き込みが失敗したときの巻き戻し用）
 * @throws 他の組がすでにその枠を確保している場合
 *         準備枠 → Error('ROOM_TAKEN') / プレイ枠 → Error('ROOM_PLAYING')
 */
type RoomLockSlot = 'preparing' | 'playing';
interface RoomLockState {
    occupiedBy: string | null;
    preparingBy: string | null;
}

const readRoomLock = (data: Partial<RoomLockState> | undefined): RoomLockState => ({
    occupiedBy: data?.occupiedBy ?? null,
    preparingBy: data?.preparingBy ?? null
});

const acquireRoomLock = async (roomId: string, regId: string, slot: RoomLockSlot): Promise<RoomLockState> => {
    const lockRef = doc(db, 'room_locks', roomId);
    return runTransaction(db, async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        const before = readRoomLock(lockSnap.data() as Partial<RoomLockState> | undefined);
        const next = { ...before };

        if (slot === 'preparing') {
            if (before.preparingBy && before.preparingBy !== regId) {
                throw new Error('ROOM_TAKEN');
            }
            next.preparingBy = regId;
        } else {
            if (before.occupiedBy && before.occupiedBy !== regId) {
                throw new Error('ROOM_PLAYING');
            }
            next.occupiedBy = regId;
            // 準備枠から移ってきた場合は準備枠を空ける（次の組が入れるように）
            if (before.preparingBy === regId) next.preparingBy = null;
        }

        transaction.set(lockRef, { ...next, updatedAt: serverTimestamp() });
        return before;
    });
};

/**
 * 部屋の排他ロックを解放する（自分が保持している枠のみ）
 *
 * @param restoreTo - 指定した場合、解放ではなくこの状態へ巻き戻す
 *                    （自分が保持している枠だけを対象にする）
 */
const releaseRoomLock = async (
    roomId: string | undefined,
    regId: string,
    restoreTo?: RoomLockState
): Promise<void> => {
    if (!roomId) return;
    const lockRef = doc(db, 'room_locks', roomId);
    try {
        await runTransaction(db, async (transaction) => {
            const lockSnap = await transaction.get(lockRef);
            const current = readRoomLock(lockSnap.data() as Partial<RoomLockState> | undefined);
            const next = { ...current };
            if (current.occupiedBy === regId) {
                next.occupiedBy = restoreTo?.occupiedBy === regId ? regId : null;
            }
            if (current.preparingBy === regId) {
                next.preparingBy = restoreTo?.preparingBy === regId ? regId : null;
            } else if (!current.preparingBy && restoreTo?.preparingBy === regId) {
                next.preparingBy = regId;
            }
            if (next.occupiedBy !== current.occupiedBy || next.preparingBy !== current.preparingBy) {
                transaction.set(lockRef, { ...next, updatedAt: serverTimestamp() });
            }
        });
    } catch (error) {
        console.error('部屋ロックの解放に失敗:', error);
    }
};

const ROOM_HOLDING_STATUSES = ['準備', '開始'];

// =====================================================
// 公開関数
// =====================================================

/**
 * 新規登録を作成
 *
 * @description
 * 新しい組の登録を作成し、Firestoreに保存する。
 * ドキュメントID は "${day}_fullno_${number}" 形式で固定
 * （"fullno" は整理券番号＝displayNumberではなく内部の連番という意味。
 *   day を含めることで1日目・2日目で同じ番号が衝突しないようにしている）。
 * 作成後、呼出が MIN_CALLED_COUNT を下回っていれば
 * この登録も含めて自動補充する。
 *
 * @param data               - 発行する登録データ（番号・ステータス・人数・難易度・日付）
 * @param todayRegistrations - 今日の全登録（オートコール補充用）
 */
export const createRegistration = async (
    data: NewRegistrationData,
    todayRegistrations: Registration[]
): Promise<void> => {
    const id = `${data.day}_fullno_${data.number}`;
    try {
        await setDoc(doc(db, "registrations", id), {
            ...data,
            createdAt: serverTimestamp(),
            statusChangedAt: serverTimestamp()
        });

        // 発行した登録をローカルで反映してから補充判定する
        // （同じ番号の古いデータが残っていた場合は置き換える）
        await fillCalledQueue([
            ...todayRegistrations.filter(r => r.id !== id),
            { ...data, id }
        ]);
    } catch (error) {
        console.error('Failed to create registration:', error);
        throw error;
    }
};

/**
 * ステータスを更新
 *
 * @description
 * 登録のステータスを更新し、必要に応じて以下の処理も実行:
 * - 同じステータスをクリックした場合 → 「待機」に戻す
 * - 担当者（assignedTo）の自動セット・クリア
 * - 部屋の割り当て（targetRoom / 部屋スタッフ役割）
 * - 開始時刻・終了時刻の記録
 * - オートコール補充（呼出を MIN_CALLED_COUNT 件維持）
 *
 * @param params                         - 更新パラメータ
 * @param todayRegistrations - 今日の全登録（オートコール用）
 */
export const updateStatus = async (
    params: UpdateStatusParams,
    todayRegistrations: Registration[]
): Promise<void> => {
    const {
        id,
        currentStatus,
        clickedStatus,
        targetRoom,
        isRoomStaffRole,
        role,
        userName
    } = params;

    // 同じステータスをクリックした場合は「待機」に戻す
    const newStatus = currentStatus === clickedStatus ? "待機" : clickedStatus;

    // 現在の登録データを取得（assignedTo の現在値確認用）
    const currentReg = todayRegistrations.find(r => r.id === id);
    const currentAssignedTo = currentReg?.assignedTo ?? null;

    const updateData: StatusUpdateData = {
        status: newStatus,
        statusChangedAt: serverTimestamp(),
        lastUpdatedBy: `${role}(${userName})`
    };

    // --------------------------------------------------
    // 担当者（assignedTo）の管理
    // --------------------------------------------------
    // assignedTo の管理
    if (newStatus === "待機" || newStatus === "終了" || newStatus === "取消") {
        // 終了・取消・待機戻し → 担当をクリア
        updateData.assignedTo = null;
    } else if (newStatus === "案内" && !currentAssignedTo) {
        // 案内 かつ 担当者未設定 → 操作者を担当にセット
        // （「呼出」は受付前に集まってもらう段階なので担当は付けない。
        //   自動呼出・手動呼出のどちらでも担当なしで揃える）
        updateData.assignedTo = userName;
    }
    // それ以外（呼出、担当者が既にいる場合など）→ assignedTo をupdateDataに含めない＝維持

    // --------------------------------------------------
    // 取消からの復帰用に、取消にする直前のステータスを記録する
    // （STATUS_ORDER に「取消」が含まれないため、1つ戻すボタンで
    //   通常の順序を辿れない。このフィールドを見て元の状態に戻す）
    // --------------------------------------------------
    if (newStatus === "取消") {
        updateData.previousStatus = currentStatus;
    }

    // --------------------------------------------------
    // 部屋の割り当て
    // --------------------------------------------------
    const roomToAssign = targetRoom || (isRoomStaffRole && (newStatus === "開始" || newStatus === "準備") ? role : null);
    if (roomToAssign) {
        updateData.room = roomToAssign;
    }

    // --------------------------------------------------
    // 時刻の記録
    // --------------------------------------------------
    if (newStatus === "開始") updateData.startTime = new Date(); // ゲーム開始時刻
    if (newStatus === "終了") updateData.endTime = new Date();   // ゲーム終了時刻

    // --------------------------------------------------
    // 部屋の排他ロック（取得は書き込みの前に）
    // 2人のスタッフがほぼ同時に同じ部屋を選んでも、どちらか一方だけが
    // 成功するようにする（表示上の空き判定はすり抜けうるため）。
    // 取得に失敗した場合はステータス自体の更新も行わず、呼び出し元に
    // エラーを伝えて別の部屋を選び直してもらう。
    //
    // 「準備」は準備枠、「開始」はプレイ枠を取得する。
    // 前の組がプレイ中でも準備枠は別なので、次の組を1組だけ確保できる。
    // 「開始」は部屋スタッフ以外が押した場合も、割当済みの部屋で
    // 準備枠 → プレイ枠へ移す（準備枠を次の組のために空ける）。
    // --------------------------------------------------
    const lockSlot: RoomLockSlot | null =
        newStatus === "準備" ? 'preparing' : newStatus === "開始" ? 'playing' : null;
    const roomToLock = lockSlot === 'playing' ? (roomToAssign || currentReg?.room) : roomToAssign;
    let lockBefore: RoomLockState | null = null;
    if (lockSlot && roomToLock) {
        lockBefore = await acquireRoomLock(roomToLock, id, lockSlot);
    }

    // ステータスを更新(Firestore に書き込む)
    // ロック取得の直後にこの書き込みがネットワーク瞬断などで失敗すると、
    // 「ロックは確保済みだが登録データ上は一度もその部屋に入っていない」
    // という幽霊ロックが残り、以後誰もその部屋を使えなくなってしまう
    // （表示は空きに見えるのに常にROOM_TAKENで弾かれる状態として実際に発生した）。
    // 取得直後の書き込みが失敗した場合は、今取得したロックを解放してから
    // 元のエラーを呼び出し元に伝える。
    try {
        await updateDoc(doc(db, "registrations", id), updateData);
    } catch (error) {
        if (lockBefore && roomToLock) {
            // 取得前の状態へ巻き戻す（もともと持っていた枠は残す）
            await releaseRoomLock(roomToLock, id, lockBefore);
        }
        throw error;
    }

    // --------------------------------------------------
    // 部屋の解放は自分自身のステータス書き込みが終わった"後"に行う。
    // 先に解放してしまうと、「ロック上は空き」なのに「登録データ上は
    // まだ開始中でその部屋にいる」という矛盾した一瞬が生まれ、その隙を
    // 突いて別チームが同じ部屋を確保できてしまう（実際に7人同時稼働の
    // 負荷テストで再現した二重割当ての原因）。
    // --------------------------------------------------
    if (ROOM_HOLDING_STATUSES.includes(currentStatus) && !ROOM_HOLDING_STATUSES.includes(newStatus)) {
        // 準備・開始 から離れる（終了・取消など）→ 部屋を解放
        await releaseRoomLock(currentReg?.room, id);
    }

    // --------------------------------------------------
    // オートコール補充
    // 変更後の状態をローカルで反映してから補充判定する
    // --------------------------------------------------
    const updatedRegistrations = todayRegistrations.map(r =>
        r.id === id ? { ...r, status: newStatus } : r
    );
    await fillCalledQueue(updatedRegistrations);
};

/**
 * 今日の全登録データを削除する
 *
 * @description
 * 今日の登録データを全て削除（確認ダイアログ付き）
 * 管理者のみ呼び出せる（Admin.tsx の canDeleteAll で制御）。
 *
 * @param registrations - 削除対象の登録一覧
 */
export const deleteAll = async (registrations: Registration[]): Promise<void> => {
    if (!window.confirm("表示中の日の全データを削除します。よろしいですか？")) {
        return;
    }

    try {
        await Promise.all([
            ...registrations.map((registration: Registration) =>
                deleteDoc(doc(db, "registrations", registration.id))
            ),
            // 部屋ロックも一緒に解放する。
            // これをしないと、リセット時に「準備」「開始」中だった部屋が
            // 誰も使っていないのにロックされたまま残り、
            // 次の日・次のテストで永久に予約不可になってしまう。
            ...ROOM_IDS.map((roomId) =>
                setDoc(doc(db, "room_locks", roomId), { occupiedBy: null, preparingBy: null, updatedAt: serverTimestamp() })
            )
        ]);
    } catch (error) {
        console.error('Failed to delete registrations:', error);
        throw error;
    }
};

/**
 * 1つ前のステータスに戻す
 *
 * @description
 * STATUS_ORDER の順序を参照して、現在の1つ前のステータスに変更する。
 * 「待機」より前には戻れない。
 * 「取消」の場合は STATUS_ORDER に含まれないため、
 * 取消にする直前に記録した previousStatus（なければ「待機」）に復帰する。
 * 戻した後も呼出の最低件数を維持するため補充処理を実行する。
 *
 * @param params             - 戻す操作のパラメータ
 * @param todayRegistrations - 今日の全登録（オートコール補充・取消復帰用）
 */
export const revertStatus = async (
    params: RevertStatusParams,
    todayRegistrations?: Registration[]
): Promise<void> => {
    const { id, currentStatus, statusOrder, role, userName } = params;

    let previousStatus: string;

    if (currentStatus === "取消") {
        // 取消からの復帰：取消にする直前のステータスへ（記録がなければ「待機」）
        const currentReg = todayRegistrations?.find(r => r.id === id);
        previousStatus = currentReg?.previousStatus || "待機";
    } else {
        const currentIndex = statusOrder.indexOf(currentStatus);
        if (currentIndex <= 0) return; // 「待機」より前には戻れない
        previousStatus = statusOrder[currentIndex - 1];
    }

    const updateData: StatusUpdateData = {
        status: previousStatus,
        statusChangedAt: serverTimestamp(),
        lastUpdatedBy: `${role}(${userName})が戻しました`
    };

    // 待機に戻す場合は担当者クリア
    if (previousStatus === "待機") updateData.assignedTo = null;
    // 開始 → 準備 に戻す場合は終了時刻をクリア
    if (previousStatus === "開始") updateData.endTime = null;
    // 準備 → 案内 に戻す場合は部屋割り当てをクリアする
    const roomBeforeRevert = todayRegistrations?.find(r => r.id === id)?.room;
    if (previousStatus === "案内") {
        updateData.room = undefined;
    }

    await updateDoc(doc(db, "registrations", id), updateData);

    // 部屋ロックの解放は自分自身の書き込みが終わった後に行う（updateStatus と同じ理由）
    if (previousStatus === "案内") {
        await releaseRoomLock(roomBeforeRevert, id);
    }

    // 戻した後も補充判定（todayRegistrations が渡された場合のみ）
    if (todayRegistrations) {
        const updatedRegistrations = todayRegistrations.map(r =>
            r.id === id ? { ...r, status: previousStatus } : r
        );
        await fillCalledQueue(updatedRegistrations);
    }
};

/**
 * フィールドを更新
 *
 * @description
 * 人数・難易度・担当者（assignedTo）などの単一フィールドを更新する。
 * ステータス変更と異なりオートコール補充は行わない。
 *
 * @param id - 登録ID
 * @param field - フィールド名（"count" / "difficulty" / "assignedTo" など）
 * @param value - 新しい値
 */
export const updateField = async (
    id: string,
    field: string,
    value: string | number | null
): Promise<void> => {
    try {
        await updateDoc(doc(db, "registrations", id), { [field]: value });
    } catch (error) {
        console.error('Failed to update field:', error);
        throw error;
    }
};

/**
 * システム全体の日付モードを変更する
 *
 * @description
 * "system_info/Waiting" ドキュメントの Day フィールドを更新する。
 * 管理者・幹部のみ実行可能。全端末に即時反映される。
 *
 * @param newDay - 新しい日モード（"1日目" / "2日目" / "テスト"）
 * @param role   - 現在の役割（管理者・幹部以外は何もしない）
 */
export const setDayMode = async (
    newDay: string,
    role: string
): Promise<void> => {
    if (role !== "管理者" && role !== "幹部") return;

    if (!window.confirm(`全端末を「${newDay}」に切り替えますか？`)) {
        return;
    }

    await setDoc(doc(db, "system_info", "Waiting"), { Day: newDay }, { merge: true });
};
