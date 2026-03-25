import { Router } from "express";
import type { QueryController } from "../controllers/queryController.js";

/**
 * Registers query-related routes.
 */
export function createQueryRouter(controller: QueryController): Router {
  const router = Router();
  router.post("/", controller.postQuery);
  return router;
}
