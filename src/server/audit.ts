import { db } from './db';
import { auditLogs } from './drizzle/schema';

/**
 * Log an action to the audit_logs table.
 * @param userId ID of the user performing the action.
 * @param action Action name (e.g., 'CREATE_USER', 'DELETE_FILE').
 * @param entity Entity type (e.g., 'user', 'file', 'folder').
 * @param entityId Optional ID of the entity.
 * @param details Optional JSON details about the action.
 */
export async function logAction(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: unknown
) {
  try {
    await db
      .insert(auditLogs)
      .values({
        userId,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ? JSON.stringify(details) : null,
        ipAddress: null, // could be filled from request later
      })
      .execute();
  } catch (e) {
    console.error('Failed to log audit action', e);
  }
}
