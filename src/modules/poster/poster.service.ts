import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
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
 * Ensures guest session exists in DB so foreign key constraints are always satisfied.
 */
const ensureGuestSession = async (guestSessionId: string) => {
  const existing = await prisma.guestSession.findUnique({
    where: { id: guestSessionId },
    select: { id: true },
  });

  if (!existing) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(guestSessionId)
      .digest("hex");

    await prisma.guestSession.upsert({
      where: { id: guestSessionId },
      update: {},
      create: {
        id: guestSessionId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
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

    // Return existing poster on idempotent re-submission
    const existingPoster = await prisma.poster.findUnique({
      where: { idempotencyKey },
      include: {
        template: { select: { id: true, title: true, aspectRatio: true } },
        sourceAssets: true,
      },
    });

    if (existingPoster) {
      return existingPoster;
    }

    // Verify template and source assets
    await validateTemplate(data.templateId);
    if (data.sourceAssets && data.sourceAssets.length > 0) {
      await validateSourceAssetsOwnership(owner, data.sourceAssets);
    }

    if (owner.guestSessionId) {
      await ensureGuestSession(owner.guestSessionId);
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

    return {
      items,
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

    return poster;
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

    if (owner.guestSessionId) {
      await ensureGuestSession(owner.guestSessionId);
    }

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
   * 7. Trigger poster render job
   */
  public async triggerRender(
    owner: IPosterOwnerContext,
    id: string,
    input: IRenderPosterInput = {}
  ) {
    const poster = await this.getPosterById(owner, id);

    if (poster.status === "PROCESSING") {
      throw new ApiError(409, "Poster is already processing a render job");
    }

    if (!poster.templateId) {
      throw new ApiError(400, "Cannot render a poster without an assigned template");
    }

    await validateTemplate(poster.templateId);

    // Transition status to PROCESSING
    return prisma.poster.update({
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
  }

  /**
   * 8. Polling endpoint for frontend to check render progress
   */
  public async getPosterStatus(
    owner: IPosterOwnerContext,
    id: string
  ): Promise<IPosterStatusResponse> {
    const poster = await this.getPosterById(owner, id);

    return {
      id: poster.id,
      status: poster.status,
      outputUrl: poster.output?.storageKey || null,
      previewUrl: poster.preview?.storageKey || null,
      errorCode: poster.errorCode,
      errorMessage: poster.errorMessage,
      completedAt: poster.completedAt,
    };
  }
}

export const posterService = new PosterService();
