/**
 * Errors and exhaustiveness helpers.
 *
 * Expected domain failures are returned as `Result` values; this module is for
 * failures that should interrupt a request (missing auth, not found, conflicts,
 * infrastructure). The central HTTP error handler is the only place that turns
 * an `AppError` into a response.
 */
import type { DomainError, Result } from "./contracts/types.js";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    status = 500,
    options: { expose?: boolean; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.expose = options.expose ?? status < 500;
    this.details = options.details;
  }
}

export function badRequest(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 400, { details });
}
export function forbidden(message = "You do not have permission to do that."): AppError {
  return new AppError("FORBIDDEN", message, 403);
}
export function notFound(message = "That record could not be found."): AppError {
  return new AppError("NOT_FOUND", message, 404);
}
export function conflict(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("CONFLICT", message, 409, { details });
}
export function unauthorised(message = "Please sign in again."): AppError {
  return new AppError("AUTH_REQUIRED", message, 401);
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}
export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
export function domainError(code: string, message: string, field?: string): DomainError {
  return { code, message, field };
}

/** Compile-time exhaustiveness check for unions. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}

/** Wrap an unknown throwable as an AppError without leaking internals. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError("INTERNAL", "Something went wrong. Please try again.", 500, {
      expose: false,
      details: { cause: error.message },
    });
  }
  return new AppError("INTERNAL", "Something went wrong. Please try again.", 500, { expose: false });
}

/** Convert a SQLite busy/locked error into a retryable 503. */
export function isSqliteBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_BUSY") || message.includes("database is locked");
}
