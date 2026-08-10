import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

import { ApplicationError } from "../errors.js";
import { describeError, logger } from "../observability/logger.js";
import {
  browserVerificationProfiles,
  createControlledDevServer,
  type ControlledDevServerDependencies,
} from "../browser/controlled-dev-server.js";
import {
  createControlledBrowserVerifier,
  type ControlledBrowserVerifier,
} from "../browser/controlled-browser-verifier.js";
import {
  createControlledScreenshotCapture,
  type ControlledScreenshotCapture,
} from "../browser/controlled-screenshot-capture.js";
import type {
  BrowserScreenshotEvidence,
  BrowserVerificationEvidence,
  ControlledDevServer,
} from "../browser/browser-types.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
import {
  createGitCheckpointService,
  type GitCheckpointService,
} from "../repositories/git-checkpoint.js";
import {
  createGitRemotePushService,
  type GitRemotePushService,
} from "../repositories/git-remote-push.js";
import type { ProjectService } from "../projects/project-service.js";
import {
  findValidationProfile,
  validationProfiles,
} from "../validation/validation-profiles.js";
import {
  createControlledCommandRunner,
  type ControlledCommandRunnerOptions,
} from "../validation/controlled-command-runner.js";
import type {
  ControlledCommandRunner,
  ValidationProfile,
} from "../validation/types.js";
import type {
  DevOpsValidator,
  TaskValidation,
  ValidationCheckName,
} from "./types.js";

export interface ControlledDevOpsValidatorDependencies {
  projectService: ProjectService;
  preparedRepositories: readonly PreparedRepository[];
  runner?: ControlledCommandRunner;
  profiles?: readonly ValidationProfile[];
  generateValidationId?: () => string;
  now?: () => Date;
  runnerOptions?: ControlledCommandRunnerOptions;
  checkpointService?: GitCheckpointService;
  remotePushService?: GitRemotePushService;
  devServer?: ControlledDevServer;
  devServerOptions?: ControlledDevServerDependencies;
  browserVerifier?: ControlledBrowserVerifier;
  screenshotCapture?: ControlledScreenshotCapture;
}

