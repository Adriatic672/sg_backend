import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Define all available roles matching the ENUM in admin_users table
export enum UserRole {
  READ = 'READ',
  WRITE = 'WRITE',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  CAMPAIGN_MANAGER = 'campaign_manager'
}

// Define role hierarchies (higher number = more permissions)
export const roleHierarchy: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 500,
  [UserRole.ADMIN]: 400,
  [UserRole.WRITE]: 300,
  [UserRole.READ]: 200,
  [UserRole.CAMPAIGN_MANAGER]: 350, // between WRITE and ADMIN maybe
};

// Define permissions for each resource
export const rolePermissions: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: ['*'], // All permissions

  [UserRole.ADMIN]: [
    'users:read', 'users:write', 'users:delete',
    'campaigns:read', 'campaigns:write', 'campaigns:delete',
    'jobs:read', 'jobs:write', 'jobs:delete',
    'payments:read', 'payments:write', 'payments:approve',
    'wallet:read', 'wallet:withdraw',
    'reports:read', 'reports:write',
    'settings:read', 'settings:write'
  ],

  [UserRole.WRITE]: [
    'users:read', 'users:write',
    'campaigns:read', 'campaigns:write',
    'jobs:read', 'jobs:write',
    'payments:read', 'payments:write',
    'wallet:read', 'wallet:withdraw',
    'reports:read', 'reports:write'
  ],

  [UserRole.READ]: [
    'users:read',
    'campaigns:read',
    'jobs:read',
    'payments:read',
    'wallet:read',
    'reports:read'
  ],

  [UserRole.CAMPAIGN_MANAGER]: [
    'users:read', 'users:write',
    'campaigns:read', 'campaigns:write', 'campaigns:delete',
    'jobs:read', 'jobs:write', 'jobs:delete',
    'payments:read', 'payments:write',
    'wallet:read', 'wallet:withdraw',
    'reports:read', 'reports:write'
    // Note: campaign manager likely has similar rights to admin but maybe limited to certain operations.
    // For simplicity, we give them same as admin except maybe no super admin only actions.
  ],
};

// Extended Request type with user info
export interface AuthRequest extends Request {
  user?: {
    user_id: string;
    role: UserRole;
    username?: string;
  };
}

/**
 * Check if user has required role
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    
    if (!userRole) {
      return res.status(401).json({ 
        message: 'Unauthorized - No role found',
        code: 'NO_ROLE'
      });
    }
    
    if (!allowedRoles.includes(userRole as UserRole)) {
      logger.warn(`[RBAC] User ${req.user?.user_id} with role ${userRole} tried to access restricted route`);
      return res.status(403).json({ 
        message: 'Forbidden - Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: userRole
      });
    }
    
    next();
  };
};

/**
 * Check if user has required permission
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole;
    
    if (!userRole) {
      return res.status(401).json({ 
        message: 'Unauthorized - No role found',
        code: 'NO_ROLE'
      });
    }
    
    const permissions = rolePermissions[userRole] || [];
    
    // Super admin has all permissions
    if (permissions.includes('*')) {
      return next();
    }
    
    // Check if user has all required permissions
    const hasPermission = requiredPermissions.every(perm => permissions.includes(perm));
    
    if (!hasPermission) {
      logger.warn(`[RBAC] User ${req.user?.user_id} with role ${userRole} lacks permissions: ${requiredPermissions.join(', ')}`);
      return res.status(403).json({ 
        message: 'Forbidden - Insufficient permissions',
        code: 'FORBIDDEN',
        required: requiredPermissions,
        current: permissions
      });
    }
    
    next();
  };
};

/**
 * Check if user has minimum role level
 */
export const requireMinRole = (minRole: UserRole) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole;
    
    if (!userRole) {
      return res.status(401).json({ 
        message: 'Unauthorized - No role found',
        code: 'NO_ROLE'
      });
    }
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[minRole] || 0;
    
    if (userLevel < requiredLevel) {
      logger.warn(`[RBAC] User ${req.user?.user_id} with role ${userRole} doesn't meet minimum role requirement: ${minRole}`);
      return res.status(403).json({ 
        message: 'Forbidden - Insufficient role level',
        code: 'FORBIDDEN',
        required: minRole,
        current: userRole
      });
    }
    
    next();
  };
};

