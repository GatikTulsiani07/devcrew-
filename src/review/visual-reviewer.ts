import { z } from "zod";

import type {
  BrowserScreenshotEvidence,
  BrowserVerificationEvidence,
  ScreenshotArtifactStore,
} from "../browser/browser-types.js";
import { createScreenshotArtifactStore } from "../browser/screenshot-store.js";
import { ApplicationError } from "../errors.js";
import {
  createRetryStageFailure,
  RetryStageFailureError,
} from "../orchestration/retry-orchestrator.js";
import {
  isTaskCancellationError,
  throwIfSignalCancelled,
} from "../tasks/task-cancellation.js";
import type { TaskSnapshot } from "../tasks/types.js";

export const VISUAL_REVIEW_MAX_FINDINGS = 8;
export const visualReviewFindingCategories = [
  "layout",
  "spacing",
  "typography",
  "missing-element",
  "incorrect-component",
  "responsive",
  "accessibility",
  "requirement-mismatch",
  "other",
] as const;

export const visualReviewFindingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(700),
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  category: z.enum(visualReviewFindingCategories),
});

export const visualReviewEvidenceSchema = z.object({
  status: z.enum(["PASSED", "FAILED"]),
  summary: z.string().trim().min(1).max(700),
  findings: z.array(visualReviewFindingSchema).max(VISUAL_REVIEW_MAX_FINDINGS),
  screenshotId: z.string().trim().min(1).max(96),
  reviewedAt: z.string().datetime(),
});

export type VisualReviewFinding = z.infer<typeof visualReviewFindingSchema>;
export type VisualReviewEvidence = z.infer<typeof visualReviewEvidenceSchema>;

export interface VisualReviewContext {
  taskTitle: string;
  taskDescription: string;
  managerPlanSummary: string;
  managerPlanSteps: readonly string[];
  developerSummary: string;
  changedFiles: readonly string[];
  browserVerification: BrowserVerificationEvidence;
  screenshot: BrowserScreenshotEvidence;
}

