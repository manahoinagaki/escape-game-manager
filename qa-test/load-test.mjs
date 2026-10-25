// =====================================================
// load-test.mjs — 11人体制を想定した並行運用シミュレーション
// =====================================================
//
// 何をするか:
//   複数の「スタッフ」を別々のブラウザセッションとして同時に動かし、
//   実際の当日に近い状況（受付が発行し続ける・複数の案内担当が
//   同時に別のチームを進める）を再現する。
//
//   - 受付役：一定間隔で整理券を発行し続ける
//   - 案内担当役（複数）：呼出中のチームを見つけて
//     案内→準備（部屋割当）→開始→終了 まで進める、を繰り返す
//   - その間、「呼出中の組数」を定期的に記録し、
//     オートコール補充（常に約4件を維持する仕組み）が
//     機能しているか確認する
//   - 部屋の二重割当てが起きていないかもチェックする
//
// 安全のため:
//   日付モードは既定で「リハーサル」を使う（本番データに触れない）。
//   終了時に自動で「全リセ」する。
//
// 使い方:
//   node load-test.mjs
//   TICKETS=20 WORKERS=3 TARGET_URL=http://localhost:5173 node load-test.mjs
//
// =====================================================

import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = (process.env.TARGET_URL || 'http://localhost:5173').replace(/\/$/, '');
const ADMIN_URL = `${BASE}/admin`;
const DAY_MODE = process.env.DAY_MODE || 'リハーサル';
const PASS = '1234';
const NUM_TICKETS = parseInt(process.env.TICKETS || '15', 10);
const NUM_WORKERS = parseInt(process.env.WORKERS || '3', 10);
const PLAY_TIME_MS = parseInt(process.env.PLAY_TIME_MS || '2500', 10); // 実際の10分プレイを短縮して再現
const WORKER_NAMES = ['スタッフG', 'スタッフH', 'スタッフA', 'スタッフF', 'スタッフM', '脱出'];

const SHOT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'shots-load');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const errors = []; // { source, text }
const roomSnapshots = []; // 部屋の二重割当てチェック用
const calledCountLog = []; // 呼出中組数の推移
const lockDebugLog = []; // [DEBUG_LOCK] 部屋ロックの取得・拒否ログ（原因調査用、一時的）

function log(...args) { console.log(...args); }

// 「No.<n>」というテキストを持つ登録カードを1つ返す locator（整理番号は不変なので安定して特定できる）
function cardByNumber(page, n) {
  return page.locator('.reg-card').filter({
    has: page.locator('.reg-no', { hasText: new RegExp(`^No\\.${n}$`) }),
  });
}

async function newTestContext(browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem('admin-guide-v1', 'done'); // CoachMark無効化
  });
  return context;
}

function attachErrorListeners(page, label) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Encountered two children with the same key')) return; // 既知の軽微な警告は除外
      if (text.includes('status of 409')) return; // 部屋ロックのトランザクション競合時に出る正常な副産物（実害なし）
      if (text.includes('[DEBUG_LOCK]')) {
        lockDebugLog.push(`[${label}] ${text.slice(0, 200)}`);
        return; // 通常のエラー集計とは分けて記録する
      }
      errors.push({ source: label, text: text.slice(0, 200) });
    }
  });
  page.on('pageerror', err => errors.push({ source: label, text: err.message }));
}

async function loginAs(page, role, userName) {
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#role-select', { timeout: 30000 });

  const skipAllBtn = page.locator('.coach-btn-skip-all');
  if (await skipAllBtn.count() > 0) await skipAllBtn.click();

  page.on('dialog', async dialog => {
    await dialog.accept(dialog.type() === 'prompt' ? PASS : undefined);
  });

  await page.selectOption('#role-select', role);
  await page.waitForTimeout(400);
  if (userName) {
    await page.selectOption('#name-select', userName).catch(() => {});
    await page.waitForTimeout(300);
  }
}

