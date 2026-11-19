import { Request, Response, NextFunction } from 'express';
import showtimeService from '../services/showtimeService.js';
import { GetShowtimeSeatsParams } from '../schemas/showtimeSchemas.js';

export async function getShowtimeSeats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as GetShowtimeSeatsParams;
    const inventory = await showtimeService.getShowtimeSeatInventory(id);

    res.status(200).json({
      status: 'success',
      data: inventory,
    });
  } catch (error) {
    next(error);
  }
}
