import { Module } from "@nestjs/common";

import { ConnectionModule } from "./connection/connection.module";
import { GameModule } from "./game/game.module";
import { HealthController } from "./health/health.controller";
import { LobbyModule } from "./lobby/lobby.module";

@Module({
  imports: [ConnectionModule, LobbyModule, GameModule],
  controllers: [HealthController],
})
export class AppModule {}
