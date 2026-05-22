// Bootstrap de la API. Usamos Fastify como adaptador HTTP por su rendimiento.
//
// Como tambien usamos WebSockets (Socket.IO via @nestjs/platform-socket.io),
// conviven HTTP REST y WS sobre el mismo servidor.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  // CORS abierto en dev; en prod se restringe al dominio del frontend.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });

  // Adapter Socket.IO sobre Fastify.
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`[chanchova-api] listening on http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
