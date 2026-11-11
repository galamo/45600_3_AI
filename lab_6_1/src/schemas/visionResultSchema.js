import { z } from "zod";

export const visionResultSchema = z.object({
  tags: z.array(z.string().min(1)).min(1).max(12),
  description: z.string().min(1).max(500),
});
