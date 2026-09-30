import { prisma } from '../config/db';
import { getIO } from '../sockets';

/**
 * Creates a notification row AND emits it over the matching socket.io room
 * so the recipient's screen updates without a page refresh (spec section 25).
 * Room naming: `employee:<id>`, `branch:<branchId>:kitchen`, `customer:<id>`.
 */
export async function notify(params: {
  userId: string;
  userType: 'EMPLOYEE' | 'CUSTOMER';
  type: string;
  title: string;
  message: string;
  relatedEntity?: string;
  room?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      userType: params.userType,
      type: params.type,
      title: params.title,
      message: params.message,
      relatedEntity: params.relatedEntity,
    },
  });

  const io = getIO();
  if (io) {
    const room = params.room ?? `${params.userType.toLowerCase()}:${params.userId}`;
    io.to(room).emit('notification.created', notification);
  }
  return notification;
}
