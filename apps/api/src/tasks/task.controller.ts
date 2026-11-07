import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MoveTaskRequest, Task, UpdateTaskRequest } from '@taskflow/api-contract/schema';
import { AccessService } from '../access/access.service';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody } from '../common/contract';
import { TasksService } from './tasks.service';

/** One task, addressed by its own ID (see the note above /tasks/{taskId} in openapi.yaml). */
@Controller('tasks/:taskId')
@UseGuards(AuthGuard)
export class TaskController {
  constructor(
    private readonly access: AccessService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  async get(@Req() req: AuthedRequest, @Param('taskId') taskId: string): Promise<Task> {
    await this.access.requireTask(req.userId, taskId, 'project:read');
    return this.tasks.get(taskId);
  }

  @Patch()
  async update(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ): Promise<Task> {
    const { task } = await this.access.requireTask(req.userId, taskId, 'task:update');
    const input = assertBody<UpdateTaskRequest>('UpdateTaskRequest', body);
    return this.tasks.update(task, input);
  }

  /** A POST action, not a PATCH of `position`: the server computes the key (openapi.yaml). */
  @Post('move')
  @HttpCode(200)
  async move(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ): Promise<Task> {
    const { task } = await this.access.requireTask(req.userId, taskId, 'task:update');
    const input = assertBody<MoveTaskRequest>('MoveTaskRequest', body);
    return this.tasks.move(task, input);
  }
}
