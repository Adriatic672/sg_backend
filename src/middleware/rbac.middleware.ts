import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Define all available roles
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  BUSINESS = 'business',  // Brand - creates campaigns
  INFLUENCER = 'influencer',
  CREATOR = 'creator',    // Campaign creator/manager
  TEST = 'test',
  VIEWER = 'viewer'
}

// Define role hierarchies (higher number = more permissions)
export const roleHierarchy: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.MODERATOR]: 60,
  [UserRole.CREATOR]: 50,
  [UserRole.BUSINESS]: 40,
  [UserRole.INFLUENCER]: 20,
  [UserRole.VIEWER]: 10,
  [UserRole.TEST]: 5
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
  
  [UserRole.MODERATOR]: [
    'users:read', 'users:write',
    'campaigns:read', 'campaigns:write',
    'jobs:read', 'jobs:write',
    'reports:read', 'reports:write'
  ],
  
  [UserRole.CREATOR]: [
    'campaigns:read', 'campaigns:write', 'campaigns:delete',
    'jobs:read', 'jobs:write', 'jobs:delete',
    'payments:read', 'payments:write',
    'wallet:read', 'wallet:withdraw',
    'reports:read', 'reports:write'
  ],
  
  [UserRole.BUSINESS]: [
    'campaigns:read', 'campaigns:write',
    'jobs:read', 'jobs:write',
    'payments:read',
    'wallet:read', 'wallet:withdraw',
    'reports:read'
  ],
  
  [UserRole.INFLUENCER]: [
    'campaigns:read',
    'jobs:read', 'jobs:write',
    'payments:read',
    'wallet:read', 'wallet:withdraw',
    'reports:read'
  ],
  
  [UserRole.VIEWER]: [
    'campaigns:read',
    'jobs:read',
    'reports:read'
  ],
  
  [UserRole.TEST]: [
    'campaigns:read',
    'jobs:read'
  ]
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
    case UserRole.MODERATOR:
      return '/moderator/dashboard';
    case UserRole.CREATOR:
      return '/creator/dashboard';
    case UserRole.BUSINESS:
      return '/brand/dashboard';
    case UserRole.INFLUENCER:
      return '/influencer/dashboard';
    case UserRole.VIEWER:
      return '/viewer/dashboard';
    default:
      return '/dashboard';
  }
};

/**
 * Get navigation items based on role
 */
export const getNavigationByRole = (role: UserRole): { name: string; route: string; icon: string }[] => {
  const commonNav = [
    { name: 'Home', route: '/', icon: 'home' }
  ];
  
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.ADMIN:
      return [
        ...commonNav,
        { name: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' },
        { name: 'Users', route: '/admin/users', icon: 'people' },
        { name: 'Campaigns', route: '/admin/campaigns', icon: 'campaign' },
        { name: 'Reports', route: '/admin/reports', icon: 'report' },
        { name: 'Settings', route: '/admin/settings', icon: 'settings' }
      ];
      
    case UserRole.BUSINESS:
      return [
        ...commonNav,
        { name: 'Dashboard', route: '/brand/dashboard', icon: 'dashboard' },
        { name: 'Campaigns', route: '/brand/campaigns', icon: 'campaign' },
        { name: 'Jobs', route: '/brand/jobs', icon: 'work' },
        { name: 'Wallet', route: '/brand/wallet', icon: 'wallet' },
        { name: 'Analytics', route: '/brand/analytics', icon: 'analytics' }
      ];
      
    case UserRole.INFLUENCER:
      return [
        ...commonNav,
        { name: 'Dashboard', route: '/influencer/dashboard', icon: 'dashboard' },
        { name: 'Jobs', route: '/influencer/jobs', icon: 'work' },
        { name: 'My Applications', route: '/influencer/applications', icon: 'assignment' },
        { name: 'Wallet', route: '/influencer/wallet', icon: 'wallet' },
        { name: 'Profile', route: '/influencer/profile', icon: 'person' }
      ];
      
    case UserRole.CREATOR:
      return [
        ...commonNav,
        { name: 'Dashboard', route: '/creator/dashboard', icon: 'dashboard' },
        { name: 'Campaigns', route: '/creator/campaigns', icon: 'campaign' },
        { name: 'Jobs', route: '/creator/jobs', icon: 'work' },
        { name: 'Team', route: '/creator/team', icon: 'group' },
        { name: 'Wallet', route: '/creator/wallet', icon: 'wallet' }
      ];
      
    default:
      return commonNav;
  }
};

export default {
  UserRole,
  roleHierarchy,
  rolePermissions,
  requireRole,
  requirePermission,
  requireMinRole,
  getDashboardRoute,
  getNavigationByRole
};
