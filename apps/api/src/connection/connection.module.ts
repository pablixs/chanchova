import { Global, Module } from "@nestjs/common";
import { ConnectionRegistry } from "./connection.registry";
import { SessionService } from "./session.service";

@Global()
@Module({
  providers: [ConnectionRegistry, SessionService],
  exports: [ConnectionRegistry, SessionService],
})
export class ConnectionModule {}
