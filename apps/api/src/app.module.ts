import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ProblemFilter } from './common/problem';
import { MeController } from './me/me.controller';
import { PrismaService } from './prisma/prisma.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [PrismaService, AuthService, { provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