export interface VisualReviewAIClient {
  analyze(input: {
    context: VisualReviewContext;
    pngBytes: Uint8Array;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export interface VisualReviewer {
  review(input: {
    task: TaskSnapshot;
    browserVerification?: BrowserVerificationEvidence;
    browserScreenshot?: BrowserScreenshotEvidence;
    existingEvidence?: VisualReviewEvidence;
    signal?: AbortSignal;
  }): Promise<VisualReviewEvidence>;
}

export interface VisualReviewServiceDependencies {
  artifactStore?: ScreenshotArtifactStore;
  aiClient: VisualReviewAIClient;
  now?: () => Date;
}

export function createVisualReviewService({
  artifactStore = createScreenshotArtifactStore(),
  aiClient,
  now = () => new Date(),
}: VisualReviewServiceDependencies): VisualReviewer {
  return {
    async review(input) {
      throwIfSignalCancelled(input.signal);
      const browserVerification =
        input.browserVerification ?? input.task.validation?.browserVerification;
      const browserScreenshot =
        input.browserScreenshot ?? input.task.validation?.browserScreenshot;

      if (browserVerification?.status !== "PASSED") {
        throw visualReviewFailure("browser verification is required");
      }

      if (browserScreenshot?.status !== "CAPTURED") {
        throw visualReviewFailure("screenshot evidence is required");
      }

      if (
        input.existingEvidence !== undefined &&
        input.existingEvidence.screenshotId === browserScreenshot.id
      ) {
        return copyVisualReviewEvidence(input.existingEvidence);
      }

      const artifact = await artifactStore.load({
        projectId: input.task.projectId,
        taskId: input.task.id,
        artifactId: browserScreenshot.id,
      });
      throwIfSignalCancelled(input.signal);

      if (artifact.artifactId !== browserScreenshot.id) {
        throw visualReviewFailure("screenshot artifact mismatch");
      }

      let output: unknown;
      try {
        output = await aiClient.analyze({
          context: buildVisualReviewContext(
            input.task,
            browserVerification,
            browserScreenshot,
          ),
          pngBytes: artifact.pngBytes,
          signal: input.signal,
        });
      } catch (error) {
        if (isTaskCancellationError(error)) {
          throw error;
        }

        if (error instanceof RetryStageFailureError) {
          throw error;
        }
        throw visualReviewFailure("visual review provider failed");
      }
      throwIfSignalCancelled(input.signal);

      const parsed = visualReviewEvidenceSchema
        .omit({ screenshotId: true, reviewedAt: true })
        .safeParse(output);

      if (!parsed.success || containsUnsafeOutput(parsed.data)) {
        throw visualReviewFailure("visual review response is invalid");
      }

      return {
        status: parsed.data.status,
        summary: parsed.data.summary,
        findings: parsed.data.findings.map((finding) => ({ ...finding })),
        screenshotId: browserScreenshot.id,
        reviewedAt: now().toISOString(),
      };
    },
  };
}

export function createUnavailableVisualReviewer(): VisualReviewer {
  return {
    async review() {
      throw visualReviewFailure("visual review is not configured");
    },
  };
}

function buildVisualReviewContext(
  task: TaskSnapshot,
  browserVerification: BrowserVerificationEvidence,
  browserScreenshot: BrowserScreenshotEvidence,
): VisualReviewContext {
  return {
    taskTitle: safeText(task.title, 160),
    taskDescription: safeText(task.description, 1_500),
    managerPlanSummary: safeText(task.plan.summary, 500),
    managerPlanSteps: task.plan.steps.slice(0, 8).map((step) => safeText(step, 500)),
    developerSummary: safeText(
      task.execution?.result.summary ?? "Unavailable",
      700,
    ),
    changedFiles: (task.execution?.result.changedFiles ?? [])
      .slice(0, 12)
      .map((file) => safeText(file, 240)),
    browserVerification: {
      status: browserVerification.status,
      url: browserVerification.url,
      ...(browserVerification.pageTitle === undefined
        ? {}
        : { pageTitle: safeText(browserVerification.pageTitle, 160) }),
      verifiedAt: browserVerification.verifiedAt,
    },
    screenshot: {
      status: browserScreenshot.status,
      id: browserScreenshot.id,
      url: browserScreenshot.url,
      viewport: {
        width: browserScreenshot.viewport.width,
        height: browserScreenshot.viewport.height,
      },
      capturedAt: browserScreenshot.capturedAt,
    },
  };
}

function safeText(value: string, maxLength: number): string {
  return value
    .replace(
      /(?:^|[\s:])(?:\/(?:Users|private\/tmp|tmp|var|etc)\/|[A-Za-z]:\\|\\\\)[^\s]*/g,
      "[redacted path]",
    )
    .replace(/(?:OPENAI_API_KEY|DATABASE_URL|DIRECT_URL|sk-[A-Za-z0-9_-]+)/g, "[redacted secret]")
    .replace(
      /(?:npm|pnpm|yarn|bun|node|npx|git|bash|sh|curl|wget|python|rm|docker)\s+[^\n]+/gi,
      "[redacted command]",
    )
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function containsUnsafeOutput(
  response:
    | {
        summary: string;
        findings: readonly VisualReviewFinding[];
      }
    | undefined,
): boolean {
  if (response === undefined) return true;

  const values = [
    response.summary,
    ...response.findings.flatMap((finding) => [
      finding.title,
      finding.description,
    ]),
  ];

  return values.some((value) =>
    [
      "/Users/",
      "private/tmp",
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
      "sk-",
      "system prompt",
      "developer message",
      "chain-of-thought",
      "base64",
      "data:image",
    ].some((unsafePattern) => value.includes(unsafePattern)),
  );
}

function copyVisualReviewEvidence(
  evidence: VisualReviewEvidence,
): VisualReviewEvidence {
  return {
    status: evidence.status,
    summary: evidence.summary,
    findings: evidence.findings.map((finding) => ({ ...finding })),
    screenshotId: evidence.screenshotId,
    reviewedAt: evidence.reviewedAt,
  };
}

export function visualReviewFailure(reason: string): ApplicationError {
  if (reason === "visual review response is invalid") {
    return createRetryStageFailure(
      "VISUAL_REVIEW",
      "MODEL_OUTPUT_SCHEMA_INVALID",
      false,
      "Visual review failed",
    );
  }

  if (reason === "visual review is not configured") {
    return createRetryStageFailure(
      "VISUAL_REVIEW",
      "UNSUPPORTED_CONFIGURATION",
      false,
      "Visual review failed",
    );
  }

  if (reason === "screenshot artifact mismatch") {
    return createRetryStageFailure(
      "VISUAL_REVIEW",
      "SCREENSHOT_ARTIFACT_MISMATCH",
      false,
      "Visual review failed",
    );
  }

  return createRetryStageFailure(
    "VISUAL_REVIEW",
    "UNKNOWN_FAILURE",
    false,
    "Visual review failed",
  );
}
