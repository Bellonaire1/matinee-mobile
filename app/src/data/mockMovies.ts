import { APPROVED_MOVIE_STARTING_PRICE } from './mockSeats';

export interface CastMember {
  id: string;
  name: string;
  character: string;
  avatarUrl?: string;
}

export interface Movie {
  id: string;
  tmdbId?: number;
  title: string;
  tagline: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string;
  rating: number;
  votes: string;
  runtime: string;
  ageRating: string;
  releaseYear: string;
  language: string;
  genres: string[];
  formats: string[];
  releaseDate: string;
  director: string;
  cast: CastMember[];
  isFeatured?: boolean;
  category: 'now_showing' | 'coming_soon' | 'trending';
  showtimes?: string[];
  /**
   * @deprecated Legacy mock price string. Non-authoritative.
   * User-visible ticket starting prices are derived directly from the approved seat-tier model
   * via APPROVED_MOVIE_STARTING_PRICE ("From ₦7,000") in mockSeats.ts.
   */
  priceRange?: string;
}

export const MOCK_GENRES = [
  'All',
  'Sci-Fi',
  'Action',
  'Adventure',
  'Drama',
  'Animation',
  'Thriller',
];

export const MOCK_FEATURED_MOVIE: Movie = {
  id: 'feat-1',
  tmdbId: 693134,
  title: 'Dune: Part Two',
  tagline: 'Long live the fighters.',
  synopsis:
    'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
  rating: 8.8,
  votes: '320k',
  runtime: '2h 46m',
  ageRating: 'PG-13',
  releaseYear: '2024',
  language: 'English',
  genres: ['Sci-Fi', 'Adventure', 'Action'],
  formats: ['IMAX 70mm', 'Dolby Cinema', 'VIP'],
  releaseDate: '2024-03-01',
  director: 'Denis Villeneuve',
  isFeatured: true,
  category: 'now_showing',
  showtimes: ['14:30', '17:45', '21:00', '23:30'],
  priceRange: APPROVED_MOVIE_STARTING_PRICE,
  cast: [
    {
      id: 'c-1',
      name: 'Timothée Chalamet',
      character: 'Paul Atreides',
      avatarUrl: '',
    },
    {
      id: 'c-2',
      name: 'Zendaya',
      character: 'Chani',
      avatarUrl: '',
    },
    {
      id: 'c-3',
      name: 'Rebecca Ferguson',
      character: 'Lady Jessica',
      avatarUrl: '',
    },
    {
      id: 'c-4',
      name: 'Austin Butler',
      character: 'Feyd-Rautha',
      avatarUrl: '',
    },
    {
      id: 'c-5',
      name: 'Florence Pugh',
      character: 'Princess Irulan',
      avatarUrl: '',
    },
  ],
};

