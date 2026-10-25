// =====================================================
// drive.mjs — 脱出ゲーム運営管理システム 運用フロー自動テスト
// =====================================================
//
// 何をするか:
//   Admin画面にログインし、日付モードを「テスト」に切り替えた上で、
//   実際の運用フロー（発行→呼出→案内→準備→開始→終了、取消→復帰、
//   スタッフ休憩トグル、お客様画面の待ち時間表示）を自動操作し、
//   各ステップでスクリーンショットとコンソールエラーを記録する。
//   最後にテストデータは自動で削除する（全リセ）。
//
// 安全のため:
//   すべての新規発行・操作は日付モード「テスト」のときだけ行う。
//   「1日目」「2日目」の本番データには一切触れない。
//
// 使い方:
//   node drive.mjs                      # デフォルト: http://localhost:5173
//   TARGET_URL=https://festival-escape-v2.web.app node drive.mjs   # 本番向け
//
// 前提:
//   npm install -g playwright && npx playwright install chromium
//   (devサーバー向けに実行する場合は、別ターミナルで
//    `cd frontend && npm run dev` を先に起動しておくこと)
//
// =====================================================

import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = (process.env.TARGET_URL || 'http://localhost:5173').replace(/\/$/, '');
const ADMIN_URL = `${BASE}/admin`;
const CUSTOMER_URL = `${BASE}/customer`;
const PASS = '1234'; // 管理者パスワード（frontend/src/shared/waitTime.ts の PASSWORDS）

const SHOT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let shotN = 0;
let failures = 0;

function ok(label, cond) {
  console.log(cond ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!cond) failures++;
  return cond;
}

// Firestoreの反映を待つため、即座に判定せず一定時間ポーリングする。
// （オフライン/低速回線での誤検知を防ぐ）
async function waitOk(label, checkFn, timeoutMs = 8000, intervalMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkFn()) return ok(label, true);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return ok(label, false);
}

async function ss(page, name) {
  shotN++;
  const f = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: f });
  console.log('  📸', f);
}

// 「No.<n>」というテキストを持つ登録カードを1つ返す locator
function cardByNumber(page, n) {
  return page.locator('.reg-card').filter({
    has: page.locator('.reg-no', { hasText: new RegExp(`^No\\.${n}$`) }),
  });
}

