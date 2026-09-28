export function planningFailure(reason: string | null): string {
  const messages: Record<string,string> = {
    scope_incomplete:"請完整選擇本次要安排的餐次。",
    replacement_outside_scope:"替換餐點不在本次選擇的範圍，請重新選擇。",
    no_controlled_substitute:"目前食譜中沒有可用的替代餐點，請選擇其他料理。",
    invalid_base:"目前餐單無法重新計算，請重新讀取。",
    duplicate_fixed_meal:"同一餐次重複指定固定餐點，請移除重複項目。",
    locked_scope_conflict:"本次變更包含已鎖定餐點，請先解鎖再調整。",
    fixed_meal_conflict:"替換與固定餐點互相衝突，請先確認要保留哪一項。",
    hard_constraint_conflict:"食材排除、飲食限制、時間或固定餐點互相衝突，請選擇要調整的條件。",
    equipment_unavailable:"可用設備不足，請確認設備或選擇其他食譜。",
    no_operable_portion:"沒有符合食材最小增量的份量，請調整餐點。",
    search_budget_exhausted:"本次搜尋已達上限；不代表完全無解，可調整條件後重試。",
    not_found_within_search_limits:"本次搜尋未找到符合目標的組合，可調整餐點或目標後重試。",
    model_no_proposal:"AI 未產生可驗證提案，既有餐單不變；可重試或調整要求。",
  };
  return messages[reason ?? ""] ?? "這份候選未通過完整檢查，請調整條件後重試。";
}

export function planningWarning(warning: string): string {
  if (warning.startsWith("external_ingredients_unverified:")) return "外食成分未知，仍需確認忌口與飲食限制。";
  if (warning.startsWith("soft_time_exceeded:")) return "部分餐點超過偏好的料理時間，可調整食譜或改為硬限制。";
  return warning;
}
