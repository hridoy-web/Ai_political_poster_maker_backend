import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createPackageInDB, getPublishedPackagesFromDB } from './package.service.js';
import sendResponse from '../../utils/sendResponse.js';

export const getPackages = asyncHandler(async (req: Request, res: Response) => {

    const result = await getPublishedPackagesFromDB();

    return sendResponse(res, 200, 'Packages retrieved successfully', true, null, result);
});

export const createPackage = asyncHandler(async (req: Request, res: Response) => {

    const result = await createPackageInDB(req.body);

    return sendResponse(res, 201, 'Package created successfully', true, null, result);
});