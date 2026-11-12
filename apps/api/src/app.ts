import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/** The app with everything production uses, shared by main.ts and the tests. */
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  // Plain WebSocket (the browser's native client), on the same port as the REST API.
  app.useWebSocketAdapter(new WsAdapter(app));
  return app;
}
