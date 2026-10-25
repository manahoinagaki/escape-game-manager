# 脱出ゲーム 運営管理システム

学祭の脱出ゲーム企画（2日間開催）向けの、スタッフ用管理アプリとお客様用待ち状況確認アプリです。

## 概要

- スタッフ約11人が別々のスマホから同時に、整理券の発行・呼び出し・部屋の割り当てを行い、来場者は自分のスマホで待ち状況を確認できる
- 2026年10月の大学祭で、2日間・約190件の整理券を一度も止まらずに運用した
- 技術：React / TypeScript / Vite / Cloud Firestore / Firebase Hosting / GitHub Actions / Playwright

### 工夫した点

- **リアルタイム同期**：Firestoreの `onSnapshot` で、誰かの操作を全端末に自動で反映する
- **部屋の二重割り当て防止**：2人のスタッフが同時に同じ部屋を選んでも、Firestoreのトランザクションで片方だけが成功するようにした
- **負荷テスト**：Playwrightで複数のブラウザを同時に動かし、当日の動きを再現して、二重割り当てが起きないことを確認した（`qa-test/load-test.mjs`）
- **自動デプロイ**：運用中は `main` にpushすると、GitHub Actionsでビルドして Firebase Hosting に公開していた（公開用のこのリポジトリでは手動実行のみ）

> ℹ️ 公開にあたり、スタッフの実名は「スタッフA」などの記号に置き換えています。イベントは終了しているため、本番のデータベースは現在すべての読み書きを拒否しています。

> 来年はじめてこのシステムを運用する方へ：事前準備・当日の運用・イベント終了後にやること・トラブルシューティングをまとめた運営マニュアルは、運営メンバー向けに別途共有しています。このREADMEはファイル・ページの対応表です。

---

## 📁 ディレクトリ・ページ対応表

| 場所 | 中身 | 使う？ |
|---|---|---|
| `frontend/src/Admin/` | スタッフ向け管理画面（React） | ✅ 本番で使う |
| `frontend/src/Customer/` | お客様向け待ち状況画面（React） | ✅ 本番で使う |
| `frontend/src/shared/` | Admin・Customer共通ロジック（待ち時間計算など） | コード参照用 |
| `export-registrations.mjs` | イベント終了後、全リセ前にFirestoreの登録データをCSVに書き出すスクリプト | ✅ イベント後に使う |
| `qa-test/load-test.mjs`, `qa-test/drive.mjs` | 複数スタッフ同時稼働を模したPlaywright負荷テスト。本番前の動作確認用 | 任意（推奨） |
| `firebase.json` | Firebase Hosting設定 | - |

```
/
├─ frontend/              React アプリ（Vite + TypeScript）本番で使うのはこちら
│  ├─ src/
│  │  ├─ Admin/           スタッフ向け管理画面
│  │  ├─ Customer/        お客様向け画面
│  │  └─ shared/          共通ロジック（待ち時間計算など）
│  └─ package.json
├─ qa-test/               負荷テスト・動作確認スクリプト（load-test.mjs, drive.mjs）
├─ export-registrations.mjs  イベント後のCSVエクスポート用スクリプト
└─ firebase.json          Firebase Hosting 設定
```

### 本番URL
| 用途 | URL |
|---|---|
| 管理画面 | https://festival-escape-v2.web.app/admin |
| お客様画面 | https://festival-escape-v2.web.app/customer |


---

## 🚀 開発サーバーの起動

### フロントエンドのみ起動（通常の開発時）
```bash
cd frontend
npm run dev
```
ブラウザで http://localhost:5173 にアクセス
- お客様画面: http://localhost:5173/customer
- 管理画面:   http://localhost:5173/admin

---

## 📦 本番デプロイ（Firebase Hosting）

```bash
cd frontend
npm install
npm run build
cd ..
firebase deploy --only hosting
```

デプロイ後のURL: https://festival-escape-v2.web.app

デプロイ後は必ず管理画面を開いて、発行ボタン・日付モード切り替えが動くか軽く確認してください。

---

## 🔧 よく使うコマンド

| 操作 | コマンド |
|---|---|
| 開発サーバー起動 | `cd frontend && npm run dev` |
| 本番ビルド | `cd frontend && npm run build` |
| デプロイ | `firebase deploy --only hosting` |
| 依存関係インストール | `cd frontend && npm install` |
| イベント後のCSVエクスポート（全リセ前に） | `node export-registrations.mjs` |

