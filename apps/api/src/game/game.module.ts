import { Module } from "@nestjs/common";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { GameStore } from "./game-store";
import { TimeoutManager } from "./timeout-manager";

@Module({
  providers: [GameStore, TimeoutManager, GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}