async function main() {
  console.log(`対象URL: ${ADMIN_URL}`);
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-default-apps',
      '--no-first-run',
      '--disable-component-update',
    ],
    // このサンドボックス環境では、明示的にプロキシを渡さないと
    // Chromiumが外部ネットワークに直接接続しようとして失敗する。
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  });
  const context = await browser.newContext();
  // CoachMark（初回操作ガイド）はページ読み込み直後の要素クリックを妨害するため、
  // 「既に見た」ことにして最初から出さないようにする（admin-guide-v1 は
  // frontend/src/Admin/Admin.tsx の <CoachMark storageKey="admin-guide-v1" /> と対応）
  await context.addInitScript(() => {
    window.localStorage.setItem('admin-guide-v1', 'done');
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [console.error]', msg.text().slice(0, 200));
  });
  page.on('pageerror', err => console.log('  [pageerror]', err.message));

  // 役割変更・日付モード変更・取消・全リセなどは window.prompt / window.confirm を使う。
  // prompt には管理者パスワードを渡し、confirm はすべて承認する。
  page.on('dialog', async dialog => {
    console.log(`  [dialog:${dialog.type()}]`, dialog.message());
    await dialog.accept(dialog.type() === 'prompt' ? PASS : undefined);
  });

  // ===== STEP 1: ログイン・テストモードへ切り替え =====
  console.log('\n=== STEP 1: 管理者ログイン & 日付モード「テスト」へ切替 ===');
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#role-select', { timeout: 20000 });

  // 初回訪問だと CoachMark（操作ガイド）のオーバーレイが自動表示され、
  // 下の要素へのクリックを妨害する。出ていたら閉じる。
  const skipAllBtn = page.locator('.coach-btn-skip-all');
  if (await skipAllBtn.count() > 0) {
    console.log('  CoachMark（初回ガイド）を検出、スキップします');
    await skipAllBtn.click();
    await page.waitForTimeout(300);
  }

  await page.selectOption('#role-select', '管理者');
  await page.waitForTimeout(500);
  ok('役割が「管理者」になっている', await page.locator('#role-select').inputValue() === '管理者');

  await page.selectOption('#day-select', 'テスト');
  await page.waitForTimeout(800);
  ok('日付モードが「テスト」になっている', await page.locator('#day-select').inputValue() === 'テスト');
  await ss(page, 'test-mode-ready');

  // ===== STEP 2: 1件目の整理券を発行し、最後まで進める =====
  console.log('\n=== STEP 2: 整理券発行 → 呼出 → 案内 → 準備(部屋割当) → 開始 → 終了 ===');
  const nextLabel1 = await page.locator('.next-number').textContent();
  const num1 = parseInt(nextLabel1.replace(/[^\d]/g, ''), 10);
  console.log(`  発行予定番号: No.${num1}`);

  await page.locator('.add-btn').click();
  await page.waitForTimeout(1000);
  const card1 = cardByNumber(page, num1);
  ok(`No.${num1} のカードが表示された`, await card1.count() > 0);

  for (const [label, cls] of [['呼出', 'btn-呼出'], ['案内', 'btn-案内']]) {
    await card1.locator(`.status-btn.${cls}`).click();
    await waitOk(`No.${num1} が「${label}」になった`,
      async () => await card1.locator(`.status-btn.${cls}.btn-active`).count() > 0);
  }

  // 「準備」→ 部屋ピッカーが開く → A室を選択
  await card1.locator('.status-btn.btn-準備').click();
  const roomPicker = card1.locator('.reg-room-picker');
  await waitOk('部屋選択ピッカーが開いた', async () => await roomPicker.count() > 0);
  await roomPicker.getByText('A室', { exact: true }).click();
  await waitOk(`No.${num1} が「準備」(A室)になった`,
    async () => await card1.locator('.status-btn.btn-準備.btn-active').count() > 0);
  await ss(page, `no${num1}-準備-A室`);

  for (const [label, cls] of [['開始', 'btn-開始'], ['終了', 'btn-終了']]) {
    await card1.locator(`.status-btn.${cls}`).click();
    const success = await waitOk(`No.${num1} が「${label}」になった`,
      async () => await card1.locator(`.status-btn.${cls}.btn-active`).count() > 0);
    if (!success) {
      const activeText = await card1.locator('.status-btn.btn-active').textContent().catch(() => '(なし)');
      const roomText = await card1.locator('.room-tag').textContent().catch(() => '(部屋タグなし)');
      const updatedBy = await card1.locator('.reg-updated-by').textContent().catch(() => '(更新者表示なし)');
      console.log(`  🔎 実際のアクティブステータス: 「${activeText}」 / 部屋タグ: ${roomText} / 最終更新: ${updatedBy}`);
      await card1.scrollIntoViewIfNeeded();
      await ss(page, `no${num1}-DEBUG-${label}`);
    }
  }
  await ss(page, `no${num1}-終了`);

  // ===== STEP 3: 2件目 — 取消 → 1つ戻す の復帰確認 =====
  console.log('\n=== STEP 3: 取消 → 1つ戻す の復帰確認 ===');
  const nextLabel2 = await page.locator('.next-number').textContent();
  const num2 = parseInt(nextLabel2.replace(/[^\d]/g, ''), 10);
  console.log(`  発行予定番号: No.${num2}`);

  await page.locator('.add-btn').click();
  await page.waitForTimeout(1000);
  const card2 = cardByNumber(page, num2);
  await card2.locator('.status-btn.btn-呼出').click();
  await waitOk(`No.${num2} が「呼出」になった`,
    async () => await card2.locator('.status-btn.btn-呼出.btn-active').count() > 0);

  await card2.locator('.status-btn.btn-取消').click(); // confirm ダイアログは自動承認
  await page.waitForTimeout(600);

  // 重要: 「取消」ステータスになると既定の「アクティブ」タブからカードが消える
  // （終了・取消は除外される仕様）。「すべて」タブに切り替えないと
  // カード自体が見つからず「1つ戻す」を押せないので、ここで切り替える。
  await page.locator('#tab-すべて').click();
  await page.waitForTimeout(500);
  await waitOk(`No.${num2} が「取消」になった（「すべて」タブで確認）`,
    async () => await card2.locator('.status-btn.btn-取消.btn-active').count() > 0);
  await ss(page, `no${num2}-取消`);

  await card2.locator('.back-status-btn').click();
  const revertedToCalling = await waitOk(
    `No.${num2} が「1つ戻す」で「呼出」に復帰した（「待機」に戻っていないか要確認）`,
    async () => await card2.locator('.status-btn.btn-呼出.btn-active').count() > 0);
  await ss(page, `no${num2}-1tsu-modosu`);
  if (!revertedToCalling) {
    console.log('  ⚠️  復帰後の実際のステータスを確認中...');
    const statusText = await card2.locator('.status-btn.btn-active').textContent().catch(() => '(不明)');
    console.log(`  実際のステータス: 「${statusText}」`);
  }

  // 通常運用に戻すため、アクティブタブに戻しておく
  await page.locator('#tab-アクティブ').click();
  await page.waitForTimeout(500);

  // ===== STEP 4: スタッフ休憩トグル =====
  console.log('\n=== STEP 4: スタッフ休憩トグル ===');
  await page.locator('.break-toggle').click();
  await waitOk('自分の休憩ボタンが「☕ 休憩中」になった',
    async () => (await page.locator('.break-toggle').textContent()).includes('休憩中'));
  await waitOk('ヘッダーに休憩中スタッフの通知が出ている',
    async () => await page.locator('.break-notice').count() > 0);
  await ss(page, 'break-on');

  // 元に戻す
  await page.locator('.break-toggle').click();
  await waitOk('休憩を解除できた',
    async () => (await page.locator('.break-toggle').textContent()).includes('休憩する'));

  // ===== STEP 5: お客様画面（待機中の整理番号を確認） =====
  console.log('\n=== STEP 5: お客様画面での待ち時間表示確認 ===');
  const customerPage = await context.newPage();
  customerPage.on('console', msg => {
    if (msg.type() === 'error') console.log('  [customer console.error]', msg.text().slice(0, 200));
  });
  await customerPage.goto(CUSTOMER_URL, { waitUntil: 'domcontentloaded' });
  await customerPage.waitForSelector('.login-card input[type="number"]', { timeout: 20000 });
  // num2 は取消→復帰で「呼出」中なので、代わりにもう1件「待機」のままの整理券を作って確認する
  await page.locator('.add-btn').click();
  await page.waitForTimeout(1000);
  const nextLabel3 = await page.locator('.next-number').textContent();
  // add-btn クリック後の nextNo は次の番号なので、実際に発行された番号は1つ前
  const num3 = parseInt(nextLabel3.replace(/[^\d]/g, ''), 10) - 1;
  console.log(`  お客様画面で確認する番号: No.${num3}`);

  await customerPage.fill('.login-card input[type="number"]', String(num3));
  await customerPage.locator('.login-card .login-btn').click();
  await customerPage.waitForTimeout(1500);
  await ss(customerPage, `customer-no${num3}`);
  const customerBodyText = await customerPage.locator('.status-section').textContent().catch(() => '');
  ok('お客様画面に待ち状況セクションが表示された', customerBodyText.length > 0);
  console.log('  表示内容の抜粋:', customerBodyText.slice(0, 150).replace(/\s+/g, ' '));
  await customerPage.close();

  // ===== STEP 6: 後片付け（テストデータを全リセ） =====
  console.log('\n=== STEP 6: テストデータの削除（全リセ） ===');
  ok('日付モードがまだ「テスト」のままである（誤って本番を消さないための最終確認）',
    await page.locator('#day-select').inputValue() === 'テスト');
  await page.locator('.reset').click(); // confirm ダイアログは自動承認
  await waitOk('テストデータが削除され、カードが0件になった',
    async () => await page.locator('.reg-card').count() === 0);
  await ss(page, 'after-cleanup');

  console.log(`\n=== 完了: ${failures === 0 ? 'すべて成功 ✅' : `${failures}件の失敗 ❌`} ===`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
