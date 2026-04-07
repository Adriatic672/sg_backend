import express, { Request, Response } from 'express';
import RolesModel from '../models/roles.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import { logger } from '../utils/logger';

const router = express.Router();
const rolesModel = new RolesModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

// Role Management Routes
router.get('/roles', applyJWTConditionally, getAllRoles);
router.get('/roles/:id', applyJWTConditionally, getRoleById);
router.post('/roles', applyJWTConditionally, createRole);
router.put('/roles/:id', applyJWTConditionally, updateRole);
router.delete('/roles/:id', applyJWTConditionally, deleteRole);

// Access Rights Management Routes
router.get('/access-rights', applyJWTConditionally, getAllAccessRights);
router.get('/access-rights/category/:category', applyJWTConditionally, getAccessRightsByCategory);
router.get('/roles/:id/permissions', applyJWTConditionally, getRolePermissions);
router.post('/roles/:id/permissions', applyJWTConditionally, assignPermissionToRole);
router.delete('/roles/:roleId/permissions/:accessRightId', applyJWTConditionally, removePermissionFromRole);

// User Role Management Routes
router.get('/users/:userId/roles', applyJWTConditionally, getUserRoles);
router.post('/users/:userId/roles', applyJWTConditionally, assignRoleToUser);
router.post('/assign-user-role', applyJWTConditionally, assignUserRole);
router.delete('/users/:userId/roles/:roleId', applyJWTConditionally, removeRoleFromUser);
router.get('/users/:userId/permissions', applyJWTConditionally, getUserPermissions);
router.get('/roles/:roleName/users', applyJWTConditionally, getUsersWithRole);

// Permission Checking Routes
router.get('/users/:userId/has-permission/:permission', applyJWTConditionally, checkUserPermission);
router.get('/users/:userId/has-role/:roleName', applyJWTConditionally, checkUserRole);

// Statistics Routes
router.get('/statistics/roles', applyJWTConditionally, getRoleStatistics);
router.get('/statistics/access-rights', applyJWTConditionally, getAccessRightsStatistics);

// Role Management Functions
async function getAllRoles(req: Request, res: Response) {
  try {
    logger.info('Getting all roles');
    const result = await rolesModel.getAllRoles();
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getAllRoles:', error);
    res.status(500).json({ message: 'Error retrieving roles', error });
  }
}

async function getRoleById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    logger.info(`Getting role by ID: ${id}`);
    const result = await rolesModel.getRoleById(parseInt(id));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getRoleById:', error);
    res.status(500).json({ message: 'Error retrieving role', error });
  }
}

async function createRole(req: Request, res: Response) {
  try {
    const { name, description } = req.body;
    logger.info(`Creating new role: ${name}`);
    
    if (!name || !description) {
      return res.status(400).json({ message: 'Name and description are required' });
    }
    
    const result = await rolesModel.createRole({ name, description });
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in createRole:', error);
    res.status(500).json({ message: 'Error creating role', error });
  }
}

async function updateRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;
    logger.info(`Updating role ID: ${id}`);
    
    const result = await rolesModel.updateRole(parseInt(id), { name, description, is_active });
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in updateRole:', error);
    res.status(500).json({ message: 'Error updating role', error });
  }
}

async function deleteRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    logger.info(`Deleting role ID: ${id}`);
    
    const result = await rolesModel.deleteRole(parseInt(id));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in deleteRole:', error);
    res.status(500).json({ message: 'Error deleting role', error });
  }
}

// Access Rights Management Functions
async function getAllAccessRights(req: Request, res: Response) {
  try {
    logger.info('Getting all access rights');
    const result = await rolesModel.getAllAccessRights();
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getAllAccessRights:', error);
    res.status(500).json({ message: 'Error retrieving access rights', error });
  }
}

async function getAccessRightsByCategory(req: Request, res: Response) {
  try {
    const { category } = req.params;
    logger.info(`Getting access rights by category: ${category}`);
    const result = await rolesModel.getAccessRightsByCategory(category);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getAccessRightsByCategory:', error);
    res.status(500).json({ message: 'Error retrieving access rights', error });
  }
}

async function getRolePermissions(req: Request, res: Response) {
  try {
    const { id } = req.params;
    logger.info(`Getting permissions for role ID: ${id}`);
    const result = await rolesModel.getRolePermissions(parseInt(id));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getRolePermissions:', error);
    res.status(500).json({ message: 'Error retrieving role permissions', error });
  }
}

async function assignPermissionToRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { accessRightId } = req.body;
    logger.info(`Assigning permission ${accessRightId} to role ID: ${id}`);
    
    if (!accessRightId) {
      return res.status(400).json({ message: 'Access right ID is required' });
    }
    
    const result = await rolesModel.assignPermissionToRole(parseInt(id), parseInt(accessRightId));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in assignPermissionToRole:', error);
    res.status(500).json({ message: 'Error assigning permission to role', error });
  }
}

