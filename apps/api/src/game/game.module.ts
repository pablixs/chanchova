import { Module } from "@nestjs/common";
import { BotOrchestrator } from "./bot/bot-orchestrator";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { GameStore } from "./game-store";
import { PoolAnonymizer } from "./pool-anonymizer";
import { TimeoutManager } from "./timeout-manager";

@Module({
  providers: [
    GameStore,
    TimeoutManager,
    BotOrchestrator,
    PoolAnonymizer,
    GameService,
    GameGateway,
  ],
  exports: [GameService, PoolAnonymizer],
})
export class GameModule {}
