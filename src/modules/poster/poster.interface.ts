import type { PosterStatus } from "@prisma/client";

/**
 * Caller identity context resolved by Auth / Guest middleware.
 * At least one of userId or guestSessionId must be present.
 */
export interface IPosterOwnerContext {
  userId?: string;
  guestSessionId?: string;
}

/**
 * Association of an uploaded photo/logo asset with a specific position slot on the poster.
 */
export interface IPosterSourceAssetInput {
  assetId: string;
  position: number;
}

/**
 * Payload to create a new poster project draft.
 */
export interface ICreatePosterInput {
  templateId: string;
  idempotencyKey?: string;
  inputData: Record<string, unknown>;
  sourceAssets?: IPosterSourceAssetInput[];
}

/**
 * Payload to update an existing draft.
 */
export interface IUpdatePosterInput {
  templateId?: string;
  inputData?: Record<string, unknown>;
  sourceAssets?: IPosterSourceAssetInput[];
}

/**
 * Query filters for listing posters belonging to the current caller.
 */
export interface IListPosterQuery {
  page: number;
  limit: number;
  status?: PosterStatus;
  templateId?: string;
}

/**
 * Trigger poster rendering request.
 */
export interface IRenderPosterInput {
  idempotencyKey?: string;
  rendererVersion?: string;
}

/**
 * Contract payload dispatched to Saad's worker queue for background rendering.
 */
export interface IPosterRenderJobPayload {
  posterId: string;
  userId?: string;
  guestSessionId?: string;
  templateId: string;
  inputData: Record<string, unknown>;
  sourceAssets: Array<{
    assetId: string;
    position: number;
  }>;
  rendererVersion: string;
  idempotencyKey: string;
}

/**
 * Polling status response for frontend.
 */
export interface IPosterStatusResponse {
  id: string;
  status: PosterStatus;
  outputUrl?: string | null;
  previewUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  completedAt?: Date | null;
}
