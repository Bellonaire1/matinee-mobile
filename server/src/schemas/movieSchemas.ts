import { z } from 'zod';

export const listMoviesQuerySchema = z.object({
  category: z
    .string()
    .optional()
    .transform((val) => (val ? val.toUpperCase() : undefined))
    .pipe(z.enum(['NOW_SHOWING', 'COMING_SOON', 'TRENDING']).optional()),
  genre: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const getMovieParamsSchema = z.object({
  id: z.string().trim().min(1, 'Movie ID is required'),
});

export type ListMoviesQuery = z.infer<typeof listMoviesQuerySchema>;
export type GetMovieParams = z.infer<typeof getMovieParamsSchema>;
