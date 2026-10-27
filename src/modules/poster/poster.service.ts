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
      },
    });

    if (existingPoster) {
      const isUserOwner = Boolean(
        owner.userId && existingPoster.userId === owner.userId
      );
      const isGuestOwner = Boolean(
        owner.guestSessionId &&
          existingPoster.guestSessionId === owner.guestSessionId
      );

      if (!isUserOwner && !isGuestOwner) {
        throw new ApiError(409, "Idempotency key is already in use");
      }

      return existingPoster;
    }

    // Verify template and source assets
    await validateTemplate(data.templateId);
    if (data.sourceAssets && data.sourceAssets.length > 0) {
      await validateSourceAssetsOwnership(owner, data.sourceAssets);
    }


    // Atomically create poster and source asset relations
    return prisma.$transaction(async (tx) => {
      return tx.poster.create({
        data: {
          idempotencyKey,
          userId: owner.userId ?? null,
          guestSessionId: owner.guestSessionId ?? null,
          templateId: data.templateId,
          status: "PENDING",
          inputData: data.inputData as Prisma.InputJsonValue,
          sourceAssets: {
            create:
              data.sourceAssets?.map((sa) => ({
                assetId: sa.assetId,
                position: sa.position,
              })) || [],
          },
        },
        include: {
          template: {
            select: { id: true, title: true, aspectRatio: true, width: true, height: true },
          },
          sourceAssets: {
            include: { asset: { select: { id: true, storageKey: true, mimeType: true } } },
            orderBy: { position: "asc" },
          },
        },
      });
    });
  }

  /**
   * 2. List posters belonging to caller with pagination
   */
  public async listPosters(owner: IPosterOwnerContext, query: IListPosterQuery) {
    const ownerFilter = buildOwnerWhere(owner);
    const where: Prisma.PosterWhereInput = {
      ...ownerFilter,
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.templateId && { templateId: query.templateId }),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.poster.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          template: {
            select: { id: true, title: true, aspectRatio: true, width: true, height: true },
          },
          output: { select: { id: true, storageKey: true, mimeType: true } },
          preview: { select: { id: true, storageKey: true, mimeType: true } },
        },
      }),
      prisma.poster.count({ where }),
    ]);

    const canAccessOutput = Boolean(owner.userId);

    const mappedItems = items.map((item) => ({
      ...item,
      output: canAccessOutput && item.output
        ? {
            ...item.output,
            url: storageService.getSecureUrl(item.output.storageKey),
          }
        : null,
      outputUrl: canAccessOutput && item.output
        ? storageService.getSecureUrl(item.output.storageKey)
        : null,
      preview: item.preview
        ? {
            ...item.preview,
            url: storageService.getSecureUrl(item.preview.storageKey),
          }
        : null,
    }));

    return {
      items: mappedItems,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * 3. Get single poster details by ID
   */
  public async getPosterById(owner: IPosterOwnerContext, id: string) {
    const ownerFilter = buildOwnerWhere(owner);

    const poster = await prisma.poster.findFirst({
      where: {
        id,
        ...ownerFilter,
        deletedAt: null,
      },
      include: {
        template: true,
        output: true,
        preview: true,
        sourceAssets: {
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!poster) {
      throw new ApiError(404, "Poster not found");
    }

    const canAccessOutput = Boolean(owner.userId);

    return {
      ...poster,
      output: canAccessOutput && poster.output
        ? {
            ...poster.output,
            url: storageService.getSecureUrl(poster.output.storageKey),
          }
        : null,
      outputUrl: canAccessOutput && poster.output
        ? storageService.getSecureUrl(poster.output.storageKey)
        : null,
      preview: poster.preview
        ? {
            ...poster.preview,
            url: storageService.getSecureUrl(poster.preview.storageKey),
          }
        : null,
    };
  }

  /**
   * 4. Update poster draft
   */
  public async updatePoster(
    owner: IPosterOwnerContext,
    id: string,
    data: IUpdatePosterInput
  ) {
    const poster = await this.getPosterById(owner, id);

    if (poster.status === "PROCESSING") {
      throw new ApiError(409, "Cannot edit a poster that is currently being rendered");
    }

    if (data.templateId && data.templateId !== poster.templateId) {
      await validateTemplate(data.templateId);
    }

    if (data.sourceAssets && data.sourceAssets.length > 0) {
      await validateSourceAssetsOwnership(owner, data.sourceAssets);
    }

    return prisma.$transaction(async (tx) => {
      if (data.sourceAssets) {
        await tx.posterSourceAsset.deleteMany({ where: { posterId: id } });
        if (data.sourceAssets.length > 0) {
          await tx.posterSourceAsset.createMany({
            data: data.sourceAssets.map((sa) => ({
              posterId: id,
              assetId: sa.assetId,
              position: sa.position,
            })),
          });
        }
      }

      return tx.poster.update({
        where: { id },
        data: {
          ...(data.templateId && { templateId: data.templateId }),
          ...(data.inputData && {
            inputData: data.inputData as Prisma.InputJsonValue,
          }),
          ...(poster.status === "FAILED" && {
            status: "PENDING",
            errorCode: null,
            errorMessage: null,
          }),
        },
        include: {
          template: true,
          sourceAssets: {
            include: { asset: true },
            orderBy: { position: "asc" },
          },
        },
      });
    });
  }

  /**
   * 5. Soft-delete poster
   */
  public async deletePoster(owner: IPosterOwnerContext, id: string) {
    await this.getPosterById(owner, id);

    return prisma.poster.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "DELETED",
      },
    });
  }

  /**
   * 6. Duplicate an existing poster draft
   */
  public async duplicatePoster(owner: IPosterOwnerContext, id: string) {
    const original = await this.getPosterById(owner, id);
    const idempotencyKey = `poster_${crypto.randomUUID()}`;


    return prisma.$transaction(async (tx) => {
      return tx.poster.create({
        data: {
          idempotencyKey,
          userId: owner.userId ?? null,
          guestSessionId: owner.guestSessionId ?? null,
          templateId: original.templateId,
          status: "PENDING",
          inputData: original.inputData as Prisma.InputJsonValue,
          sourceAssets: {
            create: original.sourceAssets.map((sa) => ({
              assetId: sa.assetId,
              position: sa.position,
            })),
          },
        },
        include: {
          template: true,
          sourceAssets: {
            include: { asset: true },
            orderBy: { position: "asc" },
          },
        },
      });
    });
  }

  /**
   * 7. Trigger poster render job with Idempotency, Billing Reservation, and Worker Dispatch
   */
  public async triggerRender(
    owner: IPosterOwnerContext,
    id: string,
    input: IRenderPosterInput = {}
  ) {
    const poster = await this.getPosterById(owner, id);
    const renderIdempotencyKey = input.idempotencyKey || `render_${id}_${Date.now()}`;

    // Idempotency: If poster is already completed and triggered with the same idempotency key
    if (poster.status === "COMPLETED") {
      return poster;
    }

    // Idempotency: If already processing
    if (poster.status === "PROCESSING") {
      // If client retries with same idempotencyKey, return the processing poster safely
      if (input.idempotencyKey && poster.idempotencyKey === input.idempotencyKey) {
        return poster;
      }
      throw new ApiError(409, "Poster is already processing a render job");
    }

    if (!poster.templateId) {
      throw new ApiError(400, "Cannot render a poster without an assigned template");
    }

    await validateTemplate(poster.templateId);

    // 1. Billing Reservation
    if (owner.userId) {
      // Authenticated User: Verify and reserve credit (or grant starter credit)
      const wallet = await prisma.creditWallet.findUnique({
        where: { userId: owner.userId },
      });

      const currentBalance = wallet ? wallet.balance : 5; // Default 5 starter credits if uninitialized

      if (currentBalance < 1) {
        throw new ApiError(402, "Insufficient poster credits. Please recharge your credit wallet.");
      }

      await prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.creditWallet.upsert({
          where: { userId: owner.userId! },
          create: {
            userId: owner.userId!,
            balance: 4,
          },
          update: {
            balance: { decrement: 1 },
          },
        });

        await tx.creditLedgerEntry.create({
          data: {
            userId: owner.userId!,
            type: "POSTER_DEBIT",
            amount: -1,
            balanceAfter: updatedWallet.balance,
            idempotencyKey: `reserve_${renderIdempotencyKey}`,
          },
        });
      });
    } else if (owner.guestSessionId) {
      // Guest User: Check free quota (max 3 successful posters)
      const guestSession = await prisma.guestSession.findUnique({
        where: { id: owner.guestSessionId },
        select: { successfulPosters: true },
      });

      if (guestSession && guestSession.successfulPosters >= 3) {
        throw new ApiError(
          403,
          "Guest free poster limit reached (maximum 3 posters). Please register an account to continue."
        );
      }
    }

    // 2. Transition status to PROCESSING atomically
    const updatedPoster = await prisma.poster.update({
      where: { id },
      data: {
        status: "PROCESSING",
        rendererVersion: input.rendererVersion || "1.0.0",
        errorCode: null,
        errorMessage: null,
      },
      include: {
        template: true,
        sourceAssets: {
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    });

    // 3. Dispatch render job to background worker queue
    dispatchPosterRenderJob({
      posterId: poster.id,
      userId: owner.userId,
      guestSessionId: owner.guestSessionId,
      templateId: poster.templateId,
      inputData: (poster.inputData as Record<string, unknown>) || {},
      sourceAssets: poster.sourceAssets.map((sa) => ({
        assetId: sa.assetId,
        position: sa.position,
      })),
      rendererVersion: input.rendererVersion || "1.0.0",
      idempotencyKey: renderIdempotencyKey,
    });

    return updatedPoster;
  }

  /**
   * 8. Polling endpoint for frontend to check render progress with secure public URLs
   */
  public async getPosterStatus(
    owner: IPosterOwnerContext,
    id: string
  ): Promise<IPosterStatusResponse> {
    const poster = await this.getPosterById(owner, id);

    return {
      id: poster.id,
      status: poster.status,
      outputUrl: owner.userId ? poster.outputUrl : null,
      previewUrl: storageService.getSecureUrl(poster.preview?.storageKey),
      errorCode: poster.errorCode,
      errorMessage: poster.errorMessage,
      completedAt: poster.completedAt,
    };
  }
}

export const posterService = new PosterService();
