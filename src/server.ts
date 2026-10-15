import "dotenv/config";
import app from "./app.js";
import { connectDb, getDb } from "./db/index.js";
import { createCalculoRepository } from "./repositories/calculo.repository.js";

const PORT: number = Number(process.env.PORT);

async function server() {
  await connectDb();

  // A run that was executing when the previous process died will never finish.
  const interrupted = await createCalculoRepository(getDb()).interrumpirEjecutando();
  if (interrupted > 0) console.warn(`Marked ${interrupted} interrupted calculation run(s) as FALLIDO`);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  });
}

server().catch((error: unknown) => {
  console.error("Failed to start the server:", error instanceof Error ? error.message : error);
  process.exit(1);
});
