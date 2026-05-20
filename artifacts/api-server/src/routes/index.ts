import { Router, type IRouter } from "express";
import healthRouter from "./health";
import suppliersRouter from "./suppliers";
import productsRouter from "./products";
import invoicesRouter from "./invoices";
import priceAlertsRouter from "./price-alerts";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import ksefRouter from "./ksef";
import insightsRouter from "./insights";
import { requireUser } from "../middlewares/requireUser";

const router: IRouter = Router();

// Public endpoints
router.use(healthRouter);

// Everything below requires an authenticated user and is scoped to req.userId
router.use(requireUser);
router.use(suppliersRouter);
router.use(productsRouter);
router.use(invoicesRouter);
router.use(priceAlertsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(ksefRouter);
router.use(insightsRouter);

export default router;
