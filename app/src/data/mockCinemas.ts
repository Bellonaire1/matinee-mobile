export interface ShowtimeSlot {
  id: string;
  time: string;
  format: 'IMAX 70mm' | 'IMAX 3D' | 'Dolby Cinema' | 'Dolby Atmos' | 'VIP Recliner' | 'Standard 2D' | '4DX';
  screen: string;
  /**
   * @deprecated Legacy mock slot price. Non-authoritative.
   * Seat admission is derived from the approved auditorium seat-tier model
   * (Standard: ₦7,000, Accessible: ₦7,000, VIP: ₦9,500, Couple: ₦6,000 each / ₦12,000 pair).
   * Starting seat price is exported as APPROVED_BASE_PRICE_KOBO (700,000 kobo = ₦7,000)
   * in mockSeats.ts and formatted via APPROVED_SHOWTIME_PRICE_LABEL ("Seats from ₦7,000").
   */
  price: number;
  currency: string;
  status: 'available' | 'filling_fast' | 'almost_full';
  seatsAvailable: number;
}

export interface Cinema {
  id: string;
  name: string;
  chain: string;
  neighborhood: string;
  address: string;
  distanceKm: number;
  features: string[];
  showtimesByMovie: Record<string, ShowtimeSlot[]>;
}

export interface DayOption {
  dateString: string; // YYYY-MM-DD
  dayName: string; // e.g. "Wed", "Today"
  dayNumber: string; // e.g. "11"
  month: string; // e.g. "Nov"
  isToday: boolean;
}

