import { Router, type IRouter } from "express";
import { getEffectivePlanStatus } from "../services/subscriptions.js";

const router: IRouter = Router();

// Stan subskrypcji usera (trial/aktywna/wygasła) — front pokazuje banerek odliczania dni.
// Leniwie przełącza wygasły trial na free (patrz getEffectivePlanStatus) przy każdym odczycie.
router.get("/subscription/status", async (req, res): Promise<void> => {
  const status = await getEffectivePlanStatus(req.userId!, req.log);
  res.json(status);
});

export default router;
