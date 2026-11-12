import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccessService } from './access/access.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ProblemFilter } from './common/problem';
import { MeController } from './me/me.controller';
import { PrismaService } from './prisma/prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { TaskController } from './tasks/task.controller';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Module({
  controllers: [
    AuthController,
    MeController,
    WorkspacesController,
    ProjectsController,
    TasksController,
    TaskController,
  ],
  providers: [
    PrismaService,
    AuthService,
    AccessService,
    TasksService,
    RealtimeGateway,
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
