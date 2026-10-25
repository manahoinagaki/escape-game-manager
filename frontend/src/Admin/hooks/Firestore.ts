// =====================================================
// src/Admin/hooks/Firestore.ts — Firestore リアルタイム同期フック
// =====================================================
//
// 📋 このファイルの役割
//
//   Firestore からデータをリアルタイムで取得・同期するフックを定義する。
//   画面を開いている間、データが更新されると自動で再描画される。
//
// 📦 同期しているデータ
//
//   registrations : "registrations" コレクション（全登録データ）
//                   番号順に取得、リアルタイム更新
//
//   dayMode       : "system_info/Waiting" ドキュメントの Day フィールド
//                   全端末で共有される今日の日付モード
//
// 使用箇所：Admin.tsx
//
// =====================================================

import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc
} from 'firebase/firestore';

import type { Registration } from '../types';
export type { Registration };

/**
 * Firebase同期フック
 * 
 * @description
 * - 登録データ（registrations）をリアルタイム同期
 * - 日モード（dayMode）をリアルタイム同期
 * 
 * @returns registrations（全登録データ）、dayMode（日付モード）、setDayMode
 */
export function useAdminFirestore() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [dayMode, setDayMode] = useState("1日目");

  // --------------------------------------------------
    // 日付モードの同期
    // "system_info/Waiting" ドキュメントの Day フィールドを監視する
    // 管理者が変更するとすべての端末に即時反映される
    // --------------------------------------------------
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "system_info", "Waiting"), 
      (snapshot) => {
        if (snapshot.exists()) {
          setDayMode(snapshot.data().Day);
        }
      }
    );
    // アンマウント時に監視を解除（メモリリーク防止）
    return () => unsubscribe();
  }, []);

  // --------------------------------------------------
    // 登録データの同期
    // "registrations" コレクションを番号順で全件監視する
    // データが追加・変更・削除されると自動で再取得される
    // --------------------------------------------------
  useEffect(() => {
    const registrationsQuery = query(
      collection(db, "registrations"), 
      orderBy("number", "asc") // 番号順に並べる
    );
    
    const unsubscribe = onSnapshot(registrationsQuery, (querySnapshot) => {
      const registrationsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Registration[];
      
      setRegistrations(registrationsList);
    });
    
    // アンマウント時に監視を解除（メモリリーク防止）
    return () => unsubscribe();
  }, []);

  return { registrations, dayMode, setDayMode };
}
