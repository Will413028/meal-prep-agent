# Meal Prep Agent

料理備餐互動 LLM Agent 展示作品，協助使用者依飲食目標安排可調整的三天餐單，以自煮為主並支援固定外食。

## 目前狀態

已確認 MVP 產品方向、只用免費模型額度，並允許使用 Cloudflare。[產品規格](product-spec.md) 整理互動流程、資料契約、保存方式與驗收案例；[營養政策 v1](nutrition-policy.md) 定義起始估算與數值邊界；[技術架構](architecture.md) 比較選型、定義模組／資料流及整合驗證。已選定 Next.js＋FastAPI／PydanticAI；Oracle 原生 Web／API、Cloudflare 入口與 D1 已部署，真模型矩陣及遠端 CI 已通過；Workers Free CPU gate 尚待決定。T00–T10 的開發與本地驗收紀錄、T11 部署證據及 T12 真模型案例見 [實作計畫](implementation-plan.md)。

## MVP 範圍

- 「我已有目標」與「幫我設定目標」兩種入口，確認後共用餐單流程。
- 自煮餐點與固定早餐／外食、每日預計營養與資料完整性。
- 局部換菜、調份量、鎖定、變更預覽及復原；營養與清單同步重算。
- 合併備餐與購物清單，條件無法同時滿足時提供協商選項。

實作依 [TDD 計畫](implementation-plan.md) 的 T00–T12 推進，每個行為先 RED、再 GREEN，必要時 REFACTOR；細項進度與實際測試證據集中記在該計畫。

## 開發方向

- Web 採 Next.js＋TypeScript，API 採 Python＋FastAPI，Agent 採 PydanticAI＋AG-UI；單一 repo、後端依業務模組組織為 Modular Monolith。
- Python 集中餐單計算與提案驗證；身體問卷估算留在瀏覽器，後端只接收已確認目標。API 與 Agent tools 共用 application use cases。
- Workers 提供公開入口、匿名身份／D1 保存 API 與固定上游 proxy；原生 Next.js standalone 與 Python 後端各以專用容器部署到 Oracle；Workers AI 免費模型優先評估 GLM-4.7-flash。先驗證契約、工具往返、workerd／Python 主機與免費用量，不自動啟用付費服務。
- Temporal、PostgreSQL、帳號及跨裝置保存留待未來需求另議。
- 保存採 Cloudflare D1＋匿名識別 Cookie，免登入、同瀏覽器恢復；保留已採用計畫與前一版，30 天未修改後失效。Cookie 只保存識別憑證，餐單在雲端；身體問卷與聊天不持久化。
- 這是可獨立開發與部署的產品；不依賴其他作品的執行環境。
- 先完成免費模型／Cloudflare 的最小可行性驗證，再依規格與營養政策建立可執行骨架及受影響測試。
- 展示先使用明確標示的合成資料，不將估算營養或成本當成已驗證事實。

## 本機開發與驗證

需求：Node.js 26、pnpm 11.2.2、uv 0.7.2、Python 3.13；精確依賴由 lockfiles 固定。以下從 repo 根目錄執行：

```sh
pnpm install --frozen-lockfile
uv sync --project backend --frozen
pnpm --filter @meal-prep/web exec playwright install chromium
pnpm test:web
pnpm typecheck
pnpm contracts:check
pnpm test:contracts
pnpm build
pnpm test:e2e
uv run --project backend --frozen pytest backend/tests
uv run --project backend --frozen ruff check --config backend/pyproject.toml backend scripts
```

`pnpm contracts:generate` 從 Python OpenAPI 重新產生 JSON 與 TypeScript；不得手改生成檔。Python mypy 請在 `backend` 執行 `uv run --frozen mypy`。

啟動 API：`uv run --project backend --frozen uvicorn meal_prep.bootstrap.app:create_app --factory --host 127.0.0.1 --port 14318`。
啟動 Web：`MEAL_API_ORIGIN=http://127.0.0.1:14318 pnpm --filter @meal-prep/web dev --hostname 127.0.0.1 --port 14317`。
`pnpm test:e2e` 自行啟停兩個測試服務，請先停止相同埠的手動服務。目標確認與未採用提案只在分頁記憶體；明確採用後才保存至 D1。

