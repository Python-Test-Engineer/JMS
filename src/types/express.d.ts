import type { AuthUser, SessionRecord } from "../contracts/types.js";
import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      isHtmx: boolean;
      cookies: Record<string, string>;
      user?: AuthUser;
      session?: SessionRecord;
      csrfToken?: string;
    }
    interface Locals {
      cspNonce?: string;
      csrfToken?: string;
      user?: AuthUser;
      can?: (key: string) => boolean;
      navGroups?: unknown;
      flash?: { type: string; message: string } | null;
      currentPath?: string;
      requestId?: string;
    }
  }
}
