import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyToken } from '../utils/jwt';

let io: SocketIOServer | null = null;

export function initSockets(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
  });

  /*
   * =========================================================
   * SOCKET AUTHENTICATION
   * =========================================================
   *
   * Supported connection types:
   *
   * 1. Employee / authenticated customer
   *    -> JWT token
   *
   * 2. QR customer
   *    -> signed QR order token
   *
   * QR customers do NOT use a raw order ID.
   */

  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    const qrToken =
      socket.handshake.auth?.qrToken;

    /*
     * =======================================================
     * QR CUSTOMER AUTHENTICATION
     * =======================================================
     */

    if (
      !token &&
      typeof qrToken === 'string' &&
      qrToken.length > 0
    ) {
      try {
        const payload =
          verifyToken(qrToken);

        /*
         * The token must specifically be
         * a QR-order token.
         */
        if (
          payload.kind !== 'qr_order'
        ) {
          return next(
            new Error('Unauthorized')
          );
        }

        /*
         * Store the VERIFIED payload.
         *
         * We do NOT trust a raw qrOrderId
         * supplied by the browser.
         */
        (socket as any).authPayload =
          payload;

        return next();
      } catch {
        return next(
          new Error('Unauthorized')
        );
      }
    }

    /*
     * =======================================================
     * EMPLOYEE / AUTHENTICATED CUSTOMER
     * =======================================================
     */

    if (
      !token ||
      typeof token !== 'string'
    ) {
      return next(
        new Error('Unauthorized')
      );
    }

    try {
      const payload =
        verifyToken(token);

      (socket as any).authPayload =
        payload;

      return next();
    } catch {
      return next(
        new Error('Unauthorized')
      );
    }
  });

  /*
   * =========================================================
   * SOCKET CONNECTION
   * =========================================================
   */

  io.on(
    'connection',
    (socket: Socket) => {
      const payload =
        (socket as any).authPayload;

      /*
       * =======================================================
       * QR CUSTOMER
       * =======================================================
       *
       * The order ID comes ONLY from the
       * verified signed QR token.
       */

      if (
        payload?.kind === 'qr_order'
      ) {
        socket.join(
          `qr-order:${payload.orderId}`
        );
      }

      /*
       * =======================================================
       * EMPLOYEE
       * =======================================================
       */

      if (
        payload?.kind === 'employee'
      ) {
        socket.join(
          `employee:${payload.employeeId}`
        );

        if (payload.branchId) {
          /*
           * Kitchen screens
           */
          socket.join(
            `branch:${payload.branchId}:kitchen`
          );

          /*
           * Service / waiter screens
           */
          socket.join(
            `branch:${payload.branchId}:service`
          );
        }
      }

      /*
       * =======================================================
       * AUTHENTICATED CUSTOMER
       * =======================================================
       */

      if (
        payload?.kind === 'customer'
      ) {
        socket.join(
          `customer:${payload.customerId}`
        );
      }
    }
  );

  return io;
}

/*
 * =========================================================
 * GET SOCKET SERVER
 * =========================================================
 */

export function getIO(): SocketIOServer | null {
  return io;
}