// ===== 受付ワーカー：整理券を発行し続ける =====
async function receptionWorker(browser) {
  const context = await newTestContext(browser);
  const page = await context.newPage();
  attachErrorListeners(page, '受付');

  await loginAs(page, '管理者', '脱出'); // 日付モード変更に管理者権限が必要
  await page.selectOption('#day-select', DAY_MODE);
  await page.waitForTimeout(800);
  await page.locator('#tab-すべて').click();
  await page.waitForTimeout(300);

  log(`[受付] 日付モードを「${DAY_MODE}」に設定`);

  // 管理者→受付に戻す（発行操作は受付権限で十分なため、実運用に近づける）
  await page.selectOption('#role-select', '受付');
  await page.waitForTimeout(300);

  // 「新規発行カード」はレイアウト設定（ユーザーごとにヘッダー常時表示/タブ切替/非表示を
  // 選べる機能）次第でヘッダーに出ず、「発行」タブの中にしか無い場合がある。
  // その場合は .add-btn がDOM上に存在せず、クリックが永久にタイムアウトしてしまうため、
  // 先に .add-btn が見えているか確認し、無ければ発行タブを開く。
  const addBtnVisible = await page.locator('.add-btn').isVisible().catch(() => false);
  if (!addBtnVisible) {
    const issueTab = page.locator('#tab-issueCard');
    if (await issueTab.count() > 0) {
      log('[受付] 「新規発行カード」がヘッダーに無いため、発行タブを開きます');
      await issueTab.click();
      await page.waitForTimeout(300);
    }
  }

  let issued = 0;
  for (let i = 0; i < NUM_TICKETS; i++) {
    const disabled = await page.locator('.add-btn').isDisabled().catch(() => false);
    if (disabled) {
      log('[受付] これ以上発行できません（発行可能な番号なし）');
      break;
    }
    try {
      await page.locator('.add-btn').click();
    } catch (e) {
      // 原因調査用：失敗した瞬間の画面を保存する
      const shotPath = path.join(SHOT_DIR, `add-btn-fail-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      log(`[受付] .add-btn クリック失敗。スクリーンショット保存先: ${shotPath}`);
      log(`[受付] 現在のURL: ${page.url()}`);
      const btnCount = await page.locator('.add-btn').count().catch(() => -1);
      const btnVisible = await page.locator('.add-btn').isVisible().catch(() => 'unknown');
      log(`[受付] .add-btn の要素数: ${btnCount} / 表示状態: ${btnVisible}`);
      throw e;
    }
    issued++;
    log(`[受付] ${issued}/${NUM_TICKETS} 件発行`);
    await page.waitForTimeout(400 + Math.random() * 400); // 実際の受付作業のばらつきを模擬
  }

  // 「発行」タブを開いたままだと登録カード一覧（.reg-card）が表示されず、
  // 以降の手動呼出ループが対象0件のまま空振りしてしまうため、
  // カード一覧が見える「すべて」タブに戻す。
  if (!addBtnVisible) {
    await page.locator('#tab-すべて').click();
    await page.waitForTimeout(300);
  }

  // 重要: オートコール補充（常に約4件を「呼出」に維持する仕組み）は、
  // 誰かが手動で「呼出」操作をした"後"にしか働かない。発行しただけでは
  // 何も呼び出されないため、実際の受付と同じく最初の数件は手動で呼び出す。
  log('[受付] 最初の呼出（オートコール補充のきっかけ作り）');
  const allCards = page.locator('.reg-card');
  const cardCount = await allCards.count();
  let calledSoFar = 0;
  for (let i = 0; i < cardCount && calledSoFar < 4; i++) {
    const card = allCards.nth(i);
    const isWaiting = await card.locator('.status-btn.btn-呼出.btn-active').count() === 0
      && await card.locator('.status-btn.btn-案内.btn-active').count() === 0
      && await card.locator('.status-btn.btn-準備.btn-active').count() === 0
      && await card.locator('.status-btn.btn-開始.btn-active').count() === 0
      && await card.locator('.status-btn.btn-終了.btn-active').count() === 0
      && await card.locator('.status-btn.btn-取消.btn-active').count() === 0;
    if (isWaiting) {
      await card.locator('.status-btn.btn-呼出').click();
      calledSoFar++;
      await page.waitForTimeout(300);
    }
  }
  log(`[受付] ${calledSoFar}件を手動で呼出（以降はオートコール補充に任せる）`);

  return { page, context, issued };
}

// ===== 案内担当ワーカー：呼出中のチームを見つけて最後まで進める =====
async function guideWorker(browser, workerId, userName, claimed, doneCounter) {
  const context = await newTestContext(browser);
  const page = await context.newPage();
  attachErrorListeners(page, `案内${workerId}(${userName})`);

  await loginAs(page, '担当', userName);
  await page.waitForTimeout(500);
  await page.locator('#tab-すべて').click();
  await page.waitForTimeout(300);

  let emptyStreak = 0;
  // これ以上「処理対象なし」が続いたら終了。
  // 受付は「全件発行し終えてから」最初の呼出をするため、発行数が多いほど
  // 案内担当が最初の呼出を待つ時間も伸びる。固定値(8秒)だと発行数が多い
  // ときに案内担当が呼出される前に諦めて全員退場し、完了数0のまま
  // 終わってしまう（アプリのバグではなく、このテストの待ち時間不足）。
  const MAX_EMPTY_STREAK = Math.max(15, NUM_TICKETS * 2);

  while (emptyStreak < MAX_EMPTY_STREAK) {
    // 呼出中で、まだ誰も着手していないカードを探す（このクエリは候補探しのみに使う）
    const calledCards = page.locator('.reg-card').filter({ has: page.locator('.status-btn.btn-呼出.btn-active') });
    const count = await calledCards.count();
    let targetNum = null;

    for (let i = 0; i < count; i++) {
      const numText = await calledCards.nth(i).locator('.reg-no').textContent().catch(() => '');
      const num = numText.replace(/[^\d]/g, '');
      if (num && !claimed.has(num)) {
        claimed.add(num);
        targetNum = num;
        break;
      }
    }

    if (!targetNum) {
      emptyStreak++;
      await page.waitForTimeout(1000);
      continue;
    }
    emptyStreak = 0;

    // 以降はステータスが変わっても同じチームを指し続けるよう、
    // 整理番号（不変の値）でカードを特定する。
    // ※ ステータスで絞り込んだロケータをまたいで使い回すと、
    //    ステータスが変わった瞬間に別のカード（または該当なし）を
    //    指してしまい、以降の操作がハングするバグがあったため修正済み。
    const target = cardByNumber(page, targetNum);

    try {
      await target.locator('.status-btn.btn-案内').click();
      await page.waitForTimeout(500);

      // 部屋が空くまで、準備ボタンを再試行する（実際の「空くまで待つ」を再現）
      //
      // 注意: 部屋ボタンをクリックしても、その裏で acquireRoomLock が
      // ROOM_TAKEN で拒否している可能性がある（表示上は空きに見えても、
      // 別のスタッフがほぼ同時に確保済みだった場合）。クリックが通った
      // ことと実際に確保できたことは別なので、"準備" ステータスに本当に
      // 遷移したかを確認してから成功とみなす。確認せず先に進むと、
      // このチームは実際には「案内」のままなのに「開始」を押すことになり、
      // 「開始」ボタンが無効のままクリックが30秒タイムアウトして脱落する
      // （ロック自体は正しく機能しているのに、テストの方が拒否後に
      //   別の部屋へ再試行しないのが原因で起きる見かけ上のバグ）。
      let roomAssigned = false;
      let roomAttempt = 0;
      const roomWaitStart = Date.now();
      const ROOM_WAIT_TIMEOUT_MS = 20000;
      while (!roomAssigned && Date.now() - roomWaitStart < ROOM_WAIT_TIMEOUT_MS) {
        await target.locator('.status-btn.btn-準備').click();
        await page.waitForTimeout(400);
        const roomPicker = target.locator('.reg-room-picker');
        const roomButtons = roomPicker.locator('.reg-room-picker-btn:not(.occupied)');
        const availableCount = await roomButtons.count();
        if (availableCount === 0) {
          await roomPicker.locator('.reg-room-picker-cancel').click().catch(() => {});
          await page.waitForTimeout(1000);
          continue;
        }
        // 毎回「表示上の先頭」だけを狙うと、複数ワーカーが同じ部屋に殺到し続けて
        // Firestoreへの取得トランザクションが延々と競合し（429過多エラーの原因に
        // なった）、いつまでも成功しない。候補を順番にずらして別の部屋も試す。
        const pick = roomAttempt % availableCount;
        const roomButton = roomButtons.nth(pick);
        const roomLabel = await roomButton.locator('.picker-room-name').textContent();
        await roomButton.click();
        await page.waitForTimeout(600); // ROOM_TAKENの場合の非同期な拒否・アラート表示を待つ

        // 本当に「準備」へ遷移できたか確認する（拒否されていれば「案内」のまま）
        const reallyAssigned = await target.locator('.status-btn.btn-準備.btn-active').count() > 0;
        if (!reallyAssigned) {
          roomAttempt++;
          log(`[案内${workerId}] No.${targetNum} は${roomLabel}を取得できませんでした（他のスタッフが先に確保）。再試行します`);
          // 失敗が続くほど待機を伸ばす（同じ部屋への連打でFirestoreをレート制限に
          // 追い込まないため）。実際の人間の「少し待って再操作」に近づける。
          await page.waitForTimeout(Math.min(500 * roomAttempt, 4000));
          continue; // ループの先頭に戻り、別の部屋を試す
        }
        log(`[案内${workerId}] No.${targetNum} を準備（${roomLabel}）`);
        roomAssigned = true;
      }

      if (!roomAssigned) {
        errors.push({ source: `案内${workerId}`, text: `No.${targetNum}: ${ROOM_WAIT_TIMEOUT_MS / 1000}秒待っても部屋が空きませんでした` });
        continue;
      }

      await target.locator('.status-btn.btn-開始').click();
      await page.waitForTimeout(PLAY_TIME_MS); // 実プレイ時間を短縮して再現

      await target.locator('.status-btn.btn-終了').click();
      await page.waitForTimeout(400);

      doneCounter.count++;
      log(`[案内${workerId}] No.${targetNum} 終了 完了 (${doneCounter.count}件目)`);
    } catch (e) {
      errors.push({ source: `案内${workerId}`, text: `No.${targetNum} 処理中にエラー: ${e.message.slice(0, 150)}` });
    }
  }

  return { page, context };
}

// ===== 監視ワーカー：呼出中の組数と部屋の二重割当てを定期チェック =====
async function monitorWorker(browser, stopFlag) {
  const context = await newTestContext(browser);
  const page = await context.newPage();
  await loginAs(page, '管理者', '脱出');
  await page.locator('#tab-すべて').click();
  await page.waitForTimeout(500);

  while (!stopFlag.stop) {
    const calledCount = await page.locator('.status-btn.btn-呼出.btn-active').count().catch(() => -1);
    calledCountLog.push(calledCount);

    // 部屋の二重割当てチェック：「開始」中のカードで同じ部屋タグが2つ以上ないか
    const startedRoomTags = await page.locator('.reg-card')
      .filter({ has: page.locator('.status-btn.btn-開始.btn-active') })
      .locator('.room-tag').allTextContents().catch(() => []);
    const seen = new Set();
    for (const r of startedRoomTags) {
      if (seen.has(r)) {
        roomSnapshots.push(`⚠️ 部屋「${r}」が同時に2チーム以上に割り当てられています`);
      }
      seen.add(r);
    }

    await page.waitForTimeout(2000);
  }
  return { page, context }; // 全リセは管理者権限が必要なため、このページを後片付けに再利用する
}

async function main() {
  log(`=== 負荷テスト開始: 対象=${ADMIN_URL} / 発行数=${NUM_TICKETS} / 案内担当=${NUM_WORKERS}人 / 日付モード=${DAY_MODE} ===\n`);

  const browser = await chromium.launch({
    args: [
      '--no-sandbox', '--disable-background-networking', '--disable-sync',
      '--disable-default-apps', '--no-first-run', '--disable-component-update',
    ],
    // HTTPS_PROXYが設定されている環境でも、localhostへのアクセスは
    // プロキシを経由させない（経由させるとdevサーバーに繋がらなくなる）
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
      : {}),
  });

  // 起動タイミングを少しずつずらす（devサーバーへの同時アクセスを避ける）
  const stopFlag = { stop: false };
  const monitorPromise = monitorWorker(browser, stopFlag);
  await new Promise(r => setTimeout(r, 500));

  const claimed = new Set();
  const doneCounter = { count: 0 };

  const receptionPromise = receptionWorker(browser);
  await new Promise(r => setTimeout(r, 1500)); // 受付が数件発行してから案内担当を起動

  const guidePromises = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
    guidePromises.push(guideWorker(browser, i + 1, WORKER_NAMES[i % WORKER_NAMES.length], claimed, doneCounter));
    await new Promise(r => setTimeout(r, 400)); // 案内担当も少しずつ起動
  }

  const reception = await receptionPromise;
  const guides = await Promise.all(guidePromises);

  stopFlag.stop = true;
  const monitor = await monitorPromise;

  // ===== 結果レポート =====
  log('\n=== 結果 ===');
  log(`発行数: ${reception.issued} / 完了数: ${doneCounter.count}`);
  log(`呼出中組数の推移（オートコール補充が機能していれば概ね4前後で推移）:`);
  log('  ' + calledCountLog.join(' → '));
  log(`最大呼出中組数: ${Math.max(...calledCountLog, 0)} / 最小: ${Math.min(...calledCountLog.filter(n => n >= 0), 0)}`);

  if (roomSnapshots.length > 0) {
    log('\n⚠️ 部屋の二重割当てを検出:');
    [...new Set(roomSnapshots)].forEach(s => log('  ' + s));
  } else {
    log('\n✅ 部屋の二重割当ては検出されませんでした');
  }

  // 原因調査用（一時的）：部屋ロックの取得・拒否の全履歴
  log(`\n=== [DEBUG_LOCK] 部屋ロック履歴 ${lockDebugLog.length}件 ===`);
  lockDebugLog.forEach(s => log('  ' + s));

  if (errors.length > 0) {
    log(`\n⚠️ エラー/警告 ${errors.length}件:`);
    errors.slice(0, 30).forEach(e => log(`  [${e.source}] ${e.text}`));
    if (errors.length > 30) log(`  ...ほか${errors.length - 30}件`);
  } else {
    log('\n✅ コンソールエラーは検出されませんでした');
  }

  // ===== 後片付け =====
  // 全リセは管理者権限が必要。受付ページは途中で役割を「受付」に
  // 変えているため使えない。ずっと管理者のままの監視ページを使う。
  log('\n=== 後片付け（全リセ） ===');
  const cleanupPage = monitor.page;
  const dayValue = await cleanupPage.locator('#day-select').inputValue().catch(() => '');
  if (dayValue !== DAY_MODE) {
    log(`⚠️ 日付モードが想定外（${dayValue}）のため、安全のため全リセをスキップします。手動で確認してください。`);
  } else {
    await cleanupPage.locator('.reset').click();
    await cleanupPage.waitForTimeout(1500);
    const remaining = await cleanupPage.locator('.reg-card').count();
    log(remaining === 0 ? '✅ テストデータを削除しました' : `⚠️ ${remaining}件のデータが残っています。手動で確認してください`);
  }

  // 全コンテキストを閉じる
  for (const g of guides) await g.context.close().catch(() => {});
  await reception.context.close().catch(() => {});
  await monitor.context.close().catch(() => {});
  await browser.close();

  const hasProblems = errors.length > 0 || roomSnapshots.length > 0;
  process.exit(hasProblems ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
