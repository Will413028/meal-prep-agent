# Meal Prep Agent

料理備餐互動 LLM Agent 展示作品。產品方向與目前狀態見 [README.md](README.md)。

- 採 Next.js＋TypeScript、Python＋FastAPI／PydanticAI 與 AG-UI，不自建 Agent 執行框架；MVP 功能與 Oracle／Cloudflare 部署候選已建立，保存遷移與 Workers Free CPU gate 見實作計畫。
- 開發及驗證命令見 README；契約改動須跑 `pnpm contracts:generate`、`pnpm contracts:check`、`pnpm test:contracts`，再跑受影響 Python／Web 測試。
- 產品互動流程與資料契約須先明確，再實作功能；不要將規劃中的行為寫成已完成。
- 技術選型與模組邊界見 [architecture.md](architecture.md)；PydanticAI／Workers AI／AG-UI、生成契約、Oracle 原生 Next.js standalone 與 Python 專用容器已有驗收紀錄，未完成 gate 不可當作已通過。餐單計算與提案驗證集中 Python domain，API 與 tools 共用 use cases；身體問卷估算只在瀏覽器，Agent 只提出提案，由 Oracle Web 讀取已採用快照、交 Python 驗證，再以 SQLite 條件寫入採用；不信任瀏覽器傳來的計算結果。
- 保存正由 D1 遷到 Oracle Web 專用 SQLite volume＋匿名識別 Cookie，不使用 IndexedDB／localStorage 保存餐單。Worker 僅限流並固定轉送；Web 負責身份歸屬及 CAS，Python 負責餐單規則；匿名 Cookie 不傳給 Python 或模型。完成遷移前不可把新落點寫成正式已驗。
- 合成食材、食譜、成本及營養資料必須標示；未知資訊不得捏造，不將估算內容當成醫療處方。
- 展示資料與執行設定須獨立，不匯入其他產品的私人紀錄或憑證。
- 單一 repo、後端 Modular Monolith；Temporal、帳號、PostgreSQL 與跨裝置保存不屬於本版，不預建空模組。
- 實作遵循 [TDD 計畫](implementation-plan.md)：每個行為先確認預期的 RED，再以最小實作達到 GREEN；保留真實命令及結果，不把環境故障、事後 mutation 或文件檢查冒充首次 RED。交付前通過受影響回歸與必要 gate。
