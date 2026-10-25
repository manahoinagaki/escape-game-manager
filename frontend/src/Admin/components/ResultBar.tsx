// =====================================================
// src/Admin/components/ResultBar.tsx — 統計ダッシュボード
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   運営の進捗状況をまとめて表示するダッシュボード。
//   ヘッダーやタブに配置できる（レイアウト設定による）。
//
// 📊 表示内容（2段構成）
//
//   【上段】基本統計
//     ・終了実績（組数 / 管理者・幹部は人数も表示）
//     ・お客様への戻ってきてほしい目安時間（下限〜上限）
//     ・実績平均プレイ時間
//
//   【下段】詳細統計（各ステータスの残り時間）
//     ・案内計 : 案内中のチームが全員終わるまでの時間
//     ・呼出計 : 呼出中 + 案内中が全員終わるまでの時間
//     ・待機計 : 待機中 + 呼出中 + 案内中が全員終わるまでの時間
//
// 使用箇所：Admin.tsx の renderPart('stats')
//
// =====================================================

import React from 'react';
import type { Registration } from '../types';

interface ResultBarProps {
  // 現在の役割（管理者・幹部のみ人数を追加表示）
  role: string;
  // 終了済みの登録データ一覧
  finishedRegistrations: Registration[];
  // 終了済みの総人数
  totalFinishedPlayers: number;
  // 待ち時間の下限（分）
  estimatedWaitLowerBound: number;
  // 待ち時間の上限（分）
  estimatedWaitUpperBound: number;
  // 実績平均プレイ時間（分）
  finishedWithTime: number;
  // 案内中の登録データ一覧
  guidingRegistrations: Registration[];
  // 準備中の登録データ一覧
  preparingRegistrations: Registration[];
  // 呼出中の登録データ一覧
  calledRegistrations: Registration[];
  // 待機中の登録データ一覧
  waitingRegistrations: Registration[];
  // 案内中が全員終わるまでの時間（分）
  FinishGuidingTime: number;
  // 呼出中 + 案内中が全員終わるまでの時間（分）
  FinishCallingTime: number;
  // 待機中 + 呼出中 + 案内中が全員終わるまでの時間（分）
  FinishWaitingTime: number;
}

const ResultBar: React.FC<ResultBarProps> = ({
  role,
  finishedRegistrations,
  totalFinishedPlayers,
  estimatedWaitLowerBound,
  estimatedWaitUpperBound,
  finishedWithTime,
  guidingRegistrations,
  preparingRegistrations,
  calledRegistrations,
  waitingRegistrations,
  FinishGuidingTime,
  FinishCallingTime,
  FinishWaitingTime
}) => {
  return (
    <div className="result-bar">

      {/* ===== 上段：基本統計 ===== */}
      <div className="result-section stats-section">

        {/* 終了実績（管理者・幹部は人数も表示） */}
        <div className="result-card">
          <div className="card-label">終了実績</div>

          <div className="card-value">
            {finishedRegistrations.length}<small>組</small>

            {(role === "管理者" || role === "幹部") && (
              <>
                {" / "}
                {totalFinishedPlayers}<small>人</small>
              </>
            )}
          </div>
        </div>

        {/* 戻ってきてほしい目安時間（お客様への案内用） */}
        <div className="result-card">
          <div className="card-label">
            戻ってきてほしい目安時間
          </div>

          <div className="card-value">
            {estimatedWaitLowerBound}-{estimatedWaitUpperBound}<small>分</small>
          </div>
        </div>

        {/* 実績平均プレイ時間 */}
        <div className="result-card">
          <div className="card-label">
            実績平均
          </div>

          <div className="card-value">
            {finishedWithTime}<small>分</small>
          </div>
        </div>

      </div>

      {/* ===== 下段：詳細統計（各ステータスの残り時間） ===== */}
      <div className="result-section detail-section">

        {/* 案内中が全員終わるまでの時間 */}
        <div className="result-card">
          <div className="card-label">
            案内計 ({guidingRegistrations.length + preparingRegistrations.length}組)
          </div>
          <div className="card-value">
            {FinishGuidingTime}<small>分</small>
          </div>
        </div>

        {/* 呼出中 + 案内中が全員終わるまでの時間 */}
        <div className="result-card">
          <div className="card-label">
            呼出計 ({calledRegistrations.length}組)
          </div>
          <div className="card-value">
            {FinishCallingTime}<small>分</small>
          </div>
        </div>

        {/* 待機中 + 呼出中 + 案内中が全員終わるまでの時間 */}
        <div className="result-card">
          <div className="card-label">
            待機計 ({waitingRegistrations.length}組)
          </div>
          <div className="card-value">
            {FinishWaitingTime}<small>分</small>
          </div>
        </div>

      </div>

    </div>
  );
};

export default ResultBar;