import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { promisify } from "node:util";

import { ApplicationError } from "../src/errors.js";
import type { ProjectService } from "../src/projects/project-service.js";
import {
  createControlledGitInspector,
  type GitInspector,
} from "../src/repositories/git-inspector.js";
import type { PreparedRepository } from "../src/repositories/prepared-repositories.js";
import {
  createControlledDeveloperExecutor,
  type DeveloperImplementationPlanner,
} from "../src/tasks/controlled-developer-executor.js";
import type { DeveloperExecutionInput } from "../src/tasks/types.js";

const execFile = promisify(execFileCallback);

let repositoryRoot: string;

async function git(args: readonly string[]): Promise<void> {
  await execFile("git", [...args], { cwd: repositoryRoot });
}

function developerInput(): DeveloperExecutionInput {
  return {
    project: {
      id: "proj_000001",
      name: "Devcrew",
      status: "REPOSITORY_CONNECTED",
      repository: {
        id: "repo_000001",
        publicRepositoryUrl: "https://github.com/example/devcrew",
        preparedRepositoryId: "prepared_devcrew_main",
      },
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    },
    task: {
      id: "task_000001",
      projectId: "proj_000001",
      title: "Implement auth middleware",
      description: "Protect every API route.",
      status: "PLAN_APPROVED",
      plan: { summary: "Add auth middleware.", steps: ["Implement it."] },
      planDecision: {
        decision: "APPROVE",
        decidedAt: "2026-08-03T01:00:00.000Z",
      },
      createdAt: "2026-08-03T00:30:00.000Z",
      updatedAt: "2026-08-03T01:00:00.000Z",
    },
  };
}

function projectService(): ProjectService {
  return {
    async createProject() {
      throw new Error("unused");
    },
    async getProject() {
      return developerInput().project;
    },
  };
}

function repository(): PreparedRepository {
  return {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    localCheckoutPath: repositoryRoot,
    validationProfileId: "node_standard",
  };
}

function planner(plan: unknown): DeveloperImplementationPlanner {
  return {
    async plan() {
      return plan;
    },
  };
}

function executor(plan: unknown, gitInspector?: GitInspector) {
  return createControlledDeveloperExecutor({
    projectService: projectService(),
    preparedRepositories: [repository()],
    planner: planner(plan),
    gitInspector: gitInspector ?? createControlledGitInspector(),
    generateExecutionId: () => "exec_000001",
    now: () => new Date("2026-08-03T02:00:00.000Z"),
  });
}

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "devcrew-git-"));
  await git(["init", "--quiet", "-b", "main"]);
  await git(["config", "user.email", "devcrew@example.com"]);
  await git(["config", "user.name", "Devcrew"]);
  await writeFile(join(repositoryRoot, "tracked.ts"), "same\n", "utf8");
  await writeFile(join(repositoryRoot, "changing.ts"), "one\ntwo\n", "utf8");
  await git(["add", "--all"]);
  await git(["commit", "--quiet", "-m", "baseline"]);
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

describe("controlled git evidence", () => {
  it("derives evidence from Git state rather than model claims", async () => {
    const execution = await executor({
      summary: "Apply the approved change.",
      operations: [
        { type: "update", path: "tracked.ts", content: "same\n" },
        { type: "update", path: "changing.ts", content: "one\ntwo\nthree\n" },
        { type: "create", path: "src/added file.ts", content: "export const a = 1;\n" },
      ],
      verification: ["Run tests"],
    }).execute(developerInput());

    const evidence = execution.result.changeEvidence;

    assert.notEqual(evidence, undefined);
    assert.deepEqual(
      [...(evidence?.files ?? [])].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      [
        { path: "changing.ts", status: "MODIFIED", additions: 1, deletions: 0 },
        { path: "src/added file.ts", status: "UNTRACKED", additions: 1, deletions: 0 },
      ],
    );
    assert.deepEqual(evidence?.summary, {
      filesChanged: 2,
      additions: 2,
      deletions: 0,
    });
    assert.equal(
      execution.result.changedFiles.includes("MODIFIED: tracked.ts (+0/-0)"),
      false,
    );
    assert.match(evidence?.diff ?? "", /\+three/);
    assert.match(evidence?.diff ?? "", /\+export const a = 1;/);
    assert.equal(/\/home\/|\/Users\//.test(evidence?.diff ?? ""), false);
  });

  it("does not stage or commit repository changes", async () => {
    await executor({
      summary: "Apply the approved change.",
      operations: [{ type: "create", path: "new.ts", content: "export const b = 2;\n" }],
      verification: ["Run tests"],
    }).execute(developerInput());

    const staged = await execFile("git", ["diff", "--cached", "--name-only"], {
      cwd: repositoryRoot,
    });
    const log = await execFile("git", ["log", "--oneline"], { cwd: repositoryRoot });
    const status = await execFile("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
    });

    assert.equal(staged.stdout, "");
    assert.equal(log.stdout.trim().split("\n").length, 1);
    assert.match(status.stdout, /^\?\? new\.ts$/m);
  });

  it("rejects a dirty baseline without mutating the repository", async () => {
    await writeFile(join(repositoryRoot, "changing.ts"), "unrelated\n", "utf8");

    await assert.rejects(
      executor({
        summary: "Apply the approved change.",
        operations: [{ type: "create", path: "new.ts", content: "x\n" }],
        verification: ["Run tests"],
      }).execute(developerInput()),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === "INTERNAL_ERROR" &&
        error.message === "An unexpected error occurred",
    );

    await assert.rejects(stat(join(repositoryRoot, "new.ts")));
    assert.equal(
      await readFile(join(repositoryRoot, "changing.ts"), "utf8"),
      "unrelated\n",
    );
  });

  it("fails closed for a directory that is not a Git repository", async () => {
    const plain = await mkdtemp(join(tmpdir(), "devcrew-plain-"));
    repositoryRoot = plain;

    await assert.rejects(
      executor({
        summary: "Apply the approved change.",
        operations: [{ type: "create", path: "new.ts", content: "x\n" }],
        verification: ["Run tests"],
      }).execute(developerInput()),
      ApplicationError,
    );

    await assert.rejects(stat(join(plain, "new.ts")));
  });

  it("restores mutations when evidence capture fails", async () => {
    const failingInspector: GitInspector = {
      async assertCleanBaseline() {},
      async captureEvidence() {
        throw new Error("git inspection exploded at /home/example/checkout");
      },
    };

    await assert.rejects(
      executor(
        {
          summary: "Apply the approved change.",
          operations: [
            { type: "create", path: "new.ts", content: "x\n" },
            { type: "update", path: "changing.ts", content: "mutated\n" },
          ],
          verification: ["Run tests"],
        },
        failingInspector,
      ).execute(developerInput()),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.message === "An unexpected error occurred",
    );

    await assert.rejects(stat(join(repositoryRoot, "new.ts")));
    assert.equal(
      await readFile(join(repositoryRoot, "changing.ts"), "utf8"),
      "one\ntwo\n",
    );
    const status = await execFile("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
    });
    assert.equal(status.stdout, "");
  });
});
