import { Module, forwardRef } from "@nestjs/common";
import { GameModule } from "../game/game.module";
import { LobbyGateway } from "./lobby.gateway";
import { LobbyService } from "./lobby.service";

@Module({
  imports: [forwardRef(() => GameModule)],
  providers: [LobbyService, LobbyGateway],
  exports: [LobbyService],
})
export class LobbyModule {}
