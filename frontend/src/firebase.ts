// =====================================================
// src/firebase.ts — Firebase 初期化
// =====================================================
//
// 📋 このファイルの役割
//
//   Firebase（Google のクラウドサービス）への接続設定を行い、
//   Firestore（リアルタイムDB）を初期化して外部に公開する。
//
//   他のファイルからは以下のように読み込んで使う：
//     import { db } from '../../firebase';
//
// ⚠️ セキュリティについて
//
//   firebaseConfig の情報（APIキーなど）は
//   Firebase の「セキュリティルール」で保護されているため、
//   公開リポジトリに含まれていても問題ない設計になっている。
//   ただし本番運用では、環境変数（.env）での管理を推奨。
//
// 🔧 よく変更する箇所
//   別の Firebase プロジェクトに切り替える場合 :
//   Firebase コンソール → プロジェクト設定 → アプリの設定
//   から新しい firebaseConfig をコピーして貼り替える
//
// =====================================================

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase プロジェクトの接続設定
const firebaseConfig = {
  apiKey: "AIzaSyBnDPujmImliemX0rTLbraeAzvvy7zDD58",
  authDomain: "festival-escape-v2.firebaseapp.com",
  projectId: "festival-escape-v2",
  storageBucket: "festival-escape-v2.firebasestorage.app",
  messagingSenderId: "21467637171",
  appId: "1:21467637171:web:205d4c1b33031dea7917c6"
};

// Firebase を初期化
const app = initializeApp(firebaseConfig);
// Firestore（データベース）のインスタンスを取得
const db = getFirestore(app);

// 他のファイルから import できるように公開
export { db };