# Meal Prep Agent — TDD 實作計畫

更新：2026-09-28。狀態：T00 本機驗證通過；T01／T02 部分 GREEN，T03 最小整合、T04 domain、T05 提案、T06 清單／備餐已驗收。依 [產品規格](product-spec.md)、[營養政策](nutrition-policy.md) 與 [架構](architecture.md) 實作。採 RED → GREEN → REFACTOR，小增量交付；本文件保存細項及執行證據，不另訂產品優先序。

## 1. 前提與接續方式

維持 Next.js／TypeScript、FastAPI／PydanticAI、AG-UI、Python Modular Monolith；Web 本機身體估算、Python 配餐驗證、D1 雲端保存與匿名 Cookie。第一版無帳號、Temporal 或跨裝置保存。免費模型與 Python 獨立部署的限制仍有效；部署主機尚未決定。保存採 D1＋匿名 Cookie 已確認，不新增登入帳號；身份與餐單歸屬檢查屬 Worker 責任。

開始每個項目前，在實際 checkout 執行 `git status --short`、`git log -5 --oneline`、`git ls-files`，命令帶絕對路徑或 `git -C <repo>`。核對三份規格及下表證據；若實際檔案或版本與上次不同，先查差異與受影響 consumer，再接續，不覆蓋別人的未提交內容。新增契約前以 `rg` 搜尋既有 producer、consumer 與測試，將結果記在該項證據。

規劃起點為 `.gitignore`、AGENTS、README、產品及營養政策，之後新增架構與本計畫；T00 已建立應用、manifest、lockfiles 與測試；目標 API、本機估算及確認畫面已有實作。未建立的模組仍為預計落點。

## 2. RED → GREEN → REFACTOR 規則

1. 一次選一個可觀察行為及最小反例，先寫測試與獨立期望值；每項包含多個小循環，不是先寫完整功能再補一包測試。
2. **RED**：在未實作該行為時執行測試，確認因預期的業務 assertion 失敗。必要時先加空介面讓測試能跑到 assertion；語法錯誤、缺套件、runner 沒收集測試或服務未啟動不算行為 RED。封裝／生成契約 gate 的 RED 可以是預期的 import／schema 不相容，但必須與環境故障分開。
3. **GREEN**：只寫通過此案例的最小 production code，重跑同一案例及受影響測試。不得把合成 fixture 的答案寫死成正式配餐或模型回覆。
4. **REFACTOR**：綠燈下整理重複與模組責任；沒有必要就不重構。維持契約及測試通過，不先加入未用到的框架。
5. 檢查 diff、該層 lint／typecheck／契約生成。交易、scope、缺值、隱私與取消等關鍵規則做下表指定的 mutation／故障注入，確認防線失效時測試會紅，還原後回綠。
6. 留下真實 RED 與 GREEN 證據再接下一個增量。不得以 skip、放寬 assertion 或直接更新 snapshot 掩蓋失敗；交付 commit 保持綠燈，不要求提交 RED 中間版本。

已存在的功能補測試記作「回歸驗證」，不能事後捏造 TDD 歷史；mutation 證明測試辨別力，也不能冒充首次開發 RED。套件設定、文件及空目錄不做形式化 TDD，使用 smoke／schema／build 檢查。

## 3. 測試責任與可行性門檻

| 層 | 主要驗證方式 | 不可替代的真實邊界 |
|---|---|---|
| Python domain／application | pytest，Decimal golden、邊界與不變式；受控合成食譜 | 期望值來自獨立核算，不呼叫受測函式生成答案 |
| API／契約 | pytest 經 FastAPI 入口、生成 TS client、runtime schema round-trip | 驗 HTTP 序列化、null／number、錯誤與版本；不能只測 DTO 建構 |
| Agent | 可控模型替身驅動真 PydanticAI／官方 AG-UI adapter | tools 使用真 use case；另以 live 評估 provider 相容與品質 |
| Web | Vitest 驗 estimator、狀態與可見互動 | 不把整頁 snapshot 或 mock call 次數當唯一驗收 |
| 保存／完整流程 | Worker 整合測試使用本地 D1 binding；Playwright 同 origin 兩頁與不同 Cookie contexts；另驗部署 D1 | in-memory fake 不能證明 D1 CAS、身份歸屬、跨頁及關頁恢復 |
| 執行與部署 | workerd smoke、實際 Workers SSE、獨立 Python service smoke | Node build 不代表 workerd 通過，本機不代表部署完成 |

預設測試不呼叫外部模型；live 明確 opt-in、限制用量並記模型版本。CI 必要測試未收集、全 skip 或缺瀏覽器都算未通過，不能回報綠燈。具體工具版本與可重跑命令由 T00 鎖定後補入 README。

**先驗可行性，再完成產品 gates：** T00–T03 先證明封裝／最小契約、Agent 工具往返、Web workerd／SSE 的可行性；這些只屬 K1–K3 的前置證據。K1–K4 的完整條件仍按架構第 9 節驗收，不能在 thin slice 通過時勾成完成。T03 的必要整合失敗時先修整合，不繼續堆完整功能；外部環境受阻可先完成獨立的離線 domain 測試，狀態仍記受阻。

## 4. 執行順序與狀態

