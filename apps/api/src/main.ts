import { createApp } from './app';

async function main() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`TaskFlow API on http://localhost:${port}/api/v1`);
}

void main();
