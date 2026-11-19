import { z } from 'zod';

export const getShowtimeSeatsParamsSchema = z.object({
  id: z.string().trim().min(1, 'Showtime ID is required'),
});

export type GetShowtimeSeatsParams = z.infer<typeof getShowtimeSeatsParamsSchema>;
