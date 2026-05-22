import { useEffect, useState } from "react";
import { MAX_PLAYERS } from "@chanchova/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  decksAvailable: string[];
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Chanchova</h1>
      <p>Juego del Chancho argentino. Hasta {MAX_PLAYERS} jugadores.</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Estado de la API</h2>
        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
        {health ? (
          <pre
            style={{
              background: "#f4f4f4",
              padding: "1rem",
              borderRadius: 8,
            }}
          >
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : (
          !error && <p>Cargando...</p>
        )}
      </section>
    </main>
  );
}
