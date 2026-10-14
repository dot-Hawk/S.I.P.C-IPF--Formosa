import express, {type Application} from "express";
import authRouter from "./routes/auth.routes.js";
import comercioRouter from "./routes/comercio.routes.js";
import relevamientoRouter from "./routes/relevamiento.routes.js";
import userRouter from "./routes/user.routes.js";

const app: Application = express()
app.use(express.json())

app.use("/api/auth", authRouter)
app.use("/api/users", userRouter)
app.use("/api/relevamientos", relevamientoRouter)
app.use("/api/comercios", comercioRouter)

export default app;
