import { z } from "zod";

import { projectIdSchema } from "../projects/contracts.js";

export const taskIdSchema = z
  .string()
  .regex(/^task_[A-Za-z0-9._:-]{1,128}$/);

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
});

export const planDecisionRequestSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    reason: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(1).max(1_000),
  }),
]);

export const createTaskPathParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const getTaskPathParamsSchema = z.object({
  projectId: projectIdSchema,
  taskId: taskIdSchema,
});

export const planDecisionPathParamsSchema = getTaskPathParamsSchema;

export const executeTaskPathParamsSchema = getTaskPathParamsSchema;

export const executeTaskRequestSchema = z.object({}).strict();

export const validateTaskPathParamsSchema = getTaskPathParamsSchema;

export const validateTaskRequestSchema = z.object({}).strict();

export const reviewTaskPathParamsSchema = getTaskPathParamsSchema;

export const reviewTaskRequestSchema = z.object({}).strict();

export const createPullRequestPathParamsSchema = getTaskPathParamsSchema;

export const createPullRequestRequestSchema = z.object({}).strict();

export const retryTaskPathParamsSchema = getTaskPathParamsSchema;

export const retryTaskRequestSchema = z.object({}).strict();

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type PlanDecisionRequest = z.infer<typeof planDecisionRequestSchema>;
export type ExecuteTaskRequest = z.infer<typeof executeTaskRequestSchema>;
export type ValidateTaskRequest = z.infer<typeof validateTaskRequestSchema>;
export type ReviewTaskRequest = z.infer<typeof reviewTaskRequestSchema>;
export type CreatePullRequestRequest = z.infer<
  typeof createPullRequestRequestSchema
>;
export type RetryTaskRequest = z.infer<typeof retryTaskRequestSchema>;
