import { Request, Response, NextFunction } from "express";
import { templateService } from "./template.service.js";
import { createTemplateSchema, listTemplateQuerySchema, updateTemplateSchema } from "./template.validation.js";

type HttpError = Error & { statusCode?: number };

const badRequest = (message: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = 400;
  return error;
};

const createTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      return next(badRequest(message));
    }

    const data = await templateService.createTemplate(parsed.data as any);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const listTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listTemplateQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      return next(badRequest(message));
    }

    const result = await templateService.listTemplates(parsed.data);
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const getTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await templateService.getTemplateById(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

// updated template

const updateTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      return next(badRequest(message));
    }

    const data = await templateService.updateTemplate(
      req.params.id as string,
      parsed.data as any
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const publishTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await templateService.publishTemplate(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const archiveTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await templateService.archiveTemplate(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const unarchiveTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await templateService.unarchiveTemplate(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const templateController = {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  publishTemplate,
  archiveTemplate,
    unarchiveTemplate,
};