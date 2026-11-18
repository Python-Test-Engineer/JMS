/** Parse the Cookie header into a plain object; no cookie-parser dependency. */
import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";

export function cookies(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
  next();
}
