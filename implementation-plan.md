# Meal Prep Agent — TDD 實作計畫

更新：2026-09-29。T00–T10 的功能與本機驗證已完成；T11 的 Oracle Web／API 與多項部署驗證已完成，依 Will 最新決定將保存 API／資料由 D1 移至 Oracle，以解除 Worker Free CPU 保存路徑超限；T12 真模型矩陣、A/N/K 對帳與遠端 CI 已驗，最終 MVP 判定須在遷移後重驗 K3。依 [產品規格](product-spec.md)、[營養政策](nutrition-policy.md) 與 [架構](architecture.md) 實作。採 RED → GREEN → REFACTOR，小增量交付；本文件保存細項及執行證據，不另訂產品優先序。

## 1. 前提與接續方式

維持 Next.js／TypeScript、FastAPI／PydanticAI、AG-UI、Python Modular Monolith；Web 本機身體估算、Python 配餐驗證、匿名 Cookie 保存。第一版無帳號、Temporal 或跨裝置保存。免費模型與 Python 獨立部署的限制仍有效；部署主機已選既有 Oracle VM，以專案獨立容器／網路／Tunnel 隔離。T07 已完成 D1 保存，本輪 T11 依新決策改為 Oracle SQLite；身份與餐單歸屬檢查移到 Oracle Web，Worker 保留公開入口與限流。

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
| T00 | 無 | 可執行測試環境、封裝、基本 CI | 已驗收：封裝／測試／build；公開 repo 遠端 CI `fb235ab` 的 Python／Web 兩 job 成功 |
| T01 | T00 | API 契約（含 Worker 保存）與已確認目標驗證 | 已驗收：目標 API／生成契約、Worker 保存 DTO／wire、日期／版本與原值邊界於 T04／T05／T07 補齊 |
| T02 | T01 | 本機身體估算及確認邊界 | 已驗收：八列估算／表單／確認、metadata／鄰級比較，保存契約與全路徑隱私於 T07／T10 補齊 |
| T03 | T01；可先於 T02 | Agent／AG-UI／workerd／D1 最小整合 | 已驗收（最小整合）：官方 HttpAgent／adapter、run token／取消、workerd SSE／中止、本地 D1 與一次 live；完整 K2/K3 留 T09/T11 |
| T04 | T01、T03 可行性 | 食譜資料與營養計算 | 已驗收：受控合成資料、份量／來源、Decimal 小計／完整性與三種 mutation |
| T05 | T04 | 三天提案、局部修改及硬限制 | 已驗收：有限搜尋／canonical API、scope／鎖定／來源、真 HTTP 跨語言契約 |
| T06 | T05 | 購物、庫存與備餐衍生資料 | 已驗收：庫存單次扣抵、勾選／衍生diff、設備序列與分裝、HTTP完整快照 |
| T07 | T01、T05、T06 | D1／匿名身份、原子採用與清除 | 本地驗收完成；部署案例由 T11 驗 |
| T08 | T02、T07 | 雙入口與手動操作完整切片 | 本地驗收完成：兩入口、營養／比較、採用換菜恢復及故障唯讀；設計與正確性審查已修正 |
| T09 | T03、T08 | Agent 對話、工具與失敗恢復 | 已驗收：正式 tools／Worker／聊天、取消與故障恢復、兩輪提案及一次 GLM live 完整工具鏈；品質矩陣留 T12 |
| T10 | T09 | 多分頁、隱私與限額故障測試 | 已驗收（本地）：入口限流／body／run／token 預算、模式選擇／額度恢復、隱私／雙匿名context與mutation；真部署邊界留T11 |
| T11 | T10；部署條件具備 | 實際環境與完整 K3 | 進行中：Oracle Web/API、D1故障／隔離、取消及整組回復已驗；依新決策將保存 API／資料遷至 Oracle，完成後重驗 K3 |
| T12 | T11 | live K4 與完整 MVP 驗收 | 進行中：四案例各三次 live、正式入口 Web live、A/N/K 對帳、帳戶 Neuron 分析計量與遠端 CI 已驗；最終 MVP 依賴遷移後的 T11 K3 |

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
- 驗收：實際 Worker 入口、Oracle Next.js Web／Python service 及固定上游串流；量測 Worker CPU 與 Oracle 兩服務各自資源、斷線、限流、直接後端繞過是否被擋。跑實際 origin 的 A13／A14，確認 Cookie 屬性、身份隔離、安全快取、D1 用量失敗及版本不相容時保留雲端資料。
- 回復：記錄可回復的 Web/API artifact 組合與契約版本；演練回到前一相容 artifact。D1 migrations 採先擴充相容 schema 再部署 consumer；回復應用不盲目 down migration、不清庫。任何破壞性變更須另有資料回復計畫與授權。

### T12 — 完整驗收與交付

- 依下表核對所有 A／N 案例、完整 K1–K3 及 CI 實際執行結果，不用單一 coverage 百分比取代驗收。
- K4：A1、A3、A5、A10 各至少三次 live，記模型版本、token／Neuron、延遲、來源及繁中品質；額度失敗可用可控故障注入驗恢復，不以故意耗盡帳戶當必要實驗。記錄 live 與注入證據的差別。
- 任何關鍵約束失敗回對應增量補 RED／GREEN，再重跑受影響案例；額度不足分日驗證，不自動付費。
- 補可重跑 README、展示合成標示、已知限制與復現路徑；所有必要證據齊全才宣稱 MVP 完成。此時再做整體規格／架構與實作對照，不能只看單項測試綠燈。

### T11 追加 — Oracle 保存遷移與切換（2026-09-29 決策）

Will 已決定把保存 API 與資料一併移到 Oracle，取代正式執行路徑的 D1。現有 49 筆 D1 session（`SELECT COUNT(*)`），其中 26 筆有已採用餐單；`expiresAt > now` 查詢確認 49 筆當下仍有效，revision 範圍 0–3、schemaVersion 均為 1。此數量是切換前盤點，切換時重新計數與對帳。沿用公開 DTO、匿名 Cookie、CSRF、CAS、30 天期限與 Python canonical 驗證；從今日條件重設計的結果是 Web 專用 SQLite volume、TypeScript 保存服務、Worker 固定轉送與限流、Python 私有計算服務。單機低寫入量適合 SQLite；PostgreSQL 能獨立擴容但增加服務與備份維運；受管資料庫減輕維運但不符合此版 Oracle 自有資料落點。舊 D1 schema／資料保留作遷移核對與可回復來源，正式 Worker 不再綁定 D1。

1. **RED／GREEN：儲存與路由。** 先為 SQLite 真檔案寫同身份隔離、原子 CAS、期限／清除、restart 後讀回與故障不冒稱成功測試；為 Worker→Web 新固定路徑寫 Cookie 只限保存服務、Authorization／任意 header 不轉送、未知 API 拒絕、SSE 取消與 `Set-Cookie` 保留的 RED。GREEN 後完整重跑既有 `sessions.test.ts`、workerd、Playwright、契約與 build。SQLite volume 用獨立 UID／目錄，WAL 和 busy timeout；Web 無模型憑證，Python 無匿名 Cookie。
2. **資料準備與對帳。** 先在 Oracle 查可用容量、目錄與既有資料；以正式 D1 `--table=plan_sessions` 匯出到受限檔案，在隔離的 SQLite 檔重播並比對列數、schema／revision 分佈及逐列內容摘要。不得在 log、Git 或對話輸出 tokenHash／快照內容；用不可逆摘要做對帳。測錯版與中斷匯入仍保留原 D1 並拒絕啟用候選。
3. **切換與回復。** 短暫停寫（Worker 固定回 503，不發新 session），停寫後再次匯出最終 D1 快照並重建 Oracle 候選 DB；以完整逐列摘要對帳、SQLite 檔案完整性與健康檢查為放行條件。部署 Web/API 相容 artifact 後將 Worker 切到無 D1 的固定 Web 保存代理，驗正式入口兩匿名身份、CAS、採用／復原／重開、Agent SSE、故障與 Free CPU。失敗時先停寫、把 Oracle 已新增／修改列反向合併回 D1 並核對，再恢復舊 Worker；不得直接切回舊 D1 Worker 而遺失新寫入。D1 與備份不清除。
4. **K3／T12 收尾。** 正式 Worker 的保存路徑 CPU 取樣需穩定符合 Free 限額，Node/Oracle 資源與私有入口隔離、容器重啟後資料持續、遠端 CI、完整部署 Playwright 及 live 預覽重驗。更新部署手冊、架構、驗收追溯與 second-brain 專案頁；每個完成子階段完成驗證後 commit，最後才勾 T11／T12 已驗收。

