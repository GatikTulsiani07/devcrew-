import type {
  ActivitySnapshot,
  ApiErrorBody,
  CreateProjectRequest,
  CreateTaskRequest,
  PlanDecisionRequest,
  ProjectSnapshot,
  TaskSnapshot,
} from "@/lib/api-types";

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
    return this.requestWrapped<ProjectSnapshot>(
      "project",
      `/api/v1/projects/${encodeURIComponent(projectId)}`,
    );
  }

  createTask(projectId: string, request: CreateTaskRequest): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  }

  getTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    );
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
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/execute`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  validateTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/validate`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  reviewTask(projectId: string, taskId: string): Promise<TaskSnapshot> {
    return this.requestWrapped<TaskSnapshot>(
      "task",
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/review`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  getActivitySnapshot(projectId: string, after?: number): Promise<ActivitySnapshot> {
    const search = after === undefined ? "" : `?after=${encodeURIComponent(String(after))}`;
    return this.requestJson<ActivitySnapshot>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/activity${search}`,
    );
  }

  openActivityStream(
    projectId: string,
    lastEventId: number,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.rawRequest(
      `/api/v1/projects/${encodeURIComponent(projectId)}/activity/stream`,
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
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/plan-decision`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
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
      throw await toApiClientError(response);
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

async function toApiClientError(response: Response): Promise<ApiClientError> {
  const fallbackMessage = `Backend request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiClientError(
      body.error?.code ?? "BACKEND_ERROR",
      body.error?.message ?? fallbackMessage,
      response.status,
      body.requestId,
    );
  } catch {
    return new ApiClientError("BACKEND_ERROR", fallbackMessage, response.status);
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  return new ApiClient(options);
}
