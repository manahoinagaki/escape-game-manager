// =====================================================
// src/Customer/Customer.tsx — お客様向け画面
// =====================================================
//
// 📱 この画面の構成
//
//   ┌──────────────────────────┐
//   │  ヘッダー（タイトル・モード表示）   │
//   ├──────────────────────────┤
//   │                          │
//   │  メインコンテンツ             │
//   │  ・待ち状況タブ               │
//   │  ・謎解きタブ                │
//   │  ・遊び方タブ                │
//   │                          │
//   ├──────────────────────────┤
//   │  フッター（タブ切替・呼出バー）   │
//   └──────────────────────────┘
//
// 🔧 よく変更する箇所
//   ROOM_COUNT / DEFAULT_PLAY_TIME_MINUTES : ../shared/waitTime.ts を編集
//                       （Admin側と共有しているため、このファイルでは直接変更しない）
//   MAX_TEAM_NUMBER   : 整理番号の最大値（デフォルト: 80）
//   ヘッダーのタイトル : <h1>🏰 脱出ゲーム </h1> の部分
//   遊び方タブの内容  : activeTab === "guide" のブロック
//   ステータスごとのメッセージ : STATUS_MESSAGES（呼出・案内・準備・開始・終了・取消）
//
// =====================================================

import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, Timestamp } from 'firebase/firestore';
import { QUIZ_LIST } from './QuizData';
import type { QuizItem, Difficulty } from './QuizData';
import type { Registration, SystemInfo } from '../shared/types';
import {
    ROOM_COUNT,
    DEFAULT_PLAY_TIME_MINUTES,
    MINIMUM_SAMPLES_FOR_AVERAGE,
    calculateWaitTimeRange
} from '../shared/waitTime';
import './Customer.css';

// =====================================================
// 定数（変更可能）
// =====================================================
// 整理番号の最大値。これを超えると1周目の番号に戻して表示する（81→1, 87→7）
const MAX_TEAM_NUMBER = 80;

// 「呼出」のお客様向けの呼び方（バッジ・フッター・遊び方で共通して使う）
// 内部ステータスの「呼出」は「まもなく順番なので受付前に集まってもらう段階」を指す
const CALLED_LABEL = "まもなくご案内";

// ステータスごとにお客様へ表示するメッセージ（待機は専用レイアウトのため含まない）
// 🔧 文言を変えたい場合はここを編集する
//   badge : 番号の下に出るバッジ
//   tone  : 'call'（黄・点滅） / 'guide'（緑・点滅） / 'info'（枠のみ・点滅なし）
const STATUS_MESSAGES: Record<
    Exclude<Registration['status'], '待機'>,
    { badge: string; icon: string; title: string; body: string; tone: 'call' | 'guide' | 'info' }
> = {
    呼出: {
        badge: CALLED_LABEL,
        icon: "📢",
        title: "5号館 受付前へ！",
        body: "まもなく順番です。受付前までお越しのうえ、スタッフがお呼びするまでお待ちください。",
        tone: 'call'
    },
    案内: {
        badge: "ご案内中",
        icon: "🚪",
        title: "まもなく開始！",
        body: "スタッフがゲームエリアへご案内いたします。",
        tone: 'guide'
    },
    準備: {
        badge: "準備中",
        icon: "🔑",
        title: "お部屋で準備中です",
        body: "スタッフの説明をお聞きください。",
        tone: 'info'
    },
    開始: {
        badge: "プレイ中",
        icon: "💣",
        title: "ゲーム進行中！",
        body: "制限時間内の脱出を目指してください。",
        tone: 'info'
    },
    終了: {
        badge: "終了",
        icon: "🎉",
        title: "ご参加ありがとうございました！",
        body: "またのお越しをお待ちしております。",
        tone: 'info'
    },
    取消: {
        badge: "キャンセル済み",
        icon: "🚫",
        title: "この整理券はキャンセルされました",
        body: "お心当たりがない場合は、受付スタッフにお声がけください。",
        tone: 'info'
    }
};

// tone ごとのアラートカードのCSSクラス
const TONE_CLASS = {
    call: "call-alert highlight-anim",
    guide: "call-alert highlight-anim guide-bg",
    info: "call-alert info-bg"
};

// =====================================================
// ユーティリティ関数
// =====================================================
// 表示用の整理番号に変換する
// 例）81 → 1、87 → 7、80 → 80

const formatCustomerNumber = (num: number): number => {
    if (num <= MAX_TEAM_NUMBER) return num;
    const remain = num % MAX_TEAM_NUMBER;
    return remain === 0 ? MAX_TEAM_NUMBER : remain;
};

