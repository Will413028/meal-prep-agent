import { PlannerWorkspace } from "../features/planner/PlannerWorkspace";

export default function Home() {
  return (
    <main>
      <h1>Meal Prep Agent</h1>
      <p>合成資料展示</p>
      <p>依飲食目標安排三天餐單，預覽後再採用。</p>
      <PlannerWorkspace />
    </main>
  );
}
