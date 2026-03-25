import type { NextFunction, Request, Response } from "express";
import type { QueryService } from "../services/queryService.js";

/**
 * HTTP handlers for natural-language graph queries.
 */
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  /**
   * POST /api/query — body: { message: string }
   */
  postQuery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "Field `message` is required." });
      return;
    }
    try {
      const result = await this.queryService.executeNaturalLanguageQuery(message);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
