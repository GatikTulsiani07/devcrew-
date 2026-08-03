import { randomUUID } from "node:crypto";

import { ApplicationError } from "../errors.js";
import {
  findPreparedRepository,
  type PreparedRepository,
} from "../repositories/prepared-repositories.js";
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

      const timestamp = now().toISOString();
      const project: StoredProject = {
        id: generateProjectId(),
        name: input.name,
        status: "REPOSITORY_CONNECTED",
        repository: {
          id: generateRepositoryId(),
          publicRepositoryUrl: canonicalRepositoryUrl,
          preparedRepositoryId: input.preparedRepositoryId,
        },
        canonicalRepositoryUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return toProjectSnapshot(await store.create(project));
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
    repository: { ...project.repository },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
