// Smoke test de integracion del backend WS.
//
// Levanta 4 clientes Socket.IO contra el server, los identifica como guests,
// uno crea sala, los demas se unen, arranca la partida y se ejercita una
// vuelta de pase lateral. Sirve para verificar a ojo que el wiring (gateway
// -> service -> motor -> broadcast) funciona end-to-end.
//
// Como correrlo (con el server ya levantado en otro shell con `pnpm dev`):
//   pnpm --filter @chanchova/api exec tsx scripts/integration-smoke.ts

import { io, type Socket } from "socket.io-client";

const URL = process.env.API_URL ?? "http://localhost:3000";

interface Client {
  name: string;
  socket: Socket;
  userId: string;
  hand: { id: string; value: string; suit: string }[];
  lastPublic?: any;
}

function connect(name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ["websocket"] });
    const client: Client = { name, socket, userId: "", hand: [] };

    socket.on("connect", () => {
      socket.emit("auth:identify", { guestName: name });
    });
    socket.on("auth:ok", (payload: { userId: string }) => {
      client.userId = payload.userId;
      resolve(client);
    });
    socket.on("auth:error", reject);

    socket.on("game:hand_dealt", (payload: { cards: Client["hand"] }) => {
      client.hand = payload.cards;
    });
    socket.on(
      "game:public_state",
      (payload: { session: any }) => (client.lastPublic = payload.session),
    );

    // Logging compacto
    for (const eventName of [
      "lobby:state",
      "game:started",
      "game:round_started",
      "game:director_pass_requested",
      "game:center_open",
      "game:center_closed",
      "game:chancho_called",
      "game:chancha_called",
      "game:slap_registered",
      "game:round_resolved",
      "game:player_eliminated",
      "game:finished",
      "error",
    ]) {
      socket.on(eventName, (payload: unknown) => {
        const summary =
          typeof payload === "object" && payload !== null
            ? Object.keys(payload).slice(0, 6).join(",")
            : String(payload);
        console.log(`[${name}] <- ${eventName}  {${summary}}`);
      });
    }
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Connecting 4 clients to ${URL}...`);
  const ana = await connect("Ana");
  const beto = await connect("Beto");
  const caro = await connect("Caro");
  const diego = await connect("Diego");
  console.log("All connected.\n");

  // Capturar el codigo desde el primer lobby:state que reciba Ana.
  let code = "";
  ana.socket.on("lobby:state", (payload: { code: string }) => {
    if (!code) code = payload.code;
  });

  // Ana crea la sala
  ana.socket.emit("lobby:create", {
    mode: "CHANCHO_DIRIGIDO",
    visibility: "PRIVATE",
    deckId: "spanish_classic",
  });
  await delay(300);
  console.log(`\n>> Sala creada con codigo ${code || "?"}\n`);

  // Beto/Caro/Diego se unen
  for (const c of [beto, caro, diego]) {
    c.socket.emit("lobby:join", { code });
    await delay(150);
  }
  await delay(300);

  // Mostrar quien quedo en la sala
  const players = (ana as any).socket.id;
  console.log(
    `\n>> Jugadores en la sala segun ultimo lobby:state recibido por Ana\n`,
  );

  // Ana inicia
  console.log(">> Ana invoca lobby:start...\n");
  ana.socket.emit("lobby:start");
  await delay(700);

  // Buscamos al director: lo aprendimos via game:round_started.
  const director = ana.lastPublic?.currentRound?.directorId;
  console.log(`\n>> Director resuelto desde public_state: ${director}\n`);
  const allClients = [ana, beto, caro, diego];
  const directorClient = allClients.find((c) => c.userId === director);
  if (directorClient) {
    console.log(`>> ${directorClient.name} dicta: 1 a la IZQUIERDA\n`);
    directorClient.socket.emit("game:director_pass", {
      count: 1,
      direction: "LEFT",
    });
    await delay(300);
  }

  // Cada uno selecciona su primera carta.
  console.log(`>> Cada jugador selecciona su primera carta para pasar\n`);
  for (const c of allClients) {
    if (c.hand[0]) {
      console.log(`   ${c.name} pasa carta ${c.hand[0].id}`);
      c.socket.emit("game:pass_card", { cardIds: [c.hand[0].id] });
      await delay(80);
    }
  }
  await delay(500);

  console.log("\n>> Smoke test terminado, cerrando conexiones.");
  for (const c of allClients) c.socket.close();
  await delay(200);
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test fallo:", err);
  process.exit(1);
});