| 項目 | 依賴 | 交付結果 | 狀態 |
|---|---|---|---|
| T00 | 無 | 可執行測試環境、封裝、基本 CI | 已驗收（本機）：封裝／測試／build；CI 定義已建立，遠端執行於 T12 核對 |
| T01 | T00 | API 契約（含 Worker 保存）與已確認目標驗證 | 部分 GREEN：目標 API／生成契約；Worker DTO 待補；日期／版本於 T05、餐單原值比較於 T04 已驗 |
| T02 | T01 | 本機身體估算及確認邊界 | 部分 GREEN：八列估算／表單／確認；本機 metadata／鄰級比較已補，保存契約與全路徑隱私 gate 待補 |
| T03 | T01；可先於 T02 | Agent／AG-UI／workerd／D1 最小整合 | 已驗收（最小整合）：官方 HttpAgent／adapter、run token／取消、workerd SSE／中止、本地 D1 與一次 live；完整 K2/K3 留 T09/T11 |
| T04 | T01、T03 可行性 | 食譜資料與營養計算 | 已驗收：受控合成資料、份量／來源、Decimal 小計／完整性與三種 mutation |
| T05 | T04 | 三天提案、局部修改及硬限制 | 已驗收：有限搜尋／canonical API、scope／鎖定／來源、真 HTTP 跨語言契約 |
| T06 | T05 | 購物、庫存與備餐衍生資料 | 已驗收：庫存單次扣抵、勾選／衍生diff、設備序列與分裝、HTTP完整快照 |
| T07 | T01、T05、T06 | D1／匿名身份、原子採用與清除 | 本地驗收完成；部署案例由 T11 驗 |
| T08 | T02、T07 | 雙入口與手動操作完整切片 | 未開始 |
| T09 | T03、T08 | Agent 對話、工具與失敗恢復 | 未開始 |
| T10 | T09 | 多分頁、隱私與限額故障測試 | 未開始 |
| T11 | T10；部署條件具備 | 實際環境與完整 K3 | 未開始 |
| T12 | T11 | live K4 與完整 MVP 驗收 | 未開始 |

每項可記「未開始／RED／GREEN／REFACTOR／已驗收／受阻」。只有必要案例與外部條件都有證據才標已驗收；以下內容是測試設計，尚不是執行結果。

### T00 — 測試環境與封裝

落點：`backend/pyproject.toml`、`backend/src/meal_prep/bootstrap/`、`backend/tests/`、`apps/web/`、CI 設定及 README。只建立實際用到的目錄。

- 設定驗證：pnpm／uv lockfile、pytest／Vitest／Playwright 可收集並執行測試；Python wheel 安裝後能從 repo 外 import。先取得可工作的 runner，不將缺套件記成 RED。
- RED：呼叫 `/health` 尚不能取得規定的技術健康結果；Web 顯示明確 fixture 標示的 smoke assertion 失敗。
- GREEN：最小 FastAPI app 與 Next.js 頁面；沒有模型或使用者資料。建立基本 lint、typecheck、測試及 build jobs。
- 驗收：故意改錯 health 結果使測試紅、還原回綠；記錄實際命令及 runtime 版本。無 tests／all skipped 的 required job 不能成功。

### T01 — API 契約與目標驗證

落點：`modules/nutrition/`、公開 Pydantic DTO、`contracts/`、Web `shared/api/`；對應 A1、A12、N4–N7、K1 部分。

- RED：以真 API 入口測 1,199／1,200 kcal、蛋白質 29／251、反向區間、null 選填、非法數值；N5 的 2,100.1 不因顯示取整變成達標，N6 必須回報能量衝突。逐例確認失敗原因。
- GREEN：Decimal 目標驗證、結構化錯誤及 evaluate／validate 的最小公開契約，產生 OpenAPI 與 TS client；先只實作當前需要的欄位。
- 驗收：HTTP round-trip 的 Decimal number／null、日期與版本一致；未知版本拒絕、合法值通過。Worker 保存端點的 request／response 同源生成，T07 必須驗實際 route 與契約一致。刻意將 number 改成 string 或刪公開欄位，consumer／漂移 gate 必須紅；還原後回綠。生成 client 不手改。

### T02 — 身體估算與確認

落點：Web `features/goals/`、版本化政策資料及 estimator 測試；對應 A2、A12、N1–N3、N7–N8。

- RED：營養政策八列 golden、蛋白質 56／112 g、單位與取整；18／19 歲、身高／體重／年齡端點；孕哺、需專業調整、未知分類、BMI < 18.5 減脂分流；缺欄位只能補問。每個 golden 直接引用獨立核算結果。
- GREEN：窄範圍本機 estimator、必要欄位表單與確認卡；GoalDraft 在確認前不改生效目標。已知目標入口不要求身體問卷。
- 驗收：反轉成人門檻或再乘活動係數應被測試抓到；重估後拒絕確認仍保留原目標。攔截網路／儲存 payload，原始問卷不外送、不持久化。

### T03 — 提早驗證技術整合

落點：`bootstrap/`、`platform/`、`planning/agents/`、Web chat 的最小 consumer／固定上游 proxy；K2 及 K3 的可行性部分。

- RED：模型替身要求一次 tool call，真 PydanticAI／adapter 尚未回完整 AG-UI 結果；取消後只有 `RUN_FINISHED` 的事件序列不得讓 UI 顯示可採用。
- GREEN：一個合成工具透過 application 介面往返、明確 `proposal_ready` 與 run token；最小 Next.js 頁經 proxy 接收串流。此工具只是 transport probe，不標成正式配餐。另以本地 D1 binding 做空 schema／prepared write／read probe，驗證 Worker 接線；正式匿名身份與 CAS 留在 T07。
- 驗收：live 完成一次 provider 工具往返；workerd 完成 hydration／SSE／斷線，記錄版本及上游行為。移除 outcome 或取消檢查時測試必須紅。未有外部授權或環境即記受阻，不以 mock 冒充 live。正式 domain 接入後於 T09 重驗完整 K2。

### T04 — 受控資料與營養計算

落點：`modules/recipes/`、`nutrition/`、`data/`；對應 A3–A4、A8、N5、N7。

- RED：同食譜跨天依各份量計算；固定外食指定餐次；一項 null 的已知小計與完整性；只規劃午晚餐不能全天達標；實際可操作的件數增量；來源版本不明需拒絕新計算。
- GREEN：小而足以區分行為的合成食譜庫、來源／單位 schema、Decimal 加總與 completeness；保留原始來源標記。
- 驗收：把 null 當 0、漏算第二天同食譜、先取整再比較各做一次 mutation。fixture 必須包含不同份量、生熟狀態與來源，不能全部同值。

### T05 — 提案與局部修改

落點：`planning/domain/`、`application/`、`api/`；對應 A5、A7、A9 的 domain 部分。

- RED：三天候選符合硬限制；第二天雞肉換豆腐時其他餐完整不變；鎖定包含份量；無受控替代、設備不足與搜尋預算耗盡各回正確原因；未採用不修改 base。
- GREEN：有限搜尋、scope／鎖定驗證、canonical proposal／diff、API evaluate 與 validate；卡片及 tool 可共用的 application 入口。
- 驗收：成功替代與無解案例都測；scope 外快照作精確比較。移除 scope 或鎖定檢查必須紅；搜尋耗盡只說未找到，不宣稱全域無解。來源被竄改不能通過 canonical 驗證。

