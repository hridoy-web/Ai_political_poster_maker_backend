import { Router } from 'express';
import { createPackage, getPackages } from './package.controller.js';
import { validateRequest } from '../../middlewares/validateRequest.middleware.js';
import { createPackageSchema } from './package.validation.js';

const router = Router();

// GET /api/v1/packages
router.get('/', getPackages);

// POST /api/v1/packages
router.post('/', validateRequest(createPackageSchema), createPackage);

export const packageRoutes = router;
export default router;