import { Router } from 'express';
import { createPackage, getPackages } from './package.controller.js';

const router = Router();

// GET /api/v1/packages
router.get('/', getPackages);

// POST /api/v1/packages
router.post('/', createPackage);

export const packageRoutes = router;