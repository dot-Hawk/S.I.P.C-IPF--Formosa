import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/database.js";

const PORT: number = Number(process.env.PORT);

async function server() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  });
}

server();
