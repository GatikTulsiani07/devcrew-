import type {
  ActivitySnapshot,
  ApiErrorBody,
  CreateProjectRequest,
  CreateTaskRequest,
  PlanDecisionRequest,
  ProjectSnapshot,
  TaskSnapshot,
} from "@/lib/api-types";

export function projectPath(projectId: string): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}`;
}

export function taskPath(projectId: string, taskId: string): string {
  return `${projectPath(projectId)}/tasks/${encodeURIComponent(taskId)}`;
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  backendUrl?: string;
  fetcher?: typeof fetch;
}

export class ApiClient {
  private readonly backendUrl?: URL;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    const backendUrl = options.backendUrl ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    this.backendUrl = backendUrl ? new URL(backendUrl) : undefined;
    this.fetcher = options.fetcher ?? fetch;
  }

  createProject(request: CreateProjectRequest): Promise<ProjectSnapshot> {
    return this.requestWrapped<ProjectSnapshot>("project", "/api/v1/projects", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  getProject(projectId: string): Promise<ProjectSnapshot> {
    return this.requestWrapped<ProjectSnapshot>("project", projectPath(projectId));
  }

  createTask(projectId: string, request: CreateTaskRequest): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `${projectPath(projectId)}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  getTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>("task", taskPath(projectId, taskId));
  }

  approvePlan(projectId: string, taskId: string, reason?: string): Promise<TaskSnapshot> {
    return this.decidePlan(projectId, taskId, {
      decision: "APPROVE",
      ...(reason === undefined ? {} : { reason }),
    });
  }

  rejectPlan(projectId: string, taskId: string, reason: string): Promise<TaskSnapshot> {
    return this.decidePlan(projectId, taskId, { decision: "REJECT", reason });
  }

  executeTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "execute");
  }

  validateTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "validate");
  }

  reviewTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "review");
  }

  retryTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "retry");
  }

  cancelTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "cancel");
  }

  resumeTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.taskAction(projectId, taskId, "resume");
  }

  getActivitySnapshot(projectId: string, after?: number): Promise<ActivitySnapshot> {
    const search = after === undefined ? "" : `?after=${encodeURIComponent(String(after))}`;
    return this.requestJson<ActivitySnapshot>(
      `${projectPath(projectId)}/activity${search}`,
    );
  }

  openActivityStream(
    projectId: string,
    lastEventId: number,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.rawRequest(
      `${projectPath(projectId)}/activity/stream`,
      {
        headers: {
          Accept: "text/event-stream",
          "Last-Event-ID": String(lastEventId),
        },
        signal,
      },
    );
  }

  private decidePlan(
    projectId: string,
    taskId: string,
    request: PlanDecisionRequest,
  ): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `${taskPath(projectId, taskId)}/plan-decision`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  private taskAction(
    projectId: string,
    taskId: string,
    action: "execute" | "validate" | "review" | "retry" | "cancel" | "resume",
  ): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `${taskPath(projectId, taskId)}/${action}`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  private async requestWrapped<T>(
    key: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const body = await this.requestJson<Record<string, T>>(path, init);
    return body[key];
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.rawRequest(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw await apiClientErrorFromResponse(response, "BACKEND_ERROR");
    }

    return (await response.json()) as T;
  }

  private rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetcher(this.url(path), init);
  }

  private url(path: string): string {
    if (!this.backendUrl) {
      throw new ApiClientError(
        "BACKEND_URL_MISSING",
        "NEXT_PUBLIC_BACKEND_URL is required to connect to Devcrew backend",
      );
    }

    return new URL(path, this.backendUrl).toString();
  }
}

/**
 * Builds an ApiClientError from a failed response, preferring the backend error
 * body and falling back to `fallbackCode` with a status-based message.
 */
export async function apiClientErrorFromResponse(
  response: Response,
  fallbackCode: string,
  fallbackMessage = `Backend request failed with status ${response.status}`,
): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiClientError(
      body.error?.code ?? fallbackCode,
      body.error?.message ?? fallbackMessage,
      response.status,
      body.requestId,
    );
  } catch {
    return new ApiClientError(fallbackCode, fallbackMessage, response.status);
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  return new ApiClient(options);
}