/**
 * Get dashboard route based on role
 */
export const getDashboardRoute = (role: UserRole): string => {
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.ADMIN:
      return '/admin/dashboard';
    case UserRole.WRITE:
      return '/admin/dashboard';
    case UserRole.READ:
      return '/admin/dashboard';
    case UserRole.CAMPAIGN_MANAGER:
      return '/admin/dashboard';
    default:
      return '/';
  }
};

/**
 * Get navigation items by role
 */
export const getNavigationByRole = (role: UserRole): { name: string; route: string; icon: string }[] => {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return [
        { name: 'Dashboard', route: '/admin/dashboard', icon: '📊' },
        { name: 'Users', route: '/admin/users', icon: '👥' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: '📢' },
        { name: 'Creators', route: '/admin/creators', icon: '✨' },
        { name: 'Jobs', route: '/admin/jobs', icon: '💼' },
        { name: 'Submissions', route: '/admin/submissions', icon: '📝' },
        { name: 'Finances', route: '/admin/finances', icon: '💰' },
        { name: 'Community', route: '/admin/community', icon: '💬' },
        { name: 'Campaign Managers', route: '/admin/campaign-managers', icon: '🎯' },
        { name: 'Pending Deletions', route: '/admin/pending-deletions', icon: '🗑️' },
      ];
    case UserRole.ADMIN:
      return [
        { name: 'Dashboard', route: '/admin/dashboard', icon: '📊' },
        { name: 'Users', route: '/admin/users', icon: '👥' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: '📢' },
        { name: 'Creators', route: '/admin/creators', icon: '✨' },
        { name: 'Jobs', route: '/admin/jobs', icon: '💼' },
        { name: 'Submissions', route: '/admin/submissions', icon: '📝' },
        { name: 'Finances', route: '/admin/finances', icon: '💰' },
        { name: 'Community', route: '/admin/community', icon: '💬' },
        { name: 'Campaign Managers', route: '/admin/campaign-managers', icon: '🎯' },
        { name: 'Pending Deletions', route: '/admin/pending-deletions', icon: '🗑️' },
      ];
    case UserRole.WRITE:
      return [
        { name: 'Dashboard', route: '/admin/dashboard', icon: '📊' },
        { name: 'Users', route: '/admin/users', icon: '👥' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: '📢' },
        { name: 'Creators', route: '/admin/creators', icon: '✨' },
        { name: 'Jobs', route: '/admin/jobs', icon: '💼' },
        { name: 'Submissions', route: '/admin/submissions', icon: '📝' },
        { name: 'Finances', route: '/admin/finances', icon: '💰' },
        { name: 'Community', route: '/admin/community', icon: '💬' },
      ];
    case UserRole.READ:
      return [
        { name: 'Dashboard', route: '/admin/dashboard', icon: '📊' },
        { name: 'Users', route: '/admin/users', icon: '👥' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: '📢' },
        { name: 'Creators', route: '/admin/creators', icon: '✨' },
        { name: 'Jobs', route: '/admin/jobs', icon: '💼' },
        { name: 'Submissions', route: '/admin/submissions', icon: '📝' },
        { name: 'Finances', route: '/admin/finances', icon: '💰' },
        { name: 'Community', route: '/admin/community', icon: '💬' },
      ];
    case UserRole.CAMPAIGN_MANAGER:
      return [
        { name: 'Dashboard', route: '/admin/dashboard', icon: '📊' },
        { name: 'Users', route: '/admin/users', icon: '👥' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: '📢' },
        { name: 'Creators', route: '/admin/creators', icon: '✨' },
        { name: 'Jobs', route: '/admin/jobs', icon: '💼' },
        { name: 'Submissions', route: '/admin/submissions', icon: '📝' },
        { name: 'Finances', route: '/admin/finances', icon: '💰' },
        { name: 'Community', route: '/admin/community', icon: '💬' },
      ];
    default:
      return [];
  }
};