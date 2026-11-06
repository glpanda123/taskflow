import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Project as ProjectRow } from '@prisma/client';
import type { CreateProjectRequest, Project } from '@taskflow/api-contract/schema';
import { AccessService } from '../access/access.service';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody } from '../common/contract';
import { requiredText } from '../common/input';
import { PrismaService } from '../prisma/prisma.service';

const toProject = (p: ProjectRow): Project => ({
  id: p.id,
  workspaceId: p.workspaceId,
  name: p.name,
  createdAt: p.createdAt.toISOString(),
});

@Controller('workspaces/:workspaceId/projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ items: Project[] }> {
    const role = await this.access.requireWorkspace(req.userId, workspaceId, 'project:list');
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId, // tenant isolation: only this workspace's rows
        // viewers: only projects they were invited to
        ...(role === 'viewer' ? { viewers: { some: { userId: req.userId } } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return { items: projects.map(toProject) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: AuthedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ): Promise<Project> {
    await this.access.requireWorkspace(req.userId, workspaceId, 'project:create');
    const input = assertBody<CreateProjectRequest>('CreateProjectRequest', body);
    const project = await this.prisma.project.create({
      data: { workspaceId, name: requiredText(input.name, 'name') },
    });
    return toProject(project);
  }
}
