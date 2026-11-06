import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { CreateWorkspaceRequest, Workspace } from '@taskflow/api-contract/schema';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody } from '../common/contract';
import { requiredText } from '../common/input';
import { PrismaService } from '../prisma/prisma.service';

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Anyone logged in can create a workspace; they become its owner (one insert, atomic). */
  @Post()
  @HttpCode(201)
  async create(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Workspace> {
    const input = assertBody<CreateWorkspaceRequest>('CreateWorkspaceRequest', body);
    const workspace = await this.prisma.workspace.create({
      data: {
        name: requiredText(input.name, 'name'),
        memberships: { create: { userId: req.userId, role: 'owner' } },
      },
    });
    return { id: workspace.id, name: workspace.name, createdAt: workspace.createdAt.toISOString() };
  }
}
