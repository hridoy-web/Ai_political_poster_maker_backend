import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Middleware factory for Role-Based Access Control (RBAC).
 * Enforces permission requirements on routes based on assigned roles.
 */
export const requirePermission = (requiredPermission: string | string[]) => {
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

      // Prepare list of acceptable permission keys
      const requiredList = Array.isArray(requiredPermission)
        ? [...requiredPermission]
        : [requiredPermission];

      // Handle aliases to support template and category manager operations
      if (requiredList.includes("MANAGE_TEMPLATES")) {
        requiredList.push(
          "template:create",
          "template:update",
          "template:publish",
          "template:archive",
          "template:unarchive",
          "template:delete"
        );
      }
      if (requiredList.includes("MANAGE_CATEGORIES")) {
        requiredList.push(
          "category:create",
          "category:update",
          "category:status:update",
          "category:read:all"
        );
      }

      // If user has any matching permission key, call next().
      const hasPermission = userRoles.some((ur) =>
        ur.role?.permissions.some(
          (rp) => rp.permission?.key && requiredList.includes(rp.permission.key)
        )
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
