import express, {type Application} from "express";
import relevamientoRouter from "./routes/relevamiento.routes.js";

const app: Application = express()
app.use(express.json())

app.use("/api/relevamientos", relevamientoRouter)

export default app;
