import { randomUUID } from "node:crypto";

import {
  createNoopActivityService,
  type ActivityService,
} from "../activity/activity-service.js";
import { ApplicationError } from "../errors.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
import { detectRepositoryCapabilities } from "../repositories/repository-capabilities.js";
import type {
  CreateProjectInput,
  ProjectSnapshot,
  ProjectStore,
  StoredProject,
} from "./types.js";

export type IdGenerator = () => string;
export type Clock = () => Date;

export interface ProjectServiceDependencies {
  store: ProjectStore;
  preparedRepositories: readonly PreparedRepository[];
  generateProjectId?: IdGenerator;
  generateRepositoryId?: IdGenerator;
  now?: Clock;
  activityService?: ActivityService;
}

export interface ProjectService {
  createProject(input: CreateProjectInput): Promise<ProjectSnapshot>;
  getProject(projectId: string): Promise<ProjectSnapshot>;
}

export function createProjectService({
  store,
  preparedRepositories,
  generateProjectId = () => `proj_${randomUUID()}`,
  generateRepositoryId = () => `repo_${randomUUID()}`,
  now = () => new Date(),
  activityService = createNoopActivityService(),
}: ProjectServiceDependencies): ProjectService {
  return {
    async createProject(input) {
      const preparedRepository = findPreparedRepository(
        preparedRepositories,
        input.preparedRepositoryId,
      );

      if (preparedRepository === undefined) {
        throw new ApplicationError(
          "PREPARED_REPOSITORY_NOT_APPROVED",
          422,
          "Prepared repository is not approved",
        );
      }

      const canonicalRepositoryUrl = canonicalizeRepositoryUrl(
        input.publicRepositoryUrl,
      );
      const allowedRepositoryUrl = canonicalizeRepositoryUrl(
        preparedRepository.publicRepositoryUrl,
      );

      if (canonicalRepositoryUrl !== allowedRepositoryUrl) {
        throw new ApplicationError(
          "REPOSITORY_URL_MISMATCH",
          422,
          "Repository URL does not match the prepared repository",
        );
      }

      if (
        (await store.findByPreparedRepositoryId(input.preparedRepositoryId)) !==
        undefined
      ) {
        throw duplicateRepositoryError();
      }

      if (
        (await store.findByCanonicalRepositoryUrl(canonicalRepositoryUrl)) !==
        undefined
      ) {
        throw duplicateRepositoryError();
      }

      const capabilities = await prepareCapabilities(preparedRepository);
      const timestamp = now().toISOString();
      const project: StoredProject = {
        id: generateProjectId(),
        name: input.name,
        status: "REPOSITORY_CONNECTED",
        repository: {
          id: generateRepositoryId(),
          publicRepositoryUrl: canonicalRepositoryUrl,
          preparedRepositoryId: input.preparedRepositoryId,
          ...(capabilities === undefined ? {} : { capabilities }),
        },
        canonicalRepositoryUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const createdProject = toProjectSnapshot(await store.create(project));
      await activityService.append({
        projectId: createdProject.id,
        type: "PROJECT_CREATED",
        actor: { kind: "HUMAN" },
        summary: "Project connected to a prepared repository.",
      });

      return createdProject;
    },

    async getProject(projectId) {
      const project = await store.findById(projectId);

      if (project === undefined) {
        throw new ApplicationError(
          "PROJECT_NOT_FOUND",
          404,
          "Project not found",
        );
      }

      return toProjectSnapshot(project);
    },
  };
}

async function prepareCapabilities(
  preparedRepository: PreparedRepository,
) {
  if (preparedRepository.capabilities !== undefined) {
    return preparedRepository.capabilities;
  }

  const capabilities = await detectRepositoryCapabilities(preparedRepository);
  if (capabilities !== undefined) {
    preparedRepository.capabilities = capabilities;
  }

  return capabilities;
}

export function canonicalizeRepositoryUrl(repositoryUrl: string): string {
  const url = new URL(repositoryUrl);
  url.hash = "";
  url.search = "";
  url.username = "";
  url.password = "";

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

function duplicateRepositoryError(): ApplicationError {
  return new ApplicationError(
    "PROJECT_REPOSITORY_ALREADY_ASSOCIATED",
    409,
    "Repository is already associated with a project",
  );
}

function toProjectSnapshot(project: StoredProject): ProjectSnapshot {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    repository: {
      ...project.repository,
      ...(project.repository.capabilities === undefined
        ? {}
        : { capabilities: { ...project.repository.capabilities } }),
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
