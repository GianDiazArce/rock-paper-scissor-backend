export type Move = 'rock' | 'paper' | 'scissors';

export interface Match {
  id: string;
  a: string; // socketId
  b: string; // socketId
  moves: Record<string, Move>;

  targetWins: number; // ej: 3 (best-of-5)
  scores: Record<string, number>; // { [socketId]: wins }
  round: number; // 1..N
  status?: 'playing' | 'over'; // estado de la serie actual
  rematch?: Record<string, boolean>; // votos de revancha { [socketId]: true }
}
