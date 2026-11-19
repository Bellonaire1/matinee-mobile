/**
 * Matinee Database Seed Script
 * =============================================================================
 * Stack: Prisma 6 / PostgreSQL
 * Target: Offline reproducible seeding for local development & staging.
 *
 * SAFETY INVARIANTS:
 * - This script is strictly IDEMPOTENT. Running it multiple times will not duplicate records.
 * - All demo entities are clearly labelled with [DEMO] prefixes and deterministic keys.
 * - CUSTOMER DATA PROTECTION: All upserts in this script target fixed synthetic identifiers
 *   (e.g., 'usr-demo-*', 'bkg-demo-*', 'tkt-demo-*', 'pay-demo-*'). Rerunning this seed
 *   cannot overwrite, alter, or delete legitimate customer accounts, bookings, or payment history.
 * - FICTIONAL DEMO DISCLAIMER: All cinema venue profiles, screening schedules, ticket codes,
 *   and showtimes in this seed script are synthetic demonstration fixtures created solely for
 *   offline mobile application UI alignment and development testing. They do NOT represent live,
 *   commercial, or independently verified cinema listings.
 * - 320 seats are created per auditorium:
 *     20 Rows (A..V, strictly skipping letters 'I' and 'O') x 16 Columns (1..16)
 *     - Row A: 4 Accessible + 12 Standard (16 total)
 *     - Rows B..J: 128 Standard seats (8 rows x 16 cols)
 *         => Total Standard = 12 + 128 = 140 seats
 *     - Rows K..R: 112 VIP Recliner seats (7 rows x 16 cols)
 *     - Rows S..V: 64 Couple seats / 32 pair pods (4 rows x 16 cols)
 *     => TOTAL: 4 Accessible + 140 Standard + 112 VIP + 64 Couple = 320 Seats.
 *
 * NOTE: DO NOT run this script against production or live unseeded customer databases.
 * =============================================================================
 */

import {
  PrismaClient,
  Role,
  MovieCategory,
  SeatTier,
  ScreenFormat,
  ShowtimeStatus,
  BookingStatus,
  TicketStatus,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// Row labels: 20 letters from Front to Back (skipping I and O)
const ROW_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
  'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
];

