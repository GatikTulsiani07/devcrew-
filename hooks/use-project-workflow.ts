"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, createApiClient, type ApiClient } from "@/lib/api-client";
import type { ProjectSnapshot, TaskSnapshot } from "@/lib/api-types";

const DEFAULT_PROJECT = {
  name: "Devcrew MVP",
  publicRepositoryUrl: "https://github.com/example/devcrew",
  preparedRepositoryId: "prepared_devcrew_main",
};

const DEFAULT_TASK = {
  title: "Implement the approved Devcrew MVP vertical slice",
  description:
    "Connect the prepared repository, create a manager plan, wait for human approval, execute, validate, and review the task with visible activity.",
};

export interface ProjectWorkflowState {
  project?: ProjectSnapshot;
  task?: TaskSnapshot;
  initializing: boolean;
  pendingAction?: "approve" | "reject" | "execute" | "validate" | "review";
  error?: string;
  approve(): Promise<void>;
  reject(): Promise<void>;
  execute(): Promise<void>;
  validate(): Promise<void>;
  review(): Promise<void>;
  fetchTask(): Promise<void>;
}

export function useProjectWorkflow(apiClient?: ApiClient): ProjectWorkflowState {
  const client = useMemo(() => apiClient ?? createApiClient(), [apiClient]);
  const initializedRef = useRef(false);
  const [project, setProject] = useState<ProjectSnapshot>();
  const [task, setTask] = useState<TaskSnapshot>();
  const [initializing, setInitializing] = useState(true);
  const [pendingAction, setPendingAction] = useState<ProjectWorkflowState["pendingAction"]>();
  const [error, setError] = useState<string>();

  const fetchTask = useCallback(async () => {
    if (!project || !task) return;

    try {
      setError(undefined);
      setTask(await client.getTask(project.id, task.id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, [client, project, task]);

  const runTaskAction = useCallback(
    async (
      action: NonNullable<ProjectWorkflowState["pendingAction"]>,
      request: (projectId: string, taskId: string) => Promise<TaskSnapshot>,
    ) => {
      if (!project || !task || pendingAction) return;

      try {
        setPendingAction(action);
        setError(undefined);
        setTask(await request(project.id, task.id));
      } catch (requestError) {
        setError(errorMessage(requestError));
      } finally {
        setPendingAction(undefined);
      }
    },
    [pendingAction, project, task],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let cancelled = false;

    async function initialize() {
      try {
        setInitializing(true);
        setError(undefined);
        const createdProject = await client.createProject(DEFAULT_PROJECT);
        if (cancelled) return;
        setProject(createdProject);
        const createdTask = await client.createTask(createdProject.id, DEFAULT_TASK);
        if (cancelled) return;
        setTask(createdTask);
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError));
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return {
    project,
    task,
    initializing,
    pendingAction,
    error,
    approve: () =>
      runTaskAction("approve", (projectId, taskId) =>
        client.approvePlan(projectId, taskId),
      ),
    reject: () =>
      runTaskAction("reject", (projectId, taskId) =>
        client.rejectPlan(projectId, taskId, "Needs revision before implementation."),
      ),
    execute: () =>
      runTaskAction("execute", (projectId, taskId) =>
        client.executeTask(projectId, taskId),
      ),
    validate: () =>
      runTaskAction("validate", (projectId, taskId) =>
        client.validateTask(projectId, taskId),
      ),
    review: () =>
      runTaskAction("review", (projectId, taskId) =>
        client.reviewTask(projectId, taskId),
      ),
    fetchTask,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Backend request failed";
}
