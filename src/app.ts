import express, {type Application} from "express";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.middleware.js";
import asignacionRouter from "./routes/asignacion.routes.js";
import authRouter from "./routes/auth.routes.js";
import canastaRouter from "./routes/canasta.routes.js";
import comercioRouter from "./routes/comercio.routes.js";
import precioRouter from "./routes/precio.routes.js";
import productoRouter from "./routes/producto.routes.js";
import relevamientoRouter from "./routes/relevamiento.routes.js";
import userRouter from "./routes/user.routes.js";

const app: Application = express()

// Behind a reverse proxy, set TRUST_PROXY to the number of proxy hops so req.ip (used by the
// login rate limiter) is the real client address and not the proxy's.
const trustProxyHops = Number(process.env["TRUST_PROXY"]);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use(express.json())

app.use("/api/auth", authRouter)
app.use("/api/users", userRouter)
app.use("/api/relevamientos", relevamientoRouter)
app.use("/api/comercios", comercioRouter)
app.use("/api/canasta", canastaRouter)
app.use("/api/productos", productoRouter)
app.use("/api/asignaciones", asignacionRouter)
app.use("/api/precios", precioRouter)

app.use(notFoundHandler)
app.use(errorHandler)

export default app;
