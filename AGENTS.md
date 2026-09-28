# Meal Prep Agent

料理備餐互動 LLM Agent 展示作品。產品方向與目前狀態見 [README.md](README.md)。

- 採 Next.js＋TypeScript、Python＋FastAPI／PydanticAI 與 AG-UI，不自建 Agent 執行框架；目前仍是文件骨架。
- 尚無 package manifest、原始碼、測試或可執行命令。建立第一個可執行骨架後，再依實際檔案補上開發及驗證命令。
- 產品互動流程與資料契約須先明確，再實作功能；不要將規劃中的行為寫成已完成。
- 技術選型與模組邊界見 [architecture.md](architecture.md)；先驗證 PydanticAI／Workers AI／AG-UI、生成契約及 Web 的 workerd 執行與獨立 Python 部署，再建立完整功能。餐單計算與提案驗證集中 Python domain，API 與 tools 共用 use cases；身體問卷估算只在瀏覽器，Agent 只提出提案，由 Worker 讀取 D1 已採用快照、交 Python 驗證，再以 D1 條件寫入採用；不信任瀏覽器傳來的計算結果。
- 保存採 Cloudflare D1＋匿名識別 Cookie，不使用 IndexedDB／localStorage 保存餐單。Worker 負責身份歸屬及 CAS，Python 負責餐單規則；匿名 Cookie 不傳給 Python 或模型。
- 合成食材、食譜、成本及營養資料必須標示；未知資訊不得捏造，不將估算內容當成醫療處方。
- 展示資料與執行設定須獨立，不匯入其他產品的私人紀錄或憑證。
- 單一 repo、後端 Modular Monolith；Temporal、帳號、PostgreSQL 與跨裝置保存不屬於本版，不預建空模組。
- 實作遵循 [TDD 計畫](implementation-plan.md)：每個行為先確認預期的 RED，再以最小實作達到 GREEN；保留真實命令及結果，不把環境故障、事後 mutation 或文件檢查冒充首次 RED。交付前通過受影響回歸與必要 gate。