## 5. 驗收追溯

| 規格案例 | 主要增量 | 最終證據 |
|---|---|---|
| A1、A2、A12 | T01、T02、T08 | `test_goals.py`、`estimate.test.ts` 八列 golden／端點、`home.spec.ts` 兩入口、`planner.spec.ts` 引導保存；A1 live 6／7／8 通過 |
| A3、A4、A8 | T04、T06、T08 | `test_nutrition_totals.py` 外食 null／部分餐次、`test_planning_search.py` 固定外食、`planner.spec.ts` 外食保存；A3 live 8／9／11 通過 |
| A5、A7 | T05、T08、T09 | `test_planning.py`、`test_planning_search.py` scope／locks／無解，`planner.spec.ts` 換菜與兩輪 Agent；A5 live 7／8／9 通過 |
| A6、A11 | T06、T08 | `test_shopping.py` 庫存合併／勾選、`test_prep.py` 設備序列／分裝、`planner.spec.ts` 保存清單 |
| A9 | T05、T07、T08 | `sessions.test.ts` CAS／operationId／undo／過期、`planner.spec.ts` 預覽採用復原與重開 |
| A10 | T03、T09、T10、T12 | `test_agent_limits.py`、`chat-faults.spec.ts` 取消／中斷／重試／429；A10 live 5／6／7 明確設備不足，額度耗盡是注入驗證 |
| A13、A14 | T07、T08、T10、T11 | `sessions.test.ts` 身份／CAS／到期／清除、`persistence.spec.ts` 真瀏覽器雙身份、`t11-d1-failure-*.log` 真 D1 故障與回復演練 |
| N1、N2、N3 | T02 | `estimate.test.ts` 八列獨立 golden、蛋白質及邊界／分流、`goal-state.test.ts` 確認與來源 |
| N4、N5、N6 | T01、T04 | `test_goals.py` 十進位原值／容差／能量衝突，`test_nutrition_totals.py` 未取整達標與未知 |
| N7、N8 | T01、T02、T04、T08、T10 | `test_nutrition_totals.py` 缺值／來源、`goal-state.test.ts` 確認邊界、`home.spec.ts` 問卷隱私、`sessions.test.ts` 雙身份 Agent context |
| K1 | T00、T01、T02、T04 | Python wheel 與封裝、`pnpm contracts:check`、`pnpm test:contracts` Python2＋TS2、`test_goals.py`／`estimate.test.ts`／`test_nutrition_totals.py` |
| K2 | T03、T09 | `test_planning_agent.py` 正式 tools／官方 AG-UI、`test_agent_disconnect.py`／`test_sse_heartbeat.py`、`t12-live-*.json` 工具往返、正式入口 live 瀏覽器 |
| K3 | T03、T07、T10、T11 | workerd40、正式 HTTPS 四例、真 D1 故障／取消／相容回復；Worker Free CPU 仍未有穩定 ≤10ms 證據，**待決** |
| K4 | T12 | 四案例各三次 live、token／延遲／來源及受控繁中畫面、429 注入；各案例費率估算與帳戶 GraphQL Analytics 3,486.63 Neurons／10,000 免費額度已記，分析計量不等於帳單數字 |

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


### T08 執行紀錄（2026-09-28）

- Consumer 盤點：`rg -n -g '*.py' -g '*.ts' -g '*.tsx' -g '!schema.d.ts' -g '!*-validator*' 'BuildProposalRequest|BuildProposalResult' backend apps/web/src apps/web/tests`，結果在 `.artifacts/t08-build-consumers.txt`。抽出 Python `BuildPreferences` 共用公開預覽條件；原 build API body／use case 不改語義。Worker PreviewRequest 不接受 caller base，真正 base 從 D1 讀取。
- `POST /api/plan/preview`：先驗 Cookie／CSRF／owner／generation／revision，Python 計算後再檢查目前版本；預覽不寫 D1。`pnpm test:web` 路由預期 200 得 404 的真 RED（`t08-preview-red.log`）→ 90 GREEN（`t08-preview-green.log`）。食譜目錄 GET 404 RED（`t08-catalog-red.log`）→ Python API 提供受控 synthetic catalog；固定 proxy 不轉送 Cookie。
- 完整畫面 RED：`MEAL_TEST_WORKER=1 pnpm --filter @meal-prep/web test:e2e planner.spec.ts` 缺「安排三天餐單」失敗（`t08-flow-red.log`）；接上 PlannerWorkspace／PlanView 後「手動確認→三天提案→採用→局部換菜→取消→再次換菜採用→重開版本2」GREEN（`t08-flow-green.log`）。Worker／Python／D1 都是真實本地服務，不用預錄提案。
- 實際瀏覽器揭露 PlanRepository 把原生 fetch 直接保存成 method 後以 instance this 呼叫，Chrome 回 Illegal invocation；單元 mock 沒揭露。獨立 chromium probe 重現於 `t08-fetch-binding-probe.log`，改成預設 arrow wrapper 保留呼叫語義，完整瀏覽器流程回綠。原先失敗不可歸因 D1 故障。
- 兩入口、鎖定／勾選／復原／清除、保存失敗保留原快照且唯讀、Python preview 不可用時仍可勾選，都在 `planner.spec.ts` 已驗。勾選為伺服器確認後才變更，測試採 click＋revision／checked assertion；不能以 Playwright check 的立即樂觀狀態假設要求產品先顯示成功。
- PlanningForm 補安排餐次、設備、排除／偏好／時間硬限制、固定三天早餐、多個固定外食及已確認庫存；外食空白營養為 null。固定早餐欄位不存在的 RED（`t08-fixed-red.log`）→ 三個 planner cases GREEN（`t08-fixed-green.log`）。庫存單位不存在的 RED（`t08-unit-red.log`）→ kg 0.1 扣抵 g 100 的真瀏覽器流程 GREEN。外食食材不拆入購物／備餐。
- 最新 `MEAL_TEST_WORKER=1 pnpm test:e2e` 15 passed（`t08-e2e-latest.log`），包含既有12與新增3個planner案例；`pnpm typecheck`／vinext build 已通過。其餘目前回歸見 `t08-web-latest.log`、`t08-python-latest.log`、`t08-contract-check.log`、`t08-wire.log`、`t08-ruff.log`、`t08-mypy.log`。
- 上述15個案例為中途證據，後續補完整營養／比較、視覺驗證及獨立審查如下。

