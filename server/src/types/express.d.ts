import type { AppSession } from "../services/session.service.js";

declare global {
  namespace Express {
    interface Request {
      /** Present only on routes behind `requireAuth`. */
      session?: AppSession;
    }
  }
}

export {};
