import { Injectable } from '@nestjs/common';
import type { Task, TaskStatus } from '@taskflow/api-contract/schema';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeHub } from './realtime.hub';

/**
 * Announces a task write to the people watching its project. Controllers call this
 * only after the write succeeded, so a 409, 403 or 422 never announces anything.
 *
 * Today this publishes straight to the sockets of this process. With the outbox
 * (Realtime, part 2) the event will be written in the same transaction as the task
 * and relayed through Redis, so it also reaches sockets held by other instances.
 */
@Injectable()
export class TaskEvents {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: RealtimeHub,
  ) {}

  async taskChanged(
    change: 'created' | 'updated' | 'moved',
    task: Task,
    actorId: string,
    from?: TaskStatus,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true },
    });
    if (!actor) return; // the account was deleted between the write and here
    this.hub.publish(task.projectId, {
      type: 'task.changed',
      projectId: task.projectId,
      change,
      task,
      actor,
      ...(from ? { from } : {}),
    });
  }
}
