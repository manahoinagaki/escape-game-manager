// =====================================================
// src/App.tsx — ルーティング設定
// =====================================================
//
// 📋 このファイルの役割
//
//   URL に応じてどの画面を表示するかを定義する。
//   アプリ全体の「入口」となるファイル。
//
// 🌐 URL と画面の対応表
//
//   /          → /customer にリダイレクト
//   /customer  → お客様向け画面（Customer.tsx）
//   /admin     → スタッフ向け管理画面（Admin.tsx）
//   それ以外   → /customer にリダイレクト
//
// 🔧 よく変更する箇所
//   画面を追加したい場合         : <Route> を1行追加する
//   デフォルト遷移先を変えたい場合 : Navigate の to="" を変更
//
// =====================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Admin from './Admin/Admin';
import Customer from './Customer/Customer';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ルートパスにアクセスした時にお客様画面へ飛ばす */}
        <Route path="/" element={<Navigate to="/customer" replace />} />

        {/* http://localhost:5173/admin で管理画面を表示 */}
        <Route path="/admin" element={<Admin />} />

        {/* http://localhost:5173/customer でお客様画面を表示 */}
        <Route path="/customer" element={<Customer />} />

        {/* 何も入力せずにアクセスした場合はお客様画面へ飛ばす */}
        <Route path="*" element={<Navigate to="/customer" />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;