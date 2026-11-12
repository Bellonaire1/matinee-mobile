import { APPROVED_MOVIE_STARTING_PRICE } from './mockSeats';

export interface CastMember {
  id: string;
  name: string;
  character: string;
  avatarUrl: string;
}

export interface Movie {
  id: string;
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
  'Drama',
  'Animation',
  'IMAX',
  'Thriller',
];

export const MOCK_FEATURED_MOVIE: Movie = {
  id: 'feat-1',
  title: 'Dune: Part Two',
  tagline: 'Long live the fighters.',
  synopsis:
    'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
  posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop',
  backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
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
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'c-2',
      name: 'Zendaya',
      character: 'Chani',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'c-3',
      name: 'Rebecca Ferguson',
      character: 'Lady Jessica',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'c-4',
      name: 'Austin Butler',
      character: 'Feyd-Rautha',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'c-5',
      name: 'Florence Pugh',
      character: 'Princess Irulan',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop',
    },
  ],
};

export const MOCK_NOW_SHOWING_MOVIES: Movie[] = [
  {
    id: 'ns-1',
    title: 'Interstellar',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    synopsis:
      'A team of explorers travel through a newly discovered wormhole in space in an attempt to ensure humanity survival as a blight ravages Earth.',
    posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-11',
        name: 'Anne Hathaway',
        character: 'Dr. Brand',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-12',
        name: 'Jessica Chastain',
        character: 'Murph',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-13',
        name: 'Michael Caine',
        character: 'Professor Brand',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
  {
    id: 'ns-2',
    title: 'Blade Runner 2049',
    tagline: 'There is still a page left.',
    synopsis:
      'Thirty years after the events of the first film, a new Blade Runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what remains of society into chaos.',
    posterUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-21',
        name: 'Harrison Ford',
        character: 'Rick Deckard',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-22',
        name: 'Ana de Armas',
        character: 'Joi',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-23',
        name: 'Sylvia Hoeks',
        character: 'Luv',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
  {
    id: 'ns-3',
    title: 'Spider-Man: Across the Spider-Verse',
    tagline: 'It is how you wear the mask that matters.',
    synopsis:
      'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence. When the heroes clash, Miles must redefine what it means to be a hero.',
    posterUrl: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-31',
        name: 'Hailee Steinfeld',
        character: 'Gwen Stacy (voice)',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-32',
        name: 'Oscar Isaac',
        character: 'Miguel O\'Hara (voice)',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
  {
    id: 'ns-4',
    title: 'Oppenheimer',
    tagline: 'The world forever changes.',
    synopsis:
      'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
    posterUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-41',
        name: 'Emily Blunt',
        character: 'Katherine "Kitty" Oppenheimer',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-42',
        name: 'Matt Damon',
        character: 'Leslie Groves',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-43',
        name: 'Robert Downey Jr.',
        character: 'Lewis Strauss',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
];

export const MOCK_COMING_SOON_MOVIES: Movie[] = [
  {
    id: 'cs-1',
    title: 'Gladiator II',
    tagline: 'What we do in life echoes in eternity.',
    synopsis:
      'Years after witnessing the death of Maximus at the hands of his uncle, Lucius must enter the Colosseum after his home is conquered by the tyrannical Emperors who now lead Rome.',
    posterUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-51',
        name: 'Pedro Pascal',
        character: 'Marcus Acacius',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-52',
        name: 'Denzel Washington',
        character: 'Macrinus',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
  {
    id: 'cs-2',
    title: 'Furiosa: A Mad Max Saga',
    tagline: 'Fury will rise.',
    synopsis:
      'As the world fell, young Furiosa is snatched from the Green Place of Many Mothers into the hands of a great Biker Horde led by the Warlord Dementus.',
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-61',
        name: 'Chris Hemsworth',
        character: 'Dementus',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
  {
    id: 'cs-3',
    title: 'Avatar: Fire and Ash',
    tagline: 'Witness the next chapter.',
    synopsis:
      'Jake Sully and Neytiri encounter the Ash People, an aggressive clan of Na\'vi led by Varang, testing their bond and family amidst rising flames.',
    posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop',
    backdropUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop',
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
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      },
      {
        id: 'c-71',
        name: 'Zoe Saldaña',
        character: 'Neytiri',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
      },
    ],
  },
];

export const ALL_MOVIES: Movie[] = [
  MOCK_FEATURED_MOVIE,
  ...MOCK_NOW_SHOWING_MOVIES,
  ...MOCK_COMING_SOON_MOVIES,
];

export function getMovieById(id: string): Movie | undefined {
  return ALL_MOVIES.find((m) => m.id === id);
}

export function getAllMovies(): Movie[] {
  return ALL_MOVIES;
}
