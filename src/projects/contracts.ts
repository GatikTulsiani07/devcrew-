import { z } from "zod";

export const projectIdSchema = z
  .string()
  .regex(/^proj_[A-Za-z0-9._:-]{1,128}$/);

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  publicRepositoryUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }),
  preparedRepositoryId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/),
});

export const projectPathParamsSchema = z.object({
  projectId: projectIdSchema,
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
