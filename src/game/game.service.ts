import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Match, Move } from './interface/game.interface';

@Injectable()
export class GameService {
  // Cola de emparejamiento
  private queue: Socket[] = [];

  // Partidas activas
  private matches = new Map<string, Match>(); // matchId -> state

  // Índice rápido: socketId -> matchId  (MANTENIENDO TU NOMBRE)
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
        // Limpia room y mapas
        this.matches.delete(mid);
        this.bySocket.delete(m.a);
        this.bySocket.delete(m.b);
      } else {
        this.bySocket.delete(client.id);
      }
    }
  }

  // ======= LÓGICA DE RONDAS + MARCADOR + FIN DE SERIE =======
  pickMove(client: Socket, io: Server, move: Move) {
    const mid = this.bySocket.get(client.id);
    if (!mid) return;
    const m = this.matches.get(mid);
    if (!m) return;

    // Si la serie anterior terminó y aún no hubo rematch, no aceptar jugadas
    if (m.status === 'over') {
      client.emit('error_msg', 'match_over_waiting_rematch');
      return;
    }

    // Registrar jugada del jugador actual
    m.moves[client.id] = move;

    // Determinar id del oponente
    const otherId = m.a === client.id ? m.b : m.a;

    // ¿Ya tenemos ambas jugadas?
    if (m.moves[client.id] && m.moves[otherId]) {
      const aMove = m.moves[m.a];
      const bMove = m.moves[m.b];
      const res = this.judge(aMove, bMove); // 'a' | 'b' | 'draw'

      // Actualizar marcador si hubo ganador de la ronda
      let winnerSocket: string | null = null;
      if (res === 'a') {
        m.scores[m.a] = (m.scores[m.a] || 0) + 1;
        winnerSocket = m.a;
      } else if (res === 'b') {
        m.scores[m.b] = (m.scores[m.b] || 0) + 1;
        winnerSocket = m.b;
      }

      // Emitir resultado de ronda con marcador y meta
      io.to(m.id).emit('round_result', {
        matchId: m.id,
        round: m.round,
        a: { socketId: m.a, move: aMove },
        b: { socketId: m.b, move: bMove },
        result: res,
        scores: { ...m.scores },
        targetWins: m.targetWins,
        winnerSocket, // null si draw
      });

      // ¿Terminó la serie? (best-of: targetWins)
      const aScore = m.scores[m.a] || 0;
      const bScore = m.scores[m.b] || 0;
      if (aScore >= m.targetWins || bScore >= m.targetWins) {
        const matchWinner = aScore >= m.targetWins ? m.a : m.b;
        m.status = 'over';
        m.rematch = {}; // limpiar votos por si acaso

        io.to(m.id).emit('match_over', {
          matchId: m.id,
          winner: matchWinner,
          scores: { ...m.scores },
          targetWins: m.targetWins,
        });

        // Nota: NO borramos la partida aquí para permitir REMATCH.
        // Se limpiará si alguien se desconecta o si deciden salir.
        return;
      }

      // limpiar jugadas para siguiente ronda, incrementar contador
      m.moves = {};
      m.round += 1;
    } else {
      client.emit('waiting_opponent');
    }
  }

  // crear partida manualmente (Mas adelante)
  createMatch(a: string, b: string, targetWins = 3) {
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const match: Match = {
      id,
      a,
      b,
      moves: {},
      targetWins,
      scores: { [a]: 0, [b]: 0 },
      round: 1,
      status: 'playing',
      rematch: {},
    };
    this.matches.set(id, match);
    this.bySocket.set(a, id);
    this.bySocket.set(b, id);
    return match;
  }

  rematch(client: Socket, io: Server) {
    const mid = this.bySocket.get(client.id);
    if (!mid) return;
    const m = this.matches.get(mid);
    if (!m) return;

    // Solo permitir rematch cuando la serie terminó
    if (m.status !== 'over') {
      client.emit('error_msg', 'match_not_over');
      return;
    }

    if (!m.rematch) m.rematch = {};
    m.rematch[client.id] = true;

    const otherId = m.a === client.id ? m.b : m.a;

    // Notificar estados
    client.emit('rematch_waiting'); // tú ya votaste
    io.to(otherId).emit('rematch_offered'); // al rival le avisa que pediste revancha

    // ¿Ambos aceptaron?
    if (m.rematch[m.a] && m.rematch[m.b]) {
      // Reiniciar serie (MISMO matchId y MISMA sala)
      m.moves = {};
      m.scores = { [m.a]: 0, [m.b]: 0 };
      m.round = 1;
      m.status = 'playing';
      m.rematch = {};

      io.to(m.id).emit('rematch_start', {
        matchId: m.id,
        players: [m.a, m.b],
        targetWins: m.targetWins,
      });
    }
  }

  private tryMatch(io: Server) {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;

      const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Best-of-5 por defecto → targetWins = 3
      const match: Match = {
        id: matchId,
        a: a.id,
        b: b.id,
        moves: {},
        targetWins: 3,
        scores: { [a.id]: 0, [b.id]: 0 },
        round: 1,
        status: 'playing',
        rematch: {},
      };

      this.matches.set(matchId, match);
      this.bySocket.set(a.id, matchId);
      this.bySocket.set(b.id, matchId);

      void a.join(matchId);
      void b.join(matchId);

      io.to(matchId).emit('match_found', {
        matchId,
        players: [a.id, b.id],
        targetWins: match.targetWins,
      });
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
