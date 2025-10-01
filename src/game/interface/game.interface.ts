export type Move = 'rock' | 'paper' | 'scissors';

export type Match = {
  id: string;
  a: string; // socketId
  b: string; //socketId
  moves: Record<string, Move | undefined>; // sorkcetId -> move
};
