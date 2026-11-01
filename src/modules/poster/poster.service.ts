import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { storageService } from "../../services/storage/storage.service.js";
import { dispatchPosterRenderJob } from "../../workers/poster.worker.js";
import type { Prisma } from "@prisma/client";
import type {
  IPosterOwnerContext,
  ICreatePosterInput,
  IUpdatePosterInput,
  IListPosterQuery,
  IRenderPosterInput,
  IPosterStatusResponse,
} from "./poster.interface.js";

/**
 * Builds owner filter ensuring strict multi-tenant isolation.
 * Throws 401 if neither userId nor guestSessionId is resolved.
 */
const buildOwnerWhere = (owner: IPosterOwnerContext) => {
  if (owner.userId) {
    return { userId: owner.userId };
  }
  if (owner.guestSessionId) {
    return { guestSessionId: owner.guestSessionId };
  }
  throw new ApiError(401, "Authentication required: user or guest session missing");
};

/**
 * Validates that template exists and is PUBLISHED.
 */
const validateTemplate = async (templateId: string) => {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new ApiError(404, "Template not found");
  }

  if (template.status !== "PUBLISHED") {
    throw new ApiError(400, "Cannot create a poster using an unpublished or archived template");
  }

  return template;
};

/**
 * Validates that all source assets exist and belong to caller.
 */
const validateSourceAssetsOwnership = async (
  owner: IPosterOwnerContext,
  sourceAssets: Array<{ assetId: string; position: number }>
) => {
  if (!sourceAssets || sourceAssets.length === 0) return;

  const assetIds = sourceAssets.map((a) => a.assetId);
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      deletedAt: null,
    },
    select: { id: true, ownerUserId: true, guestSessionId: true },
  });

  if (assets.length !== assetIds.length) {
    throw new ApiError(404, "One or more source assets were not found or have been deleted");
  }

  for (const asset of assets) {
    const isOwner =
      (owner.userId && asset.ownerUserId === owner.userId) ||
      (owner.guestSessionId && asset.guestSessionId === owner.guestSessionId);

    if (!isOwner) {
      throw new ApiError(403, `You do not own asset ${asset.id}`);
    }
  }
};

class PosterService {
  /**
   * 1. Create a new poster project draft
   */
  public async createPoster(owner: IPosterOwnerContext, data: ICreatePosterInput) {
    const idempotencyKey = data.idempotencyKey || `poster_${crypto.randomUUID()}`;

    // আগে verified owner আবশ্যক; idempotency key দিয়ে অন্যের poster ফেরত দিই না।
    buildOwnerWhere(owner);

    // একই owner-এর পুনরায় request হলে আগের poster খুঁজি।
    const existingPoster = await prisma.poster.findUnique({
      where: { idempotencyKey },
      include: {
        template: { select: { id: true, title: true, aspectRatio: true } },
        sourceAssets: true,