Cloudflare 本機驗證：`pnpm --filter @meal-prep/web build:worker`，接著 `MEAL_TEST_WORKER=1 pnpm test:e2e`；以原生 Next standalone 搭配 workerd 執行瀏覽器案例，另跑 Worker 專用保存案例；啟動時自動將 migration 套用至本地 D1。完整規劃畫面須使用 workerd；Node Next dev 不提供 D1 保存 routes。`pnpm --filter @meal-prep/web test:d1` 只測 ephemeral 本地 D1 binding，不建立雲端資料庫。

開發連線診斷頁位於 `/diagnostics/transport`，走 `/api/diagnostics/agent` → Python `/diagnostics/agent`，診斷結果不可採用。正式聊天以官方 HttpAgent 呼叫 Worker `/api/agent`；Worker 驗身份與 revision、注入 D1 已採用快照，再轉送固定 Python `/agent`。瀏覽器測試以明確的 `create_synthetic_probe_app` 配置合成模型，仍走正式 tools。

真模型 API 使用 `meal_prep.bootstrap.live:create_live_app` 啟動，後端須設定 `CLOUDFLARE_ACCOUNT_ID` 與 `CLOUDFLARE_API_TOKEN`；固定 GLM-4.7-flash、關閉模型推理以配合有界輸出，無付費或 synthetic fallback。預設使用合成展示，固定呼叫正式工具但不理解自由文字；頁面明確選擇 live 才呼叫真模型。`create_app` 未配置模型時仍可使用合成展示，live 明確回報不可用；切換模式會清除本頁聊天及未採用提案。T12 的 A1／A3／A5／A10 各三次本機 live 工具驗收已通過，正式部署仍依 T11／T12 驗收紀錄判定。聊天僅保留本頁有界文字歷史，產生提案不代表採用。

真模型理解要求並選擇工具；訪客看到的完成／失敗摘要由已驗提案或失敗原因產生，營養與餐點數字以預覽卡片為準。模型原始文字不代表保存成功。合成展示不理解自由文字：已有餐單時，它只挑第一個經受控食譜與正式配餐規則證實可行的單餐替代作固定示範。合成資料和未採用狀態在對話及卡片中標明。

需要重跑 live 品質案例時，使用自己的專案環境檔，依序將 `A1` 換成 `A3`、`A5`、`A10`；`--trial` 使用尚未出現的 1–20 編號，避免覆蓋證據：

```sh
PYDANTIC_AI_NO_BANNER=1 uv run --env-file .env.cloudflare.local --project backend --frozen python scripts/live-acceptance.py A1 --trial 12
```

腳本只送合成目標、食譜及外食資料，檢查正式工具、來源、canonical 提案或明確不可用原因；原始串流和結構化結果寫入 ignored `.artifacts/t12-live-<案例>-<編號>.events/.json`，其中可能包含完整合成對話，請勿提交。`run_usage` 的 input／output tokens 可依當時[模型費率](https://developers.cloudflare.com/workers-ai/platform/pricing/)估算 Neurons；估值不是 Cloudflare 帳戶實際扣量。A10 預期為設備不足且沒有可採用提案。若觸及每日免費額度，等額度重置後重跑，不自動改用付費服務或展示模式。公開入口、D1 與回復演練見 [部署手冊](deploy/README.md)；逐案證據與已知限制見 [實作計畫](implementation-plan.md)。

部署後可用真瀏覽器補驗 live 模式與九餐預覽；只用合成目標，寫入 ignored `.artifacts/t12-live-browser-<編號>.json`，不會採用餐單。編號也須未使用：

```sh
MEAL_DEPLOYED_ORIGIN=https://<正式 HTTPS 入口> node scripts/live-browser-acceptance.mjs 1
```

保存端點由 `apps/web/src/worker.ts` 提供，公開 DTO 從 Python schema-only router 生成；該 router 不掛在 Python runtime。`wrangler.jsonc` 頂層 D1 ID 為本地占位值，production 使用專案正式 D1 及兩個 VPC binding；部署流程見 [deploy/README.md](deploy/README.md)。首次 migration 僅新增 `plan_sessions`，不改 T03 probe table；已演練回到前一相容 Worker／Web／API 組合，完整 D1 快照保持一致，沒有執行破壞性 down migration。舊測試快照若缺逐餐營養或目標差距欄位，會保留原列並回報格式不相容；使用者須明確選擇「開始新規劃」，不自動遷移或刪除。

契約 validator 在生成階段以 Ajv standalone＋固定 esbuild bundle 為 ESM，Worker 不執行 Ajv 動態編譯。雙 runtime 切換後 `typecheck` 會先 `next typegen` 更新生成型別。開發前請讀 [AGENTS.md](AGENTS.md)。
