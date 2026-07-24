import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_URL, credentials: true });
  await app.listen(process.env.API_PORT ?? 3000);
  // eslint-disable-next-line no-console
  console.log(`PMO API escuchando en :${process.env.API_PORT ?? 3000}`);
}
bootstrap();
