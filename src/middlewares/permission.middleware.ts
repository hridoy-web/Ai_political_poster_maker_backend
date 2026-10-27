import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Middleware factory for Role-Based Access Control (RBAC).
 * Enforces permission requirements on routes based on assigned roles.
 */
export const requirePermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Contract with Dev 1 (Shakil's auth.middleware):
      // Check req.user. If !req.user (or if request is only a guest session), immediately return 401 Unauthorized
      if (!req.user || !req.user.id) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      // Permission evaluation:
      // Fetch user's assigned roles and capability permissions via Prisma (UserRole -> Role -> RolePermission -> Permission).
      // Optimize: Use lean Prisma select queries (only fetch role name and permission key)
      const userRoles = await prisma.userRole.findMany({
        where: { userId: req.user.id },
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: {
                      key: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // If user has "SUPER_ADMIN" role, bypass and call next().
      const isSuperAdmin = userRoles.some((ur) => ur.role?.name === "SUPER_ADMIN");
      if (isSuperAdmin) {
        next();
        return;
      }

      // If user has the matching requiredPermission key, call next().
      const hasPermission = userRoles.some((ur) =>
        ur.role?.permissions.some((rp) => rp.permission?.key === requiredPermission)
      );

      if (hasPermission) {
        next();
        return;
      }

      // Otherwise, return 403 Forbidden
      res.status(403).json({
        success: false,
        message: "Forbidden: Insufficient permissions",
      });
      return;
    } catch (error) {
      // Pass async errors to next(error)
      next(error);
    }
  };
};

export default requirePermission;
