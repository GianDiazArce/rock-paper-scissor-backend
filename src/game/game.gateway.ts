import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { Move } from './interface/game.interface';

@WebSocketGateway({
  cors: {
    origin: (process.env.WS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: false,
  },
})
export class GameGateway {
  constructor(private readonly game: GameService) {}

  @WebSocketServer() io!: Server;

  // Conexion y desconexion
  handleConnection(_client: Socket) {
    console.log('connected', _client.id);
  }

  handleDisconnect(client: Socket) {
    this.game.onDisconnect(client, this.io);
  }

  // Eventos
  @SubscribeMessage('join_queue')
  onJoinQueue(@ConnectedSocket() client: Socket) {
    this.game.enqueue(client, this.io);
  }

  @SubscribeMessage('leave_queue')
  onLeaveQueue(@ConnectedSocket() client: Socket) {
    this.game.leaveQueue(client);
  }

  @SubscribeMessage('pick_move')
  onPickMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { move: Move },
  ) {
    const move = body?.move;
    if (!['rock', 'paper', 'scissors'].includes(move)) {
      return client.emit('error_msg', 'invalid_move');
    }
    this.game.pickMove(client, this.io, move);
  }

  @SubscribeMessage('rematch')
  onRematch(@ConnectedSocket() client: Socket) {
    this.game.rematch(client, this.io);
  }
}