async function removePermissionFromRole(req: Request, res: Response) {
  try {
    const { roleId, accessRightId } = req.params;
    logger.info(`Removing permission ${accessRightId} from role ID: ${roleId}`);
    
    const result = await rolesModel.removePermissionFromRole(parseInt(roleId), parseInt(accessRightId));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in removePermissionFromRole:', error);
    res.status(500).json({ message: 'Error removing permission from role', error });
  }
}

// User Role Management Functions
async function getUserRoles(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    logger.info(`Getting roles for user: ${userId}`);
    const result = await rolesModel.getUserRoles(userId);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getUserRoles:', error);
    res.status(500).json({ message: 'Error retrieving user roles', error });
  }
}

async function assignRoleToUser(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const { roleId, assignedBy, expiresAt } = req.body;
    logger.info(`Assigning role ${roleId} to user: ${userId}`);
    
    if (!roleId || !assignedBy) {
      return res.status(400).json({ message: 'Role ID and assigned by are required' });
    }
    
    const result = await rolesModel.assignRoleToUser(userId, parseInt(roleId), assignedBy, expiresAt);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in assignRoleToUser:', error);
    res.status(500).json({ message: 'Error assigning role to user', error });
  }
}

async function assignUserRole(req: Request, res: Response) {
  try {
    const { user_id, role_id } = req.body;
    const assignedBy = (req.body as any).userId; // From JWT middleware
    logger.info(`Assigning role ${role_id} to user: ${user_id}`);
    
    if (!user_id || !role_id) {
      return res.status(400).json({ message: 'user_id and role_id are required' });
    }
    
    const result = await rolesModel.assignRoleToUser(user_id, parseInt(role_id), assignedBy);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in assignUserRole:', error);
    res.status(500).json({ message: 'Error assigning role to user', error });
  }
}

async function removeRoleFromUser(req: Request, res: Response) {
  try {
    const { userId, roleId } = req.params;
    logger.info(`Removing role ${roleId} from user: ${userId}`);
    
    const result = await rolesModel.removeRoleFromUser(userId, parseInt(roleId));
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in removeRoleFromUser:', error);
    res.status(500).json({ message: 'Error removing role from user', error });
  }
}

async function getUserPermissions(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    logger.info(`Getting permissions for user: ${userId}`);
    const result = await rolesModel.getUserPermissions(userId);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getUserPermissions:', error);
    res.status(500).json({ message: 'Error retrieving user permissions', error });
  }
}

async function getUsersWithRole(req: Request, res: Response) {
  try {
    const { roleName } = req.params;
    logger.info(`Getting users with role: ${roleName}`);
    const result = await rolesModel.getUsersWithRole(roleName);
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getUsersWithRole:', error);
    res.status(500).json({ message: 'Error retrieving users with role', error });
  }
}

// Permission Checking Functions
async function checkUserPermission(req: Request, res: Response) {
  try {
    const { userId, permission } = req.params;
    logger.info(`Checking permission ${permission} for user: ${userId}`);
    
    const hasPermission = await rolesModel.hasPermission(userId, permission as any);
    res.status(200).json({ 
      hasPermission, 
      userId, 
      permission 
    });
  } catch (error) {
    logger.error('Error in checkUserPermission:', error);
    res.status(500).json({ message: 'Error checking user permission', error });
  }
}

async function checkUserRole(req: Request, res: Response) {
  try {
    const { userId, roleName } = req.params;
    logger.info(`Checking role ${roleName} for user: ${userId}`);
    
    const hasRole = await rolesModel.hasRole(userId, roleName);
    res.status(200).json({ 
      hasRole, 
      userId, 
      roleName 
    });
  } catch (error) {
    logger.error('Error in checkUserRole:', error);
    res.status(500).json({ message: 'Error checking user role', error });
  }
}

// Statistics Functions
async function getRoleStatistics(req: Request, res: Response) {
  try {
    logger.info('Getting role statistics');
    const result = await rolesModel.getRoleStatistics();
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getRoleStatistics:', error);
    res.status(500).json({ message: 'Error retrieving role statistics', error });
  }
}

async function getAccessRightsStatistics(req: Request, res: Response) {
  try {
    logger.info('Getting access rights statistics');
    const result = await rolesModel.getAccessRightsStatistics();
    res.status(result.status).json(result);
  } catch (error) {
    logger.error('Error in getAccessRightsStatistics:', error);
    res.status(500).json({ message: 'Error retrieving access rights statistics', error });
  }
}

export default router; 