export const MOCK_NOW_SHOWING_MOVIES: Movie[] = [
  {
    id: 'ns-1',
    tmdbId: 157336,
    title: 'Interstellar',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    synopsis:
      'A team of explorers travel through a newly discovered wormhole in space in an attempt to ensure humanity survival as a blight ravages Earth.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    rating: 8.9,
    votes: '412k',
    runtime: '2h 49m',
    ageRating: 'PG-13',
    releaseYear: '2014',
    language: 'English',
    genres: ['Sci-Fi', 'Drama'],
    formats: ['IMAX', 'Dolby Cinema'],
    releaseDate: '2014-11-07',
    director: 'Christopher Nolan',
    category: 'now_showing',
    showtimes: ['13:00', '16:30', '20:15'],
    priceRange: APPROVED_MOVIE_STARTING_PRICE,
    cast: [
      {
        id: 'c-10',
        name: 'Matthew McConaughey',
        character: 'Cooper',
        avatarUrl: '',
      },
      {
        id: 'c-11',
        name: 'Anne Hathaway',
        character: 'Dr. Brand',
        avatarUrl: '',
      },
      {
        id: 'c-12',
        name: 'Jessica Chastain',
        character: 'Murph',
        avatarUrl: '',
      },
      {
        id: 'c-13',
        name: 'Michael Caine',
        character: 'Professor Brand',
        avatarUrl: '',
      },
    ],
  },
  {
    id: 'ns-2',
    tmdbId: 335984,
    title: 'Blade Runner 2049',
    tagline: 'There is still a page left.',
    synopsis:
      'Thirty years after the events of the first film, a new Blade Runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what remains of society into chaos.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/gNdLJU9TxrpGx4dkZidjys3fyy0.jpg',
    rating: 8.4,
    votes: '198k',
    runtime: '2h 44m',
    ageRating: 'R',
    releaseYear: '2017',
    language: 'English',
    genres: ['Sci-Fi', 'Mystery', 'Action'],
    formats: ['Dolby Atmos', 'VIP'],
    releaseDate: '2017-10-06',
    director: 'Denis Villeneuve',
    category: 'now_showing',
    showtimes: ['15:15', '18:45', '22:00'],
    priceRange: APPROVED_MOVIE_STARTING_PRICE,
    cast: [
      {
        id: 'c-20',
        name: 'Ryan Gosling',
        character: 'Officer K',
        avatarUrl: '',
      },
      {
        id: 'c-21',
        name: 'Harrison Ford',
        character: 'Rick Deckard',
        avatarUrl: '',
      },
      {
        id: 'c-22',
        name: 'Ana de Armas',
        character: 'Joi',
        avatarUrl: '',
      },
      {
        id: 'c-23',
        name: 'Sylvia Hoeks',
        character: 'Luv',
        avatarUrl: '',
      },
    ],
  },
  {
    id: 'ns-3',
    tmdbId: 569094,
    title: 'Spider-Man: Across the Spider-Verse',
    tagline: 'It is how you wear the mask that matters.',
    synopsis:
      'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence. When the heroes clash, Miles must redefine what it means to be a hero.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
    rating: 8.7,
    votes: '280k',
    runtime: '2h 20m',
    ageRating: 'PG',
    releaseYear: '2023',
    language: 'English',
    genres: ['Animation', 'Action', 'Sci-Fi'],
    formats: ['3D IMAX', '4DX'],
    releaseDate: '2023-06-02',
    director: 'Joaquim Dos Santos',
    category: 'now_showing',
    showtimes: ['12:30', '15:00', '17:30', '20:00'],
    priceRange: APPROVED_MOVIE_STARTING_PRICE,
    cast: [
      {
        id: 'c-30',
        name: 'Shameik Moore',
        character: 'Miles Morales (voice)',
        avatarUrl: '',
      },
      {
        id: 'c-31',
        name: 'Hailee Steinfeld',
        character: 'Gwen Stacy (voice)',
        avatarUrl: '',
      },
      {
        id: 'c-32',
        name: 'Oscar Isaac',
        character: "Miguel O'Hara (voice)",
        avatarUrl: '',
      },
    ],
  },
  {
    id: 'ns-4',
    tmdbId: 872585,
    title: 'Oppenheimer',
    tagline: 'The world forever changes.',
    synopsis:
      'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/nb3xI8XI3w4pMVZ38VijbsyBqP4.jpg',
    rating: 8.9,
    votes: '350k',
    runtime: '3h 00m',
    ageRating: 'R',
    releaseYear: '2023',
    language: 'English',
    genres: ['Drama', 'History'],
    formats: ['IMAX 70mm'],
    releaseDate: '2023-07-21',
    director: 'Christopher Nolan',
    category: 'now_showing',
    showtimes: ['14:00', '18:00', '21:30'],
    priceRange: APPROVED_MOVIE_STARTING_PRICE,
    cast: [
      {
        id: 'c-40',
        name: 'Cillian Murphy',
        character: 'J. Robert Oppenheimer',
        avatarUrl: '',
      },
      {
        id: 'c-41',
        name: 'Emily Blunt',
        character: 'Katherine "Kitty" Oppenheimer',
        avatarUrl: '',
      },
      {
        id: 'c-42',
        name: 'Matt Damon',
        character: 'Leslie Groves',
        avatarUrl: '',
      },
      {
        id: 'c-43',
        name: 'Robert Downey Jr.',
        character: 'Lewis Strauss',
        avatarUrl: '',
      },
    ],
  },
];

