import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useProjectWorkflow, type ProjectWorkflowState } from "@/hooks/use-project-workflow";
import { ApiClientError, type ApiClient } from "@/lib/api-client";
import type { ProjectSnapshot, TaskSnapshot } from "@/lib/api-types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const project = { id: "proj_1", name: "Devcrew MVP" } as ProjectSnapshot;

function task(status: TaskSnapshot["status"]): TaskSnapshot {
  return { id: "task_1", projectId: project.id, status } as TaskSnapshot;
}

function stubClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
  return {
    createProject: vi.fn().mockResolvedValue(project),
    createTask: vi.fn().mockResolvedValue(task("WAITING_FOR_APPROVAL")),
    getTask: vi.fn().mockResolvedValue(task("WAITING_FOR_APPROVAL")),
    approvePlan: vi.fn().mockResolvedValue(task("PLAN_APPROVED")),
    rejectPlan: vi.fn().mockResolvedValue(task("PLAN_REJECTED")),
    executeTask: vi.fn().mockResolvedValue(task("IMPLEMENTATION_COMPLETED")),
    validateTask: vi.fn().mockResolvedValue(task("VALIDATION_COMPLETED")),
    reviewTask: vi.fn().mockResolvedValue(task("REVIEW_COMPLETED")),
    ...overrides,
  } as unknown as ApiClient;
}

async function render(apiClient: ApiClient) {
  const states: ProjectWorkflowState[] = [];

  function Harness() {
    const state = useProjectWorkflow(apiClient);
    states.push(state);
    return <div>{state.task?.status ?? "none"}</div>;
  }

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  return {
    states,
    latest: () => states.at(-1)!,
  };
}

describe("useProjectWorkflow initialization", () => {
  it("creates the default project and task once", async () => {
    const apiClient = stubClient();
    const { latest } = await render(apiClient);

    expect(apiClient.createProject).toHaveBeenCalledTimes(1);
    expect(apiClient.createTask).toHaveBeenCalledWith(
      "proj_1",
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(latest().initializing).toBe(false);
    expect(latest().project).toBe(project);
    expect(latest().task?.status).toBe("WAITING_FOR_APPROVAL");
    expect(latest().error).toBeUndefined();
  });

  it("reports an ApiClientError as code and message and stops initializing", async () => {
    const apiClient = stubClient({
      createProject: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError("BACKEND_URL_MISSING", "NEXT_PUBLIC_BACKEND_URL is required", undefined),
        ),
    });
    const { latest } = await render(apiClient);

    expect(latest().error).toBe(
      "BACKEND_URL_MISSING: NEXT_PUBLIC_BACKEND_URL is required",
    );
    expect(latest().initializing).toBe(false);
    expect(latest().task).toBeUndefined();
  });

  it("reports plain errors and non-error rejections", async () => {
    const plain = await render(
      stubClient({ createTask: vi.fn().mockRejectedValue(new Error("network down")) }),
    );
    expect(plain.latest().error).toBe("network down");

    await act(async () => root?.unmount());
    container?.remove();
    root = undefined;

    const opaque = await render(
      stubClient({ createTask: vi.fn().mockRejectedValue("boom") }),
    );
    expect(opaque.latest().error).toBe("Backend request failed");
  });
});

describe("useProjectWorkflow task actions", () => {
  it("runs each lifecycle action against the created project and task", async () => {
    const apiClient = stubClient();
    const { latest } = await render(apiClient);

    await act(async () => latest().approve());
    expect(apiClient.approvePlan).toHaveBeenCalledWith("proj_1", "task_1");
    expect(latest().task?.status).toBe("PLAN_APPROVED");

    await act(async () => latest().execute());
    expect(apiClient.executeTask).toHaveBeenCalledWith("proj_1", "task_1");
    expect(latest().task?.status).toBe("IMPLEMENTATION_COMPLETED");

    await act(async () => latest().validate());
    expect(latest().task?.status).toBe("VALIDATION_COMPLETED");

    await act(async () => latest().review());
    expect(latest().task?.status).toBe("REVIEW_COMPLETED");
    expect(latest().pendingAction).toBeUndefined();
  });

  it("rejects a plan with a reason", async () => {
    const apiClient = stubClient();
    const { latest } = await render(apiClient);

    await act(async () => latest().reject());

    expect(apiClient.rejectPlan).toHaveBeenCalledWith(
      "proj_1",
      "task_1",
      "Needs revision before implementation.",
    );
    expect(latest().task?.status).toBe("PLAN_REJECTED");
  });

  it("exposes the pending action while a request is in flight and ignores concurrent actions", async () => {
    let resolveApprove: ((snapshot: TaskSnapshot) => void) | undefined;
    const apiClient = stubClient({
      approvePlan: vi.fn().mockImplementation(
        () =>
          new Promise<TaskSnapshot>((resolve) => {
            resolveApprove = resolve;
          }),
      ),
    });
    const { latest } = await render(apiClient);

    let approving: Promise<void> | undefined;
    await act(async () => {
      approving = latest().approve();
    });
    expect(latest().pendingAction).toBe("approve");

    await act(async () => latest().execute());
    expect(apiClient.executeTask).not.toHaveBeenCalled();

    await act(async () => {
      resolveApprove?.(task("PLAN_APPROVED"));
      await approving;
    });
    expect(latest().pendingAction).toBeUndefined();
    expect(latest().task?.status).toBe("PLAN_APPROVED");
  });

  it("keeps the previous task and clears the pending action when an action fails", async () => {
    const apiClient = stubClient({
      executeTask: vi
        .fn()
        .mockRejectedValue(
          new ApiClientError("INVALID_TASK_TRANSITION", "Task is not approved", 409),
        ),
    });
    const { latest } = await render(apiClient);

    await act(async () => latest().execute());

    expect(latest().error).toBe("INVALID_TASK_TRANSITION: Task is not approved");
    expect(latest().pendingAction).toBeUndefined();
    expect(latest().task?.status).toBe("WAITING_FOR_APPROVAL");
  });
});

describe("useProjectWorkflow task refresh", () => {
  it("refetches the task and clears a previous error", async () => {
    const apiClient = stubClient({
      executeTask: vi.fn().mockRejectedValue(new Error("temporary failure")),
      getTask: vi.fn().mockResolvedValue(task("VALIDATION_COMPLETED")),
    });
    const { latest } = await render(apiClient);

    await act(async () => latest().execute());
    expect(latest().error).toBe("temporary failure");

    await act(async () => latest().fetchTask());

    expect(apiClient.getTask).toHaveBeenCalledWith("proj_1", "task_1");
    expect(latest().error).toBeUndefined();
    expect(latest().task?.status).toBe("VALIDATION_COMPLETED");
  });

  it("surfaces refresh failures", async () => {
    const apiClient = stubClient({
      getTask: vi.fn().mockRejectedValue(new ApiClientError("NOT_FOUND", "Task not found", 404)),
    });
    const { latest } = await render(apiClient);

    await act(async () => latest().fetchTask());

    expect(latest().error).toBe("NOT_FOUND: Task not found");
  });

  it("does nothing before the project and task exist", async () => {
    const apiClient = stubClient({
      createProject: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const { latest } = await render(apiClient);

    await act(async () => latest().fetchTask());
    await act(async () => latest().approve());

    expect(apiClient.getTask).not.toHaveBeenCalled();
    expect(apiClient.approvePlan).not.toHaveBeenCalled();
  });
});
