import { randomUUID } from "node:crypto";
import { link, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import type {
  ScreenshotArtifactStore,
  StoredScreenshotArtifact,
} from "./browser-types.js";

export class ScreenshotArtifactStoreError extends Error {
  constructor(readonly reason: string) {
    super(`Screenshot artifact storage failed: ${reason}`);
    this.name = "ScreenshotArtifactStoreError";
  }
}

export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_SCREENSHOT_ARTIFACT_ROOT = resolve(
  tmpdir(),
  "devcrew",
  "screenshot-artifacts",
);

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_ARTIFACT_ID_PATTERN = /^shot_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface ScreenshotArtifactStoreDependencies {
  artifactRoot?: string;
  maxBytes?: number;
  generateArtifactId?: () => string;
}

export function createScreenshotArtifactStore({
  artifactRoot = process.env.DEVCREW_SCREENSHOT_ARTIFACT_ROOT ??
    DEFAULT_SCREENSHOT_ARTIFACT_ROOT,
  maxBytes = SCREENSHOT_MAX_BYTES,
  generateArtifactId = () => `shot_${randomUUID()}`,
}: ScreenshotArtifactStoreDependencies = {}): ScreenshotArtifactStore {
  return {
    async store(input): Promise<StoredScreenshotArtifact> {
      const root = resolveArtifactRoot(artifactRoot);
      const projectSegment = safePathSegment(input.projectId, "project id");
      const taskSegment = safePathSegment(input.taskId, "task id");
      const artifactId = safeArtifactId(generateArtifactId());

      validatePngBytes(input.pngBytes, maxBytes);

      const filename = `${artifactId}.png`;
      const directory = resolve(root, projectSegment, taskSegment);
      const absolutePath = resolve(directory, filename);
      assertWithinRoot(absolutePath, root);

      if (input.repositoryRoot !== undefined) {
        assertOutsideRepository(absolutePath, input.repositoryRoot);
      }

      const temporaryPath = resolve(directory, `${filename}.${process.pid}.tmp`);
      assertWithinRoot(temporaryPath, root);

      try {
        await mkdir(directory, { recursive: true });
        const realRoot = await realpath(root);
        const realDirectory = await realpath(directory);
        assertWithinRoot(realDirectory, realRoot);

        await writeFile(temporaryPath, input.pngBytes, { flag: "wx" });
        await link(temporaryPath, absolutePath);
        await rm(temporaryPath, { force: true });
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        if (error instanceof ScreenshotArtifactStoreError) {
          throw error;
        }
        throw new ScreenshotArtifactStoreError("artifact write failed");
      }

      return {
        artifactId,
        absolutePath,
        byteCount: input.pngBytes.byteLength,
      };
    },
  };
}

function resolveArtifactRoot(value: string): string {
  const root = resolve(value);

  if (!isAbsolute(root)) {
    throw new ScreenshotArtifactStoreError("artifact root is not absolute");
  }

  return root;
}

function safePathSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT_PATTERN.test(value) || value.includes("..")) {
    throw new ScreenshotArtifactStoreError(`${label} is unsafe`);
  }

  return value;
}

function safeArtifactId(value: string): string {
  if (!SAFE_ARTIFACT_ID_PATTERN.test(value)) {
    throw new ScreenshotArtifactStoreError("artifact id is unsafe");
  }

  return value;
}

function validatePngBytes(bytes: Uint8Array, maxBytes: number): void {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new ScreenshotArtifactStoreError("artifact size limit is invalid");
  }

  if (bytes.byteLength === 0) {
    throw new ScreenshotArtifactStoreError("screenshot is empty");
  }

  if (bytes.byteLength > maxBytes) {
    throw new ScreenshotArtifactStoreError("screenshot exceeds size limit");
  }

  if (bytes.byteLength < PNG_SIGNATURE.byteLength) {
    throw new ScreenshotArtifactStoreError("screenshot is not a PNG");
  }

  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new ScreenshotArtifactStoreError("screenshot is not a PNG");
    }
  }
}

function assertWithinRoot(target: string, root: string): void {
  const relativePath = relative(root, target);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    relativePath === ".." ||
    relativePath.includes(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ScreenshotArtifactStoreError("artifact path escaped storage root");
  }
}

function assertOutsideRepository(target: string, repositoryRoot: string): void {
  if (!isAbsolute(repositoryRoot)) {
    throw new ScreenshotArtifactStoreError("repository root is not absolute");
  }

  const repository = resolve(repositoryRoot);
  const relativePath = relative(repository, target);

  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  ) {
    throw new ScreenshotArtifactStoreError("artifact path overlaps repository");
  }
}
