# Runtime 架構改善驗收

日期：2026-09-30。承接整體架構 review 的四項改善；優先序主表仍為專案 Pending。

## 範圍與沿用盤點

- 保留 Next／Python／SQLite 分工：身份與 CAS 不因計算執行方式改變，公開資料及營養政策不變。
- 保留官方 AG-UI adapter／heartbeat：只補 admission 的完整串流生命週期，不取代 Agent framework。
- 保留有限搜尋及 canonical 驗證：新增取消 checkpoint，不改搜尋排序、budget 或可採用判準。
- 採 thread offload 隔離 event loop；process pool 可提供 CPU 平行，但增加序列化與生命週期，現行單 process／0.5 CPU 展示不需要。
- admission 每 process 一個 Agent run 與一個共用 calculation slot、零排隊；只限制請求頻率無法限制同時執行，排隊則增加等待與取消管理。數值先保守維持一個，不宣稱已證明正式容量。
- 沿用容器 log 輪替，增加 payload-free JSON 事件；完整 tracing 服務留待實際診斷需求成立。

## 執行與證據

- [x] RED：test_runtime_hardening.py 原實作 3 failed：event loop tick 未執行、第二個 run 回 200 而非忙碌、缺結構化事件。第一次試跑因等待無上限而中止，不列為完整 RED；修正 test 的等待邊界後重跑取得上述 3 failed。
- [x] GREEN：相同三測試 3 passed。取消、timeout 回收、重複取消、串流尚未開始的斷線另作回歸驗證，不冒充首次 RED。
- [x] Web RED：diagnostics.test.ts 因 console.warn 未呼叫失敗；加入固定分類後 Web 回歸 121 passed。
- [x] 文件：K4 已完成，明確保留既有展示預算並定義重評條件。
- [x] 完整回歸：Python 184 passed；Web 121 passed；workerd＋Next standalone browser 40 passed（57.7 秒）；wire Python／TS 各 2 passed；contracts:check、typecheck、mypy（41 source files）、CI 設定下的 ruff check／format 通過。
- [x] 獨立 design-review、diff／指令檔對帳；累積 findings 全數 Fixed，最終生命週期複查沒有新增設計阻擋。
- [ ] 提交、正式部署與 smoke。

重跑：`uv run --project backend --frozen pytest backend/tests/test_runtime_hardening.py -q`；`pnpm --filter @meal-prep/web exec vitest run src/server/persistence/diagnostics.test.ts`。

## 累積 findings ledger

- R1 Fixed：原 Agent-only offload 留下手動 preview 繞過容量限制；改為 HTTP／Agent 共用 runner。`test_agent_and_preview_share_calculation_admission` 原 preview 200 → RED，修正後 503 → GREEN。
- R2 Fixed：fixture 在 Agent admission 前直接搜尋；改為先取 run slot，再以共用 runner 選候選。`test_busy_fixture_does_not_start_candidate_selection` 原 calls=[True] → RED，修正後不呼叫 → GREEN。
- R3 Fixed：disconnect probe 可吞 CancelledError，monitor 留存使計算 slot 無法釋放；加入明確停止旗標。完整 browser 首次 36 passed／4 failed → focused 4 passed → 完整 40 passed。回歸 test 以 asyncio.wait 觀察自然完成；移除停止旗標的 mutation 1 failed，恢復後 focused 11 passed。這是事後回歸／mutation 證據，不冒充首次 RED。

## Gate 命令

從 repo 根目錄執行：

```sh
uv run --project backend --frozen pytest backend/tests -q
uv run --project backend --frozen ruff check --config backend/pyproject.toml backend scripts
uv run --project backend --frozen ruff format --check --config backend/pyproject.toml backend scripts
uv run --project backend --frozen mypy --config-file backend/pyproject.toml backend/src/meal_prep
pnpm test:web
pnpm contracts:check
pnpm test:contracts
pnpm typecheck
MEAL_TEST_WORKER=1 pnpm --dir apps/web exec playwright test --workers=1
```

第一次廣域 ruff 未指定 backend config，誤套預設規則；不據此修改既有 scripts。正式 gate 明確沿用 CI 的 config。中途改動 source／舊服務占埠的中止試跑不列成功 gate；最後完整 browser 使用固定 source、單一序列執行。

## 回退

本輪沒有 SQLite schema、Cookie 或公開 DTO 遷移。保留前一 Web／API image 的 immutable release tag；新版本異常時回退相容同一 SQLite schema 的 image，按 deploy/README.md 重驗 health／讀取／SSE，不重建資料檔、不切回 D1。
