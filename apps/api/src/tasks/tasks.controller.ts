import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { TaskStatus } from '@prisma/client';
import type { CreateTaskRequest, Task, TaskPage } from '@taskflow/api-contract/schema';
import type { Response } from 'express';
import { AccessService } from '../access/access.service';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody } from '../common/contract';
import { validationFailed } from '../common/problem';
import { TasksService } from './tasks.service';

const STATUSES = new Set<string>(['todo', 'in_progress', 'in_review', 'done']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A query parameter that must appear at most once, as plain text. */
function single(q: Record<string, unknown>, field: string): string | undefined {
  const value = q[field];
  if (value === undefined || typeof value === 'string') return value;
  throw validationFailed([{ field, message: 'Give this parameter once.' }]);
}

/** Query string → typed filters, with the contract's rules (422 on bad input). */
function parseListQuery(q: Record<string, unknown>) {
  const rawStatus = ([] as unknown[]).concat(q.status ?? []);
  if (rawStatus.some((s) => typeof s !== 'string' || !STATUSES.has(s))) {
    throw validationFailed([{ field: 'status', message: 'Unknown status.' }]);
  }
  const assigneeId = single(q, 'assigneeId');
  if (assigneeId !== undefined && !UUID.test(assigneeId)) {
    throw validationFailed([{ field: 'assigneeId', message: 'Must be a UUID.' }]);
  }
  const rawLimit = single(q, 'limit');
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw validationFailed([{ field: 'limit', message: 'Must be an integer from 1 to 100.' }]);
  }
  return {
    status: rawStatus as TaskStatus[],
    assigneeId,
    limit,
    cursor: single(q, 'cursor'),
  };
}

@Controller('projects/:projectId/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    private readonly access: AccessService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<TaskPage> {
    await this.access.requireProject(req.userId, projectId, 'project:read');
    return this.tasks.list(projectId, parseListQuery(query));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<Task> {
    const { project } = await this.access.requireProject(req.userId, projectId, 'task:create');
    const input = assertBody<CreateTaskRequest>('CreateTaskRequest', body);
    const task = await this.tasks.create(project, req.userId, input);
    res.location(`/api/v1/tasks/${task.id}`);
    return task;
  }
}
