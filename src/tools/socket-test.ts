import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });

a.on('connect', () => {
  console.log('A conectado', a.id);
  a.emit('join_queue');
});
b.on('connect', () => {
  console.log('B conectado', b.id);
  b.emit('join_queue');
});

[a, b].forEach((s, i) => {
  s.on('match_found', (p) => {
    console.log(`P${i + 1} match_found`, p);
    // simula jugadas
    setTimeout(
      () => s.emit('pick_move', { move: i === 0 ? 'rock' : 'scissors' }),
      500,
    );
  });
  s.on('waiting_opponent', () => console.log(`P${i + 1} waiting_opponent`));
  s.on('round_result', (r) => console.log(`P${i + 1} round_result`, r));
  s.on('opponent_left', () => console.log(`P${i + 1} opponent_left`));
});
