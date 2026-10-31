import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Me } from '@taskflow/api-contract/schema';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { unauthorized } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@Req() req: AuthedRequest): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: req.userId },
      include: { memberships: { include: { workspace: true }, orderBy: { joinedAt: 'asc' } } },
    });
    if (!user) throw unauthorized(); // token for a user that no longer exists
    return {
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        createdAt: m.workspace.createdAt.toISOString(),
        role: m.role,
      })),
    };
  }
}
