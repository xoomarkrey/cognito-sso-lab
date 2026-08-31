import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";

const app = express();

// The SPA runs on a different origin, so allow it explicitly and send cookies.
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());
// Secret enables signed cookies (req.signedCookies).
app.use(cookieParser(env.sessionSecret));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Cognito SSO Lab backend is running" });
});

app.use("/auth", authRoutes);

// Example of a resource protected by the Cognito-backed session.
app.get("/api/protected", requireAuth, (req, res) => {
  res.json({
    message: `Hello ${req.session!.claims.email ?? req.session!.sub}`,
    youAreInGroups: req.session!.claims["cognito:groups"] ?? [],
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
