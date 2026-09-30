import { prisma } from '../config/db';

export async function logAudit(params: {
  userId?: string | null;
  userRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      userRole: params.userRole ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      metadata: params.metadata ? (params.metadata as any) : undefined,
    },
  });
}