export const MOCK_COMING_SOON_MOVIES: Movie[] = [
  {
    id: 'cs-1',
    tmdbId: 558449,
    title: 'Gladiator II',
    tagline: 'What we do in life echoes in eternity.',
    synopsis:
      'Years after witnessing the death of Maximus at the hands of his uncle, Lucius must enter the Colosseum after his home is conquered by the tyrannical Emperors who now lead Rome.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/b5UXjzW5cLZhprMnlAmsVAA3G4t.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/euYIwmwkmz95mnXvufEmbL6ovhZ.jpg',
    rating: 8.5,
    votes: 'Upcoming',
    runtime: '2h 28m',
    ageRating: 'R',
    releaseYear: '2026',
    language: 'English',
    genres: ['Action', 'Drama', 'Adventure'],
    formats: ['IMAX', 'Dolby Cinema'],
    releaseDate: 'Nov 22, 2026',
    director: 'Ridley Scott',
    category: 'coming_soon',
    priceRange: 'Showtimes Open Soon',
    cast: [
      {
        id: 'c-50',
        name: 'Paul Mescal',
        character: 'Lucius',
        avatarUrl: '',
      },
      {
        id: 'c-51',
        name: 'Pedro Pascal',
        character: 'Marcus Acacius',
        avatarUrl: '',
      },
      {
        id: 'c-52',
        name: 'Denzel Washington',
        character: 'Macrinus',
        avatarUrl: '',
      },
    ],
  },
  {
    id: 'cs-2',
    tmdbId: 786892,
    title: 'Furiosa: A Mad Max Saga',
    tagline: 'Fury will rise.',
    synopsis:
      'As the world fell, young Furiosa is snatched from the Green Place of Many Mothers into the hands of a great Biker Horde led by the Warlord Dementus.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/iADOJ8Zymht2JPMoy3R7xceZprc.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/raph7qjAGTMXaIjVxt6ZDSXRzUr.jpg',
    rating: 8.3,
    votes: 'Upcoming',
    runtime: '2h 28m',
    ageRating: 'R',
    releaseYear: '2026',
    language: 'English',
    genres: ['Action', 'Sci-Fi'],
    formats: ['IMAX 3D', '4DX'],
    releaseDate: 'Dec 05, 2026',
    director: 'George Miller',
    category: 'coming_soon',
    priceRange: 'Showtimes Open Soon',
    cast: [
      {
        id: 'c-60',
        name: 'Anya Taylor-Joy',
        character: 'Furiosa',
        avatarUrl: '',
      },
      {
        id: 'c-61',
        name: 'Chris Hemsworth',
        character: 'Dementus',
        avatarUrl: '',
      },
    ],
  },
  {
    id: 'cs-3',
    tmdbId: 83533,
    title: 'Avatar: Fire and Ash',
    tagline: 'Witness the next chapter.',
    synopsis:
      "Jake Sully and Neytiri encounter the Ash People, an aggressive clan of Na'vi led by Varang, testing their bond and family amidst rising flames.",
    posterUrl: 'https://image.tmdb.org/t/p/w500/pN3eaCl3sqwrerU8UNdp40F2mK0.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/bRBeSHfGHwkEpImlhxPmOcUsaeg.jpg',
    rating: 8.9,
    votes: 'Upcoming',
    runtime: '3h 10m',
    ageRating: 'PG-13',
    releaseYear: '2026',
    language: 'English',
    genres: ['Sci-Fi', 'Action', 'Adventure'],
    formats: ['IMAX 3D HFR', 'VIP'],
    releaseDate: 'Dec 19, 2026',
    director: 'James Cameron',
    category: 'coming_soon',
    priceRange: 'Showtimes Open Soon',
    cast: [
      {
        id: 'c-70',
        name: 'Sam Worthington',
        character: 'Jake Sully',
        avatarUrl: '',
      },
      {
        id: 'c-71',
        name: 'Zoe Saldaña',
        character: 'Neytiri',
        avatarUrl: '',
      },
    ],
  },
];

export const STAGING_DUNE_MOVIE: Movie = {
  id: 'mov-staging-dune',
  tmdbId: 693134,
  title: 'Dune: Part Two (Staging Benchmark)',
  tagline: 'Long live the fighters.',
  synopsis:
    'Synthetic load-test screening for 500-VU seat contention and zero double-booking verification.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
  rating: 8.8,
  votes: '320k',
  runtime: '2h 46m',
  ageRating: '15',
  releaseYear: '2026',
  language: 'English',
  genres: ['Action', 'Adventure', 'Sci-Fi'],
  formats: ['STANDARD_2D', 'Laser IMAX'],
  releaseDate: '2026-11-23',
  director: 'Denis Villeneuve',
  category: 'now_showing',
  priceRange: APPROVED_MOVIE_STARTING_PRICE,
  cast: [],
};

export const ALL_MOVIES: Movie[] = [
  MOCK_FEATURED_MOVIE,
  ...MOCK_NOW_SHOWING_MOVIES,
  ...MOCK_COMING_SOON_MOVIES,
];

export function getMovieById(id: string): Movie | undefined {
  if (id === 'mov-staging-dune') return STAGING_DUNE_MOVIE;
  return ALL_MOVIES.find((m) => m.id === id);
}

export function getAllMovies(): Movie[] {
  return ALL_MOVIES;
}