export function createControlledDevOpsValidator({
  projectService,
  preparedRepositories,
  runner: injectedRunner,
  profiles = validationProfiles,
  generateValidationId = () => `val_${randomUUID()}`,
  now = () => new Date(),
  runnerOptions,
  checkpointService = createGitCheckpointService(),
  remotePushService = createGitRemotePushService(),
  devServerOptions,
  devServer = createControlledDevServer(devServerOptions),
  browserVerifier = createControlledBrowserVerifier(),
  screenshotCapture = createControlledScreenshotCapture(),
}: ControlledDevOpsValidatorDependencies): DevOpsValidator {
  const runner = injectedRunner ?? createControlledCommandRunner(runnerOptions);

  return {
    async validate(task): Promise<TaskValidation> {
      const project = await projectService.getProject(task.projectId);
      const repository = findPreparedRepository(
        preparedRepositories,
        project.repository.preparedRepositoryId,
      );
      const profileId = repository?.validationProfileId;
      const profile =
        profileId === undefined
          ? undefined
          : findValidationProfile(profiles, profileId);

      if (
        !repository ||
        repository.publicRepositoryUrl !== project.repository.publicRepositoryUrl ||
        !profile ||
        !isValidRepository(repository) ||
        !isValidProfile(profile)
      ) {
        throw validationFailure();
      }

      const startedAt = now().toISOString();
      const checks = [];
      for (const check of profile.checks) {
        let result;
        try {
          result = await runner.run(check, repository.localCheckoutPath);
        } catch (error) {
          logger.error("Validation check runner threw", {
            check: check.name,
            cause: describeError(error),
          });
          throw validationFailure();
        }
        if (result.status !== "PASSED") {
          throw validationFailure();
        }
        checks.push({
          name: check.name as ValidationCheckName,
          status: "PASSED" as const,
          summary: checkSummary(check.name),
        });
      }

      const changeEvidence = task.execution?.result.changeEvidence;

      if (changeEvidence === undefined) {
        logger.error("Controlled validation cannot checkpoint without Git evidence", {
          taskId: task.id,
        });
        throw validationFailure();
      }

      let checkpoint;

      try {
        checkpoint = await checkpointService.createCheckpoint({
          repositoryRoot: repository.localCheckoutPath,
          taskId: task.id,
          changeEvidence,
          existingCheckpoint: task.validation?.checkpoint,
        });
      } catch (error) {
        logger.error("Controlled Git checkpoint failed after validation", {
          taskId: task.id,
          cause: describeError(error),
        });
        throw validationFailure();
      }

      let remoteBranch;

      try {
        remoteBranch = await remotePushService.pushValidatedBranch({
          repositoryRoot: repository.localCheckoutPath,
          taskId: task.id,
          projectRepositoryUrl: project.repository.publicRepositoryUrl,
          checkpoint,
          existingRemoteBranch: task.validation?.remoteBranch,
        });
      } catch (error) {
        logger.error("Controlled Git remote push failed after checkpoint", {
          taskId: task.id,
          cause: describeError(error),
        });
        throw validationFailure();
      }

      let browserVerification: BrowserVerificationEvidence | undefined;
      let browserScreenshot: BrowserScreenshotEvidence | undefined;
      const browserProfileId = repository.browserVerificationProfileId;

      if (browserProfileId !== undefined) {
        const browserProfile = browserVerificationProfiles.find(
          (profile) => profile.id === browserProfileId,
        );

        if (browserProfile === undefined) {
          logger.error("Controlled browser verification profile is unsupported", {
            taskId: task.id,
          });
          throw validationFailure();
        }

        let server;

        try {
          server = await devServer.start({
            profileId: browserProfileId,
            repositoryRoot: repository.localCheckoutPath,
          });
          browserVerification = await browserVerifier.verify({
            profile: browserProfile,
            url: server.url,
          });
          browserScreenshot = await screenshotCapture.capture({
            projectId: task.projectId,
            taskId: task.id,
            profile: browserProfile,
            browserVerification,
            repositoryRoot: repository.localCheckoutPath,
            existingEvidence: task.validation?.browserScreenshot,
          });
        } catch (error) {
          logger.error("Controlled browser verification failed after validation", {
            taskId: task.id,
            cause: describeError(error),
          });
          throw validationFailure();
        } finally {
          if (server !== undefined) {
            await server.stop().catch((error: unknown) => {
              logger.error("Controlled browser verification cleanup failed", {
                taskId: task.id,
                cause: describeError(error),
              });
            });
          }
        }
      }

      return {
        id: generateValidationId(),
        role: "DEVOPS_ENGINEER",
        status: "PASSED",
        attempt: 1,
        startedAt,
        completedAt: now().toISOString(),
        checks,
        summary: "Controlled validation completed successfully.",
        checkpoint,
        remoteBranch,
        ...(browserVerification === undefined ? {} : { browserVerification }),
        ...(browserScreenshot === undefined ? {} : { browserScreenshot }),
      };
    },
  };
}

function isValidRepository(repository: PreparedRepository): repository is PreparedRepository & {
  localCheckoutPath: string;
  validationProfileId: string;
} {
  return (
    typeof repository.localCheckoutPath === "string" &&
    isAbsolute(repository.localCheckoutPath) &&
    typeof repository.validationProfileId === "string" &&
    repository.validationProfileId.length > 0
  );
}

function isValidProfile(profile: ValidationProfile): boolean {
  const expectedNames = ["typecheck", "tests", "build"];
  return (
    Array.isArray(profile.checks) &&
    profile.checks.length === 3 &&
    profile.checks.every((check, index) => check.name === expectedNames[index]) &&
    profile.checks.every(
      (check) =>
        typeof check.executable === "string" &&
        check.executable.length > 0 &&
        Array.isArray(check.args) &&
        check.args.every((arg: unknown) => typeof arg === "string") &&
        Number.isInteger(check.timeoutMs) &&
        check.timeoutMs > 0,
    )
  );
}

function checkSummary(name: string): string {
  switch (name) {
    case "typecheck":
      return "Type checking completed successfully.";
    case "tests":
      return "Automated tests completed successfully.";
    case "build":
      return "Production build completed successfully.";
    default:
      return "Validation check completed successfully.";
  }
}

function validationFailure(): ApplicationError {
  return new ApplicationError("INTERNAL_ERROR", 500, "Validation failed");
}
