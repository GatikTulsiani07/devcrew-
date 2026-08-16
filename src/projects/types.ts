import type { RepositoryCapabilities } from "../repositories/repository-capabilities.js";

export type ProjectStatus = "REPOSITORY_CONNECTED";

export interface ProjectRepositorySnapshot {
  id: string;
  publicRepositoryUrl: string;
  preparedRepositoryId: string;
  capabilities?: RepositoryCapabilities;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  status: ProjectStatus;
  repository: ProjectRepositorySnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface StoredProject extends ProjectSnapshot {
  canonicalRepositoryUrl: string;
}

export interface CreateProjectInput {
  name: string;
  publicRepositoryUrl: string;
  preparedRepositoryId: string;
}

export interface ProjectStore {
  create(project: StoredProject): Promise<StoredProject>;
  findById(projectId: string): Promise<StoredProject | undefined>;
  findByPreparedRepositoryId(
    preparedRepositoryId: string,
  ): Promise<StoredProject | undefined>;
  findByCanonicalRepositoryUrl(
    canonicalRepositoryUrl: string,
  ): Promise<StoredProject | undefined>;
}
