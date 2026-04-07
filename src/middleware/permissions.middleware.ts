import { Request, Response, NextFunction } from 'express';
import RolesModel, { Permission } from '../models/roles.model';
import { logger } from '../utils/logger';

const rolesModel = new RolesModel();

export class PermissionsMiddleware {
  /**
   * Middleware to check if user has required permission
   * @param permission - The permission to check
   */
  static requirePermission(permission: Permission) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.body as any).userId || (req as any).userId;

        if (!userId) {
          return res.status(401).json({
            status: 401,
            message: 'Unauthorized - User ID not found'
          });
        }

        const hasPermission = await rolesModel.hasPermission(userId, permission);

        if (!hasPermission) {
          logger.warn(`Permission denied for user ${userId} - Missing permission: ${permission}`);
          return res.status(403).json({
            status: 403,
            message: `Access denied - You do not have ${permission} permission`
          });
        }

        next();
      } catch (error) {
        logger.error('Error in permission check:', error);
        return res.status(500).json({
          status: 500,
          message: 'Error checking permissions'
        });
      }
    };
  }

  /**
   * Middleware to check if user has any of the required permissions
   * @param permissions - Array of permissions (user needs at least one)
   */
  static requireAnyPermission(permissions: Permission[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.body as any).userId || (req as any).userId;

        if (!userId) {
          return res.status(401).json({
            status: 401,
            message: 'Unauthorized - User ID not found'
          });
        }

        let hasAnyPermission = false;
        for (const permission of permissions) {
          const hasPermission = await rolesModel.hasPermission(userId, permission);
          if (hasPermission) {
            hasAnyPermission = true;
            break;
          }
        }

        if (!hasAnyPermission) {
          logger.warn(`Permission denied for user ${userId} - Missing any of: ${permissions.join(', ')}`);
          return res.status(403).json({
            status: 403,
            message: `Access denied - You need one of: ${permissions.join(', ')}`
          });
        }

        next();
      } catch (error) {
        logger.error('Error in permission check:', error);
        return res.status(500).json({
          status: 500,
          message: 'Error checking permissions'
        });
      }
    };
  }

  /**
   * Middleware to check if user has all required permissions
   * @param permissions - Array of permissions (user needs all of them)
   */
  static requireAllPermissions(permissions: Permission[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.body as any).userId || (req as any).userId;

        if (!userId) {
          return res.status(401).json({
            status: 401,
            message: 'Unauthorized - User ID not found'
          });
        }

        for (const permission of permissions) {
          const hasPermission = await rolesModel.hasPermission(userId, permission);
          if (!hasPermission) {
            logger.warn(`Permission denied for user ${userId} - Missing permission: ${permission}`);
            return res.status(403).json({
              status: 403,
              message: `Access denied - You need ${permission} permission`
            });
          }
        }

        next();
      } catch (error) {
        logger.error('Error in permission check:', error);
        return res.status(500).json({
          status: 500,
          message: 'Error checking permissions'
        });
      }
    };
  }

  /**
   * Middleware to require WRITE permission (for POST/PUT/PATCH requests)
   */
  static requireWrite() {
    return PermissionsMiddleware.requirePermission('WRITE');
  }

  /**
   * Middleware to require READ permission
   */
  static requireRead() {
    return PermissionsMiddleware.requirePermission('READ');
  }

  /**
   * Middleware to check if user is SUPER_ADMIN
   */
  static requireSuperAdmin() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req.body as any).userId || (req as any).userId;

        if (!userId) {
          return res.status(401).json({
            status: 401,
            message: 'Unauthorized - User ID not found'
          });
        }

        const isSuperAdmin = await rolesModel.hasRole(userId, 'SUPER_ADMIN');

        if (!isSuperAdmin) {
          logger.warn(`Access denied for user ${userId} - Not a SUPER_ADMIN`);
          return res.status(403).json({
            status: 403,
            message: 'Access denied - SUPER_ADMIN role required'
          });
        }

        next();
      } catch (error) {
        logger.error('Error in super admin check:', error);
        return res.status(500).json({
          status: 500,
          message: 'Error checking admin status'
        });
      }
    };
  }

  /**
   * Middleware to block write operations for view-only users
   * This checks if the request is a mutation (POST/PUT/PATCH/DELETE) and requires WRITE permission
   */
  static blockMutationsForViewOnly() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      
      if (mutationMethods.includes(req.method)) {
        return PermissionsMiddleware.requireWrite()(req, res, next);
      }
      
      // For GET requests, just continue
      next();
    };
  }
}

export default PermissionsMiddleware;

