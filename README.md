# Rock–Paper–Scissors Backend (NestJS + Socket.IO)

Backend para el juego **Piedra, Papel o Tijera** con **multijugador online** vía **WebSockets (Socket.IO)** y emparejamiento **aleatorio** (matchmaking).  
Cliente de referencia: el repo del frontend (CRA/Vite) que consume este backend.

---

## ✨ Features

- Matchmaking random (cola + empareja de 2 en 2).
- Rondas simultáneas: el servidor espera ambas jugadas y emite resultado.
- Eventos de rematch, cancelación de cola y manejo de desconexión.
- CORS configurable por variables de entorno.
- Listo para deploy en **Render** / **Railway** (HTTPS + WSS).

---

## 🧱 Stack

- **NestJS 11** (`@nestjs/websockets`, `@nestjs/platform-socket.io`)
- **Socket.IO 4**
- **TypeScript**
- (Opcional futuro) Redis Adapter para escalar a múltiples instancias.

---

## 📁 Estructura (resumen)

```
src/
├─ app.module.ts
├─ main.ts
└─ game/
   ├─ game.module.ts
   ├─ game.gateway.ts     # WebSocket gateway (eventos y CORS del WS)
   └─ game.service.ts     # Lógica: cola, partidas, jugadas, juez

```

---

## ⚙️ Variables de entorno

Crea un archivo `.env` en la raíz (mismo nivel que `package.json`):

| Variable       | Ejemplo / Valor        | Descripción |
|----------------|------------------------|-------------|
| `PORT`         | `3001`                 | Puerto HTTP/WS del backend. En Render se sobreescribe. |
| `NODE_ENV`     | `development`          | Entorno. |
| `WS_ORIGINS`   | `http://localhost:3000,http://localhost:5173,https://giandiazarce.github.io` | Lista separada por comas con orígenes permitidos para CORS (frontend). **Importante en prod**. |

> En **Render**, no fijes `PORT`; Render lo inyecta. Tu app debe leer `process.env.PORT`.

---

## 🚀 Arranque local

```bash
# 1) instalar deps
npm install

# 2) .env (ejemplo)
echo PORT=3001 > .env
echo NODE_ENV=development >> .env
echo WS_ORIGINS=http://localhost:3000,http://localhost:5173 >> .env

# 3) dev
npm run start:dev
# App en http://localhost:3001
```

#### Test rápido (opcional) con cliente Node
```bash
npm i -D tsx socket.io-client
# crea tools/socket-test.ts con el script de prueba y ejecuta:
npx tsx tools/socket-test.ts
```
---
## 🔌 API de WebSocket (eventos)

## Cliente → Servidor

- join_queue : entra a la cola de emparejamiento.

- leave_queue : sale de la cola.

- pick_move { move: 'rock'|'paper'|'scissors' } : envía jugada.

- rematch : solicita revancha en la misma sala.

## Servidor → Cliente

- queue_joined : confirmación al unirse a cola.

- queue_left : confirmación al salir de cola.

- match_found { matchId, players } : partida creada y lista.

- waiting_opponent : se registró tu jugada; falta la del rival.

- round_result { a:{socketId,move}, b:{socketId,move}, result:'a'|'b'|'draw' } : resultado de la ronda.

- rematch_ready : ambos pueden volver a jugar.

- opponent_left : tu rival se desconectó.

- error_msg : mensaje de error (p. ej. invalid_move).

 Anti-cheat básico: el server no emite jugadas hasta que tiene ambas.