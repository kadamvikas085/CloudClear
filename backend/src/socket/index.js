const { Server } = require('socket.io');
const config = require('../config/env');
const { logger } = require('../config/logger');
const { verifyAccessToken } = require('../services/token.service');
const { createRedisConnection } = require('../config/redis');
const { CHANNEL } = require('../services/realtime.publisher');

let io = null;

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication token is required to connect'));
  }

  try {
    const decoded = verifyAccessToken(token);
    socket.userId = decoded.sub;
    next();
  } catch (err) {
    next(new Error('Invalid or expired authentication token'));
  }
}

function subscribeToRealtimeEvents() {
  const subscriber = createRedisConnection();
  subscriber.subscribe(CHANNEL, (err) => {
    if (err) {
      logger.error({ err }, '[Socket.IO] Failed to subscribe to realtime events channel');
    }
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const { room, event, payload } = JSON.parse(message);
      io.to(room).emit(event, payload);
    } catch (err) {
      logger.warn({ err: err.message }, '[Socket.IO] Failed to forward realtime event');
    }
  });

  return subscriber;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    logger.info({ socketId: socket.id, userId: socket.userId }, '[Socket.IO] client connected');

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id, userId: socket.userId }, '[Socket.IO] client disconnected');
    });
  });

  subscribeToRealtimeEvents();

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet. Call initSocket(server) first.');
  }
  return io;
}

module.exports = { initSocket, getIO };