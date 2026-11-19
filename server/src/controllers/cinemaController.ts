import { Request, Response, NextFunction } from 'express';
import cinemaService from '../services/cinemaService.js';
import { ListCinemasQuery, GetCinemaShowtimesQuery } from '../schemas/cinemaSchemas.js';

export async function getCinemas(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as ListCinemasQuery;
    const cinemas = await cinemaService.listCinemas(query);

    res.status(200).json({
      status: 'success',
      data: cinemas,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCinemaShowtimes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const query = req.query as unknown as GetCinemaShowtimesQuery;
    const showtimes = await cinemaService.getCinemaShowtimes(id, query);

    res.status(200).json({
      status: 'success',
      data: showtimes,
    });
  } catch (error) {
    next(error);
  }
}
