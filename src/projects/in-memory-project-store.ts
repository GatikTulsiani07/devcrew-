import type { ProjectStore, StoredProject } from "./types.js";

export class InMemoryProjectStore implements ProjectStore {
  readonly #projectsById = new Map<string, StoredProject>();

  async create(project: StoredProject): Promise<StoredProject> {
    this.#projectsById.set(project.id, project);
    return project;
  }

  async findById(projectId: string): Promise<StoredProject | undefined> {
    return this.#projectsById.get(projectId);
  }

  async findByPreparedRepositoryId(
    preparedRepositoryId: string,
  ): Promise<StoredProject | undefined> {
    return [...this.#projectsById.values()].find(
      (project) =>
        project.repository.preparedRepositoryId === preparedRepositoryId,
    );
  }

  async findByCanonicalRepositoryUrl(
    canonicalRepositoryUrl: string,
  ): Promise<StoredProject | undefined> {
    return [...this.#projectsById.values()].find(
      (project) => project.canonicalRepositoryUrl === canonicalRepositoryUrl,
    );
  }
}
