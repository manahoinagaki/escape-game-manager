// =====================================================
// src/main.tsx — アプリのエントリーポイント
// =====================================================
//
// 📋 このファイルの役割
//
//   React アプリを HTML の #root 要素に描画する。
//   index.html の <div id="root"> がここで React に置き換わる。
//
//   読み込み順：
//     index.html → main.tsx → App.tsx → 各画面
//
// =====================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// document.getElementById('root') に React アプリをマウント
// StrictMode: 開発環境でのみ動作し、潜在的な問題を警告する
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