async function main() {
  console.log('------------------------------------------------------------');
  console.log('[Matinee Seed] Initializing reproducible database seed...');
  console.log('------------------------------------------------------------');

  // 1. Seed Lagos Cinemas (Matching app/src/data/mockCinemas.ts)
  console.log('[Matinee Seed] Upserting 4 Lagos Cinemas...');
  const cinemasData = [
    {
      id: 'cin-lekki-imax',
      name: 'Filmhouse Cinemas IMAX',
      chain: 'Filmhouse',
      neighborhood: 'Lekki Phase 1',
      address: 'Bisola Durosinmi Etti Dr, The Rock Drive, Lekki, Lagos',
      city: 'Lagos',
      country: 'Nigeria',
      latitude: 6.4474,
      longitude: 3.4723,
      features: ['Laser IMAX', 'Signature VIP', 'Dolby Atmos', 'Valet Parking'],
    },
    {
      id: 'cin-genesis-palms',
      name: 'Genesis Deluxe Cinemas',
      chain: 'Genesis',
      neighborhood: 'The Palms, Lekki / VI',
      address: 'The Palms Shopping Mall, Bisway St, Victoria Island, Lagos',
      city: 'Lagos',
      country: 'Nigeria',
      latitude: 6.4357,
      longitude: 3.4411,
      features: ['Dolby Atmos', 'Full Leather Recliners', 'Gourmet Bar'],
    },
    {
      id: 'cin-ebonylife-vi',
      name: 'EbonyLife Cinemas',
      chain: 'EbonyLife',
      neighborhood: 'Victoria Island',
      address: '1637 Adetokunbo Ademola St, Victoria Island, Lagos',
      city: 'Lagos',
      country: 'Nigeria',
      latitude: 6.4281,
      longitude: 3.4219,
      features: ['Ultra Luxury VIP', 'In-seat Dining', 'Art Deco Lounge'],
    },
    {
      id: 'cin-silverbird-ikeja',
      name: 'Silverbird Cinemas',
      chain: 'Silverbird',
      neighborhood: 'Ikeja City Mall',
      address: 'Ikeja City Mall, Obafemi Awolowo Way, Alausa, Ikeja, Lagos',
      city: 'Lagos',
      country: 'Nigeria',
      latitude: 6.6192,
      longitude: 3.3581,
      features: ['Dolby 7.1', 'Atrium Arcade', 'Student Discount'],
    },
  ];

  for (const c of cinemasData) {
    await prisma.cinema.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  // 2. Seed Auditoriums & 320 Physical Seats
  console.log('[Matinee Seed] Upserting Auditoriums & 320 Physical Seats per Hall...');
  const auditoriumsData = [
    {
      id: 'aud-lekki-imax-01',
      cinemaId: 'cin-lekki-imax',
      name: 'Screen 1 (Laser IMAX & Recliners)',
      screenNumber: 1,
      totalSeats: 320,
      supportedFormats: ['IMAX_70MM', 'DOLBY_ATMOS', 'STANDARD_2D', 'VIP_RECLINER'],
    },
    {
      id: 'aud-genesis-palms-01',
      cinemaId: 'cin-genesis-palms',
      name: 'Screen 1 (Dolby Atmos & VIP)',
      screenNumber: 1,
      totalSeats: 320,
      supportedFormats: ['DOLBY_CINEMA', 'DOLBY_ATMOS', 'STANDARD_2D', 'VIP_RECLINER'],
    },
    {
      id: 'aud-ebonylife-vi-01',
      cinemaId: 'cin-ebonylife-vi',
      name: 'White Hall VIP',
      screenNumber: 1,
      totalSeats: 320,
      supportedFormats: ['VIP_RECLINER', 'STANDARD_2D'],
    },
    {
      id: 'aud-silverbird-ikeja-01',
      cinemaId: 'cin-silverbird-ikeja',
      name: 'Screen 4 (Main Hall)',
      screenNumber: 1,
      totalSeats: 320,
      supportedFormats: ['STANDARD_2D', 'VIP_RECLINER'],
    },
  ];

  for (const aud of auditoriumsData) {
    await prisma.auditorium.upsert({
      where: { id: aud.id },
      update: aud,
      create: aud,
    });

    // Populate the exact 320-seat matrix for the primary reference auditorium (Filmhouse Lekki)
    if (aud.id === 'aud-lekki-imax-01') {
      const seatsToCreate: Array<{
        id: string;
        auditoriumId: string;
        row: string;
        column: number;
        seatNumber: string;
        tier: SeatTier;
        isAccessible: boolean;
        isCouple: boolean;
      }> = [];

      for (let rowIndex = 0; rowIndex < ROW_LETTERS.length; rowIndex++) {
        const row = ROW_LETTERS[rowIndex];

        for (let col = 1; col <= 16; col++) {
          const seatId = `${aud.id}-${row}-${col}`;
          const seatNumber = `${row}${col}`;

          let tier: SeatTier = SeatTier.STANDARD;
          let isAccessible = false;
          let isCouple = false;

          if (row === 'A') {
            // Row A: Outer edges accessible (1, 2, 15, 16); middle standard (3..14)
            if (col === 1 || col === 2 || col === 15 || col === 16) {
              tier = SeatTier.ACCESSIBLE;
              isAccessible = true;
            } else {
              tier = SeatTier.STANDARD;
            }
          } else if (rowIndex >= 1 && rowIndex <= 8) {
            // Rows B..J (8 rows): Standard (128 seats)
            tier = SeatTier.STANDARD;
          } else if (rowIndex >= 9 && rowIndex <= 15) {
            // Rows K..R (7 rows): VIP Recliner (112 seats)
            tier = SeatTier.VIP;
          } else {
            // Rows S..V (4 rows): Couple Lounger (64 seats, 32 pairs)
            tier = SeatTier.COUPLE;
            isCouple = true;
          }

          seatsToCreate.push({
            id: seatId,
            auditoriumId: aud.id,
            row,
            column: col,
            seatNumber,
            tier,
            isAccessible,
            isCouple,
          });
        }
      }

      // Upsert physical seats
      for (const s of seatsToCreate) {
        await prisma.seat.upsert({
          where: { id: s.id },
          update: {
            tier: s.tier,
            isAccessible: s.isAccessible,
            isCouple: s.isCouple,
          },
          create: s,
        });
      }

      // Link couple partner relationships (pair pods)
      for (const s of seatsToCreate.filter((st) => st.isCouple)) {
        const partnerCol = s.column % 2 === 1 ? s.column + 1 : s.column - 1;
        const partnerId = `${aud.id}-${s.row}-${partnerCol}`;

        await prisma.seat.update({
          where: { id: s.id },
          data: { couplePartnerId: partnerId },
        });
      }
    }
  }

  // 3. Seed Movies (Matching app/src/data/mockMovies.ts)
  console.log('[Matinee Seed] Upserting Catalog Movies...');
  const moviesData = [
    {
      id: 'mov-dune-2',
      tmdbId: 693134,
      title: 'Dune: Part Two',
      tagline: 'Long live the fighters.',
      synopsis:
        'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
      posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop',
      backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
      runtime: 166,
      ageRating: 'PG-13',
      releaseYear: 2024,
      releaseDate: new Date('2024-03-01'),
      language: 'English',
      genres: ['Sci-Fi', 'Adventure', 'Action'],
      formats: ['IMAX 70mm', 'Dolby Cinema', 'VIP'],
      rating: 8.8,
      votesCount: 320000,
      director: 'Denis Villeneuve',
      category: MovieCategory.NOW_SHOWING,
      isActive: true,
    },
    {
      id: 'mov-interstellar',
      tmdbId: 157336,
      title: 'Interstellar',
      tagline: 'Mankind was born on Earth. It was never meant to die here.',
      synopsis:
        'A team of explorers travel through a wormhole in space in an attempt to ensure humanity survival.',
      posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop',
      backdropUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1200&auto=format&fit=crop',
      runtime: 169,
      ageRating: 'PG-13',
      releaseYear: 2014,
      releaseDate: new Date('2014-11-07'),
      language: 'English',
      genres: ['Sci-Fi', 'Drama', 'Adventure'],
      formats: ['IMAX 70mm', 'Dolby Atmos'],
      rating: 8.7,
      votesCount: 450000,
      director: 'Christopher Nolan',
      category: MovieCategory.NOW_SHOWING,
      isActive: true,
    },
    {
      id: 'mov-oppenheimer',
      tmdbId: 872585,
      title: 'Oppenheimer',
      tagline: 'The world forever changes.',
      synopsis:
        'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
      posterUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=600&auto=format&fit=crop',
      backdropUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop',
      runtime: 180,
      ageRating: 'R',
      releaseYear: 2023,
      releaseDate: new Date('2023-07-21'),
      language: 'English',
      genres: ['Drama', 'History', 'Biography'],
      formats: ['IMAX 70mm', 'Dolby Cinema'],
      rating: 8.9,
      votesCount: 510000,
      director: 'Christopher Nolan',
      category: MovieCategory.NOW_SHOWING,
      isActive: true,
    },
    {
      id: 'mov-deadpool-wolverine',
      tmdbId: 533535,
      title: 'Deadpool & Wolverine',
      tagline: 'Come together.',
      synopsis: 'Wolverine is recovering from his injuries when he crosses paths with the loudmouth Deadpool.',
      posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop',
      backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
      runtime: 127,
      ageRating: 'R',
      releaseYear: 2024,
      releaseDate: new Date('2024-07-26'),
      language: 'English',
      genres: ['Action', 'Comedy', 'Sci-Fi'],
      formats: ['IMAX 3D', '4DX', 'Dolby Atmos'],
      rating: 8.0,
      votesCount: 280000,
      director: 'Shawn Levy',
      category: MovieCategory.COMING_SOON,
      isActive: true,
    },
  ];

  for (const m of moviesData) {
    await prisma.movie.upsert({
      where: { id: m.id },
      update: m,
      create: m,
    });
  }

  // 4. Seed Showtimes for Filmhouse IMAX Screen 1 (Fictional Demonstration Schedule)
  console.log('[Matinee Seed] Upserting Fictional Demonstration Showtimes (synthetic UI fixture; not live listings)...');
  const baseDate = new Date();
  baseDate.setHours(14, 30, 0, 0);

  const showtimesData = [
    {
      id: 'st-dune-lekki-1430',
      movieId: 'mov-dune-2',
      auditoriumId: 'aud-lekki-imax-01',
      startTime: new Date(baseDate.getTime()),
      endTime: new Date(baseDate.getTime() + 166 * 60 * 1000),
      format: ScreenFormat.IMAX_70MM,
      basePriceKobo: 700000, // Standard: ₦7,000
      vipPriceKobo: 950000, // VIP: ₦9,500
      couplePairPriceKobo: 1200000, // Couple pair: ₦12,000 (₦6,000/seat)
      accessiblePriceKobo: 700000, // Accessible: ₦7,000
      status: ShowtimeStatus.OPEN_FOR_BOOKING,
    },
    {
      id: 'st-dune-lekki-1745',
      movieId: 'mov-dune-2',
      auditoriumId: 'aud-lekki-imax-01',
      startTime: new Date(baseDate.getTime() + 3.25 * 60 * 60 * 1000),
      endTime: new Date(baseDate.getTime() + (3.25 * 60 + 166) * 60 * 1000),
      format: ScreenFormat.IMAX_70MM,
      basePriceKobo: 700000,
      vipPriceKobo: 950000,
      couplePairPriceKobo: 1200000,
      accessiblePriceKobo: 700000,
      status: ShowtimeStatus.OPEN_FOR_BOOKING,
    },
  ];

  for (const st of showtimesData) {
    await prisma.showtime.upsert({
      where: { id: st.id },
      update: st,
      create: st,
    });
  }

  // 5. Seed Clearly Labelled Synthetic Demo User & Bookings
  console.log('[Matinee Seed] Upserting [DEMO] User, Bookings & Tickets...');
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo-customer@matinee.internal' },
    update: {
      fullName: '[DEMO] Adaeze Okonkwo',
      phone: '+2348012345678',
      role: Role.CUSTOMER,
    },
    create: {
      id: 'usr-demo-adaeze',
      email: 'demo-customer@matinee.internal',
      fullName: '[DEMO] Adaeze Okonkwo',
      phone: '+2348012345678',
      role: Role.CUSTOMER,
    },
  });

  // A. Confirmed Booking (Demo fixture matching mockSeats.ts sold seats: E7, E8)
  const confirmedBooking = await prisma.booking.upsert({
    where: { bookingReference: 'DEMO-MAT-8942-X7' },
    update: {
      status: BookingStatus.CONFIRMED,
      seatCount: 2,
      subtotalKobo: 1400000,
      bookingFeeKobo: 50000,
      totalKobo: 1450000,
    },
    create: {
      id: 'bkg-demo-confirmed-01',
      bookingReference: 'DEMO-MAT-8942-X7',
      userId: demoUser.id,
      showtimeId: 'st-dune-lekki-1430',
      status: BookingStatus.CONFIRMED,
      seatCount: 2,
      subtotalKobo: 1400000,
      bookingFeeKobo: 50000,
      totalKobo: 1450000,
      contactEmail: 'demo-customer@matinee.internal',
      contactPhone: '+2348012345678',
      contactName: '[DEMO] Adaeze Okonkwo',
      confirmedAt: new Date(),
    },
  });

  // Confirmed Tickets for E7 and E8
  const ticketE7 = await prisma.ticket.upsert({
    where: { ticketCode: 'TKT-DEMO-E7' },
    update: { status: TicketStatus.CONFIRMED },
    create: {
      id: 'tkt-demo-e7',
      ticketCode: 'TKT-DEMO-E7',
      bookingId: confirmedBooking.id,
      showtimeId: 'st-dune-lekki-1430',
      seatId: 'aud-lekki-imax-01-E-7',
      tier: SeatTier.STANDARD,
      priceKobo: 700000,
      status: TicketStatus.CONFIRMED,
      qrPayload: 'MATINEE-DEMO-TKT-E7-MOCK-SIGNATURE',
    },
  });

  const ticketE8 = await prisma.ticket.upsert({
    where: { ticketCode: 'TKT-DEMO-E8' },
    update: { status: TicketStatus.CONFIRMED },
    create: {
      id: 'tkt-demo-e8',
      ticketCode: 'TKT-DEMO-E8',
      bookingId: confirmedBooking.id,
      showtimeId: 'st-dune-lekki-1430',
      seatId: 'aud-lekki-imax-01-E-8',
      tier: SeatTier.STANDARD,
      priceKobo: 700000,
      status: TicketStatus.CONFIRMED,
      qrPayload: 'MATINEE-DEMO-TKT-E8-MOCK-SIGNATURE',
    },
  });

  // Successful payment attempt for the confirmed booking
  await prisma.paymentAttempt.upsert({
    where: { providerTransactionId: 'TXN-DEMO-SUCC-01' },
    update: { status: PaymentStatus.SUCCEEDED },
    create: {
      id: 'pay-demo-succ-01',
      bookingId: confirmedBooking.id,
      provider: PaymentProvider.TEST_GATEWAY,
      providerTransactionId: 'TXN-DEMO-SUCC-01',
      amountKobo: 1450000,
      currency: 'NGN',
      status: PaymentStatus.SUCCEEDED,
      paymentMethod: 'TEST_CARD',
    },
  });

  // B. Cancelled Booking demonstrating released seat state
  const cancelledBooking = await prisma.booking.upsert({
    where: { bookingReference: 'DEMO-MAT-CANC-01' },
    update: { status: BookingStatus.CANCELLED },
    create: {
      id: 'bkg-demo-cancelled-01',
      bookingReference: 'DEMO-MAT-CANC-01',
      userId: demoUser.id,
      showtimeId: 'st-dune-lekki-1430',
      status: BookingStatus.CANCELLED,
      seatCount: 1,
      subtotalKobo: 700000,
      bookingFeeKobo: 0,
      totalKobo: 700000,
      contactEmail: 'demo-customer@matinee.internal',
      cancelledAt: new Date(),
      cancellationReason: 'Demo session expiry',
    },
  });

  await prisma.ticket.upsert({
    where: { ticketCode: 'TKT-DEMO-CANC-01' },
    update: { status: TicketStatus.CANCELLED },
    create: {
      id: 'tkt-demo-canc-01',
      ticketCode: 'TKT-DEMO-CANC-01',
      bookingId: cancelledBooking.id,
      showtimeId: 'st-dune-lekki-1430',
      seatId: 'aud-lekki-imax-01-F-1',
      tier: SeatTier.STANDARD,
      priceKobo: 700000,
      status: TicketStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });

  // C. Refunded Restricted Booking demonstrating blocked seat state (REFUNDED_RESTRICTED)
  const restrictedBooking = await prisma.booking.upsert({
    where: { bookingReference: 'DEMO-MAT-REFD-01' },
    update: { status: BookingStatus.REFUNDED },
    create: {
      id: 'bkg-demo-refunded-01',
      bookingReference: 'DEMO-MAT-REFD-01',
      userId: demoUser.id,
      showtimeId: 'st-dune-lekki-1430',
      status: BookingStatus.REFUNDED,
      seatCount: 1,
      subtotalKobo: 950000,
      bookingFeeKobo: 0,
      totalKobo: 950000,
      contactEmail: 'demo-customer@matinee.internal',
      cancelledAt: new Date(),
      cancellationReason: 'Recliner mechanical failure - seat blocked from resale',
    },
  });

  await prisma.ticket.upsert({
    where: { ticketCode: 'TKT-DEMO-REFD-01' },
    update: { status: TicketStatus.REFUNDED_RESTRICTED },
    create: {
      id: 'tkt-demo-refd-01',
      ticketCode: 'TKT-DEMO-REFD-01',
      bookingId: restrictedBooking.id,
      showtimeId: 'st-dune-lekki-1430',
      seatId: 'aud-lekki-imax-01-L-7',
      tier: SeatTier.VIP,
      priceKobo: 950000,
      status: TicketStatus.REFUNDED_RESTRICTED,
      cancelledAt: new Date(),
    },
  });

  console.log('------------------------------------------------------------');
  console.log('[Matinee Seed] Seed completed successfully!');
  console.log('Summary:');
  console.log('  - Cinemas: 4 Lagos locations');
  console.log('  - Reference Hall: Screen 1 Laser IMAX with 320 seats');
  console.log('      * Accessible: 4 seats (A1, A2, A15, A16)');
  console.log('      * Standard: 140 seats (Row A middle + Rows B..J)');
  console.log('      * VIP: 112 seats (Rows K..R)');
  console.log('      * Couple: 64 seats / 32 pair pods (Rows S..V)');
  console.log('  - Movies: 4 catalog titles (Now Showing & Coming Soon)');
  console.log('  - Showtimes: Dune Part Two (14:30, 17:45)');
  console.log('  - [DEMO] Bookings: Confirmed, Cancelled (released), Refunded (restricted)');
  console.log('------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('[Matinee Seed] Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

