import { GoalSetup } from "../features/goals/GoalSetup";
import { TransportProbe } from "../features/chat/TransportProbe";

export default function Home() {
  return (
    <main>
      <h1>Meal Prep Agent</h1>
      <p>合成資料展示</p>
      <p>依飲食目標安排三天餐單。配餐功能開發中。</p>
      <GoalSetup />
      <TransportProbe />
    </main>
  );
}
