import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { purchasePackageWithWallet } from './wallet-purchase.service.js';
import sendResponse from '../../utils/sendResponse.js';

/**
 * POST /api/v1/payments/buy-with-wallet
 * Deducts the package price from the user's money wallet and grants poster credits.
 */
export const buyPackageWithWallet = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized: please login to purchase a package');
  }

  const { packageId } = req.body;
  if (!packageId) {
    throw new ApiError(400, 'packageId is required');
  }

  const result = await purchasePackageWithWallet(userId, String(packageId));

  return sendResponse(
    res,
    200,
    'Package purchased successfully from wallet balance',
    true,
    null,
    result
  );
});

