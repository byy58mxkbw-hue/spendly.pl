import { Router, type IRouter } from "express";
import healthRouter from "./health";
import suppliersRouter from "./suppliers";
import productsRouter from "./products";
import invoicesRouter from "./invoices";
import priceAlertsRouter from "./price-alerts";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(suppliersRouter);
router.use(productsRouter);
router.use(invoicesRouter);
router.use(priceAlertsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);

export default router;
