import { z } from 'zod';

export const listCinemasQuerySchema = z.object({
  city: z.string().trim().min(1).optional(),
  neighborhood: z.string().trim().min(1).optional(),
});

export const getCinemaParamsSchema = z.object({
  id: z.string().trim().min(1, 'Cinema ID is required'),
});

export const getCinemaShowtimesQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  movieId: z.string().trim().min(1).optional(),
});

export type ListCinemasQuery = z.infer<typeof listCinemasQuerySchema>;
export type GetCinemaParams = z.infer<typeof getCinemaParamsSchema>;
export type GetCinemaShowtimesQuery = z.infer<typeof getCinemaShowtimesQuerySchema>;
