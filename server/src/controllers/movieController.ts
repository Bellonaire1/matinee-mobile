import { Request, Response, NextFunction } from 'express';
import movieService from '../services/movieService.js';
import { ListMoviesQuery } from '../schemas/movieSchemas.js';

export async function getMovies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as ListMoviesQuery;
    const result = await movieService.listMovies(query);

    res.status(200).json({
      status: 'success',
      data: result.movies,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMovieById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const movie = await movieService.getMovieById(id);

    res.status(200).json({
      status: 'success',
      data: movie,
    });
  } catch (error) {
    next(error);
  }
}