### T06 — 購物、庫存與備餐

落點：`modules/shopping/`、`prep/` 與 planning 組合；對應 A3、A6、A11。

- RED：跨餐同食材合併後庫存只扣一次；刪餐重算不為負；不同生熟／規格／不相容單位不合併；外食不入採買；增加數量讓已勾項重新確認，未受影響勾選保留。
- GREEN：純 use cases 算需求與清單；料理步驟依前置關係、設備序列與分裝量組合。未知保存／復熱資訊保持未知，不生成保證。
- 驗收：只有電鍋不得選其他設備食譜；同設備時間不重疊，分裝量對得回餐次。重複扣庫存或允許設備重疊的 mutation 必須紅。

### T07 — D1、匿名身份與原子採用

落點：Worker `server/persistence/`、Web 雲端 PlanRepository client、`deploy/migrations/`、D1 整合測試及 Playwright；對應 A9、A13、A14。

- RED：先寫匿名 session 初始化／讀取測試，無 Cookie、過期或隨機 token 不得讀寫；A、B 兩身份的 planId 交換仍不可越權；跨 origin 修改被擋、正確 Cookie／CSRF 的同源操作可成功。
- GREEN：安全 token＋HttpOnly Cookie、D1 hash 歸屬、parameterized SQL、Worker 公開保存 routes 與 migration。不得把 owner 或 Cookie 交給 Python／模型；公開 planId 不是身份憑證。
- 下一個 RED：同 baseRevision 的兩次提交僅一個成功；Python 驗證後、D1 寫入前插入另一修改，舊候選必須失敗；current／previous 不可只改一半。
- GREEN：Worker 從 D1 讀 base、呼叫 Python，單列 CAS 驗證 owner／generation／revision／期限，檢查 changes 後回 canonical state；Web 等伺服器確認才顯示已保存。
- 下一個 RED：同 operationId 重試不再增加 revision；同 id 不同內容被擋；寫入完成但回應中斷後可讀回；復原後舊候選、清除／到期後晚到初次提案不得重建身份。
- GREEN：操作識別、復原新 revision、刪除 session／清 Cookie、明確新 session 建立；成功內容修改才續 30 天，查看不續期，排程清理過期列。
- 驗收：T07 先以本地 D1 跑 CAS／競爭，部署 D1 的相同案例列入 T11／完整 K3，不能把尚無部署環境當成本地開發的循環前提，不用純 SQLite 或 mock 成功取代 binding；兩頁用 barrier 協調，另用兩 browser contexts 驗身份隔離。移除 owner、revision 或 expiresAt predicate 各須紅，合法對照維持綠。清除途中／保存中 D1 失敗不冒稱成功；未知 schema 不刪資料；Cookie 遺失不恢復舊身份。驗排程清理前已拒絕過期讀寫，清理後舊請求仍失敗。Migration 先在空庫與舊 schema fixture 測試，再以相容前後版本驗回復。

### T08 — 雙入口與可操作切片

落點：Web goals／planner／shopping／prep；對應 A1–A9、A11–A13 的畫面整合。

- RED：以可見行為跑「手動目標 → 三天提案 → 預覽 → 採用 → 局部換菜 → 清單更新 → 關頁恢復」，尚缺任一步就明確失敗；引導估算另走同一確認入口。
- GREEN：薄 route、共用工作區狀態與卡片；接真 API/domain，用合成資料及可控模型替身。預覽與已採用狀態明確區分。
- 驗收：兩入口最後使用相同 confirmed goal 契約；取消預覽不動原計畫，卡片及清單同 revision。D1／保存 API 中斷時，已載入快照唯讀，採用／復原／勾選不冒稱成功；重開需雲端可用，沒有本機 fallback。只有模型停用時仍能純計算與保存；Python 中斷時讀取、勾選及復原仍走 Worker。

### T09 — 正式 Agent 與失敗恢復

落點：`planning/agents/`、API `/agent`、Web chat；對應 A5、A7、A10、完整 K2。

- RED：透過真框架讓 find_recipes／build_proposal 使用 T05／T06 use cases；工具錯誤、無效參數、取消、串流中斷及晚到事件都不能產生可採用的半成品。
- GREEN：正式工具、request-scoped context、有界重試、proposal_ready 與一致的錯誤／重試 UI；每次從已採用快照建 context。
- 驗收：連續兩輪提案、只採用第二輪時第一輪不能覆寫；前一未採用內容不能污染新 run。事件分段與順序用可控 transport 故障重現，仍由官方 adapter 產生正式事件。live 重驗完整工具鏈，不能只保留 T03 的 probe 成功紀錄。

### T10 — 跨邊界故障與隱私

落點：整合／e2e、proxy／API 限額及 logging 設定；對應 A10、A13–A14、N8。

- RED：兩匿名使用者 context 互不污染，不能讀寫對方餐單；原始身體問卷不得出現在 request、SSR、D1、log／trace；模型額度不足及 timeout 不切付費、不把 fixture 當 live。
- GREEN：入口 allowlist、body／訊息／工具次數／時間限制、run 清理、純計算可用性與明確 fixture/live 標示。
- 驗收：正常與超界請求成對測；fake clock 驗 timeout，真串流驗中止。移除問卷過濾、身份歸屬、CSRF、run token 或任一關鍵限額時對應測試紅；恢復後綠。公開 proxy 不能任意轉送 URL，後端入口隔離於 T11 用真部署驗證。

### T11 — 實際部署與回復演練

依賴：選定 Python 主機、必要外部授權與可用免費模型帳戶條件；本計畫不替代登入／secrets 的授權。

- RED／GREEN：可自動化的 proxy 路徑、錯誤與 SSE 行為先以整合測試驅動；帳戶開通、套件安裝及部署以 smoke 記錄，不偽稱業務 TDD。
- 驗收：實際 Workers Web、Python service 及固定上游串流；量測 Worker 與 Python 各自資源、斷線、限流、直接後端繞過是否被擋。跑實際 origin 的 A13／A14，確認 Cookie 屬性、身份隔離、安全快取、D1 用量失敗及版本不相容時保留雲端資料。
- 回復：記錄可回復的 Web/API artifact 組合與契約版本；演練回到前一相容 artifact。D1 migrations 採先擴充相容 schema 再部署 consumer；回復應用不盲目 down migration、不清庫。任何破壞性變更須另有資料回復計畫與授權。