---

## 🌐 Firebase プロジェクト

- プロジェクトID: `festival-escape-v2`
- Firestore: リアルタイムDB（登録データ・部屋ロック・休憩状態・システム情報）
- Hosting: 静的ファイル配信
- プラン: **Blaze（従量課金）**。無料枠（読み取り5万回/日）を超えるとSparkプランではアプリが停止するため、Blazeのまま維持してください。詳細は運営マニュアルの「トラブルシューティング」を参照

設定変更は `frontend/src/firebase.ts` を参照。

### 🆕 来年、新しくFirebaseプロジェクトを作る場合（初めての人向け手順）

今の `festival-escape-v2` プロジェクトをそのまま使い続けるのが一番簡単です。もし新しいFirebaseプロジェクトに移行する必要がある場合は、以下の手順で進めてください。

1. **Googleアカウントを用意する**
   運営用のGoogleアカウント（個人アカウントでも可）でログインしておく。

2. **Firebaseプロジェクトを作成する**
   - https://console.firebase.google.com/ を開き、「プロジェクトを追加」
   - プロジェクト名を決める（例: `festival-escape-2027`）。Google Analyticsは不要なので無効でよい。

3. **Blazeプラン（従量課金）にアップグレードする**
   - 左下の「無料プランを変更」→「Blazeプラン」を選択し、支払い方法（クレジットカード）を登録する
   - Blazeが必要な理由: Firestoreの読み取り回数が無料枠（5万回/日）を超えるとSparkプランではアプリが止まってしまうため。本番運用には必須
   - 想定外の課金を防ぐため、「予算アラート」をGoogle Cloud ConsoleまたはFirebaseの使用量ページで設定しておくと安心（例: 1,000円で通知）

4. **Firestoreを有効化する**
   - Firebaseコンソール左メニュー「構築」→「Firestore Database」→「データベースを作成」
   - リージョンは `asia-northeast2`（大阪）を選択（`firebase.json` の設定と揃える）
   - セキュリティルールは本番モードで作成し、デプロイ時に `firestore.rules` の内容を反映させる
   - ⚠️ 今の `firestore.rules` はイベント終了後の「すべて拒否」になっている。このままデプロイするとアプリは動かないので、使う前にFirebase AuthenticationでログインさせてSecurity Rulesで書き込みを制限する形に作り直すこと（誰でも読み書きできるルールには戻さない）

5. **Hostingを有効化する**
   - Firebaseコンソール左メニュー「構築」→「Hosting」→「開始する」
   - 画面の指示は一旦スキップしてよい（デプロイはCLIから行う）

6. **Firebase CLIをインストールしてログインする**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
   ブラウザが開くので、3で使ったGoogleアカウントでログインする。

7. **このリポジトリと新しいプロジェクトを紐付ける**
   - ルートの `.firebaserc` の `"default"` を新しいプロジェクトIDに書き換える
     ```json
     {
       "projects": {
         "default": "新しいプロジェクトID"
       }
     }
     ```
   - または `firebase use --add` を実行し、対象プロジェクトを選んで `default` として登録する

8. **アプリの接続設定（firebaseConfig）を書き換える**
   - Firebaseコンソール →「プロジェクトの概要」横の歯車アイコン →「プロジェクトの設定」→「マイアプリ」
   - アプリが無ければ「アプリを追加」→ ウェブ（`</>` アイコン）を選び、登録
   - 表示される `firebaseConfig` の値一式（`apiKey` / `authDomain` / `projectId` / `storageBucket` / `messagingSenderId` / `appId`）を `frontend/src/firebase.ts` の `firebaseConfig` に貼り替える
   - ※ このAPIキーは「クライアント用の公開キー」で、アクセス制限はFirestoreのセキュリティルール（`firestore.rules`）側で行う設計のため、リポジトリに含めても問題ない

9. **デプロイして動作確認する**
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   firebase deploy --only firestore,hosting
   ```
   - デプロイ後、表示されたURL（`https://<プロジェクトID>.web.app`）の `/admin` と `/customer` を開き、発行ボタン・日付モード切り替えが動くか確認する
   - Firestoreのデータが0件から始まるため、既存データの移行が必要な場合は事前に `export-registrations.mjs` で旧プロジェクトのデータをCSV化しておくこと
