"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Agent } from "@/lib/mock-data";

type WorkspaceState = {
  crewOnline: boolean;
  setCrewOnline: (online: boolean) => void;
  selectedAgentId: Agent["id"];
  setSelectedAgentId: (id: Agent["id"]) => void;
};

const WorkspaceStateContext = createContext<WorkspaceState | null>(null);

export function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const [crewOnline, setCrewOnline] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<Agent["id"]>("manager");
  const value = useMemo(
    () => ({ crewOnline, setCrewOnline, selectedAgentId, setSelectedAgentId }),
    [crewOnline, selectedAgentId],
  );

  return <WorkspaceStateContext.Provider value={value}>{children}</WorkspaceStateContext.Provider>;
}

export function useWorkspaceState() {
  const value = useContext(WorkspaceStateContext);
  if (!value) throw new Error("useWorkspaceState must be used inside WorkspaceStateProvider");
  return value;
}
