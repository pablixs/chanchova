// Smoke test del orquestador de bots.
//
// Conecta 1 cliente humano (Ana) y agrega 3 bots a la sala. Ana auto-actua
// con logica minima cuando le toca (selecciona primera carta, etc.) para
// que los bots puedan progresar la partida y verifiquemos el flujo end-to-end.

import { io } from "socket.io-client";

const URL = process.env.API_URL ?? "http://localhost:3000";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Conectando Ana + 3 bots a ${URL}\n`);
  const ana = io(URL, { transports: ["websocket"] });

  let anaId = "";
  let hand: { id: string }[] = [];
  let lastSession: any = null;

  ana.on("connect", () => {
    ana.emit("auth:identify", { guestName: "Ana" });
  });

  await new Promise<void>((resolve) => {
    ana.on("auth:ok", (p: { userId: string }) => {
      anaId = p.userId;
      resolve();
    });
  });

  let code = "";
  ana.on("lobby:state", (p: { code: string }) => {
    if (!code) code = p.code;
  });
  ana.on("game:hand_dealt", (p: { cards: { id: string }[] }) => {
    hand = p.cards;
  });
  ana.on(
    "game:public_state",
    (p: { session: any }) => (lastSession = p.session),
  );

  // Loggeo de eventos clave.
  let lastPhase = "";
  ana.on("game:public_state", (p: { session: any }) => {
    const phase = p.session.currentRound?.phase ?? "-";
    const dir = p.session.currentRound?.directorId ?? "-";
    if (phase !== lastPhase) {
      lastPhase = phase;
      console.log(`[state] phase=${phase} director=${dir}`);
    }
  });
  for (const ev of [
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
  ]) {
    ana.on(ev, (payload: unknown) =>
      console.log(`[${ev}]`, JSON.stringify(payload)),
    );
  }

  // Auto-comportamiento de Ana: cuando le toca, hace lo minimo.
  ana.on("game:public_state", (p: { session: any }) => {
    const round = p.session.currentRound;
    if (!round) return;

    if (round.phase === "DIRECTOR_PICKING" && round.directorId === anaId) {
      setTimeout(
        () =>
          ana.emit("game:director_pass", { count: 1, direction: "LEFT" }),
        500,
      );
    }
    if (round.phase === "PASSING_LATERAL" && hand.length > 0) {
      const cardIds = [hand[0]!.id];
      setTimeout(
        () => ana.emit("game:pass_card", { cardIds }),
        300,
      );
    }
    if (round.phase === "CENTER_DROP" && hand.length > 1) {
      const need = round.centerPool?.expectedDropPerPlayer ?? 1;
      const cardIds = hand.slice(0, need).map((c) => c.id);
      setTimeout(
        () => ana.emit("game:drop_to_center", { cardIds }),
        300,
      );
    }
  });

  ana.emit("lobby:create", {
    mode: "CHANCHO_DIRIGIDO",
    visibility: "PRIVATE",
    deckId: "spanish_classic",
  });
  await delay(300);
  console.log(`Sala creada: ${code}\n`);

  for (let i = 0; i < 3; i++) {
    ana.emit("lobby:add_bot", {});
    await delay(150);
  }

  console.log("\nIniciando partida 1 humano + 3 bots...\n");
  ana.emit("lobby:start");

  await delay(15_000);

  console.log("\n>> Cerrando.");
  ana.close();
  await delay(200);
  process.exit(0);
}

main().catch((err) => {
  console.error("smoke fallo:", err);
  process.exit(1);
});