// Firestore Timestamp と Date のどちらでも Date に変換する
const toDate = (value: Timestamp | Date): Date =>
    value instanceof Date ? value : value.toDate();
// =====================================================
// メインコンポーネント
// =====================================================
function Customer() {
    // --------------------------------------------------
    // 状態管理（画面の状態を保持する変数）
    // --------------------------------------------------
    // Firestoreから取得した全登録データ
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    // お客様が入力した整理番号
    const [myNumber, setMyNumber] = useState<number | "">("");
    // 現在の日付モード（"1日目" / "2日目" / "テスト"）
    const [day, setDay] = useState("1日目");
    // 整理番号を入力して確認ボタンを押したかどうか
    const [signedUp, setSignedUp] = useState(false);
    // 現在表示中のタブ（"status" / "game" / "guide"）
    const [activeTab, setActiveTab] = useState<string>("status");

    // 謎解き関連の状態
    // 選択中の難易度（null = 未選択）
    const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
    // 現在表示中のクイズ
    const [nowQuiz, setNowQuiz] = useState<QuizItem | null>(null);
    // 現在の問題が難易度内で何問目か（0始まり）
    const [quizIndex, setQuizIndex] = useState(0);
    // 謎解きの進行状態（"selecting"=難易度選択中 / "playing"=回答中 / "result"=結果表示 / "complete"=全問クリア）
    const [quizStatus, setQuizStatus] = useState<'selecting' | 'playing' | 'result' | 'complete'>('selecting');
    // 正解したかどうか（null = まだ回答していない）
    const [correct, setCorrect] = useState<boolean | null>(null);
    // 記述式クイズのテキスト入力値
    const [userInput, setUserInput] = useState("");
    // 表示中のヒント段階（0=非表示 / 1=ヒント1まで / 2=ヒント2まで）
    const [hintLevel, setHintLevel] = useState(0);

    // --------------------------------------------------
    // Firestore リアルタイム同期
    // ページを開いている間、データが変わると自動的に画面も更新される
    // --------------------------------------------------
    useEffect(() => {

        // 全登録データを番号順に取得・監視
        const q = query(collection(db, "registrations"), orderBy("number", "asc"));
        const unsubRegs = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Registration[];
            setRegistrations(data);
        });

        // システム情報（日付モード）を取得・監視
        // Firestoreの "system_info/Waiting" ドキュメントを参照
        // （デフォルトプレイ時間は shared/waitTime.ts の DEFAULT_PLAY_TIME_MINUTES を
        //   Admin側と共通で使用するため、ここでは取得しない）
        const unsubSystem = onSnapshot(
            doc(db, "system_info", "Waiting"),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data() as SystemInfo;
                    setDay(data.Day || "1日目"); // デフォルト1日目
                }
            }
        );

        // 画面を閉じたときに監視を解除する
        return () => {
            unsubRegs();
            unsubSystem();
        };
    }, []); // [] = 画面が開いたときに1回だけ実行

    // =====================================================
    // 計算
    // =====================================================

    // 自分の整理番号に対応する登録データ
    // お客様が入力するのは表示用の番号（1〜MAX_TEAM_NUMBER）だが、内部では
    // 2周目以降が 81, 161... のように続き番号で登録されている。
    // 表示用番号が一致するもののうち、最新の周（内部番号が最大）を採用する。
    // （registrations は number の昇順なので、最後に一致したものが最新）
    // 入力値そのものは変換しない（81 などを入力しても 1 番と一致させないため）
    const isValidNumber =
        myNumber !== "" && myNumber >= 1 && myNumber <= MAX_TEAM_NUMBER;
    const myData = isValidNumber
        ? registrations
            .filter(r =>
                r.day === day &&
                formatCustomerNumber(r.number) === myNumber
            )
            .pop()
        : undefined;

    // 実績ベースの平均プレイ時間（分）を計算する
    // 終了済みデータが MINIMUM_SAMPLES_FOR_AVERAGE 件未満の場合はデフォルト値を使用
    // （Admin側の平均プレイ時間計算と同じ基準にすることで、スタッフ画面と
    //   お客様画面の待ち時間表示がずれないようにしている）
    // 1分以下・60分以上の異常値もデフォルト値に戻す
    const averagePlayTime = (() => {
        const finished = registrations.filter(r =>
            r.status === "終了" && r.startTime && r.endTime && r.day === day
        );

        if (finished.length < MINIMUM_SAMPLES_FOR_AVERAGE) return DEFAULT_PLAY_TIME_MINUTES;

        const totalMinutes = finished.reduce((acc, curr) => {
            const start = toDate(curr.startTime!);
            const end = toDate(curr.endTime!);
            return acc + (end.getTime() - start.getTime()) / (1000 * 60);
        }, 0);

        const avg = Math.round(totalMinutes / finished.length);
        return (avg > 1 && avg < 60) ? avg : DEFAULT_PLAY_TIME_MINUTES;
    })();

    // 待ち時間の情報を計算する（自分が「待機」中のみ）
    // 返り値：{ aheadCount: 前の組数, lowerBound: 下限(分), upperBound: 上限(分) }
    // 自分が待機中でない場合は null を返す
    const waitInfo = (() => {
        if (!myNumber || !myData || myData.status !== "待機") return null;

        // 異常値を防ぐため平均プレイ時間の上限を20分に設定
        const avg = Math.min(averagePlayTime, 20);

        // 自分より前に待機している組数
        const aheadCount = registrations.filter(r =>
            r.day === day &&
            r.status === "待機" &&
            Number(r.number) < Number(myData.number)
        ).length;

        // 現在プレイ中の組数
        const playingCount = registrations.filter(r =>
            r.day === day && r.status === "開始"
        ).length;

        // 待ち時間の計算
        let waitMin = (aheadCount / ROOM_COUNT) * avg;

        // 全部屋が埋まっている場合は追加で半分の時間を加算
        if (playingCount >= ROOM_COUNT) {
            waitMin += avg / 2;
        }

        // 上限チェック：前の組数 × 10分を超えないようにする
        const hardLimit = (aheadCount + 1) * 10;
        if (waitMin > hardLimit) waitMin = hardLimit;

        // 5分刻みで表示（例：12分 → 10〜15分）
        // Admin側と同じ calculateWaitTimeRange を使うことで、
        // レンジ幅を変更したときに両画面が一致した状態を保てる
        const [lowerBound, upperBound] = calculateWaitTimeRange(waitMin);

        return { aheadCount, lowerBound, upperBound };
    })();

    // =====================================================
    // 謎解き
    // =====================================================

    // 難易度の並び順（全問クリア後に次の難易度へ進むために使用）
    const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

    // 難易度を選んでクイズ開始（1問目から順番に出題）
    const startQuiz = (diff: Difficulty) => {
        const list = QUIZ_LIST[diff];
        setDifficulty(diff);
        setQuizIndex(0);
        setNowQuiz(list[0]);
        setQuizStatus('playing');
        setCorrect(null);
        setUserInput("");
        setHintLevel(0);
    };

    // 選択式：選択肢ボタンを押したときの正誤チェック
    const checkAnswer = (selected: string) => {
        setCorrect(selected === nowQuiz?.answer);
        setQuizStatus('result');
    };

    // 記述式：回答ボタンまたはEnterキーを押したときの正誤チェック
    // answer は「きいろ,キイロ,黄色」のようにカンマ区切りで複数の表記を許容する
    const checkInputAnswer = () => {
        if (!nowQuiz) return;
        const accepted = nowQuiz.answer.split(',').map(a => a.trim());
        setCorrect(accepted.includes(userInput.trim()));
        setQuizStatus('result');
        setUserInput("");
    };

    // 同じ問題をもう一度解く（正誤・ヒント状態をリセット）
    const retryQuiz = () => {
        setQuizStatus('playing');
        setCorrect(null);
        setUserInput("");
        setHintLevel(0);
    };

    // 次の問題へ進む（順番通り。最後の問題だったら全問クリア画面へ）
    const nextQuiz = () => {
        if (!difficulty) return;
        const list = QUIZ_LIST[difficulty];
        const nextIndex = quizIndex + 1;
        if (nextIndex < list.length) {
            setQuizIndex(nextIndex);
            setNowQuiz(list[nextIndex]);
            setQuizStatus('playing');
            setCorrect(null);
            setUserInput("");
            setHintLevel(0);
        } else {
            setQuizStatus('complete');
        }
    };

    // 同じ難易度をもう一度最初から挑戦する
    const retryAllQuiz = () => {
        if (!difficulty) return;
        startQuiz(difficulty);
    };

    // 次の難易度へ進む（1問目から）。最後の難易度なら難易度選択に戻る
    const goNextDifficulty = () => {
        if (!difficulty) return;
        const idx = DIFFICULTY_ORDER.indexOf(difficulty);
        const next = DIFFICULTY_ORDER[idx + 1];
        if (next) {
            startQuiz(next);
        } else {
            setQuizStatus('selecting');
        }
    };

    // =====================================================
    // ブラウザのテーマカラーをモードに合わせて更新
    // day が変わるたびに実行される
    // =====================================================
    useEffect(() => {
        const colors: Record<string, string> = {
            "1日目": "#7b8cde",
            "2日目": "#e94560",
            "テスト": "#ff9d00",
        };
        const color = colors[day] ?? "#1A1A2E";

        // <meta name="theme-color"> を更新（ブラウザのアドレスバーの色）
        let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = "theme-color";
            document.head.appendChild(meta);
        }
        meta.content = color;

        // html・body の背景色もモードカラーに統一
        document.body.style.backgroundColor = color;
        document.documentElement.style.backgroundColor = color;
    }, [day]);// day が変わるたびに実行
    // =====================================================
    // 画面描画
    // =====================================================
    return (
        // header-mode-${day} クラスでモード別の色テーマをCSSに伝える
        <div className={`app-container header-mode-${day}`}>

            {/* ===== ヘッダー ===== */}
            {/* クイズ回答中は header-mini クラスでコンパクト表示 */}
            <header className={`app-header ${quizStatus === 'playing' ? 'header-mini' : ''}`}>
                <h1>🏰 脱出ゲーム</h1>
                <div className="day-badge">{day}</div>
            </header>

            {/* ===== メインコンテンツ（ここだけスクロールする） ===== */}
            <main className="app-main">
                <div className="content-inner">

                    {/* ===== 待ち状況タブ ===== */}
                    {activeTab === "status" && (
                        <div className="tab-panel">
                            {/* 整理番号を未入力の場合 → 番号入力フォームを表示 */}
                            {!signedUp ? (
                                <div className="login-card">
                                    <h2>🎟️ 順番を確認する</h2>
                                    <p>整理券の番号を入力してください</p>
                                    <input
                                        type="number"
                                        min="0"
                                        pattern="\d*"
                                        value={myNumber}
                                        onChange={(e) => {
                                            const value = Math.max(0, Number(e.target.value));
                                            setMyNumber(value);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "-" || e.key === "e" || e.key === "+") {
                                                e.preventDefault();
                                            }
                                        }}
                                        placeholder="15"
                                    />
                                    <button
                                        className="login-btn"
                                        onClick={() => setSignedUp(true)}
                                    >
                                        状況を確認 →
                                    </button>
                                </div>
                            ) : (
                                // 整理番号入力済みの場合 → 状況を表示
                                <div className="status-section">
                                    {myData ? (
                                        <div className={`status-card status-${myData.status}`}>
                                            {/* 登録データが見つかった場合 */}
                                            {myData.status === "待機" ? (
                                                // 待機中
                                                <div className="waiting-layout">
                                                    <div className="number-display-small">
                                                        整理番号 No.<span>{formatCustomerNumber(myData.number)}</span>
                                                    </div>
                                                    <div className="wait-time-hero">
                                                        <p className="hero-label">ご案内までおよそ</p>
                                                        <div className="hero-time">
                                                            <span>
                                                                {waitInfo
                                                                    ? `${waitInfo.lowerBound}〜${waitInfo.upperBound}`
                                                                    : "?"}
                                                            </span>
                                                            分
                                                        </div>
                                                        <p className="hero-note">
                                                            順番が近づくと、この画面でお知らせします
                                                        </p>
                                                    </div>
                                                    {waitInfo && (
                                                        <p className="ahead-count">
                                                            あなたの前に <strong>{waitInfo.aheadCount}</strong> 組待機しています
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                // 待機以外：ステータスごとのメッセージを表示
                                                (() => {
                                                    const message = STATUS_MESSAGES[myData.status];
                                                    return (
                                                        <div className="action-layout">
                                                            <div className="number-display">
                                                                No.<span>{formatCustomerNumber(myData.number)}</span>
                                                            </div>
                                                            <div className="status-badge-text">{message.badge}</div>
                                                            <div className={TONE_CLASS[message.tone]}>
                                                                <div className="alert-icon">{message.icon}</div>
                                                                <h2>{message.title}</h2>
                                                                <p>{message.body}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            )}
                                        </div>
                                    ) : (
                                        <div className="status-card">
                                            <p>
                                                {isValidNumber
                                                    ? "番号が見つかりません"
                                                    : `No.${myNumber} は存在しません`}
                                            </p>
                                        </div>
                                    )}
                                    <button
                                        className="change-num-link"
                                        onClick={() => setSignedUp(false)}
                                    >
                                        整理番号を変更する
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== 謎解きタブ ===== */}
                    {activeTab === "game" && (
                        <div className="tab-panel game-panel">

                            {/* 難易度選択 */}
                            {quizStatus === 'selecting' && (
                                <div className="quiz-card">
                                    <h2>🧩 謎解き挑戦！</h2>
                                    <p>難易度を選んで挑戦してください</p>
                                    <div className="difficulty-buttons">
                                        <button className="diff-btn easy" onClick={() => startQuiz('easy')}>
                                            🟢 簡単
                                        </button>
                                        <button className="diff-btn normal" onClick={() => startQuiz('normal')}>
                                            🟡 普通
                                        </button>
                                        <button className="diff-btn hard" onClick={() => startQuiz('hard')}>
                                            🔴 難しい
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* クイズ回答画面 */}
                            {quizStatus === 'playing' && nowQuiz && (
                                <div className="quiz-card">
                                    <div className="quiz-header">
                                        <span className={`diff-badge ${difficulty}`}>
                                            {difficulty === 'easy' ? '初級' : difficulty === 'normal' ? '中級' : '上級'}
                                        </span>
                                        {/* 進行状況（例：3 / 5問） */}
                                        {difficulty && (
                                            <span className="quiz-progress">
                                                {quizIndex + 1} / {QUIZ_LIST[difficulty].length}問
                                            </span>
                                        )}
                                        {/* やめるボタン → 難易度選択に戻る */}
                                        <button
                                            className="back-link"
                                            onClick={() => setQuizStatus('selecting')}
                                        >
                                            やめる
                                        </button>
                                    </div>

                                    {/* 画像（imageUrl がある問題のみ表示） */}
                                    {nowQuiz.imageUrl && (
                                        <div className="quiz-image-container">
                                            <img
                                                src={nowQuiz.imageUrl}
                                                alt="クイズ画像"
                                                className="quiz-image"
                                            />
                                        </div>
                                    )}

                                    {/* 問題文 */}
                                    <div className="quiz-question">{nowQuiz.question}</div>

                                    {/* ヒント（hint1 がある問題のみ表示） */}
                                    {nowQuiz.hint1 && (
                                        <div className="quiz-hint-area">
                                            {hintLevel >= 1 && (
                                                <div className="hint-box">💡 ヒント1：{nowQuiz.hint1}</div>
                                            )}
                                            {hintLevel >= 2 && nowQuiz.hint2 && (
                                                <div className="hint-box">💡 ヒント2：{nowQuiz.hint2}</div>
                                            )}
                                            {hintLevel === 0 && (
                                                <button className="hint-btn" onClick={() => setHintLevel(1)}>
                                                    💡 ヒントを見る
                                                </button>
                                            )}
                                            {hintLevel === 1 && nowQuiz.hint2 && (
                                                <button className="hint-btn" onClick={() => setHintLevel(2)}>
                                                    💡 もう一つヒントを見る
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* 選択式：選択肢ボタンを表示 */}
                                    {nowQuiz.type === 'choice' ? (
                                        <div className="quiz-options">
                                            {nowQuiz.options?.map(opt => (
                                                <button
                                                    key={opt}
                                                    className="opt-btn"
                                                    onClick={() => checkAnswer(opt)}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        /* 記述式：テキスト入力欄を表示 */
                                        <div className="quiz-input-area">
                                            <input
                                                type="text"
                                                className="answer-input"
                                                placeholder="答えを入力してね"
                                                value={userInput}
                                                onChange={(e) => setUserInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && checkInputAnswer()}
                                            />
                                            <button className="login-btn" onClick={checkInputAnswer}>
                                                回答する
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 結果画面 */}
                            {quizStatus === 'result' && nowQuiz && (
                                <div className="quiz-card result-card">
                                    {/* 正解・不正解のアイコン */}
                                    <div className={`result-icon ${correct ? 'correct' : 'wrong'}`}>
                                        {correct ? '⭕️ 正解！' : '❌ 残念...'}
                                    </div>
                                    {/* 解説文 */}
                                    <div className="explanation-area">
                                        <p>{nowQuiz.explanation}</p>
                                    </div>
                                    <div className="result-buttons">
                                        <button className="next-quiz-btn" onClick={nextQuiz}>
                                            {difficulty && quizIndex + 1 < QUIZ_LIST[difficulty].length
                                                ? '次の問題へ →'
                                                : '結果を見る →'}
                                        </button>
                                        <button className="retry-btn" onClick={retryQuiz}>
                                            🔄 もう一度解く
                                        </button>
                                        <button
                                            className="quit-btn"
                                            onClick={() => setQuizStatus('selecting')}
                                        >
                                            難易度を変える
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 全問クリア画面 */}
                            {quizStatus === 'complete' && difficulty && (
                                <div className="quiz-card result-card">
                                    <div className="result-icon correct">🎉 おめでとうございます！</div>
                                    <div className="explanation-area">
                                        <p>
                                            {(difficulty === 'easy' ? '初級' : difficulty === 'normal' ? '中級' : '上級')}
                                            の全{QUIZ_LIST[difficulty].length}問をクリアしました！
                                        </p>
                                    </div>
                                    <div className="result-buttons">
                                        {DIFFICULTY_ORDER.indexOf(difficulty) + 1 < DIFFICULTY_ORDER.length && (
                                            <button className="next-quiz-btn" onClick={goNextDifficulty}>
                                                次の難易度へ →
                                            </button>
                                        )}
                                        <button className="retry-btn" onClick={retryAllQuiz}>
                                            🔄 もう一度挑戦する
                                        </button>
                                        <button
                                            className="quit-btn"
                                            onClick={() => setQuizStatus('selecting')}
                                        >
                                            難易度選択に戻る
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== 遊び方タブ ===== */}
                    {activeTab === "guide" && (
                        <div className="tab-panel">
                            <div className="guide-card">
                                <h2>📜 遊び方</h2>
                                <h3>1. 集合</h3>
                                <p>画面に「{CALLED_LABEL}」と表示されたら、5号館 受付前へお越しください。</p>
                                <h3>2. 制限時間</h3>
                                <p>・ご案内する際になってもお見えにならない場合は、キャンセル扱いとなり次のお客様をご案内させていただきます。
                                    ・キャンセルする場合は受付に必ずお申し出ください。</p>
                                <p>1プレイ最大10分間です。</p>
                                <h2>あらすじ</h2>
                                <p>大学祭に来たあなたは、ふと近くの教室に入るとそこには南京錠で閉ざされた箱に時限爆弾が!?
                                    カウントダウンはすでに始まっている...。
                                    生きて帰るには南京錠を開けてこの爆弾を止めるしかないようだ。あなたは、謎
                                    を解いてこの部屋から無事に脱出することはできますか?</p>
                                <h2>注意事項</h2>
                                <p>・場内は喫煙禁止です。</p>
                                <p>・場内は飲食禁止です。</p>
                                <p>・ゴミは指定の場所に分別して捨ててください。</p>
                                <p>・ゴミ箱は AITプラザ前、12号館前、愛和会館にあります。</p>
                                <p>・場内の備品を破損した場合、弁償してもらうことがあります。</p>
                                <p>・大学祭実行委員の指示に従ってください。従わずに生じた事故、トラブルに関して</p>
                                <p>大学祭実行委員会は一切責任を負いません。</p>
                                <p>・上記のことが守れない場合は退場してもらうことがあります</p>
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* ===== フッター ===== */}
            <footer className="app-footer">
                {/* タブ切り替えボタン */}
                <nav className="bottom-tabs">
                    <button
                        className={activeTab === "status" ? "tab-item active" : "tab-item"}
                        onClick={() => setActiveTab("status")}
                    >
                        <span className="tab-icon">🕒</span>
                        <span className="tab-label">待ち状況</span>
                    </button>
                    <button
                        className={activeTab === "game" ? "tab-item active" : "tab-item"}
                        onClick={() => setActiveTab("game")}
                    >
                        <span className="tab-icon">🧩</span>
                        <span className="tab-label">謎解き</span>
                    </button>
                    <button
                        className={activeTab === "guide" ? "tab-item active" : "tab-item"}
                        onClick={() => setActiveTab("guide")}
                    >
                        <span className="tab-icon">📜</span>
                        <span className="tab-label">遊び方</span>
                    </button>
                </nav>

                {/* 現在呼出中の番号を常時表示するバー */}
                <div className="calling-bar">
                    📢 {CALLED_LABEL}:
                    <span className="calling-numbers">
                        {registrations
                            .filter(r => r.day === day && r.status === "呼出")
                            .map(r => formatCustomerNumber(r.number))
                            .join("  ") || "なし"}
                    </span>
                </div>
            </footer>
        </div>
    );
}

export default Customer;
