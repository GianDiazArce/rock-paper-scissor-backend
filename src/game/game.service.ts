import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Match, Move } from './interface/game.interface';

@Injectable()
export class GameService {
  private queue: Socket[] = [];
  private matches = new Map<string, Match>();
  private bySocket = new Map<string, string>();

  enqueue(client: Socket, io: Server) {
    if (!this.queue.find((s) => s.id === client.id)) this.queue.push(client);
    client.emit('queue_joined');
    this.tryMatch(io);
  }

  leaveQueue(client: Socket) {
    this.queue = this.queue.filter((s) => s.id !== client.id);
    client.emit('queue_left');
  }

  onDisconnect(client: Socket, io: Server) {
    // sacar de cola
    this.queue = this.queue.filter((s) => s.id !== client.id);

    // si estaba en partida
    const mid = this.bySocket.get(client.id);
    if (mid) {
      const m = this.matches.get(mid);
      if (m) {
        const otherId = m.a === client.id ? m.b : m.a;
        io.to(otherId).emit('opponent_left');
      }
      this.matches.delete(mid);
      this.bySocket.delete(client.id);
    }
  }

  pickMove(client: Socket, io: Server, move: Move) {
    const mid = this.bySocket.get(client.id);
    if (!mid) return;
    const m = this.matches.get(mid);
    if (!m) return;

    m.moves[client.id] = move;

    const otherId = m.a === client.id ? m.b : m.a;
    if (m.moves[client.id] && m.moves[otherId]) {
      const aMove = m.moves[m.a]!;
      const bMove = m.moves[m.b]!;
      const result = this.judge(aMove, bMove); // 'a' | 'b' | 'draw'

      io.to(m.id).emit('round_result', {
        a: { socketId: m.a, move: aMove },
        b: { socketId: m.b, move: bMove },
        result,
      });

      // limpiar jugadas para siguiente ronda
      m.moves = {};
    } else {
      client.emit('waiting_opponent');
    }
  }

  rematch(client: Socket, io: Server) {
    const mid = this.bySocket.get(client.id);
    if (!mid) return;
    if (!this.matches.has(mid)) return;
    io.to(mid).emit('rematch_ready');
  }

  private tryMatch(io: Server) {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;

      const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const match: Match = { id: matchId, a: a.id, b: b.id, moves: {} };

      this.matches.set(matchId, match);
      this.bySocket.set(a.id, matchId);
      this.bySocket.set(b.id, matchId);

      void a.join(matchId);
      void b.join(matchId);

      io.to(matchId).emit('match_found', { matchId, players: [a.id, b.id] });
    }
  }

  private judge(a: Move, b: Move): 'a' | 'b' | 'draw' {
    if (a === b) return 'draw';
    const wins: Record<Move, Move> = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper',
    };
    return wins[a] === b ? 'a' : 'b';
  }
}
