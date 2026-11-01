import { prisma } from "../lib/prisma.js";
import { storageService } from "../services/storage/storage.service.js";
import type { IPosterRenderJobPayload } from "../modules/poster/poster.interface.js";
import crypto from "node:crypto";
import { BillingService } from "../modules/payment/billing.service.js";

/**
 * Headless Canvas / Browser Rendering Hook.
 *
 * ARCHITECTURAL CONTRACT:
 * In a complete production deployment, this hook interfaces with an isolated headless
 * rendering engine (e.g., Puppeteer, Playwright, node-canvas, or a dedicated render microservice) that:
 *  1. Compiles the template HTML/CSS with user text and political branding values substituted.
 *  2. Composites high-resolution source images into the designated layout layer positions.
 *  3. Captures a pixel-perfect PNG buffer and a lightweight WebP preview thumbnail.
 *  4. Streams the rendered images to Cloudinary via storageService.uploadBuffer().
 *
 * CURRENT STAGE (LIFECYCLE & STATE ORCHESTRATION):
 * This worker currently handles the complete transactional lifecycle state machine:
 *  - State transition: PENDING -> PROCESSING -> COMPLETED (or FAILED on error).
 *  - Atomic creation of output and preview Asset records linked to the user or guest session.
 *  - Double-entry ledger settlement (decrementing reserves or incrementing guest limits).
 *  - Automatic billing credit refund via BillingService upon unrecoverable pipeline failure.
 *
 * The block below generates simulated output asset records until the external headless renderer is connected.
 */
async function executeHeadlessRendererHook(payload: {
  posterId: string;
  templateWidth: number;
  templateHeight: number;
  idempotencyKey?: string;
}): Promise<{
  outputStorageKey: string;
  previewStorageKey: string;
  width: number;
  height: number;
}> {
  // TODO [Production Plug-in]: Replace simulated keys with output from actual headless render service
  const renderTimestamp = Date.now();
  const outputStorageKey = `posters/${payload.posterId}/render_${payload.idempotencyKey || renderTimestamp}`;
  const previewStorageKey = `posters/${payload.posterId}/preview_${payload.idempotencyKey || renderTimestamp}`;

  return {
    outputStorageKey,
    previewStorageKey,
    width: payload.templateWidth,
    height: payload.templateHeight,
  };
}

/**
 * Worker handler for processing poster background rendering jobs asynchronously.
 */
export async function processPosterRenderJob(
  payload: IPosterRenderJobPayload
): Promise<boolean> {
  console.log(`[PosterWorker] Lifecycle Transition: Poster ${payload.posterId} -> PROCESSING...`);

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
    console.warn(`[PosterWorker] Poster ${payload.posterId} not found in database. Skipping.`);
    return false;
  }

  // Idempotency check: if already completed, nothing to do
  if (poster.status === "COMPLETED") {
    console.log(`[PosterWorker] Poster ${payload.posterId} is already COMPLETED. Skipping duplicate execution.`);
    return true;
  }

  try {
    const templateWidth = poster.template?.width || 1080;
    const templateHeight = poster.template?.height || 1920;

    // 1. Invoke Headless Rendering Pipeline (or stub hook)
    const rendered = await executeHeadlessRendererHook({
      posterId: payload.posterId,
      templateWidth,
      templateHeight,
      idempotencyKey: payload.idempotencyKey,
    });

    // 2. Persist output and preview assets atomically, mark COMPLETED and settle billing
    await prisma.$transaction(async (tx) => {
      // Create final output asset
      const outputAsset = await tx.asset.create({
        data: {
          storageKey: rendered.outputStorageKey,
          mimeType: "image/png",
          sizeBytes: 245000,
          width: rendered.width,
          height: rendered.height,
          purpose: "POSTER_OUTPUT",
          ownerUserId: payload.userId ?? null,
          guestSessionId: payload.guestSessionId ?? null,
        },
      });

      // Create preview thumbnail asset
      const previewAsset = await tx.asset.create({
        data: {
          storageKey: rendered.previewStorageKey,
          mimeType: "image/webp",
          sizeBytes: 45000,
          width: Math.round(rendered.width / 4),
          height: Math.round(rendered.height / 4),
          purpose: "POSTER_OUTPUT",
          ownerUserId: payload.userId ?? null,
          guestSessionId: payload.guestSessionId ?? null,
        },
      });

      // Transition poster status to COMPLETED
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

      // Settle Billing: If guest user and pro template, increment their successful posters counter
      if (payload.guestSessionId && poster.template?.accessLevel === "PREMIUM") {
        await tx.guestSession.update({
          where: { id: payload.guestSessionId },
          data: {
            successfulPosters: { increment: 1 },
          },
        });
      }
      // For registered users: Credit reservation was already debited as POSTER_DEBIT in triggerRender if Pro template
    });

    console.log(
      `[PosterWorker] Lifecycle Transition: Poster ${payload.posterId} [PROCESSING -> COMPLETED] with output assets saved.`
    );
    return true;
  } catch (error: any) {
    console.error(
      `[PosterWorker] Lifecycle Transition: Poster ${payload.posterId} [PROCESSING -> FAILED]. Cause:`,
      error?.message || error
    );

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

      // Billing Refund: If authenticated user had credits debited for Pro template, refund them via BillingService
      if (payload.userId && poster?.template?.accessLevel === "PREMIUM") {
        await BillingService.refundCredits(
          payload.userId,
          1,
          `refund_${payload.idempotencyKey || crypto.randomUUID()}`
        );
        console.log(
          `[PosterWorker] Settle Refund: Credited back 1 credit via BillingService to user ${payload.userId} for failed poster ${payload.posterId}.`
        );
      }
    } catch (refundError) {
      console.error(
        `[PosterWorker] Critical: Failed to process billing refund for poster ${payload.posterId}:`,
        refundError
      );
    }

    return false;
  }
}

/**
 * Dispatches an asynchronous render job to the background worker.
 */
export function dispatchPosterRenderJob(payload: IPosterRenderJobPayload): void {
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

      console.log(`[PosterWorker] Found stuck processing poster ${stuckPoster.id}. Recovering and executing...`);
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
