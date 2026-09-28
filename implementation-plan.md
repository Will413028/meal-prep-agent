# Meal Prep Agent — TDD 實作計畫

更新：2026-09-28。狀態：規劃完成，尚未執行。依 [產品規格](product-spec.md)、[營養政策](nutrition-policy.md) 與 [架構](architecture.md) 實作。採 RED → GREEN → REFACTOR，小增量交付；本文件保存細項及執行證據，不另訂產品優先序。

## 1. 前提與接續方式

維持 Next.js／TypeScript、FastAPI／PydanticAI、AG-UI、Python Modular Monolith；Web 本機身體估算、Python 配餐驗證、D1 雲端保存與匿名 Cookie。第一版無帳號、Temporal 或跨裝置保存。免費模型與 Python 獨立部署的限制仍有效；部署主機尚未決定。保存採 D1＋匿名 Cookie 已確認，不新增登入帳號；身份與餐單歸屬檢查屬 Worker 責任。

開始每個項目前，在實際 checkout 執行 `git status --short`、`git log -5 --oneline`、`git ls-files`，命令帶絕對路徑或 `git -C <repo>`。核對三份規格及下表證據；若實際檔案或版本與上次不同，先查差異與受影響 consumer，再接續，不覆蓋別人的未提交內容。新增契約前以 `rg` 搜尋既有 producer、consumer 與測試，將結果記在該項證據。

規劃起點為 `.gitignore`、AGENTS、README、產品及營養政策，之後新增架構與本計畫；尚無應用或 manifest。表內路徑是預計落點，不是假設已存在的命令或程式。此輪只寫計畫，不安裝依賴、讀取 secrets、登入或部署。

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
| T00 | 無 | 可執行測試環境、封裝、基本 CI | 未開始 |
| T01 | T00 | API 契約（含 Worker 保存）與已確認目標驗證 | 未開始 |
| T02 | T01 | 本機身體估算及確認邊界 | 未開始 |
| T03 | T01；可先於 T02 | Agent／AG-UI／workerd／D1 最小整合 | 未開始 |
| T04 | T01、T03 可行性 | 食譜資料與營養計算 | 未開始 |
| T05 | T04 | 三天提案、局部修改及硬限制 | 未開始 |
| T06 | T05 | 購物、庫存與備餐衍生資料 | 未開始 |
| T07 | T01、T05、T06 | D1／匿名身份、原子採用與清除 | 未開始 |
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

尚無實作證據。下一個可執行項為 T00。外部 gate 受阻時記具體缺口及可獨立推進項；不將 blocked 標成完成。未部署的變更以 forward fix 或精確 revert 回復，保留他人的工作；不以整庫 reset 作為一般回復方式。