// Generate the next 7 calendar days starting from current date
export function generateDateRibbon(baseDate: Date = new Date()): DayOption[] {
  const days: DayOption[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);

    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const dayOfMonth = d.getDate();
    const dayOfWeek = d.getDay();

    const dateString = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(
      dayOfMonth
    ).padStart(2, '0')}`;

    days.push({
      dateString,
      dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[dayOfWeek],
      dayNumber: String(dayOfMonth),
      month: monthNames[monthIndex],
      isToday: i === 0,
    });
  }

  return days;
}

// Mock Lagos Cinemas catalog
export const LAGOS_CINEMAS: Cinema[] = [
  {
    id: 'cin-lekki-imax',
    name: 'Filmhouse Cinemas IMAX',
    chain: 'Filmhouse',
    neighborhood: 'Lekki Phase 1',
    address: 'Bisola Durosinmi Etti Dr, The Rock Drive, Lekki, Lagos',
    distanceKm: 2.8,
    features: ['Laser IMAX', 'Signature VIP', 'Dolby Atmos', 'Valet Parking'],
    showtimesByMovie: {
      'feat-1': [
        {
          id: 'st-dune-1',
          time: '14:30',
          format: 'IMAX 70mm',
          screen: 'Screen 1 (Laser IMAX)',
          price: 9500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 142,
        },
        {
          id: 'st-dune-2',
          time: '17:45',
          format: 'IMAX 70mm',
          screen: 'Screen 1 (Laser IMAX)',
          price: 9500,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 34,
        },
        {
          id: 'st-dune-3',
          time: '21:00',
          format: 'VIP Recliner',
          screen: 'Screen 2 (Signature VIP)',
          price: 12000,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 18,
        },
        {
          id: 'st-dune-4',
          time: '23:30',
          format: 'Dolby Atmos',
          screen: 'Screen 3',
          price: 8500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 95,
        },
      ],
      'ns-1': [
        {
          id: 'st-int-1',
          time: '13:00',
          format: 'IMAX 70mm',
          screen: 'Screen 1 (Laser IMAX)',
          price: 8500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 88,
        },
        {
          id: 'st-int-2',
          time: '16:30',
          format: 'Dolby Atmos',
          screen: 'Screen 3',
          price: 7500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 110,
        },
        {
          id: 'st-int-3',
          time: '20:15',
          format: 'VIP Recliner',
          screen: 'Screen 2 (Signature VIP)',
          price: 11000,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 22,
        },
      ],
      'ns-2': [
        {
          id: 'st-br-1',
          time: '18:45',
          format: 'Dolby Atmos',
          screen: 'Screen 3',
          price: 7500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 76,
        },
      ],
      'ns-4': [
        {
          id: 'st-opp-1',
          time: '14:00',
          format: 'IMAX 70mm',
          screen: 'Screen 1 (Laser IMAX)',
          price: 9500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 64,
        },
        {
          id: 'st-opp-2',
          time: '18:00',
          format: 'IMAX 70mm',
          screen: 'Screen 1 (Laser IMAX)',
          price: 9500,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 28,
        },
      ],
    },
  },
  {
    id: 'cin-genesis-palms',
    name: 'Genesis Deluxe Cinemas',
    chain: 'Genesis',
    neighborhood: 'The Palms, Lekki / VI',
    address: 'The Palms Shopping Mall, Bisway St, Victoria Island, Lagos',
    distanceKm: 4.6,
    features: ['Dolby Atmos', 'Full Leather Recliners', 'Gourmet Bar'],
    showtimesByMovie: {
      'feat-1': [
        {
          id: 'st-dune-gen-1',
          time: '15:15',
          format: 'Dolby Cinema',
          screen: 'Screen 1 (Atmos)',
          price: 8500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 90,
        },
        {
          id: 'st-dune-gen-2',
          time: '18:30',
          format: 'VIP Recliner',
          screen: 'Screen 2 (VIP Recliner)',
          price: 10500,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 14,
        },
        {
          id: 'st-dune-gen-3',
          time: '21:45',
          format: 'Standard 2D',
          screen: 'Screen 3',
          price: 7000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 80,
        },
      ],
      'ns-3': [
        {
          id: 'st-spid-gen-1',
          time: '12:30',
          format: 'Standard 2D',
          screen: 'Screen 3',
          price: 6500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 120,
        },
        {
          id: 'st-spid-gen-2',
          time: '15:00',
          format: 'Dolby Atmos',
          screen: 'Screen 1 (Atmos)',
          price: 7500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 78,
        },
        {
          id: 'st-spid-gen-3',
          time: '17:30',
          format: 'VIP Recliner',
          screen: 'Screen 2 (VIP Recliner)',
          price: 9500,
          currency: '₦',
          status: 'almost_full',
          seatsAvailable: 6,
        },
      ],
      'ns-4': [
        {
          id: 'st-opp-gen-1',
          time: '20:00',
          format: 'Dolby Cinema',
          screen: 'Screen 1 (Atmos)',
          price: 8500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 68,
        },
      ],
    },
  },
  {
    id: 'cin-ebonylife-vi',
    name: 'EbonyLife Cinemas',
    chain: 'EbonyLife',
    neighborhood: 'Victoria Island',
    address: '1637 Adetokunbo Ademola St, Victoria Island, Lagos',
    distanceKm: 5.2,
    features: ['Ultra Luxury VIP', 'In-seat Dining', 'Art Deco Lounge'],
    showtimesByMovie: {
      'feat-1': [
        {
          id: 'st-dune-eb-1',
          time: '16:00',
          format: 'VIP Recliner',
          screen: 'White Hall VIP',
          price: 13000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 28,
        },
        {
          id: 'st-dune-eb-2',
          time: '19:30',
          format: 'VIP Recliner',
          screen: 'White Hall VIP',
          price: 13000,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 8,
        },
      ],
      'ns-2': [
        {
          id: 'st-br-eb-1',
          time: '17:00',
          format: 'VIP Recliner',
          screen: 'Gold Room',
          price: 12000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 35,
        },
        {
          id: 'st-br-eb-2',
          time: '20:30',
          format: 'VIP Recliner',
          screen: 'Gold Room',
          price: 12000,
          currency: '₦',
          status: 'almost_full',
          seatsAvailable: 4,
        },
      ],
    },
  },
  {
    id: 'cin-silverbird-ikeja',
    name: 'Silverbird Cinemas',
    chain: 'Silverbird',
    neighborhood: 'Ikeja City Mall',
    address: 'Ikeja City Mall, Obafemi Awolowo Way, Alausa, Ikeja, Lagos',
    distanceKm: 14.5,
    features: ['Dolby 7.1', 'Atrium Arcade', 'Student Discount'],
    showtimesByMovie: {
      'feat-1': [
        {
          id: 'st-dune-sb-1',
          time: '14:00',
          format: 'Standard 2D',
          screen: 'Screen 4',
          price: 6500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 130,
        },
        {
          id: 'st-dune-sb-2',
          time: '17:30',
          format: 'Standard 2D',
          screen: 'Screen 4',
          price: 6500,
          currency: '₦',
          status: 'available',
          seatsAvailable: 94,
        },
        {
          id: 'st-dune-sb-3',
          time: '21:00',
          format: 'VIP Recliner',
          screen: 'Screen 1 (VIP)',
          price: 8500,
          currency: '₦',
          status: 'filling_fast',
          seatsAvailable: 20,
        },
      ],
      'ns-1': [
        {
          id: 'st-int-sb-1',
          time: '15:00',
          format: 'Standard 2D',
          screen: 'Screen 2',
          price: 6000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 110,
        },
        {
          id: 'st-int-sb-2',
          time: '18:45',
          format: 'Standard 2D',
          screen: 'Screen 2',
          price: 6000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 85,
        },
      ],
      'ns-3': [
        {
          id: 'st-spid-sb-1',
          time: '13:15',
          format: 'Standard 2D',
          screen: 'Screen 5',
          price: 6000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 140,
        },
        {
          id: 'st-spid-sb-2',
          time: '16:00',
          format: 'Standard 2D',
          screen: 'Screen 5',
          price: 6000,
          currency: '₦',
          status: 'available',
          seatsAvailable: 95,
        },
      ],
    },
  },
];

export function getCinemasWithShowtimesForMovie(movieId: string): {
  cinema: Cinema;
  showtimes: ShowtimeSlot[];
}[] {
  const result: { cinema: Cinema; showtimes: ShowtimeSlot[] }[] = [];

  for (const cinema of LAGOS_CINEMAS) {
    const slots = cinema.showtimesByMovie[movieId];
    if (slots && slots.length > 0) {
      result.push({
        cinema,
        showtimes: slots,
      });
    }
  }

  return result;
}

export function getAllCinemas(): Cinema[] {
  return LAGOS_CINEMAS;
}

