import type { Prisma } from "@prisma/client";

export type AccessLevel = "FREE" | "PREMIUM";

export interface ICreateTemplateInput {
  categoryId: string;
  title: string;
  description?: string;
  accessLevel: AccessLevel;
  aspectRatio: string;
  width: number;
  height: number;
  config: Prisma.InputJsonValue;
  previewAssetId?: string;
}

export interface IUpdateTemplateInput {
  categoryId?: string;
  title?: string;
  description?: string | null;
  accessLevel?: AccessLevel;
  aspectRatio?: string;
  width?: number;
  height?: number;
  config?: Prisma.InputJsonValue;
  previewAssetId?: string | null;
}

export interface IListTemplateQuery {
  categoryId?: string;
  accessLevel?: AccessLevel;
  page: number;
  limit: number;
}

// only seeds
export interface ITheme {
  title: string;
  category: { name: string; slug: string; sortOrder: number };
  accessLevel: AccessLevel;
  bg: string;
  titleColor: string;
  textColor: string;
  defaultTitle: string;
  defaultSubtitle: string;
  withPhoto: boolean;
}