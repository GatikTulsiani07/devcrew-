import { describeError, logger } from "../observability/logger.js";
import type {
  BrowserRenderer,
  BrowserScreenshotEvidence,
  BrowserVerificationEvidence,
  BrowserVerificationProfile,
  ScreenshotArtifactStore,
  ScreenshotViewport,
} from "./browser-types.js";
import { validateLocalhostUrl } from "./controlled-browser-verifier.js";
import {
  createScreenshotArtifactStore,
  SCREENSHOT_MAX_BYTES,
} from "./screenshot-store.js";

export class ControlledScreenshotCaptureError extends Error {
  constructor(readonly reason: string) {
    super(`Controlled screenshot capture failed: ${reason}`);
    this.name = "ControlledScreenshotCaptureError";
  }
}

export const SCREENSHOT_VIEWPORT: ScreenshotViewport = {
  width: 1440,
  height: 900,
};

export interface ControlledScreenshotCapture {
  capture(input: {
    projectId: string;
    taskId: string;
    profile: BrowserVerificationProfile;
    browserVerification: BrowserVerificationEvidence;
    repositoryRoot: string;
    existingEvidence?: BrowserScreenshotEvidence;
  }): Promise<BrowserScreenshotEvidence>;
}

export interface ControlledScreenshotCaptureDependencies {
  renderer?: BrowserRenderer;
  store?: ScreenshotArtifactStore;
  viewport?: ScreenshotViewport;
  maxBytes?: number;
  now?: () => Date;
}

export function createControlledScreenshotCapture({
  renderer = createPlaywrightBrowserRenderer(),
  store = createScreenshotArtifactStore(),
  viewport = SCREENSHOT_VIEWPORT,
  maxBytes = SCREENSHOT_MAX_BYTES,
  now = () => new Date(),
}: ControlledScreenshotCaptureDependencies = {}): ControlledScreenshotCapture {
  const serverViewport = validateViewport(viewport);

  return {
    async capture(input) {
      if (input.browserVerification.status !== "PASSED") {
        throw new ControlledScreenshotCaptureError("browser verification is not passed");
      }

      const approvedUrl = validateScreenshotUrl(
        input.browserVerification.url,
        input.profile,
      );

      if (
        input.existingEvidence !== undefined &&
        input.existingEvidence.status === "CAPTURED" &&
        input.existingEvidence.url === approvedUrl.href &&
        sameViewport(input.existingEvidence.viewport, serverViewport)
      ) {
        return copyScreenshotEvidence(input.existingEvidence);
      }

      let rendered;

      try {
        rendered = await renderer.captureScreenshot({
          url: approvedUrl.href,
          expectedOrigin: approvedUrl.origin,
          viewport: serverViewport,
          timeoutMs: input.profile.navigationTimeoutMs,
          maxBytes,
        });
      } catch (error) {
        logger.error("Controlled screenshot renderer failed", {
          taskId: input.taskId,
          projectId: input.projectId,
          operation: "screenshot_capture",
          cause: describeError(error),
        });
        throw new ControlledScreenshotCaptureError("screenshot capture failed");
      }

      const renderedUrl = validateScreenshotUrl(rendered.url, input.profile);

      if (renderedUrl.origin !== approvedUrl.origin) {
        throw new ControlledScreenshotCaptureError("navigation left localhost origin");
      }

      if (rendered.pngBytes.byteLength === 0) {
        throw new ControlledScreenshotCaptureError("screenshot is empty");
      }

      if (rendered.pngBytes.byteLength > maxBytes) {
        throw new ControlledScreenshotCaptureError("screenshot exceeds size limit");
      }

      let artifact;
      try {
        artifact = await store.store({
          projectId: input.projectId,
          taskId: input.taskId,
          pngBytes: rendered.pngBytes,
          repositoryRoot: input.repositoryRoot,
        });
      } catch (error) {
        logger.error("Controlled screenshot storage failed", {
          taskId: input.taskId,
          projectId: input.projectId,
          operation: "screenshot_store",
          byteCount: rendered.pngBytes.byteLength,
          cause: describeError(error),
        });
        throw new ControlledScreenshotCaptureError("screenshot storage failed");
      }

      return {
        status: "CAPTURED",
        id: artifact.artifactId,
        url: approvedUrl.href,
        viewport: serverViewport,
        capturedAt: now().toISOString(),
      };
    },
  };
}

export function createPlaywrightBrowserRenderer({
  executablePath = process.env.DEVCREW_BROWSER_EXECUTABLE_PATH,
}: { executablePath?: string } = {}): BrowserRenderer {
  return {
    async captureScreenshot(input) {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({
        headless: true,
        ...(executablePath === undefined || executablePath === ""
          ? {}
          : { executablePath }),
      });
      let context:
        | Awaited<ReturnType<typeof browser.newContext>>
        | undefined;
      let page:
        | Awaited<ReturnType<NonNullable<typeof context>["newPage"]>>
        | undefined;

      try {
        context = await browser.newContext({
          viewport: input.viewport,
          ignoreHTTPSErrors: false,
        });
        page = await context.newPage();
        await page.goto(input.url, {
          waitUntil: "networkidle",
          timeout: input.timeoutMs,
        });

        const finalUrl = new URL(page.url());
        if (finalUrl.origin !== input.expectedOrigin) {
          throw new ControlledScreenshotCaptureError("browser redirected externally");
        }

        const pngBytes = await page.screenshot({
          type: "png",
          fullPage: false,
          timeout: input.timeoutMs,
        });

        if (pngBytes.byteLength === 0) {
          throw new ControlledScreenshotCaptureError("screenshot is empty");
        }

        if (pngBytes.byteLength > input.maxBytes) {
          throw new ControlledScreenshotCaptureError("screenshot exceeds size limit");
        }

        return {
          url: page.url(),
          pngBytes,
        };
      } finally {
        await page?.close().catch(() => undefined);
        await context?.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    },
  };
}

function validateScreenshotUrl(
  value: string,
  profile: BrowserVerificationProfile,
): URL {
  try {
    return validateLocalhostUrl(value, profile);
  } catch {
    throw new ControlledScreenshotCaptureError("localhost URL is not approved");
  }
}

function validateViewport(viewport: ScreenshotViewport): ScreenshotViewport {
  if (
    !Number.isInteger(viewport.width) ||
    !Number.isInteger(viewport.height) ||
    viewport.width !== SCREENSHOT_VIEWPORT.width ||
    viewport.height !== SCREENSHOT_VIEWPORT.height
  ) {
    throw new ControlledScreenshotCaptureError("screenshot viewport is not approved");
  }

  return { width: viewport.width, height: viewport.height };
}

function sameViewport(left: ScreenshotViewport, right: ScreenshotViewport): boolean {
  return left.width === right.width && left.height === right.height;
}

function copyScreenshotEvidence(
  evidence: BrowserScreenshotEvidence,
): BrowserScreenshotEvidence {
  return {
    status: evidence.status,
    id: evidence.id,
    url: evidence.url,
    viewport: {
      width: evidence.viewport.width,
      height: evidence.viewport.height,
    },
    capturedAt: evidence.capturedAt,
  };
}
