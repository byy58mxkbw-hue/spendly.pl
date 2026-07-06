import { Router, type IRouter } from "express";
import healthRouter from "./health";
import suppliersRouter from "./suppliers";
import productsRouter from "./products";
import invoicesRouter from "./invoices";
import priceAlertsRouter from "./price-alerts";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import ksefRouter from "./ksef";
import costCentersRouter from "./cost-centers";
import searchRouter from "./search";
import { requireUser } from "../middlewares/requireUser";
import { aiQuota } from "../middlewares/aiQuota";

const router: IRouter = Router();

// Public endpoints
router.use(healthRouter);

// Everything below requires an authenticated user and is scoped to req.userId
router.use(requireUser);

// Miesięczny limit AI zależny od planu (czat AI CFO + OCR). Za requireUser,
// bo potrzebuje req.userId/req.plan; przed routerami, żeby wyprzedzić handlery.
router.use("/ai-cfo/chat", aiQuota);
router.use("/invoices/scan-receipt", aiQuota);

router.use(suppliersRouter);
router.use(productsRouter);
router.use(invoicesRouter);
router.use(priceAlertsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(ksefRouter);
router.use(costCentersRouter);
router.use(searchRouter);

import aiCfoRouter from "./ai-cfo";
router.use(aiCfoRouter);

import adminRouter from "./admin";
router.use(adminRouter);

import foodCostRouter from "./food-cost";
router.use(foodCostRouter);

export default router;