### T12 — 完整驗收與交付

- 依下表核對所有 A／N 案例、完整 K1–K3 及 CI 實際執行結果，不用單一 coverage 百分比取代驗收。
- K4：A1、A3、A5、A10 各至少三次 live，記模型版本、token／Neuron、延遲、來源及繁中品質；額度失敗可用可控故障注入驗恢復，不以故意耗盡帳戶當必要實驗。記錄 live 與注入證據的差別。
- 任何關鍵約束失敗回對應增量補 RED／GREEN，再重跑受影響案例；額度不足分日驗證，不自動付費。
- 補可重跑 README、展示合成標示、已知限制與復現路徑；所有必要證據齊全才宣稱 MVP 完成。此時再做整體規格／架構與實作對照，不能只看單項測試綠燈。

## 5. 驗收追溯

| 規格案例 | 主要增量 | 最終證據 |
|---|---|---|
| A1、A2、A12 | T01、T02、T08 | 目標 API／estimator、兩入口瀏覽器流程 |
| A3、A4、A8 | T04、T06、T08 | 外食、null、涵蓋餐次與清單畫面 |
| A5、A7 | T05、T08、T09 | scope／locks、卡片與對話同規則、無可行解 |
| A6、A11 | T06、T08 | 庫存／單位／設備、分裝與步驟 |
| A9 | T05、T07、T08 | 預覽不變、原子採用、復原、過期／重複提案 |
| A10 | T03、T09、T10、T12 | 工具／模型／串流失敗、重試及免費耗盡 |
| A13、A14 | T07、T08、T10、T11 | D1／Cookie 歸屬、雙頁 CAS／清除／到期／寫入失敗 |
| N1、N2、N3 | T02 | 獨立 golden、所有輸入端點與適用分流 |
| N4、N5、N6 | T01、T04 | API 端點、Decimal 容許差／衝突 |
| N7、N8 | T01、T02、T04、T08、T10 | 缺值、確認邊界、全資料路徑隱私 |
| K1 | T00、T01、T02、T04 | 封裝／生成契約及 N1–N8 的相關部分；N8 整合證據於 T10 補齊 |
| K2 | T03、T09 | 真框架＋正式 tools＋live 往返及取消 |
| K3 | T03、T07、T10、T11 | workerd 與實際部署、Python、保存完整驗證 |
| K4 | T12 | 指定案例各三次 live 與用量／耗盡證據 |

## 6. 執行證據格式

每個小循環追加：`項目／行為 → 測試路徑與名稱 → RED 命令、版本及實際失敗 → GREEN 同命令結果 → 受影響回歸 → mutation／故障（適用時）→ commit 或 artifact → 尚未驗證事項`。大型 log 用可定位 artifact，避免貼問卷、對話或憑證。命令使用當次實際 checkout 絕對路徑。

每一已驗收項需能對回可重跑命令；若 RED 不是預期原因，修測試環境或資料後重新確認，不能照抄本計畫的預期文字充當證據。純文件檢查不列入應用 RED／GREEN。

### 2026-09-28 基礎切片執行紀錄（commit 4e53bd8）

- T00：`test_health.py` 先 404 assertion RED，加入 `/health` 後 GREEN；fixture 標示在 Vitest／Playwright 都先缺元素 RED，再 GREEN。故意改錯 health 回應會失敗，已還原。wheel 在 `.artifacts/wheel-env` 安裝後由 `/tmp` 以 `python -I` import 成功。JUnit guard 的 zero／all-skipped／failure 反例均被拒絕。
- T01：目標 API 的有效輸入先 404 RED；邊界循環 21 failed → 23 passed，區間／能量衝突循環 5 failed → 37 passed。獨立 review 找到原始 JSON number 經 float 提早取整，以及回應版本未列 required；各加 2 個 RED 後修正。現在 API 保留 Decimal lexeme 到驗證，生成 schema 要求回應版本。
- T01：`pnpm contracts:check` 與 `pnpm test:contracts` 通過；真 FastAPI HTTP 序列化結果交給 TS client／Ajv 驗證。數字字串、缺欄位、錯版本已有失敗案例；生成漂移 mutation 已完成；保存 DTO／日期與 T04 的餐單總值規則待補。
- T02：八列 golden 與蛋白質先 9 failed，實作後 GREEN；適用範圍與缺值再 23 failed → GREEN。Web 單元當時 45 passed（含 API runtime validator）；問卷資料只在記憶體計算。
- 畫面：手動目標確認先缺表單 RED，引導估算先缺入口 RED。實際 Web → Python route 先 1 failed／3 passed，再 4 passed；另驗舊 confirmed goal 不被 draft 改寫、問卷未出現在 API payload 或 localStorage／sessionStorage，重整後清空。尚無雲端保存。
- T03：PydanticAI 2.51.0＋官方 AGUIAdapter，tool round-trip 先 404 RED → GREEN；取消與無工具結果兩案例 2 failed／1 passed → 3 passed。probe 獨立 app，合成 outcome 明確 `adoptable: false`，不掛入正式 app；未呼叫真模型。
- 工具版本：Python 3.13.13、Node 26.8.1、pnpm 11.2.2、uv 0.7.2、Next 16.3.5、React 19.3.0、TypeScript 5.9.3、pytest 9.1.1、Vitest 4.1.11、Playwright 1.63.0。依賴實際版本以兩個 lockfiles 為準。
- 環境故障獨立記錄：4317／4318 與 Docker listener 衝突，`lsof -nP -iTCP:4317 -iTCP:4318 -sTCP:LISTEN` 證實；改用 14317／14318 後同測試可執行。pnpm 拒絕 esbuild／workerd install script 後，明確 allowlist 再安裝。以上都不是行為 RED。
- 本機證據位於 ignored `.artifacts/`：`t00/*-red.log`、`health-mutation.log`、`agent-red.log`、`agent-outcome-{red,green}.log`、`web-python-red.log`、`web-final.log` 與 JUnit XML。可重跑命令見 README；遠端 CI／部署與完整 K1–K4 尚未驗收。

