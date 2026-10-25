// =====================================================
// src/Admin/components/FocusBar.tsx — ステータス確認バー
// =====================================================
//
// 📋 このコンポーネントの役割
//
//   呼出中・案内中・プレイ中のチーム番号を
//   一目で確認できるバーを表示する。
//
//   ヘッダー内に固定表示されるため、
//   スクロールしても常に見える。
//
// 📊 表示内容
//   📢 呼出  : 呼出中の番号一覧（カンマ区切り）
//   🚪 案内  : 案内中の番号一覧
//   ⚔️ プレイ : プレイ中（開始）の番号一覧
//
// 使用箇所：Admin.tsx の renderPart('focusBar')
//
// =====================================================
import React from 'react';
import type { Registration } from '../types';

interface FocusBarProps {
  // 全登録データ（今日・他の日を含む全件）
  registrations: Registration[];
  // 現在の日付モード（絞り込みに使用）
  dayMode: string;
  // 番号の表示形式変換関数（2周目は "2-1" 形式） */
  formatDisplayNumber: (num: number) => string;
}

const FocusBar: React.FC<FocusBarProps> = ({
  registrations,
  dayMode,
  formatDisplayNumber
}) => {

  /**
     * 指定したステータスのチームの番号一覧を文字列で返す
     * 対象がなければ "-" を返す
     *
     * @param status - 対象ステータス（"呼出" / "案内" / "開始"）
     */
  const buildList = (...statuses: string[]) =>
    registrations
      .filter(r => statuses.includes(r.status) && r.day === dayMode)
      .map((r: Registration) => formatDisplayNumber(r.number))
      .join(',') || '-';

  return (
    <div className="focus-bar">

      {/* 呼出中チームの番号一覧 */}
      <div className="focus-card calling">
        <div className="card-label">📢 呼出</div>
        <div className="card-value">
          {buildList('呼出')}
        </div>
      </div>

      {/* 案内中チームの番号一覧 */}
      <div className="focus-card guiding">
        <div className="card-label">🚪 案内</div>
        <div className="card-value">
          {buildList('案内', '準備')}
        </div>
      </div>

      {/* プレイ中チームの番号一覧 */}
      <div className="focus-card playing">
        <div className="card-label">⚔️ プレイ</div>
        <div className="card-value">
          {buildList('開始')}
        </div>
      </div>

    </div>
  );
};

export default FocusBar;