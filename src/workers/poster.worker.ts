import { prisma } from "../lib/prisma.js";
import { storageService } from "../services/storage/storage.service.js";
import type { IPosterRenderJobPayload } from "../modules/poster/poster.interface.js";
import crypto from "node:crypto";
import { BillingService } from "../modules/payment/billing.service.js";

/**
 * Worker handler for processing poster background rendering jobs asynchronously.
 */
export async function processPosterRenderJob(
  payload: IPosterRenderJobPayload
): Promise<boolean> {
  console.log(`[PosterWorker] Processing render job for poster ID: ${payload.posterId}...`);

  const poster = await prisma.poster.findUnique({
    where: { id: payload.posterId },
    include: {
      template: true,
      sourceAssets: {
        include: { asset: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!poster) {
    console.warn(`[PosterWorker] Poster ${payload.posterId} not found. Skipping.`);
    return false;
  }

  // Idempotency: if already completed, nothing to do
  if (poster.status === "COMPLETED") {
    console.log(`[PosterWorker] Poster ${payload.posterId} is already COMPLETED. Skipping.`);
    return true;
  }

  try {
    // 1. Simulate/execute the high-resolution rendering pipeline
    // In production with Saad's canvas/headless renderer, this creates the final composed image.
    const renderTimestamp = Date.now();
    const outputStorageKey = `posters/${payload.posterId}/render_${payload.idempotencyKey || renderTimestamp}`;
    const previewStorageKey = `posters/${payload.posterId}/preview_${payload.idempotencyKey || renderTimestamp}`;

    const width = poster.template?.width || 1080;
    const height = poster.template?.height || 1920;

    // 2. Persist output and preview assets atomically, mark COMPLETED and settle billing
    await prisma.$transaction(async (tx) => {
      // Create output asset
      const outputAsset = await tx.asset.create({
        data: {
          storageKey: outputStorageKey,
          mimeType: "image/png",
          sizeBytes: 245000,
          width,
          height,
          purpose: "POSTER_OUTPUT",
          ownerUserId: payload.userId ?? null,
          guestSessionId: payload.guestSessionId ?? null,
        },
      });

      // Create preview thumbnail asset
      const previewAsset = await tx.asset.create({
        data: {
          storageKey: previewStorageKey,
          mimeType: "image/webp",
          sizeBytes: 45000,
          width: Math.round(width / 4),
          height: Math.round(height / 4),
          purpose: "POSTER_OUTPUT",
          ownerUserId: payload.userId ?? null,
          guestSessionId: payload.guestSessionId ?? null,
        },
      });

      // Update poster status to COMPLETED
      await tx.poster.update({
        where: { id: payload.posterId },
        data: {
          status: "COMPLETED",
          outputAssetId: outputAsset.id,
          previewAssetId: previewAsset.id,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });

      // Settle Billing: If guest user, increment their successful posters counter
      if (payload.guestSessionId) {
        await tx.guestSession.update({
          where: { id: payload.guestSessionId },
          data: {
            successfulPosters: { increment: 1 },
          },
        });
      }
      // For registered users: Credit reservation was already recorded as POSTER_DEBIT in triggerRender
    });

    console.log(`[PosterWorker] Poster ${payload.posterId} rendered and marked COMPLETED successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[PosterWorker] Render failed for poster ${payload.posterId}:`, error?.message || error);

    // 3. Mark FAILED and execute billing refund
    try {
      await prisma.poster.update({
        where: { id: payload.posterId },
        data: {
          status: "FAILED",
          errorCode: (error?.code || "RENDER_PIPELINE_ERROR").slice(0, 50),
          errorMessage: (error?.message || "Failed to render poster artwork").slice(0, 255),
          completedAt: new Date(),
        },
      });

      // Billing Refund: If authenticated user had credits reserved, refund them via BillingService
      if (payload.userId) {
        await BillingService.refundCredits(
          payload.userId,
          1,
          `refund_${payload.idempotencyKey || crypto.randomUUID()}`
        );
        console.log(`[PosterWorker] Refunded 1 credit via BillingService to user ${payload.userId} due to render failure.`);
      }
    } catch (refundError) {
      console.error(`[PosterWorker] Failed to process billing refund for poster ${payload.posterId}:`, refundError);
    }

    return false;
  }
}

/**
 * Dispatches an asynchronous render job to the background worker.
 */
export function dispatchPosterRenderJob(payload: IPosterRenderJobPayload): void {
  // Use setImmediate to asynchronously execute without blocking the HTTP response
  setImmediate(async () => {
    try {
      await processPosterRenderJob(payload);
    } catch (err) {
      console.error(`[PosterWorker] Unhandled error during async render dispatch:`, err);
    }
  });
}

/**
 * Background worker polling engine for posters stuck in PROCESSING or orphaned.
 */
export function startPosterWorkerQueue(pollIntervalMs: number = 15000): NodeJS.Timeout {
  console.log(`[PosterWorker] Background worker queue initialized (polling every ${pollIntervalMs}ms).`);

  const timer = setInterval(async () => {
    try {
      // Find oldest stuck poster in PROCESSING
      const stuckPoster = await prisma.poster.findFirst({
        where: {
          status: "PROCESSING",
          outputAssetId: null,
          deletedAt: null,
          createdAt: {
            lt: new Date(Date.now() - 30 * 1000), // stuck for > 30s
          },
        },
        include: {
          sourceAssets: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!stuckPoster || !stuckPoster.templateId) return;

      console.log(`[PosterWorker] Found stuck processing poster ${stuckPoster.id}. Recovering and rendering...`);
      await processPosterRenderJob({
        posterId: stuckPoster.id,
        userId: stuckPoster.userId ?? undefined,
        guestSessionId: stuckPoster.guestSessionId ?? undefined,
        templateId: stuckPoster.templateId,
        inputData: (stuckPoster.inputData as Record<string, unknown>) || {},
        sourceAssets: stuckPoster.sourceAssets.map((sa) => ({
          assetId: sa.assetId,
          position: sa.position,
        })),
        rendererVersion: stuckPoster.rendererVersion || "1.0.0",
        idempotencyKey: stuckPoster.idempotencyKey,
      });
    } catch (err) {
      console.error("[PosterWorker] Error in background polling loop:", err);
    }
  }, pollIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}