- 每餐營養由 Python 共用 `calculate_day` 依實際份量產生，不在 Web 重算；新增 `mealNutrition`、每天各營養 `targetDifference`。未知／部分餐次／未設定目標的差距為 null。逐餐缺欄 RED → GREEN（`t08-meal-nutrition-red.log`）；卡片缺值／未知 RED → GREEN（`t08-meal-view-red.log`）；範圍內外差距3個 RED → GREEN（`t08-target-difference-red.log`）。
- 提案顯示餐點、每日營養、採買與料理步驟的前後差異，目標摘要顯示來源／範圍。合成目標仍須確認；transport probe 移到 `/diagnostics/transport`。比較、產品入口與合成按鈕各自真 RED 記於 `t08-comparison-red.log`、`t08-product-entry-red.log`、`t08-demo-red.log`。
- 清除回應／回讀都失敗時保留唯讀快照；`t08-clear-red.log` 原顯示「已保存」的 assertion RED，修正後完整 E2E GREEN。
- **設計決策（Will 確認）**：採嚴格新契約，不為尚未部署的舊本機快照保留 optional defaults。缺 `mealNutrition`／`targetDifference` 時拒絕 current 或 previous；D1 原列保留至既有到期清理。UI 只在明確按「開始新規劃」後建立新身份，不自動 migrate／delete。維持開發中 v1；本次補輸出欄位沒有更換營養算法。`t08-strict-red.log` 2 RED → 95 GREEN；`t08-recovery-red.log` 舊格式恢復入口 RED → GREEN；D1 測試確認新身份建立後原列內容仍在。
- 獨立 design-review 檢查身份／CAS、preview 邊界、衍生營養、契約／舊快照及 UI 狀態：1 項發現，提1（已獲決定）→ 改1；複查無剩餘 finding。獨立 correctness review 3 項全部修正：中文名稱轉 catalog foodId，未知／歧義拒絕；adopt／undo／reload／失敗回讀同步表單；回讀同時同步 goal。`t08-review-red.log` 3 RED，`t08-goal-recovery-red.log` 預期1800卻送2000的獨立 RED，修正後回歸 GREEN。第二次靜態複查確認3項解決。
- 桌機1360×1000／手機390×844已目視檢查 `.artifacts/t08-desktop.png`、`t08-mobile.png`，無橫向溢出，按鍵焦點可見；Playwright 同時驗寬度及鍵盤焦點。所有畫面資料清楚標示合成或使用者來源。
- 最終驗證：`uv run --project backend --frozen pytest backend/tests -q` 115 passed（`t08-python-verified.log`）；`pnpm test:web` 96 passed（`t08-web-verified.log`）；`MEAL_TEST_WORKER=1 pnpm test:e2e` 21 passed（`t08-reviewed-e2e.log`），新增復原庫存斷言另跑 `--grep 'fixed breakfast'` 1 passed（`t08-undo-pantry.log`）。`pnpm contracts:check`、`pnpm test:contracts` Python2＋TS2、ruff check／format、mypy、typecheck、Next build、vinext build、本地 D1 probe 均通過。原始 RED、後續 mutation 與環境失敗分開記錄；本階段不宣稱正式 Agent／部署／完整 MVP gates 通過。


### T09 執行紀錄（2026-09-28）

