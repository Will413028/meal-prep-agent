# Meal Prep Agent

料理備餐互動 LLM Agent 展示作品，協助使用者依飲食目標安排可調整的三天餐單，以自煮為主並支援固定外食。

## 目前狀態

已確認 MVP 產品方向、只用免費模型額度，並允許使用 Cloudflare。[產品規格](product-spec.md) 整理互動流程、資料契約、保存方式與驗收案例；[營養政策 v1](nutrition-policy.md) 定義起始估算與數值邊界；[技術架構](architecture.md) 比較選型、定義模組／資料流及整合驗證。已依參考專案選定 Next.js＋FastAPI／PydanticAI；部署組合仍須實測。目前尚無可執行應用、package manifest、測試或部署，規劃內容不代表功能已完成。

## MVP 範圍

- 「我已有目標」與「幫我設定目標」兩種入口，確認後共用餐單流程。
- 自煮餐點與固定早餐／外食、每日預計營養與資料完整性。
- 局部換菜、調份量、鎖定、變更預覽及復原；營養與清單同步重算。
- 合併備餐與購物清單，條件無法同時滿足時提供協商選項。

實作依 [TDD 計畫](implementation-plan.md) 的 T00–T12 推進，每個行為先 RED、再 GREEN，必要時 REFACTOR；目前所有項目未開始。

## 開發方向

- Web 採 Next.js＋TypeScript，API 採 Python＋FastAPI，Agent 採 PydanticAI＋AG-UI；單一 repo、後端依業務模組組織為 Modular Monolith。
- Python 集中餐單計算與提案驗證；身體問卷估算留在瀏覽器，後端只接收已確認目標。API 與 Agent tools 共用 application use cases。
- Workers 提供 Web、匿名身份／D1 保存 API 與固定上游 proxy，Python 後端另部署；Workers AI 免費模型優先評估 GLM-4.7-flash。先驗證契約、工具往返、workerd／Python 主機與免費用量，不自動啟用付費服務。
- Temporal、PostgreSQL、帳號及跨裝置保存留待未來需求另議。
- 保存採 Cloudflare D1＋匿名識別 Cookie，免登入、同瀏覽器恢復；保留已採用計畫與前一版，30 天未修改後失效。Cookie 只保存識別憑證，餐單在雲端；身體問卷與聊天不持久化。
- 這是可獨立開發與部署的產品；不依賴其他作品的執行環境。
- 先完成免費模型／Cloudflare 的最小可行性驗證，再依規格與營養政策建立可執行骨架及受影響測試。
- 展示先使用明確標示的合成資料，不將估算營養或成本當成已驗證事實。

開發前請讀 [AGENTS.md](AGENTS.md)。目前沒有可執行的安裝、啟動或測試指令。
