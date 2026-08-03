import { z } from "zod";

import { projectIdSchema } from "../projects/contracts.js";

export const taskIdSchema = z
  .string()
  .regex(/^task_[A-Za-z0-9._:-]{1,128}$/);

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
});

export const createTaskPathParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const getTaskPathParamsSchema = z.object({
  projectId: projectIdSchema,
  taskId: taskIdSchema,
});

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
