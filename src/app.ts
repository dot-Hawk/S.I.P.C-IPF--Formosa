import express, {type Application} from "express";
import asignacionRouter from "./routes/asignacion.routes.js";
import authRouter from "./routes/auth.routes.js";
import comercioRouter from "./routes/comercio.routes.js";
import precioRouter from "./routes/precio.routes.js";
import productoRouter from "./routes/producto.routes.js";
import relevamientoRouter from "./routes/relevamiento.routes.js";
import userRouter from "./routes/user.routes.js";

const app: Application = express()
app.use(express.json())

app.use("/api/auth", authRouter)
app.use("/api/users", userRouter)
app.use("/api/relevamientos", relevamientoRouter)
app.use("/api/comercios", comercioRouter)
app.use("/api/productos", productoRouter)
app.use("/api/asignaciones", asignacionRouter)
app.use("/api/precios", precioRouter)

export default app;
