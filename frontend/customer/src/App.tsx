import { useState } from "react";
import type { ComponentType } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Dashboard } from "./screens/Dashboard";
import { Transactions } from "./screens/Transactions";
import { Statements } from "./screens/Statements";
import { Cards } from "./screens/Cards";
import { Alerts } from "./screens/Alerts";
import { Profile } from "./screens/Profile";
import { useData, useBootstrap } from "./store/data";
import { useClock } from "./store/clock";
import { visibleTxns, fraudAlerted, greetingFor, dayLine } from "./lib/derive";

type ScreenId = "dashboard" | "transactions" | "statements" | "cards" | "alerts" | "profile";

const SCREENS: Record<ScreenId, ComponentType> = {
  dashboard:    Dashboard,
  transactions: Transactions,
  statements:   Statements,
  cards:        Cards,
  alerts:       Alerts,
  profile:      Profile,
};

export default function App() {
  useBootstrap();
  const [screen, setScreen] = useState<ScreenId>("dashboard");

  const t = useClock((s) => s.t);
  const { txns } = useData();
  const visible = visibleTxns(txns, t);
  const alertCount = fraudAlerted(visible) ? visible.filter((x) => x.is_fraud === 1).length : 0;

  const Screen = SCREENS[screen];

  return (
    <div className="flex h-screen bg-bg text-ink font-sans overflow-hidden">
      <Sidebar active={screen} onNavigate={(id) => setScreen(id as ScreenId)} alertCount={alertCount} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar greeting={t ? greetingFor(t) : "Welcome"} subtitle={t ? dayLine(t) : ""} />
        <div className="flex-1 overflow-auto" style={{ padding: "0 26px 24px" }}>
          <Screen />
        </div>
      </div>
    </div>
  );
}