- T03 workerd：vinext 1.0.0-beta.13、Wrangler 4.141.0、Miniflare 5.20260925.0-alpha。首次啟動發現 Ajv runtime compile 不相容，改用同源 schema 的 standalone 預編譯；第二次抓到 redirect:error 不支援，新增回歸先 RED、改 manual＋拒絕 3xx 後 GREEN。Node 與 workerd 共用 fixed-path proxy，不轉送 Cookie。
- T03 workerd 瀏覽器：四個既有案例通過；新增 SSE 案例先 `/api/agent` 404 → 加固定串流 route → 5 passed（`.artifacts/sse-green.log`）。官方 adapter 完成 synthetic tool 往返，outcome 綁 runId 且明確不可採用。此案例驗事件傳輸，尚不等於 UI run token／真斷線及完整 K2。
- 本地 D1：`pnpm --filter @meal-prep/web test:d1` 通過 ephemeral binding 的 prepared write／read／missing-row smoke；使用 Miniflare 5 原生 config。沒有正式保存 schema、CAS 或雲端 D1。
- Mutation：TS 型別產物與 standalone validator 各自加入漂移，生成 gate 均拒絕；成人門檻 19 改 18，38 個 estimator 案例中對應 1 個失敗；已精確還原，見 `.artifacts/mutation-{0,1,2}.log`。不把 mutation 當首次 RED。
- 獨立設計審查涵蓋契約生成／proxy／取消／probe factories／Cloudflare 接線，兩輪皆無設計發現。先前 correctness review 的兩個契約問題已修正；基礎切片已提交 4e53bd8，未推送。
- Cloudflare OAuth 登入狀態已由 Wrangler 確認；live factory 所需專案 API 環境變數未設定，Will 隨後提供指定 Cloudflare 設定，account token 驗證 active；以該 token 完成一次 GLM live 工具往返。登入／下載已授權，不再重問。遠端 CI、部署、正式 D1 保存與 T04–T12 仍未完成。

- Live：2026-09-28，固定 `@cf/zai-org/glm-4.7-flash` 完成官方 adapter 的 tool call／result／proposal_ready／RUN_FINISHED，HTTP 200，9.71 秒，無 RUN_ERROR；`.artifacts/live-probe.log` 僅保存事件類型與合成 outcome，不記憑證。一次 transport probe 不等於 K4 品質／用量驗收；未量 Neuron。token 依使用者指定來源沿用，未另建 token。
- 空間限制：本機曾 ENOSPC，僅清除本輪可重建快取後剩約 211 MiB；後續 df 已恢復約 4.1 GiB；大型安裝／build 前仍先查可用空間。

### 全計畫持續執行

使用者已指定完成本計畫全部 T00–T12 為目標，並授權每階段必要驗證通過後直接 commit；不因已有部分 GREEN 即結束整體目標。基礎切片先提交，後續 commit 依各階段完成範圍命名，外部 gates 仍需真實證據。

### 2026-09-28 目標輸入與確認增量

- 手動數值先以原始十進位文字檢查精度，再轉 JSON number；支援 `下限..上限`、選填 carbs/fat，空白與 0 分開。`pnpm test:web`：parser 8 failed → GREEN，`.artifacts/target-parser-{red,green}.log`；瀏覽器先無區間輸入 RED → 6 passed，`.artifacts/manual-ranges-{red,green}.log`。
- `goal-state.test.ts`：來源／UTC 確認時間／快照隔離 3 failed → GREEN，`.artifacts/goal-metadata-{red,green}.log`。本機 ConfirmedGoal 保留允許欄位；GoalDraft 的原始身體輸入、EER、意圖調整值不進確認快照。此型別仍是 UI 狀態，公開保存 DTO 於 T01/T07 同源生成，不宣稱已有保存 API。
- `pnpm test:e2e`：來源及原始估算顯示 2 failed → 6 passed；活動不確定先比較、無 API payload／無確認卡，1 assertion failed → 6 passed，`.artifacts/goal-metadata-ui-{red,green}.log` 與 `activity-ui-{red,green}.log`。兩次 locator strict-mode 衝突已縮小為 goal region／combobox，不放寬業務 assertion。
- 本次 `pnpm test:web` 57 passed（`.artifacts/goals-final-web.log`），`pnpm typecheck` 通過（`.artifacts/goals-final-types.log`）；尚未將 T02 全部 gate 標完成。

- 獨立 design-review 發現表單重複意圖調整計算（1 項，採「改」）；已將 adjustedKcal 收回 estimator，表單只讀結果。新增 assertion 1 failed → 58 passed（`pnpm test:web`，`.artifacts/adjusted-energy-{red,green}.log`），八列 golden 包含獨立未取整期望值，複查確認原發現已解決。

- 最終增量 gate：`pnpm typecheck`、`pnpm --filter @meal-prep/web build:vinext`、`MEAL_TEST_WORKER=1 pnpm test:e2e` 通過，workerd 6 passed（`.artifacts/goals-worker-{build,e2e}.log`）。Node 6 passed 在 estimator 搬回單一計算來源前完成；該 refactor 後再跑單元／typecheck／workerd。沒有重跑未變更的 Python domain 或假稱遠端 CI 通過。

### 2026-09-28 T03 串流 consumer 與取消驗收

