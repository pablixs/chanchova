import { Controller, Get } from "@nestjs/common";
import { listDecks } from "@chanchova/decks";

// Endpoint de salud. Verifica que el backend está vivo
// y que los packages compartidos se resuelven correctamente.
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "chanchova-api",
      timestamp: new Date().toISOString(),
      decksAvailable: listDecks().map((d) => d.id),
    };
  }
}
