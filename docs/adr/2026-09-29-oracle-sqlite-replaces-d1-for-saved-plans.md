---
title: 將匿名餐單保存權威移至 Oracle SQLite
date: 2026-09-29
status: active
tags: [meal-prep-agent, decision, sqlite, deployment]
---

# 將匿名餐單保存權威移至 Oracle SQLite

## Context

2026-09-28 原選 Worker＋D1＋匿名 Cookie，讓免登入餐單可重開恢復。Next.js Web 移到 Oracle 後，當時 Worker 保存路徑的正式 CPU 樣本仍為 actions 3–27 ms、preview 7–25 ms，未穩定證明符合 Free 門檻。Will 於 2026-09-29 決定把保存 API 與資料一併移到 Oracle。

**約束**

- `external` Workers Free 每次 HTTP 請求 CPU 上限 10 ms，且本版不啟用 Workers Paid；來源：[Cloudflare 限額](https://developers.cloudflare.com/workers/platform/limits/)與 Will 的選擇。
- `external` 切換時 D1 有 49 筆仍有效的匿名 session、26 筆已採用餐單；須保留身份與逐列對帳，不能當可丟棄資料。來源：[T11 切換紀錄](https://github.com/Will413028/meal-prep-agent/blob/ee35860/implementation-plan.md)。
- `inherited` 原生 Next.js Web 與 Python API 已在既有 Oracle VM 的專用容器運作；仍成立，因這是現行單主機展示拓撲，且部署驗收已通過。來源：[架構](https://github.com/Will413028/meal-prep-agent/blob/ee35860/architecture.md)。
- `inherited` 匿名 Cookie 歸屬、CSRF、30 天期限、單列 CAS、一階復原及 Python canonical 驗證須維持；仍成立，因它們是已採用餐單的公開行為與正確性契約，與資料庫位置無關。來源：同上。
- `inherited` 目前只有一個 Web 寫入主機；仍成立，因 MVP 沒有多節點寫入或跨裝置找回需求。這不是未來擴容保證。

## Options Considered

- **基準／選用：Oracle Web＋本機 SQLite。** 在單機、低寫入、應用伺服器與資料同主機的條件下，即使從零設計也適用；Worker 只限流及固定代理。代價是單 writer、主機故障域和自管備份。[SQLite 官方選型](https://www.sqlite.org/whentouse.html)
- **A. 繼續優化 Worker＋D1。** 保留現有受管資料庫、七天 Free Time Travel 與已建的保存路徑；但當時多輪調整後仍有超 10 ms 樣本，新的精簡方案能否達標尚未驗。[D1 回復能力](https://developers.cloudflare.com/d1/reference/time-travel/)
- **B. Oracle Web 驗身份與提案，另設薄 D1 Worker 執行受控 CAS。** 保留 D1 及其回復能力，也把大部分應用 CPU 移出公開 Worker；但多一個私有 API／憑證與網路跳點，薄 Worker 的 CPU、延遲和回復語意未實測。Cloudflare 的[外部應用存取 D1 指引](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/)採 proxy Worker；內建 REST API 主要用於管理。
- **C. Workers Paid＋D1。** 保留 D1 且提高 CPU 上限、免資料遷移；代價是最低月費與用量計費，不符本版免費 Worker 決定。[Workers 定價](https://developers.cloudflare.com/workers/platform/pricing/)
- **D. Oracle Web＋同主機 PostgreSQL。** 可應對較多寫入並發；目前仍共用單 VM 故障域，卻增加資料庫服務、升級和備份維運，沒有本版已證實的收益。[PostgreSQL 備份](https://www.postgresql.org/docs/current/backup.html)

## Decision

Oracle Web 持有匿名身份、保存 API 與專用 SQLite volume，讀取已採用 base、交 Python 重新驗證提案後，以條件更新採用。Worker 僅提供公開入口、限流與固定 Web／API 私有代理，不綁 D1，也不雙寫。切換期間舊 D1、匯出與相容 artifact 暫留作受控回復來源；其後續處置見下方 Amendment。

## Rationale

相較 A，選用方案把身份、驗證、CAS 和資料處理一併移出 Worker；切換後 75 筆正式事件的 CPU 最大 1 ms，通過這次低流量 Free gate。舊數據只證明當時整條 Worker 保存路徑超限，沒有逐元件 profiling，不能說 D1 本身必然超限；新樣本也不是未來負載保證。

相較 B，本機 SQLite 少一個私有 D1 API、憑證和網路跳點；代價是放棄 D1 受管 Time Travel，須由專案自行決定備份與還原政策。相較 C，避免 Workers Paid；相較 D，單寫入主機先不增加另一個資料庫服務。Oracle VM 因而成為 Web 與資料的共同故障域，SQLite 鎖競爭及同步呼叫也須按實際流量監看。現用的 Workers VPC 在 open beta 期間免費，[價格可能變動](https://developers.cloudflare.com/workers-vpc/reference/pricing/)。

## Expected Outcome

- 正式公開保存與 Agent 路徑有逐路徑 CPU 樣本符合 Free gate；HTTP 成功、上游等待及 Worker CPU 分別驗證。
- 匿名身份、CAS、採用／復原與重開讀回維持同一契約；資料庫缺檔或故障時拒絕操作，不冒稱已保存。
- 切換逐列摘要一致，Oracle 重啟、線上備份與隔離還原可驗；切換當時若要回切 D1，原方案要求先停寫、反向調和與對帳，後續窗口處置見下方 Amendment。

## Amendment (2026-09-29): 回復窗口與備份政策

Will 依目前展示作品的範圍，選擇不設排程備份，包含原有的每日同機 timer；另一選項是保留同機 timer，但它與資料共用故障域；若要承諾恢復目標，基準做法是用 [SQLite Online Backup API](https://www.sqlite.org/backup.html) 製作一致快照、存放於不同故障域並[定期驗證還原](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-database-disaster-recovery/testing.html)。此版不承諾 RPO／RTO，原 timer 已停用並卸載；歷史備份檔保留。

Will 同時選擇關閉 D1 回復窗口，而非繼續保留反向回寫工具及舊 adapter。切換時已完成一次線上備份／隔離還原演練，但那不是持續備份。D1 adapter、D1 專用 parity 測試、反向回寫與備份 CLI／排程已退役；HTTP 行為測試改跑正式 SQLite store。舊 D1 資料庫及切換 artifact 保留作歷史資料，不再是發行版回切路徑。日後軟體降版只能使用相容目前 SQLite schema 的 artifact，且不得把舊 D1 快照重新公開。

## Followup

- 本次兩項後續工作已結案；若產品將承諾資料恢復目標，需另行決定備份方案並驗證還原。

## Invariants

- 切換後 Oracle SQLite 是唯一權威；不能把已落後的 D1 直接重新公開而覆蓋新寫入。
- 正式服務只開已驗證的 SQLite 檔；缺檔或未知 schema 必須 fail closed，不自建空庫。

## Revocation Triggers

- 持續鎖競爭或同步 SQLite 呼叫使寫入、頁面或 SSE 延遲超標，或需要多個寫入主機時，重評執行緒及資料庫邊界。
- 產品需要承諾資料恢復目標，或 VPC beta 的免費／功能條件改變時，重評資料與公開入口的部署位置。

## Related

- 決策來源：2026-09-29 Will 與 coding agent 討論；無另存的外部會議文件，本 ADR 保存當時 A-over-B 理由。
- 原 D1 選擇：[a5d5db9](https://github.com/Will413028/meal-prep-agent/commit/a5d5db9)；Oracle 遷移與驗收：[fd7a139](https://github.com/Will413028/meal-prep-agent/commit/fd7a139)、[ee35860](https://github.com/Will413028/meal-prep-agent/commit/ee35860)；回復窗口與備份政策修訂：[1425390](https://github.com/Will413028/meal-prep-agent/commit/1425390)、[4249f5d](https://github.com/Will413028/meal-prep-agent/commit/4249f5d)。完整可重跑證據見 repo `docs/verification.md`。