- `run-state.test.ts`：裸 RUN_FINISHED、缺 outcome、晚到事件、取消／錯誤、runId 不一致 6 failed → GREEN（`pnpm test:web`，`.artifacts/run-state-{red,green}.log`）。移除 outcome／取消守門均被 mutation 抓到，已還原（`.artifacts/run-state-mutation-{outcome,cancel}.log`）。
- 瀏覽器 consumer 先缺按鈕與結果 assertion 2 failed → GREEN（`.artifacts/probe-ui-{red,green}.log`），取消與重試透過 barrier 控制晚到回覆；沒有以 sleep 猜測 UI 完成。
- 設計審查 1 項「改」：最初自製 SSE reader 偏離架構 HttpAgent，已移除，改用固定 `@ag-ui/client` 1.0.0，保留應用層 run token／outcome reducer；複查 NO DESIGN FINDINGS。最終官方 client 的任意 UTF-8 byte 分段、fetch AbortSignal 測試通過；先前 custom reader 的 3 個測試不再列最終測試數。
- Provider 清理屬既有框架行為，記回歸驗證而非首次 RED：`uv run --project backend --frozen pytest backend/tests/test_agent_disconnect.py -q` 以獨立 ephemeral TCP server 發送真 SSE，收到首段後關連線，provider iterator finally 在 3 秒內觸發，server 可停止（`.artifacts/tcp-disconnect-regression.log`）。
- workerd 真瀏覽器中止：收到 RUN_STARTED、尚未 proposal_ready 即 AbortController.abort，reader 回 AbortError；Wrangler 印出技術訊息 `Network connection lost`，取消後可進行下一次正常 run。沒有以此宣稱部署端清理已驗收，部署仍由 T11 驗證。synthetic probe 的工具刻意延後 1 秒供取消觀察；live 無此延遲。
- 最終 gate：Python 45 passed（`.artifacts/t03-python.log`）、Vitest 66 passed（`.artifacts/http-agent-web-final.log`）、typecheck／ruff／mypy 通過，vinext build 後 workerd Playwright 10 passed（`.artifacts/http-agent-worker-{build,e2e}.log`）。Node 10 passed 在測試 bare-finish fixture 補齊 RUN_STARTED 前完成；正式 fixture 補齊後於 workerd 重驗。
- 相容性邊界：HttpAgent 1.0.0 對 CRLF fixture 解析失敗（`.artifacts/http-agent-web.log`）；目前固定官方 AGUIAdapter 實際輸出 LF，proxy 原樣轉送，最終驗證使用同一 LF 協定。未宣稱一般 SSE CRLF 相容；更換 producer／換行格式前必須先補其相容性驗證，不以自製 parser 繞過官方 client。
- 此 T03 只證明最小整合；正式餐單 tools／多輪狀態及 live 品質仍屬 T09/T12，保存身份／CAS 仍屬 T07。

### 2026-09-28 T04 受控食譜與營養計算

- 新增前 consumer 搜尋：`rg -n 'Recipe|PlannedMeal|NutritionTotal|calculate_day' backend/src backend/tests` 無匹配；新增後以 `rg -n 'recipe_meal|load_catalog|calculate_day|NutrientValue|MealNutrition' backend/src backend/tests` 確認 consumer 為新 recipes application 與三個 T04 測試檔，未變更既有目標 API。
- `test_nutrition_totals.py`：跨天同食譜／每日份量、外食缺值、部分餐次、2100.1 kcal／99.9 g 原值比較、未知來源版本，7 failed → 7 passed（`uv run --project backend --frozen pytest backend/tests/test_nutrition_totals.py -q`，`.artifacts/t04-totals-{red,green}.log`）；空介面沒有產生 kcal total 的案例為輸出資料缺漏，其餘為業務 assertion。後續補每100g、指定外食日期／餐次與未設定營養項回歸。
- `test_recipe_portions.py`：非法份量／增量／非有限值與半顆食材，7 failed → 7 passed（`.artifacts/t04-portions-{red,green}.log`）。食譜 adapter 先缺營養／未守份量而 2 failed，再接受控來源與份量驗證 GREEN（`.artifacts/t04-recipe-adapter-red.log`、`t04-domain-green.log`）。
- Catalog：缺受控 recipe IDs assertion RED → GREEN（`.artifacts/t04-catalog-{red,green}.log`）。8 筆合成食譜隨 Python package 保存，數字不是實測；生／熟／即食狀態、g/ml/piece、營養來源版本、件數增量、設備／步驟、未知保存／復熱／成本均明示。筆數由 checkout 外 wheel smoke 的 `assert len(load_catalog()) == 8` 核對，非人工估計。
- 三種 mutation：null 當 0、跨天先依 source_id 去重、比較前取整，皆使對應測試失敗，finally 精確還原（`.artifacts/t04-mutation-{null,cross-day,rounding}.log`）。
- 獨立 correctness review 找出部分餐次個別 within_target 與先除後乘的件數誤差，兩項皆採修正。對照產品 §7 修正原錯誤 assertion，新反例 2 failed → GREEN（`.artifacts/t04-review-red.log`）；個別達標也需 full_day，件數改以原始 quantity*amount 對 basis*increment 整除，不先算1/3。複查無新增問題。
- 最終 Python 66 passed（`uv run --project backend --frozen pytest backend/tests -q`，`.artifacts/t04-python-final.log`）；ruff check／format 與 mypy no-incremental 通過。`uv build --project backend --wheel --out-dir .artifacts/t04-dist` 後安裝至隔離 wheel-env，從 `/tmp` 以 `python -I` 載入 packaged catalog 並驗1.5份雞肉飯為1050 kcal（`.artifacts/t04-wheel*.log`）。Web／公開契約未改，未額外重跑不受影響的瀏覽器流程。
- 配餐搜尋／scope／外食鎖定與 API 串接由 T05 接續；購物／設備排程由 T06 接續，沒有將純營養計算宣稱完整餐單已完成。


### 2026-09-28 T05 三天提案與局部修改

