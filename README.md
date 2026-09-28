# Meal Prep Agent

料理備餐互動 LLM Agent 展示作品，協助使用者依飲食目標安排可調整的三天餐單，以自煮為主並支援固定外食。

## 目前狀態

已確認 MVP 產品方向、只用免費模型額度，並允許使用 Cloudflare。[產品規格](product-spec.md) 整理互動流程、資料契約、保存方式與驗收案例；[營養政策 v1](nutrition-policy.md) 定義起始估算與數值邊界；[技術架構](architecture.md) 比較選型、定義模組／資料流及整合驗證。已依參考專案選定 Next.js＋FastAPI／PydanticAI；部署組合仍須實測。目前已有可執行 Web／Python 骨架、目標驗證 API、生成契約與本機估算表單；T00–T02 的部分案例已完成 RED／GREEN，T03 已驗證官方 HttpAgent／AGUIAdapter、run token／取消與 workerd 最小整合。T04 已有隨 Python 封裝的受控合成食譜及營養／份量計算；T05 已完成三天有限搜尋、局部換菜／鎖定與 canonical 提案 API；尚未完成購物／備餐、D1 保存或部署，完整 gates 尚未驗收。

## MVP 範圍

- 「我已有目標」與「幫我設定目標」兩種入口，確認後共用餐單流程。
- 自煮餐點與固定早餐／外食、每日預計營養與資料完整性。
- 局部換菜、調份量、鎖定、變更預覽及復原；營養與清單同步重算。
- 合併備餐與購物清單，條件無法同時滿足時提供協商選項。

實作依 [TDD 計畫](implementation-plan.md) 的 T00–T12 推進，每個行為先 RED、再 GREEN，必要時 REFACTOR；細項進度與實際測試證據集中記在該計畫。

## 開發方向

- Web 採 Next.js＋TypeScript，API 採 Python＋FastAPI，Agent 採 PydanticAI＋AG-UI；單一 repo、後端依業務模組組織為 Modular Monolith。
- Python 集中餐單計算與提案驗證；身體問卷估算留在瀏覽器，後端只接收已確認目標。API 與 Agent tools 共用 application use cases。
- Workers 提供 Web、匿名身份／D1 保存 API 與固定上游 proxy，Python 後端另部署；Workers AI 免費模型優先評估 GLM-4.7-flash。先驗證契約、工具往返、workerd／Python 主機與免費用量，不自動啟用付費服務。
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
`pnpm test:e2e` 自行啟停兩個測試服務，請先停止相同埠的手動服務。目標目前只在分頁記憶體；確認不代表雲端保存。

Cloudflare 本機驗證：`pnpm --filter @meal-prep/web build:vinext`，接著 `MEAL_TEST_WORKER=1 pnpm test:e2e`；同一組瀏覽器案例改跑 workerd。`pnpm --filter @meal-prep/web test:d1` 只測 ephemeral 本地 D1 binding，不建立雲端資料庫。

T03 瀏覽器使用固定 `@ag-ui/client` 1.0.0 的 HttpAgent；合成連線測試不產生可採用餐單。`/api/agent` 只轉送固定 Python `/agent`。瀏覽器測試啟動明確的 `create_synthetic_probe_app`；正式 `create_app` 不掛 Agent probe。真模型測試另以 `meal_prep.bootstrap.probe:create_live_probe_app` 啟動，需在後端環境設定 `CLOUDFLARE_ACCOUNT_ID` 與 `CLOUDFLARE_API_TOKEN`，固定 Cloudflare GLM-4.7-flash，無付費或 synthetic fallback；已成功執行一次 live 工具往返；尚未部署，也未完成模型品質 gate。

契約 validator 在生成階段預編譯，Worker 不執行 Ajv 動態編譯。雙 runtime 切換後 `typecheck` 會先 `next typegen` 更新生成型別。開發前請讀 [AGENTS.md](AGENTS.md)。