- 沿用盤點：從目前約束重新設計仍選官方 PydanticAI／AGUIAdapter、每請求獨立 dependencies、共用 `build_proposal`／`recipe_allowed`，不沿用 probe 的 synthetic/adoptable=false 結果契約；正式結果包含 canonical proposal。UUID／revision／D1 base 沿用 T07 身份／CAS 契約；採用仍為獨立 action。沒有全域 proposal/context；app state 只持 server-configured model。
- `test_planning_agent.py` 正式 `/agent` 原404的3個 RED（`t09-agent-red.log`）→ find_recipes／build_proposal 真框架往返、明確 proposal_ready、純文字不可採用、未設定模型503無synthetic fallback GREEN（`t09-agent-green.log`）。正式 `/agent` 由 create_app 掛載；診斷 probe 已移至 `/diagnostics/agent`，合成測試 factory 同時配置正式工具的 FunctionModel。
- 正式工具依指定scope／replacements呼叫同一use case；on_complete 核對本輪最後build call與成功結果，後續無效tool參數不發布先前候選。not_found 發 proposal_unavailable；真TCP斷線測試同時涵蓋probe與正式route。已驗2輪request不繼承上一輪未採用候選、部分餐次局部換菜精確保留其他餐、全天目標下無可行豆腐替代保持not_found。第一次局部成功測試誤選無可行全天fixture，修正成正／負兩案；不改domain限制、不冒充產品bug RED。
- 公共 Worker AgentRunRequest 生成契約；`sessionHttp` 對Agent入口驗owner／CSRF／run/thread/context IDs、拒browser base並注入D1 current。`t09-worker-red.log` 原404的1 RED → Web97 GREEN（`t09-worker-green.log`）。後續已接 Worker fetch dispatcher、固定 Python `/agent` sender 與正式聊天 UI；匿名 Cookie 不轉送 Python。
- 有界文字歷史：最多12則user/assistant、每則2000字、合計8000字，最後必須user；不收system、tool history、client tool/state/context。`t09-history-red.log` 原422 RED→正式adapter接受歷史。TestModel見既有ModelResponse就不呼叫tools（已查安裝版test.py），故此案改FunctionModel明確發tool call，不能把TestModel排程誤判產品錯誤。
- 真 HttpAgent envelope 額外帶 `protocolVersion: "1.0"`；原 schema 拒絕造成瀏覽器 400，官方 SDK 捕捉測試 1 RED → Web 98 GREEN（`t09-sdk-envelope-red.log`／`t09-sdk-green.log`），由 Python 生成新契約，未手改 validators。
- 聊天先設定已確認條件再執行；兩輪提案只有明確採用那輪寫入 D1。正式 adapter 事件經 transport 注入截斷、外來 run、錯序、取消後晚到、最終雲端 read 失敗，均不能採用半成品，重試可恢復。聊天初始缺入口 RED → workerd GREEN；最終 cloud read 503 原未進唯讀 RED → 修正 readFailure GREEN。
- 獨立 design-review 覆蓋官方 transport、request dependencies、最後 tool call 綁定、ID／revision／CAS、取消、歷史及固定上游；1 項發現採「改」：以 typed Operation 取代 UI 文案控制忙碌狀態，複審無剩餘發現。正確性審查 2 項採「改」：取消先解除 active run，防止舊 finally 清掉新操作；跨頁 revision 改變先 restore 最新快照再重試。兩案首次行為 RED 後 GREEN（`t09-review-red.log`／`t09-review-green2.log`）。同餐單重試採用屬 no-op，依 T07 不增加 revision；測試改驗預覽關閉／版本與鎖定保留，未放寬產品規則。
- 沿用機制重新評估：官方 HttpAgent／adapter、request-scoped deps、UUID／D1 CAS 仍適合目前無帳號且不自建框架的約束；最多 12 則／每則 2000 字／合計 8000 字與 4 model requests／8 tools 保持有界。Worker／client 60 秒上限已存在；Python 整輪 deadline 與全入口 body limit 按既定 T10 補齊，未將單次 provider timeout 當整輪保護。
- GLM live：前三次未通過，第三次明確因推理耗盡 2048 token。依官方 [GLM template](https://huggingface.co/zai-org/GLM-4.7-Flash/blob/main/chat_template.jinja#L85) 在固定 provider 設 `chat_template_kwargs.enable_thinking=false`，保留 max_tokens 2048。第四次正式 `/agent` 成功：find_recipes → build_proposal → proposal_ready → RUN_FINISHED，22.544 秒，input 58,892／output 2,030 tokens、3 requests／2 tool calls（`t09-live-run4.log`）。輸入均合成，未採用或部署；回覆有錯字及每日／三日標題混淆，T12 品質矩陣須改善並重驗，不能從一次 transport 成功宣稱品質完成。
- 階段回歸命令：`uv run --project backend --frozen pytest backend/tests -q` 126 passed；`pnpm test:web` 98 passed；`MEAL_TEST_WORKER=1 pnpm test:e2e` 30 passed；`pnpm test:e2e` Node 12 passed。ruff check／format、mypy 35 source files、typecheck、contracts:check、test:contracts（Python 2／TS 2）、Next build 與 vinext build 通過。證據為 `.artifacts/t09-*-final.log` 與 `t09-review-fixed-build.log`；1440px 桌面並排與 390px 手機聊天截圖已人工檢視。T10–T12、遠端 CI／部署尚未完成。


### T10 執行紀錄（2026-09-28）

- 開工對帳 architecture §8：規格為 request 128 KiB、歷史最多8則；T09實作用12則且無body限制，依SSOT修正，不擅改規格。T09紀錄中的12是當時實際值，本階段收斂為8。
- body正反邊界：Python exact128KiB接受／+1拒絕413、chunked與一般body、8則接受／9則422，首次3 failed＋3 passed（`t10-body-python-red.log`）→ GREEN。Web proxy同界線、未結束分段UTF-8與虛假Content-Length反例首次2 failed（`t10-body-web-red.log`）→ GREEN；超界會cancel reader，不先完整讀取再判定。
- Python pure ASGI middleware在JSON parser前有界讀取；Web共用boundedBody供固定proxy及D1路由。補raw ASGI兩chunk即停止、不讀尾段；D1建立session exact128KiB成功，超界不新增row。沒有把Content-Length當唯一可信依據。
- Python正式Agent整輪60秒deadline獨立於provider單次timeout；超時停止provider iterator，只發run_timeout，不能有RUN_FINISHED或可採用提案。429／500原始provider error body先真RED（共3failed，`t10-agent-limits-red.log`）；透過官方AGUIEventStream公開on_error擴充點轉固定model_quota／model_unavailable／run_limit代碼，避免將原始body／私密sentinel送往client。三案與原真TCP斷線共5 GREEN（`t10-agent-limits-green.log`），未重寫AG-UI解析器或框架。
- 當前回歸：`uv run --project backend --frozen pytest backend/tests -q` 136 passed（`t10-python-current.log`）；`pnpm test:web` 102 passed（`t10-web-current.log`）；`MEAL_TEST_WORKER=1 pnpm test:e2e` 30 passed（`t10-workerd-current.log`）。vinext build、typecheck、mypy37sources、contracts:check／wire2+2通過。測試新增檔及兩個平台helper尚未commit；本階段還未完成。
- 接續：公開限流、fixture/live與429耗盡UI、原始問卷全資料路徑／雙匿名context隔離、fake-clock deadline與關鍵限制mutation、獨立review及階段commit。Cloudflare原生Rate Limiting binding已查官方文件（https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/）：適合此展示入口，低延遲但按colo／eventually consistent，不能當費用硬上限；尚未加binding或改帳戶。原始記憶體limiter跨instance不一致，D1精確計數會增加讀寫，故建議原生binding＋既定免費平台上限；實際配置與閾值驗證接續，不宣稱已完成限流。

- T10公開限流增量：Worker在路由前使用Cloudflare原生binding，API_RATE_LIMITER按雜湊來源300/min、SESSION_RATE_LIMITER按雜湊來源60/min、AI_RATE_LIMITER按雜湊匿名Cookie6/min；缺binding／binding故障回503，不讓API繞過，頁面仍可載入。各namespace為1431701–1431703、key有meal-prep前綴；正式部署前T11核對namespace未與帳戶其他Worker共用。閾值為展示初值，K4依實測再核對，不宣稱全域精確額度。`t10-rate-red.log` 3行為RED → Web105 GREEN（`t10-rate-web.log`）；workerd真binding第7次AI請求429而GET餐單仍404（陌生Cookie）通過，未呼叫live服務。
- T10額度恢復增量：provider RUN_ERROR/model_quota及入口HTTP429均顯示明確原因，暫停新AI 60秒，表單不受影響；fake browser clock於59秒仍disabled、60秒可重試，不自動送請求。`t10-quota-ui-red.log` 2 RED→`t10-quota-ui-green.log` 2 GREEN。Python收到provider429後按app/process共用60秒暫停，直接重送在呼叫provider前429；`t10-quota-server-red.log` 1 RED→137 Python GREEN（`t10-quota-python-green.log`），fake monotonic驗159／160邊界與恢復。這是process級暫停，不取代Worker限流或帳戶免費上限；未自動切換model／fixture。
- 此增量完整workerd33 passed（`MEAL_TEST_WORKER=1 pnpm test:e2e`，`t10-rate-workerd.log`）、Web105 passed、Python137 passed；typecheck、mypy37sources、contracts:check通過，vinext已含原生bindings build成功（`t10-quota-build.log`）。T10仍未階段提交：尚須fixture/live明確選擇（預設fixture）、input token預算、隱私全路徑與雙匿名Agent context、關鍵保護mutation、独立設計／正確性審查。模式不能只靠後端factory或「合成食材」字樣假裝已區分模型來源。

- T10模式完成：新增forwardedProps.mode fixture/live，省略時固定fixture；正式app無憑證亦可跑明確標示的固定工具展示，不理解自由文字。live必須明確選擇，未配置／失敗回錯而非fallback；runtime capability由server判定，切換清除本頁history及未採用proposal。後端3行為RED（`t10-modes-red.log`）→GREEN；UI缺selector 1 RED（`t10-mode-ui-red.log`）→GREEN。fixture既有probe FunctionModel抽成產品專用fixture，不變更canonical／D1採用。run_usage帶mode，live腳本也須指定並核對live，避免預設展示被誤報為真模型成功。
- 用量：新增每輪provider回報輸入120,000／輸出8,192 tokens預算，沿用4requests／8tools／60秒、單次2048。token gate不是預先精確計費保證。token測試最初只替換StreamedResponse.usage property，漏了get().usage，該輪RED不列產品證據；修正為真provider reported ModelResponse用量後8例GREEN，再獨立移除budget做mutation。公開OpenAI HTTP mock驗實際max_completion_tokens/max_tokens=2048、固定GLM與enable_thinking=false，Cookie及原始問卷不進provider；不是live成功證據。
- 隱私／隔離：兩匿名D1快照並行轉給各自Agent，異主planId404、原始問卷extra400、D1不寫問卷；已有保護，無需改身份設計。引導估算→確認→D1→Agent的真瀏覽器請求逐一檢查age／heightCm／weightKg等原始keys不出現，同查SSR、browser console及local/session storage；Python provider exception sentinel不出現在response／captured stdout/stderr/log。`rg -n 'logging|print\(|instrument|trace|console\.' backend/src apps/web/src --glob '!*-validator.js'` 僅見生成HTTP trace method欄位；installed PydanticAI instrumentation default=False，未配置body trace exporter。外部主機實際logging／入口隔離由T11部署驗，不以本地測試代替。
- Mutation與首次RED分開記錄：`.artifacts/t10-mutations-result.log` 逐一移除Python/Web body、8則history、2000字／8000總字、4requests／8tools、deadline、input/output token各預算，皆因對應assertion失敗；`t10-boundary-mutations-result.log` 移除CSRF／owner／問卷whitelist均被抓到。移除正式chat wrapper runId檢查時，foreign-run從「AI未完成」變成「提案已完成」而測試紅（`t10-mutation-runid.log`）；改provider cap2048→4096，實際HTTP assertion紅（`t10-mutation-provider-cap.log`）。全部finally還原，再跑整批回歸。fake browser clock驗59秒仍執行、60秒取消且無提案；真TCPprovider清理仍通過。
- 獨立審查：design-review NO DESIGN FINDINGS，涵蓋官方adapter擴充、模式／fixture、身分／CAS、body雙邊界、deadline／abort、rate locality、provider暫停與費用宣稱。correctness 1改：缺planning原KeyError/500，新增必填guard；`t10-review-red.log` 1 RED→`t10-review-green.log` 4 GREEN。檢查repo與second-brain status/log，未有reviewer寫入或commit。
- 最終驗證命令與結果集中 `.artifacts/t10-final-*.log`：`uv run --project backend --frozen pytest backend/tests -q` 153 passed、`pnpm test:web` 106 passed、`MEAL_TEST_WORKER=1 pnpm test:e2e` 35 passed、`pnpm test:e2e` Node 12 passed；ruff check／format、mypy（38 source files）、typecheck、contracts:check／wire（Python2＋TS2）、Next/vinext build 通過。1440px／390px 模式選擇與聊天畫面已目視檢查。階段僅聲稱本地T10驗收；T11真部署／logging／入口隔離與T12完整live品質、遠端CI仍未完成。


### T11 執行紀錄（2026-09-28）

- Will 選定既有 Oracle 主機，Meal Prep 使用獨立容器、網路與 Tunnel，不共用其他產品資料／憑證。唯讀 `ssh oci-a1` 盤點：aarch64、4 CPU、available memory 21,263 MiB、root 121G available；即時證據 `.artifacts/t11-host-inventory.log`。不增 VM／disk 配置，不將瞬間空閒視為負載驗收。
- CI 等價 lint 揭露 `--config backend/pyproject.toml` 與自動探索的 first-party 分類不同，21 個 I001；明確設定 known-first-party meal_prep 後同命令 check／format 通過。這是工具設定修正，不是產品行為 TDD；RED／GREEN 見 `t10-ci-lint.log`／`t11-ci-lint-green.log`。

- T11私有上游：新增MEAL_API VPC binding，既有Python allowlist／body／timeout／錯誤映射保留，透過注入fetch供Validator／Builder／Agent共用；Worker攔截固定公開Python routes，方法不符405，query／Cookie／Authorization不轉送。兩行為assertion RED→Web108 GREEN、typecheck與workerd35 GREEN（`t11-vpc-{red,green,types,workerd}.log`）。初版測試JSON解析／uncaught exception已先改為明確斷言再重跑RED，不列為最終行為證據。
- 遠端CI：a97d161首次兩job未啟動，GitHub註記billing/spending limit；Will明確要求repo改public。檢查Git歷史329 blobs，未命中secret pattern，沒有追蹤環境檔／AGENTS.local／secrets；已改PUBLIC並重跑。run36443334102的python與web job均success。此run覆蓋a97d161，不代表尚未提交T11變更的CI已驗。
- 外部資源：Wrangler OAuth建立meal-prep-production D1並套0001 migration；既有API token無D1／Tunnel建立權限（401／403），改由已授權OAuth完成專用Tunnel／VPC。沒有提高帳戶付費等級；subscriptions仍僅r2_paid，既有兩Worker均無ratelimit bindings，1431701–1431703未與它們共用。resource IDs在production Wrangler及ignored `t11-resources.json`。
- Oracle候選image t11-candidate1建置成功；專案API／Tunnel啟動healthy，無host port，network meal-prep_private；Dockerfile allowlist排除secret，API停用access log。首次macOS rsync --relative沒有套用/./截斷，改明確source→target並移除本次誤建的專案內Users目錄，不影響既有專案。
- 初次Worker部署version6fe59fcb-596a-4a5b-8979-021a96bc505c，https://meal-prep-agent.fathompod.workers.dev。production build通過，Chrome頁面200、runtime200/liveAvailable=true；Python urllib探測遇Cloudflare1010，未當成應用故障。正式D1／CAS／UI案例執行中；CPU、取消、隔離、回復與獨立審查尚待，不宣稱T11完成。

- 正式HTTPS browser：`playwright.deployed.config.ts --grep 'manual goal creates|Worker persists canonical'` 2 passed（`t11-deployed-flow.log`），驗CAS 200/409、匿名隔離／Cookie／重開／復原／清除；`--grep 'guided estimation|Agent produces two separate'` 2 passed（`t11-deployed-agent.log`），引導問卷不出本機與fixture兩輪提案採用已驗。故障route注入仍明確屬模擬，不等同真D1故障。
- T11獨立design-review與correctness皆無material finding（純靜態），部署驗收持續；parent second-brain同時出現其他工作線commit d4e8af85，未將其歸因reviewer或碰觸。
- CPU gate尚未通過：safe-filtered Wrangler tail第一批21events CPU最高50ms，全部ok；按path補測13events，root [13,13,8]ms、preview[8,9,8]、actions[13,14]，不是可穩定低於Workers Free 10ms的證據。官方limits說明容許偶發超限，不以目前HTTP200當作通過。API取樣CPU17.88%、RAM92.59MiB/512MiB；public backend14318外部無法連線，Docker無host ports／專用network。接續先驗Ajv inlineRefs:false是否降低巨大inline validators開銷，再處理SSR；原基線artifact保留，不擅升級付費。

- Ajv實驗：inlineRefs:false重新生成後wire2+2／Web108／production build皆通過，bundle3422→3042KiB；部署2182a2d7-26bb-4bd3-baf6-9c2eb4018dfa後兩正式流程通過，但tail樣本root[64,9,115]ms、preview16、actions45，不能證明CPU gate改善。撤回此生成設定，不將bundle變小當成性能GREEN；此版暫仍在遠端，待後續已驗artifact替換。參考tech頁及官方vinext#2911記錄bare-Node prerender與cloudflare:workers限制，Web部署選型需要重新判斷。

- 回復演練：以2182a2d7建立revision1合成快照，Worker rollback到6fe59fcb成功；API保持同一相容image t11-candidate1，stop→start無process重疊。真瀏覽器用原匿名身份讀回的完整D1狀態與rollback前deep-equal，UI版本1與fixture SSE完成（`t11-rollback-{before,worker,api,after}.log`）。API沒有兩個不同runtime artifact，不宣稱驗過API降版。
- 本專案prerender實測：CLI舊參數不支援，改installed vinext config `prerender:{routes:"*"}`後，build-time Node載入cloudflare:協定回ERR_UNSUPPORTED_ESM_URL_SCHEME（`t11-prerender-config.log`）。探測設定finally還原；Ajv實驗也已生成回原設定，遠端已rollback基線。現行productiondist是失敗prerender中間產物，下次部署／本地workerd前必須按環境重新build。
- 已將Web部署選型交Will：建議Next.js Web亦移Oracle專用容器、Worker仍管公開入口／D1／身份；其他選項為继续Cloudflare adapter或靜態前端。此為architecture原Web部署位置的改動，等待選擇；不重問登入下載。API CPU優化仍需獨立驗，不假稱只移SSR即可完成全部gate。

- 真D1舊格式：僅將專用合成rollback fixture之schemaVersion暫改99，Chrome GET409／舊格式UI，明確開始新規劃建立revision0／current=null。finally改回schema1後，以原匿名身份讀回完整狀態，與測試前deep-equal（`t11-legacy-restored-state.log`）；CLI --file僅回import統計，未將它當成查詢欄位值證據（`t11-legacy-{incompatible,browser,retained,restore}.log`）。沒有刪原餐單或以mock當D1證據。完整T11仍等待Web部署選擇、CPU、真取消／D1故障與最後回歸。

- 2026-09-29 Will 確認 Web 也移至既有 Oracle；採原生 Next.js standalone，Worker 保留公開入口／D1／身份與 MEAL_WEB、MEAL_API 固定 VPC proxy。撤除 vinext runtime／部署依賴；不變更既有 domain、公開契約、匿名 D1 或免費模型約束。新增 Web 邊界兩例真 assertion RED→GREEN，拒絕未知 API／非 GET HEAD，剝除身份 headers（t11-web-entry-{red,green}.log）。
- 移轉驗證：Next dev 經此正式入口的 HMR 無法連線，改以 production 驗證後 hydration 通過。原生 Next 的 route announcer 另有 role=alert，舊全頁 alert locator 歧義導致 5 例失敗／30 通過；測試改依預期訊息篩選，保留原行為斷言，改用實際 standalone artifact 重跑。Oracle 首輪 Web build 缺 nutrition-v1.json，已補精確 build allowlist；不將 build／測試設定故障計為 TDD RED。新架構完整部署及 CPU 驗收仍進行中。
- Oracle 原生 Web image `meal-prep-web:t11-native1` 已啟動 healthy；Worker `ea2f2581-4d4f-466d-ac32-aa275d936e60` 接兩個私有 VPC。standalone＋workerd 35 passed，Web110與typecheck通過；正式origin四例（D1隔離/CAS、手動、引導、兩輪Agent）全部通過。容器快照Web49.49MiB/API82.86MiB/Tunnel18.3MiB，三者readonly且無host port。這是當下資源快照，不是壓力測試。
- 新路徑安全CPU樣本 `.artifacts/t11-native-route-metrics.json`：首頁0–1ms／static0–1ms，actions15–84ms、preview13–26ms，全部outcome=ok仍未通過Free CPU目標。共用生成schema graph優化中；不移除契約驗證。獨立design-review重新檢查Web遷移16項機制，NO DESIGN FINDINGS；scope核對repo/parent無審查者寫入或commit。
- 真D1可控故障：只對既有專用合成餐單建立暫時before UPDATE/DELETE trigger，RAISE ABORT使真binding返回503；UI未冒稱保存，重新讀回完整原狀態；清除失敗顯示唯讀且完整原列保留。finally DROP兩trigger成功，`.artifacts/t11-d1-failure-{drill,browser,restore}.log`。此為真D1 query故障注入，不是實際耗盡帳戶quota，也不是browser mock。
- Ajv graph 合併後 bundle1558.97→405.03KiB，Web110／wire Python2＋TS2通過；workerd首輪34通過1例上游等待逾時，reordered單例重跑1.3秒通過，尚須最後整套回歸。部署c42e7cfa四正式流程通過，但actions12–38ms、preview12–23ms仍未過CPU gate（t11-shared-route-metrics.json）。本機CPU profile只提供取樣線索，不取代遠端CPU計量；不宣稱縮包已解決效能。
- 真取消RED：透過正式Worker/VPC與Oracle API注入FunctionModel合成長串流，瀏覽器取消後8秒內provider iterator finally未執行。補enable_request_signal（官方要求）後444fe6c2重驗仍RED，需繼續定位VPC／response stream取消；兩次演練皆finally恢復原live API healthy。此不是真Cloudflare模型品質測試，不計入K4。
- Oracle Web與shared validator correctness唯讀審查無material finding；scope未有審查者修改／commit。T11仍未完成，不提交階段完成標記。
- 取消定位：Worker安全診斷只記固定marker，tail觀察responseStreamDisconnected但未見signal marker；移除診斷logging後已部署乾淨Worker07c874fa。保持路徑、改合成provider每秒yield，取消1.3秒釋放；改回原60秒靜默source後，新增2秒SSE comment heartbeat的API candidate2真演練4.1秒釋放（t11-cancellation-browser.log），finally恢復正常live API。這證明需靠定期寫入讓現有HTTP/VPC路徑觀測中止，不宣稱已定位Cloudflare內部實作缺陷。
- Heartbeat採原官方adapter編碼後加`: keepalive`註解，不改AGUI事件，不另建Agent框架。首次heartbeat缺失assertion RED→GREEN；跨yield deadline被逐次anext task拆斷的回歸RED→單一producer Task GREEN；独立correctness另找queue滿時deadline取消producer後持續heartbeat，新增slow-consumer真RED→監控producer結束並顯式關閉內層source GREEN。queue maxsize1保留backpressure、finally清理；最後Python157／ruff通過，mypy及新API candidate3重部署／取消複驗中。
- Fail-fast Ajv只消費boolean結果；`rg -n '\.errors|ajv.errors|validator.errors' apps/web/src --glob '!*-validator.js' --glob '!validators.js'`未見錯誤集合consumer，改allErrors=false保留接受／拒絕語義。Web110、wire2+2、types／drift與單worker模式完整workerd35通過；正式四流程通過。第一輪CPU tail在清理已退出process group時失敗而未落檔，沒有當作CPU證據；改安全落檔與確認子process狀態後重新量測。

- 最終 transport 複驗：API `t11-candidate3` 經正式 Worker／VPC 的靜默合成 provider，在瀏覽器取消後 4,018ms 執行 finally；演練後恢復正常 live factory 且 healthy（`t11-heartbeat-final-cancellation.log`）。新增正式 PlanningAdapter＋FunctionModel 慢讀測試通過；reviewer 撤回未重現的內層清理推論，已修的 material finding 為 queue 滿時 producer 結束後無限 heartbeat。Python158、Web112、workerd35、Node12 passed；後兩命令分別 `MEAL_TEST_WORKER=1 pnpm --filter @meal-prep/web exec playwright test --workers=1` 與 `pnpm test:e2e`，證據 `t11-final-workerd.log`／`t11-final-node.log`。
- Python transport 回傳 unknown，由 persistence 邊界驗證一次；current 由完整 SessionState 驗證，previous 仍獨立驗證。新增真正經 pythonBuilder／pythonValidator 的缺逐餐營養反例，503且無D1寫入。獨立 design-review 覆蓋21項機制，NO DESIGN FINDINGS。
- 整組相容回復已驗：Worker `02a3066d-de34-44ca-90d2-a8bdeab89f3b`／API `t11-candidate3`／Web `t11-native2` → Worker `ea2f2581-4d4f-466d-ac32-aa275d936e60`／API `t11-candidate1`／Web `t11-native1` → 恢復目前組合。兩次都驗 hydration、fixture SSE 與原匿名身份完整D1快照deep-equal；未改migration或清庫。命令為 `.artifacts/t11-native-rollback-drill.py`，結果在 `t11-native-rollback-{drill,during,after}.log`；恢復容器healthy。
- 最新安全CPU取樣 `t11-once-route-metrics.json` 共84events，actions 3–27ms、preview 7–25ms，全部API outcome=ok；首頁0–1ms。`t11-once-tail.py` 明確指定 production config，僅保留path／CPU／wall／outcome等技術欄位。這不是穩定符合Free 10ms的證據；未將縮包或HTTP成功當CPU GREEN。已請Will選擇免費展示接受限制、繼續架構調整或評估付費Workers，尚未變更驗收標準或付費等級。

### T12 執行紀錄（2026-09-29）

- 開工先讀 A1–A14／N1–N8／K1–K4 原規格與既有測試；T11 CPU 方向尚待Will決定，T12 先進行獨立的真模型品質矩陣，不提前標驗收。Cloudflare Workers AI Dashboard 當日已用 539.53／10,000 Neurons；固定 GLM-4.7-flash，不啟付費。新增 `scripts/live-acceptance.py`，只用合成資料，逐次記工具、canonical 結果、model usage、文字及延遲到 ignored `.artifacts`；不以此腳本輸出取代 Dashboard 的 Neuron 實量。
- A1 首次 live RED：`uv run --env-file .env.cloudflare.local --project backend --frozen python scripts/live-acceptance.py A1 --trial 1`，正式 find_recipes／build_proposal 均有呼叫、HTTP200／RUN_FINISHED，但 `proposal_unavailable: not_found_within_search_limits`、沒有 canonical 提案（`t12-live-A1-1.{log,json}`，55.805秒、input25,750／output3,736 tokens、3 requests／2 tools）。模型文字另有錯字及臆測菜單描述，未達繁中品質。腳本最初把「不會聲稱已保存」誤判為已保存，已移除此不精確字串判斷；真 RED 為沒有可採用提案。正調查 tool arguments，再決定最小修正與重驗。
- A1 第二筆 live 有 canonical 提案與兩正式 tools（`t12-live-A1-2.json`，50.588秒、input58,960／output2,000 tokens），但長文字把**每日**2012.5 kcal 標成「三天總計」，又說「我會將其標記為已採用」，仍不達正確敘述與提交邊界的品質門檻。資料卡片的 canonical 計算本身通過。模型文字已改為只簡述未採用提案、合成來源，具體餐點／數值由權威預覽呈現；後續 live 重驗中。
- 真模型能在tool參數中改已確認constraints或加入使用者未確認fixed meals：`test_model_cannot_change_confirmed_conditions_while_building` 兩反例均在原碼產生 `proposal_ready`，2 RED（`t12-agent-conditions-red.log`）。`PlanningRun` tool 現於執行前拒絕改動並要求模型重試，2 GREEN（`t12-agent-conditions-green.log`）；UI表單仍可由使用者明確修改條件。本防線不依賴提示詞遵守情況。
- A1 第三筆 live 的正式工具與 canonical 提案通過（`t12-live-A1-3.json`，51.203秒、input59,622／output680 tokens），但模型仍在文字說「採用首次配餐選擇」，不能以prompt縮短就宣稱品質合格。Web真實 HttpAgent 流注入「我已保存成功」後，原畫面確實顯示假成功，行為 RED（`t12-live-prose-red2.log`；首次測試把live模式送往無模型的synthetic上游，503屬環境設定，不計RED）。現只依已驗 canonical proposal／reason 顯示繁中對話摘要，仍保留正式模型工具決策與AG-UI事件；同一真 workerd 瀏覽器測試 GREEN（`t12-live-prose-green.log`）。原始模型文字留在 ignored 驗收artifact供品質診斷，不當成已驗事實呈現給訪客。
- A3 真模型把固定外食早餐從初次規劃 scope 排除，`t12-live-A3-4.json` 得 `scope_incomplete`。加 `test_initial_plan_uses_confirmed_full_scope_even_when_model_omits_fixed_meal` 行為 RED（`t12-initial-scope-red.log`）後，初次規劃只用已確認完整範圍；該測試與 agent 組 GREEN（`t12-initial-scope-green.log`），A3-5／6／7 的 3 筆真模型皆產生 canonical 提案、保留外食鎖定與未知蛋白質。其後 tool surface 重構保留此已確認範圍規則。
- A5-4／5 真模型反覆送多餘 `snack` 與錯誤的 `YYYY-MM-DD: slot` key，工具拒絕；不是有效提案。改為一筆 typed `replacement={day,slot,recipeId}`，正式 domain scope／replacement 由工具建立，不讓模型輸入已確認條件。`test_local_replacement_uses_the_adopted_base_and_retains_every_other_meal` RED→GREEN（`t12-typed-replacement-red.log`、`t12-typed-compact-green.log`），未指定替換時不發布假變更。A5-6／7／8 三次真模型皆保留其他餐、只換第二天午餐。
- 模型原本收到完整 `BuildProposalResult`（含整份營養／清單／步驟）與完整食譜，浪費免費 token。`test_model_receives_compact_tool_result_while_client_gets_canonical_proposal` 與 `test_recipe_tool_lists_source_and_small_controlled_choices` 分別 RED（`t12-compact-tool-red.log`、`t12-compact-recipes-red.log`）→ GREEN（`t12-typed-compact-green.log`、`t12-compact-recipes-green.log`）；完整 canonical 只留在 request-scoped context 給瀏覽器，模型僅收 status/reason 與有來源的受控食譜摘要。A5-7 相較 A5-3 的 input tokens 26,258→11,604、延遲12.359→5.058秒；只是不同隨機回合的觀察，非因果效能基準。
- 獨立設計審查 2 項發現均改：受控 `clarification_required`（meal／recipe／conditions）讓模糊要求顯示固定繁中追問，`test_clarification_is_structured_and_cannot_publish_a_proposal`、瀏覽器追問各 RED→GREEN（`t12-clarification-{api,ui}-{red,green}.log`，UI RED 的首次啟動因本機磁碟滿而失敗不計行為證據，後以 `t12-clarification-retry-ui-red.log` 重跑）；重試不再把同一句使用者訊息重複加入 model history，`t12-clarification-retry-ui-{red,green}.log`。審查者唯讀、未改檔或 commit；最終 diff 與 reviewer scope 已核對。
- A10-2 真模型只查食譜便結束，沒有 canonical 結果；A10-4 在初次規劃不斷傳入局部換菜參數並觸及 `run_limit`，均不列為通過。`test_recipe_lookup_without_a_proposal_reports_an_explicit_model_failure` RED→GREEN（`t12-no-model-proposal-api-{red,green}.log`）：已有工具但無可驗結果回 `model_no_proposal`，畫面有明確狀態及重試；既有失敗畫面補重試，真 workerd `t12-unavailable-retry-ui-{red,green}.log`。初次規劃忽略模型送出的局部換菜參數，始終採已確認 full scope，`test_initial_plan_ignores_a_model_suggested_local_replacement` RED→GREEN（`t12-initial-replacement-{red,green}.log`）。A10-5／6／7 三次真模型皆回 `equipment_unavailable`，無 ready 提案。

- 審查續查發現 `proposal_unavailable` 會附加受控助理失敗摘要，重試因此再加一則相同使用者訊息。真 workerd 瀏覽器 `live chat explains a tool failure...` 先得到 history user count `[1,2]` RED（`t12-unavailable-history-red.log`），改以原 user turn ID 截回該訊息後與既有 HTTP 失敗重試同測 `[1,1]` GREEN（`t12-retry-history-green2.log`）。模型純文字、完全沒有工具時 UI 同樣沒有可驗結果；`test_formal_agent_text_only_cannot_be_adopted` 的 `model_no_proposal` assertion RED→GREEN（`t12-text-only-{red,green}.log`），最後澄清工具無實際結果也回此狀態。
- 新 typed replacement 規則使已有 base、卻未提供換菜資訊的**合成展示**工具失敗；首次完整 workerd 37 passed／3 failed，三例都在已採用餐單後要求 fixture 再提案（`t12-workerd-full.log`）。為維持「不理解自由文字」的展示語義，fixture 現從已確認範圍、未鎖餐及受控食譜挑第一筆由正式 domain 預先證實可行的單餐替代，送入同一 typed `build_proposal`；live 模式不自動選替代。`test_fixture_with_adopted_base_demonstrates_one_controlled_change` 無 ready RED→GREEN（`t12-fixture-adopted-{red,green2}.log`）；真變更會使 D1 revision 2→3，瀏覽器預期已據此更新。
- 獨立審查再指出 fixture 在**全部已鎖或無可行替代**時送空工具參數，`ModelRetry` 最終只會成泛用錯誤。`test_fixture_with_all_meals_locked_reports_lock_conflict` 先因 RUN_ERROR 紅（`t12-fixture-no-choice-red.log`），分出 typed fixture choice／受控不可提案原因後 GREEN（`t12-fixture-no-choice-green.log`）；進一步要求全鎖明確回 `locked_scope_conflict`，先 assertion RED→GREEN（`t12-fixture-lock-reason-{red,green}.log`）。無候選但未全鎖回 `no_controlled_substitute`。同一正式工具發布 `proposal_unavailable`、不產生 ready；審查最終回報 NO DESIGN FINDINGS，reviewer 唯讀、未修改檔案或呼叫 live API。

K4 使用固定 `@cf/zai-org/glm-4.7-flash`、合成食譜 `synthetic:recipes-v1`，A3 另含使用者輸入的固定外食 `user:user-v1`。下表每列依 trial 順序記錄實際模型 `run_usage` 與端到端秒數；Neuron 是依 [Cloudflare 模型費率](https://developers.cloudflare.com/workers-ai/platform/pricing/) 的 **估算**（input tokens × 0.0055 ＋ output tokens × 0.0364），並非帳戶實際扣量。

| 案例／trial | 通過的可驗條件 | 延遲秒 | input tokens | output tokens | 估算 Neurons |
|---|---|---|---|---|---|
| A1 6／7／8 | 手動目標、九餐、正式雙工具及未採用 canonical 提案 | 13.274／6.143／6.458 | 9792／9438／9504 | 922／288／500 | 87.42／62.39／70.47 |
| A3 8／9／11 | 固定外食鎖定、未知蛋白質 null、不入自煮採買／步驟 | 35.069／5.941／40.495 | 10168／10334／10442 | 128／230／298 | 60.58／65.21／68.28 |
| A5 7／8／9 | 第二天午餐單餐換 tofu-rice，其他餐完整不變 | 5.058／5.664／4.256 | 11604／11592／11616 | 232／234／158 | 72.27／72.27／69.64 |
| A10 5／6／7 | 設備不足回 `equipment_unavailable`，無 ready | 3.769／5.626／31.359 | 8728／8804／8826 | 104／270／250 | 51.79／58.25／57.64 |

12 筆納入案例的費率估算合計 796.21 Neurons；`uv run --env-file .env.cloudflare.local --project backend --frozen python scripts/live-acceptance.py <A1|A3|A5|A10> --trial <未使用編號>` 可重跑，原始事件與結果是 ignored `.artifacts/t12-live-<案例>-<trial>.events/.json`。A3-10 因 60 秒 timeout 且無 usage／proposal 排除，未充作通過。繁中品質驗的是訪客可見的受控繁中狀態、追問、失敗與 canonical 預覽；原始模型文字曾錯稱已保存與營養總數，只作忽略追蹤的診斷，從 live UI 隔離。模型額度 429／cooldown 由故障注入測試證實，沒有故意耗盡帳戶；帳戶用量見下方 GraphQL Analytics 實測。

- 本機最終候選：Python `168 passed`（`t12-python-final3.log`），Web Vitest `112 passed`（`t12-web-unit-final.log`）、workerd Playwright `40 passed`（`t12-workerd-final.log`）、Node Playwright `12 passed`（`t12-node-e2e.log`）；mypy 39 source、ruff check／format、TS typecheck、契約生成檢查及 wire Python2＋TS2、Next 與 Worker build 皆通過對應 `t12-*-final*.log`。最後 fixture 分流變更後 Python168及workerd40重跑；Node／Web／契約路徑未受變更。完整 diff `git diff --check` 通過。
- 部署候選：只用 `git ls-files --cached --others --exclude-standard` 精確允許的 130 個 Docker build inputs 傳到既有專用 Oracle 目錄，未傳 env／AGENTS.local／artifacts。首輪 Web image 因 context 缺 `synthetic-evaluation.json` 而 TypeScript build 失敗；補 `.dockerignore` 與 Web Dockerfile 的 test-fixture allowlist 後重建成功，屬封裝錯誤，不冒充業務 RED。新 immutable tags API `t12-final1`（image sha256:1a52819c...）、Web `t12-final1`（sha256:936cd623...）；Compose API／Web／Tunnel healthy，無 host ports，快照 RAM 84.22／48.61／17.75 MiB。Worker 沿用已驗 `02a3066d-de34-44ca-90d2-a8bdeab89f3b`，D1 schema 不變；前一組相容映像保留可回復。
- 正式 HTTPS 入口四個合成瀏覽器案例全部通過：D1 身份隔離／CAS、手動目標採用換菜重開、引導估算、兩輪 Agent（`t12-deployed-four.log`）。另外 `scripts/live-browser-acceptance.mjs` 明確選 live，在真 Worker／VPC／Oracle 上取得 HTTP200、受控九餐預覽與未採用狀態，兩次 7 秒（`t12-live-browser-{1,2}.json`）。首次腳本試圖用 Playwright `response.text()` 讀串流，在 Chromium 得 `Network.getResponseBody` 無資料；改以真瀏覽器已驗 UI、請求 mode、HTTP 與九餐卡片判定，未把無法讀到的每輪 usage 虛構為正式入口證據。後端 12 筆 live 案例另有真 AG-UI `run_usage`。
- 遠端 CI run 36471787758 對 `5ef1b73` 的 Web job 成功；Python job 167 passed／1 failed，失敗在 SSE heartbeat 與上游 timeout 同時到達時，producer 已結束但錯誤仍在 queue，舊邏輯直接 return。新增穩定注入該競爭的 `test_heartbeat_timeout_does_not_hide_queued_source_error`，先 RED 再保留 queue 終止訊息使 GREEN；本機完整 Python 169 passed，ruff check／format、mypy 39 source 與原 deadline 案例連跑 100 次通過。修正後的遠端 CI 仍須重新驗收。
- 修正 commit `fb235ab` 的 [遠端 CI run 36472443571](https://github.com/Will413028/meal-prep-agent/actions/runs/36472443571) 逐 job 核對 Python／Web 均 success；原失敗案例納入 Python 169 passed，Web job 含契約、112 Vitest、Node／workerd Playwright 與兩種 build。
- 2026-09-28 UTC 透過 Cloudflare 官方 GraphQL Analytics `aiInferenceAdaptiveGroups` 查專案帳戶：固定 GLM-4.7-flash 116 次、input 505,163／output 19,457 tokens、`totalNeurons=3,486.6313`，ignored 原始摘要 `.artifacts/t12-account-neurons.json`。這是**整個帳戶所有專案**當日同模型用量，不能歸給本專案 12 筆案例；該 12 筆另以各 run usage 估算 796.21。依[官方免費額度](https://developers.cloudflare.com/workers-ai/platform/pricing/)為每日 10,000 Neurons，當下分析計量低於額度；[GraphQL 官方說明](https://developers.cloudflare.com/analytics/graphql-api/)明示分析資料不是計費依據，因此不宣稱已取得 Dashboard 帳單實值。

### T11 Oracle SQLite 遷移執行紀錄（2026-09-29）

- Will 指定保存 API 與資料一併移到 Oracle，取代正式 Worker 的 D1 執行路徑；先前 D1 盤點 49 列／26 已採用只作遷移前基線，停寫後重查。Worker 改為固定五路徑代理與限流；Web 專用 SQLite volume 持有身份、CAS、Python canonical 驗證及 Agent 已採用 base。公開 DTO、Cookie、CSRF、單列原子更新與免費模型均維持原契約。
- RED→GREEN：Worker 轉送、安全 header／Cookie、`Set-Cookie`、停寫與 method allowlist；SQLite 真檔保存、競爭 CAS、缺檔／空檔拒絕、啟動補清過期列、競爭寫入最長等待小於 1 秒；私有 D1 反向回寫工具的新增／修改／刪除全列對帳。相應證據為 `.artifacts/t11-{sqlite-failclosed,expiry-startup,sqlite-lock,reconcile}-{red,green}.log` 及既有 Worker proxy 測試日誌。正式 runtime 不自建空庫；本機測試與開發透過明確初始化。250 ms SQLite 鎖等待於測試中使競爭寫入約 0.25 秒失敗，長期鎖競爭或頁面／SSE 延遲超標時再拆到 worker thread／獨立服務。
- 獨立 design-review 四項處置：缺檔自建空庫、只靠 24 小時 process interval 清理、主要 HTTP 測試仍只跑 D1、D1 回復無反向工具，均已修正；原 D1 adapter 限回復窗口內 parity 測試，窗口關閉並通過 Oracle backup／restore 後退役。審查者全程唯讀。`sqlite-http.test.ts` 已在正式 SQLite adapter 驗身份、採用、revision、重試、重開與復原；D1 SQL 反向匯入另用 Wrangler **本地 D1** 演練，`DELETE`＋`INSERT` 兩命令成功，舊列被移除，查詢回 1 列、revision 2（`.artifacts/t11-d1-rehearsal/{reconcile,verify}.log`）；正式回復仍須停寫、遠端重匯出及逐列摘要核對。
- 本地整組驗證：`pnpm test:web` 121 passed、Python pytest 173 passed、Next build／Worker dry-run 10.04 KiB、TS typecheck、mypy 39 source、ruff check／format、contract drift 與 wire Python 2＋TS 2 全通過；`MEAL_TEST_WORKER=1 pnpm --filter @meal-prep/web exec playwright test --workers=1` 經 standalone＋workerd＋真 SQLite 40 passed（`.artifacts/t11-final-*.log`）。本地 gates 通過不代表遠端 CPU、正式資料切換及回復演練已完成。
- 下一步按 T11 §追加第 2–4 步：提交並推送候選，核對遠端 CI；建立不可變 Web image，停寫後從 D1 匯出／匯入／逐列對帳，部署 Web，再開 Worker 保存代理；正式 A13/A14、SSE、故障、重啟、backup／restore 及 Worker CPU 逐項驗。完成後更新本計畫的 T11／T12 最終狀態與 K3 判定。