- Consumer 盤點：`rg -n -g '*.py' -g '*.ts' -g '*.tsx' -g '!schema.d.ts' -g '!*-validator.d.ts' 'build_proposal|validate_proposal|ConfirmedGoal|validateBuildResult|validateEvaluation|validateProposal' backend/src backend/tests apps/web/src apps/web/tests`；結果為 planning application／API／測試、生成 validator wrapper 與既有 GoalSetup／goal-state，詳 `.artifacts/t05-consumers.txt`。ConfirmedGoal 改由 OpenAPI 生成；Worker 保存 DTO 仍待 T07。
- `uv run --project backend --frozen pytest backend/tests/test_planning.py -q`：evaluate 空介面 6 failed → GREEN；scope／份量鎖定空驗證 2 failed → GREEN，base 未被修改且 scope 外完整 snapshot 相等。最初測試直接指定 int 造成 `.is_finite` 錯誤不算 RED；修成 Decimal 後重新以空驗證確認 assertion RED。來源竄改案例屬既有 canonical 檢查的回歸保護。
- `test_planning_search.py`：三天／預算／設備及受控替代 3 failed → GREEN；第二天限定換菜、固定外食與鎖定循環 2 failed → GREEN。beam 16、每餐最多 4 食譜、3 輪，另以最多 20,000 次展開限制請求；失敗只回搜尋範圍內未找到或具體衝突，不宣稱全域無解。
- `test_planning_api.py`：evaluate／build／validate 真 HTTP 先 404 assertion 2 failed → GREEN。日期、UTC timestamp、嚴格版本／安全整數及 number/null 由 Python 公開契約生成 TS／Ajv standalone validators；HTTP 回應交生成 client 再驗 runtime schema。缺營養 key／缺版本反例先 1 failed，補輸出 required 與 nutrient key 數量後通過，未手改生成產物。
- 邊界循環：重複 base／fixedMeal、bool 版本、數字 timestamp、三天日期溢位；已知 kcal 衝突不可因 protein 未知而隱藏；固定餐點和明確替換衝突；soft time 超過只警告、hard time 拒絕。各有實際 RED/GREEN，見 `.artifacts/t05-{boundary,known-target,fixed-conflict,soft-time}-red.log`。
- 審查修正：design-review 1 項採「改」，搜尋與 evaluation 共用 `meal_nutrition`。correctness 4 項：3 改、1 駁回。數值超出 JSON client 可表示範圍、除法後溢位、revision 超過 2^53−1，4 failed → GREEN；解鎖外食的明確 replacement 原被忽略，1 failed → GREEN。刪餐禁止建議駁回：T06 明列刪餐重算，產品 §3 允許暫未安排；scope／lock 仍驗證，coverage／fullDay／withinTargets 已表達缺餐與未知，不宣稱全天達標。
- Mutation：移除 scope／locked guard 均使測試紅，finally 還原，`.artifacts/t05-mutation-{scope,lock}.log`。與原始開發 RED 分開記錄。
- 最終 Python `pytest backend/tests -q`：95 passed（`.artifacts/t05-python-final.log`）；Web 66 passed（`.artifacts/t05-web-final.log`）；契約 wire 為 2 個 Python producer＋2 個 TS consumer 測試。ruff、mypy、typecheck、contracts:check 通過；Next 與 vinext build 通過、workerd Playwright 10 passed（`.artifacts/t05-{next-build,worker-build,worker-e2e}.log`）。build／瀏覽器在最後純 Python 邊界修正前完成，修正後重跑 Python／契約／typecheck，未假稱重跑未受影響的瀏覽器。
- 此階段交付 Python API 與可共用 use cases；購物／備餐由 T06、D1 採用由 T07、完整卡片流程由 T08、正式 tools 由 T09 接續。沒有將 Python canonical 驗證當成已保存或已核驗身份。


### 2026-09-28 T06 採買、庫存與備餐

- 前提核對：維持受控合成食譜、Decimal、純 application use cases，沒有保存或模型呼叫。consumer 盤點 `rg -n 'request.base|req.base|base=|Evaluation|CanonicalProposal' backend/src/meal_prep/modules/planning backend/tests/test_planning* apps/web/tests/contracts/wire.test.ts`（`.artifacts/t06-consumers.txt`）；清單需保留勾選，base 由 PlanCandidate 升為完整 Evaluation，所有 producer／consumer 同步，目前尚未部署，不需維持舊的裸 candidate 請求相容層。
- `test_shopping.py`：合併後單次扣庫存、刪餐不為負、生熟／規格／g對ml隔離先 2 個 assertion RED；第三個空介面結果原為 IndexError，不列業務 RED，補明確數量 assertion 並重現初始 stub RED 後回 GREEN（`.artifacts/t06-shopping-corrected-red.log`）。確認的 kg→g、l→ml 庫存才扣抵；未知／未確認數量保留 warning。相容單位的重複庫存 key 拒絕，防止重複扣抵。
- 勾選：增加需要量或剩餘採買量，原已勾項需重新確認；未受影響與減量保留。`test_shopping.py` 1 failed → GREEN，重算不得抹除未確認提示另 1 failed → GREEN（`.artifacts/t06-shopping-checks-red.log`、`t06-reconfirm-red.log`）。只有 key／需求內容影響採買狀態，不修改輸入快照。
- `test_portion_ingredients.py`：1.5份雞肉飯獨立期望270g雞／150g米／180g菜，先空結果 assertion RED → GREEN。採買只收已展開自煮食材；external 仍計營養但沒有採买或料理步驟。
- `test_prep.py`：缺步驟與缺設備兩個 RED → GREEN；依食譜前置關係及各設備時間安排，同設備不重疊，無設備的準備工作也序列。保留每份對应日期／餐次／實際份量，未知保存／復熱為null、時間明示合成估計。未臆測設備容量或將跨餐數量當成一鍋可同時完成。份量變更只取消該餐步驟勾選，1 failed → GREEN。
- 完整衍生快照：evaluate 回購物／prep，proposal 含 shoppingDiff／prepDiff；API 缺公開欄位 assertion RED → GREEN。搜尋省略 pantry 代表沿用base，明確空陣列代表清空；原本意外清空造成scope拒絕，1 failed → GREEN（`.artifacts/t06-preserve-stock-red.log`）。pantry 變更仍須全餐 scope。
- 設計審查1項採「改」：從營養adapter抽出 `validate_recipe_portion`，營養／採買／prep 共用驗證，複查解除。correctness 1項採「改」：evaluate HTTP 原無法收base導致勾選重置；改為 EvaluatePlanRequest(candidate,base)，先重算base再計算候選。不變／增加份量兩個真HTTP RED → GREEN（`.artifacts/t06-evaluate-checks-red.log`）；consumer 搜尋及結果在 `.artifacts/t06-evaluate-consumers.txt`。
- 契約 gate 曾因 Pydantic 產生 Evaluation-Input/Output 而 missingRef，記 schema integration RED，非業務 RED。generator 改由 API 200 response 取得 schema，TS wrapper 同樣引用 paths response，不依賴 component 命名；產物由固定工具重新生成。wire 額外驗採買數字、9份分裝、null保存、衍生diff、缺清單／缺合成標示／非法日期拒絕。
- Mutation：庫存扣抵倍增與移除設備可用時間，各使對應 assertion 紅；finally還原（`.artifacts/t06-mutation-{stock,equipment}.log`）。未將 mutation 冒稱開發 RED。
- workerd 回歸曾1 failed／9 passed，probe按鈕點擊後仍是初始狀態；原案例單項重跑3次通過，不能宣稱已定位。另以延遲JavaScript的barrier獨立重現 hydration前按鈕可點（expected disabled/received enabled）；新增ready門檻，僅hydration後啟用（`.artifacts/t06-hydration-red.log`）。不以增加timeout隱藏失敗。

