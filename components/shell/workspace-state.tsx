"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Agent } from "@/lib/mock-data";
import { useProjectWorkflow, type ProjectWorkflowState } from "@/hooks/use-project-workflow";

type WorkspaceState = {
  crewOnline: boolean;
  setCrewOnline: (online: boolean) => void;
  selectedAgentId: Agent["id"];
  setSelectedAgentId: (id: Agent["id"]) => void;
  workflow: ProjectWorkflowState;
};

const WorkspaceStateContext = createContext<WorkspaceState | null>(null);

export function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const [crewOnline, setCrewOnline] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<Agent["id"]>("manager");
  const workflow = useProjectWorkflow();
  const value = useMemo(
    () => ({ crewOnline, setCrewOnline, selectedAgentId, setSelectedAgentId, workflow }),
    [crewOnline, selectedAgentId, workflow],
  );

  return <WorkspaceStateContext.Provider value={value}>{children}</WorkspaceStateContext.Provider>;
}

export function useWorkspaceState() {
  const value = useContext(WorkspaceStateContext);
  if (!value) throw new Error("useWorkspaceState must be used inside WorkspaceStateProvider");
  return value;
}