- 最終驗證：`uv run --project backend --frozen pytest backend/tests -q` 109 passed（`.artifacts/t06-python-final.log`）；`pnpm test:web` 66 passed；`pnpm test:contracts` Python producer 2＋TS wire 2 passed，contracts:check／ruff／mypy／typecheck 通過。Next build、vinext build 通過，`MEAL_TEST_WORKER=1 pnpm test:e2e` 11 passed（`.artifacts/t06-worker-e2e-final.log`），包含新增 hydration barrier。獨立複查確認 evaluate 契約 consumer 全部同步。尚無保存或完整操作 UI，不將 T06 純計算驗收等同 T07/T08。


### T07 本地保存與身份驗收（2026-09-28）

- 前提仍為 Cloudflare D1／匿名 Cookie、單列快照、Python canonical 驗證、無瀏覽器持久化。首次 migration 新增 `plan_sessions`；`git ls-tree -r --name-only 3fc9e50 deploy` 無輸出，沒有舊產品 schema。相容 fixture 使用 T03 的 probe table，測試保留原資料並可讀寫新 session；回退應用保留新增表，正式部署回退由 T11 驗。
- `pnpm test:web`：session 初始化／歸屬 2 RED → 68 GREEN（`t07-session-{red,green}.log`）；CAS 2 RED → 71 GREEN（`t07-cas-{red,green}.log`）；HTTP Cookie／Origin 2 RED → 73 GREEN（`t07-http-{red,green}.log`）；CSRF／清除故障 1 RED → 75 GREEN；adopt／操作識別 1 RED → 76 GREEN；checks／undo 1 RED → 78 GREEN；locks／portion 1 RED → 79 GREEN。以上 artifact 均在 `.artifacts/`。D1 由 Miniflare 真 binding 執行，沒有以純 SQLite 或成功 mock 取代 CAS。
- 公開 Worker routes：明確建 session、讀取、adopt／portion／locks／checks／undo 與清除；256-bit token 僅在 HttpOnly Secure Host Cookie，D1 存 hash。Python 收服務端讀取的 base，不收 Cookie／owner；單列 prepared UPDATE 核對 owner、generation、planId、revision、schema、expiresAt，只有一列修改才成功。GET／no-op／同 operationId 重試不續期；成功內容修改續 30 天；每日排程清理，讀寫不依賴排程才拒絕到期。
- 實際 route RED：`MEAL_TEST_WORKER=1 pnpm --filter @meal-prep/web test:e2e persistence.spec.ts` 預期 201 得 404（`t07-routes-red.log`）；接 custom Worker entry／migration／固定 Python validator 後 GREEN。前置 JSON import／ESM require 環境錯誤不算業務 RED。瀏覽器驗證使用真 Python application、workerd 與本地 D1：兩 contexts 隔離、HttpOnly Cookie、重開讀回、同頁面身份的兩頁 barrier 競爭只有 200＋409、復原與舊提案、commit 後網路中斷仍可讀回 operationId。
- 固定早餐解除鎖定：產品 §3 的 requested slots 限定 Agent 安排範圍，不排斥使用者既有餐點；移除 evaluate 中會誤拒解鎖早餐的 guard，保留日期／recipe slot／scope／hard constraints。`t07-unlock-fixed-red.log` 真 RED，全部 Python 110 GREEN（`t07-python-final.log`）。
- Worker 原始 JSON number 在送 Python 前不可靜默捨入：極小 baseRevision 被 JS 轉 0 曾錯誤成功，`t07-precision-red.log` 1 RED → 80 GREEN。以原始 numeric lexeme／Decimal 比對拒絕精度損失，瀏覽器另驗 schemaVersion 高精度冒充 1 被拒；正常 number round-trip 仍通過。
- PlanRepository 僅使用同源 fetch 與記憶體，回應中斷先讀回核對 planId／generation／revision／operationId，不盲重送。`t07-client-red.log` 3 RED → 83 GREEN；explicit initialize／clear 1 RED → 84 GREEN。未知 schema 不刪資料；最後 UPDATE 故障不改 row／不回續期 Cookie；計算途中到期拒絕。
- Mutation（不是首次 RED）：暫移除 CAS owner／revision／expiresAt predicate，分別 1／3／2 failed，其餘 15／13／14 passed（`t07-mutation-{owner,revision,expiry}.log`）；還原後回歸綠。
- design-review：1 改、0 記、0 提、0 駁回。移除 Ajv 內部 helper mutation，以固定 esbuild 於生成階段 bundle standalone ESM；官方依據為 [Ajv standalone runtime requirements](https://ajv.js.org/standalone.html#requirement-at-runtime)。獨立複查確認解決。correctness review：2 改，no-op 在 Python await 後也須重查身份／期限／revision；DELETE 回應中斷須確認 absence，讀失敗或現存 session 不宣稱已清除。`t07-review-red.log` 2 failed／87 passed → `t07-review-green.log` 89 passed，獨立複查無新增實質問題。
- 最終命令：`pnpm test:web` 89 passed；`uv run --project backend --frozen pytest backend/tests -q` 110 passed；`pnpm contracts:check`、`pnpm test:contracts`（Python 2＋TS 2）、`pnpm typecheck`、ruff check／format、backend mypy、Next build、vinext build 通過。`MEAL_TEST_WORKER=1 pnpm test:e2e` 12 passed（`t07-worker-e2e-final.log`）；本地通過不代表部署 D1／K3 或完整 UI 完成。T08 接操作畫面，T11 驗正式 D1／Python 隔離與回退。
