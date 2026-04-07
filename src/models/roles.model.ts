import Model from "../helpers/model";
import { logger } from "../utils/logger";

// Permission types
export type Permission = 
  | 'READ' 
  | 'WRITE' 
  | 'DELETE' 
  | 'DELETE_USER' 
  | 'MANAGE_ROLES' 
  | 'MANAGE_SYSTEM' 
  | 'VIEW_ANALYTICS' 
  | 'MANAGE_PAYMENTS' 
  | 'MANAGE_CAMPAIGNS' 
  | 'MANAGE_USERS' 
  | 'MANAGE_CONTENT' 
  | 'MANAGE_SETTINGS'
  | 'ASSIGN_ROLES'
  | 'EXPORT_DATA'
  | 'VIEW_FINANCIAL_DATA'
  | 'APPROVE_CAMPAIGNS'
  | 'MODERATE_CONTENT'
  | 'SEND_NOTIFICATIONS'
  | 'MANAGE_NOTIFICATIONS';

// Role interface
export interface Role {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Access Right interface
export interface AccessRight {
  id: number;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// User role interface
export interface UserRole {
  id: number;
  user_id: string;
  role_id: number;
  assigned_by: string;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role?: Role; // Joined role data
}

class RolesModel extends Model {
  
  /**
   * Get all roles
   */
  async getAllRoles(): Promise<any> {
    try {
      const roles = await this.callQuerySafe(`SELECT * FROM roles WHERE is_active = TRUE ORDER BY name ASC`);
      return this.makeResponse(200, "Roles retrieved successfully", roles);
    } catch (error) {
      logger.error("Error in getAllRoles:", error);
      return this.makeResponse(500, "Error retrieving roles");
    }
  }

  /**
   * Get role by ID
   */
  async getRoleById(roleId: number): Promise<any> {
    try {
      const roles:any = await this.callQuerySafe(`SELECT * FROM roles WHERE id = ${roleId} AND is_active = TRUE`);
      
      if (roles.length === 0) {
        return this.makeResponse(404, "Role not found");
      }
      
      return this.makeResponse(200, "Role retrieved successfully", roles[0]);
    } catch (error) {
      logger.error("Error in getRoleById:", error);
      return this.makeResponse(500, "Error retrieving role");
    }
  }

  /**
   * Get role by name
   */
  async getRoleByName(roleName: string): Promise<any> {
    try {
      const roles:any = await this.callQuerySafe(`SELECT * FROM roles WHERE name = '${roleName}' AND is_active = TRUE`);
      
      if (roles.length === 0) {
        return this.makeResponse(404, "Role not found");
      }
      
      return this.makeResponse(200, "Role retrieved successfully", roles[0]);
    } catch (error) {
      logger.error("Error in getRoleByName:", error);
      return this.makeResponse(500, "Error retrieving role");
    }
  }

  /**
   * Create a new role
   */
  async createRole(data: { name: string; description: string }): Promise<any> {
    try {
      const { name, description } = data;
      
      // Check if role already exists
      const existingRole:any = await this.callQuerySafe(`SELECT id FROM roles WHERE name = '${name}'`);
      
      if (existingRole.length > 0) {
        return this.makeResponse(400, "Role with this name already exists");
      }
      
      const newRole = {
        name,
        description,
        is_active: true
      };
      
      const roleId = await this.insertData("roles", newRole);
      
      return this.makeResponse(201, "Role created successfully", { roleId });
    } catch (error) {
      logger.error("Error in createRole:", error);
      return this.makeResponse(500, "Error creating role");
    }
  }

  /**
   * Update a role
   */
  async updateRole(roleId: number, data: { name?: string; description?: string; is_active?: boolean }): Promise<any> {
    try {
      const { name, description, is_active } = data;
      
      // Check if role exists
      const existingRole:any = await this.callQuerySafe(`SELECT id FROM roles WHERE id = ${roleId}`);
      
      if (existingRole.length === 0) {
        return this.makeResponse(404, "Role not found");
      }
      
      // Check if new name conflicts with existing role
      if (name) {
        const nameConflict:any = await this.callQuerySafe(`SELECT id FROM roles WHERE name = '${name}' AND id != ${roleId}`);
        
        if (nameConflict.length > 0) {
          return this.makeResponse(400, "Role with this name already exists");
        }
      }
      
      const updateData: any = {};
      if (name) updateData.name = name;
      if (description) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;
      updateData.updated_at = new Date();
      
      await this.updateData("roles", `id = ${roleId}`, updateData);
      
      return this.makeResponse(200, "Role updated successfully");
    } catch (error) {
      logger.error("Error in updateRole:", error);
      return this.makeResponse(500, "Error updating role");
    }
  }

  /**
   * Delete a role (soft delete)
   */
  async deleteRole(roleId: number): Promise<any> {
    try {
      // Check if role exists
      const existingRole:any = await this.callQuerySafe(`SELECT id FROM roles WHERE id = ${roleId}`);
      
      if (existingRole.length === 0) {
        return this.makeResponse(404, "Role not found");
      }
      
      // Check if role is assigned to any users
      const assignedUsers:any = await this.callQuerySafe(`SELECT COUNT(*) as count FROM user_roles WHERE role_id = ${roleId} AND is_active = TRUE`);
      
      if (assignedUsers[0].count > 0) {
        return this.makeResponse(400, "Cannot delete role that is assigned to users");
      }
      
      // Soft delete
      await this.updateData("roles", `id = ${roleId}`, { is_active: false, updated_at: new Date() });
      
      return this.makeResponse(200, "Role deleted successfully");
    } catch (error) {
      logger.error("Error in deleteRole:", error);
      return this.makeResponse(500, "Error deleting role");
    }
  }

  /**
   * Get all access rights
   */
  async getAllAccessRights(): Promise<any> {
    try {
      const accessRights:any = await this.callQuerySafe(`SELECT * FROM access_rights WHERE is_active = TRUE ORDER BY category, name`);
      return this.makeResponse(200, "Access rights retrieved successfully", accessRights);
    } catch (error) {
      logger.error("Error in getAllAccessRights:", error);
      return this.makeResponse(500, "Error retrieving access rights");
    }
  }

  /**
   * Get access rights by category
   */
  async getAccessRightsByCategory(category: string): Promise<any> {
    try {
      const accessRights:any = await this.callQuerySafe(`SELECT * FROM access_rights WHERE category = '${category}' AND is_active = TRUE ORDER BY name`);
      return this.makeResponse(200, "Access rights retrieved successfully", accessRights);
    } catch (error) {
      logger.error("Error in getAccessRightsByCategory:", error);
      return this.makeResponse(500, "Error retrieving access rights");
    }
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(roleId: number): Promise<any> {
    try {
      const permissions:any = await this.callQuerySafe(`
        SELECT ar.* 
        FROM access_rights ar
        JOIN role_permissions rp ON ar.id = rp.access_right_id
        WHERE rp.role_id = ${roleId} AND ar.is_active = TRUE
        ORDER BY ar.category, ar.name
      `);
      
      return this.makeResponse(200, "Role permissions retrieved successfully", permissions);
    } catch (error) {
      logger.error("Error in getRolePermissions:", error);
      return this.makeResponse(500, "Error retrieving role permissions");
    }
  }

  /**
   * Assign permission to role
   */
  async assignPermissionToRole(roleId: number, accessRightId: number): Promise<any> {
    try {
      // Check if role and access right exist
      const role:any = await this.callQuerySafe(`SELECT id FROM roles WHERE id = ${roleId} AND is_active = TRUE`);
      const accessRight:any = await this.callQuerySafe(`SELECT id FROM access_rights WHERE id = ${accessRightId} AND is_active = TRUE`);
      
      if (role.length === 0) {
        return this.makeResponse(404, "Role not found or inactive");
      }
      
      if (accessRight.length === 0) {
        return this.makeResponse(404, "Access right not found or inactive");
      }
      
      // Check if permission is already assigned
      const existingPermission:any = await this.callQuerySafe(`SELECT id FROM role_permissions WHERE role_id = ${roleId} AND access_right_id = ${accessRightId}`);
      
      if (existingPermission.length > 0) {
        return this.makeResponse(400, "Permission already assigned to role");
      }
      
      // Assign permission
      await this.insertData("role_permissions", {
        role_id: roleId,
        access_right_id: accessRightId
      });
      
      return this.makeResponse(201, "Permission assigned to role successfully");
    } catch (error) {
      logger.error("Error in assignPermissionToRole:", error);
      return this.makeResponse(500, "Error assigning permission to role");
    }
  }

  /**
   * Remove permission from role
   */
  async removePermissionFromRole(roleId: number, accessRightId: number): Promise<any> {
    try {
      const result:any       = await this.callQuerySafe(`DELETE FROM role_permissions WHERE role_id = ${roleId} AND access_right_id = ${accessRightId}`);
      
      if (result.affectedRows === 0) {
        return this.makeResponse(404, "Role permission not found");
      }
      
      return this.makeResponse(200, "Permission removed from role successfully");
    } catch (error) {
      logger.error("Error in removePermissionFromRole:", error);
      return this.makeResponse(500, "Error removing permission from role");
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<any> {
    try {
      const userRoles:any = await this.callQuerySafe(`
        SELECT ur.*, r.name as role_name, r.description as role_description
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = '${userId}' AND ur.is_active = TRUE AND r.is_active = TRUE
        ORDER BY ur.assigned_at DESC
      `);
      
      return this.makeResponse(200, "User roles retrieved successfully", userRoles);
    } catch (error) {
      logger.error("Error in getUserRoles:", error);
      return this.makeResponse(500, "Error retrieving user roles");
    }
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(userId: string, roleId: number, assignedBy: string, expiresAt?: string): Promise<any> {
    try {
      // Check if role exists and is active
      const role:any = await this.callQuerySafe(`SELECT id FROM roles WHERE id = ${roleId} AND is_active = TRUE`);
      
      if (role.length === 0) {
        return this.makeResponse(404, "Role not found or inactive");
      }
      
      // Check if user already has this role
      const existingRole:any = await this.callQuerySafe(`SELECT id FROM user_roles WHERE user_id = '${userId}' AND role_id = ${roleId}`);
      
      if (existingRole.length > 0) {
        // Update existing role assignment
        const updateData: any = {
          assigned_by: assignedBy,
          is_active: true,
          updated_at: new Date()
        };
        
        if (expiresAt) updateData.expires_at = expiresAt;
        
        await this.updateData("user_roles", `user_id = '${userId}' AND role_id = ${roleId}`, updateData);
        return this.makeResponse(200, "User role updated successfully");
      }
      
      // Create new role assignment
      const newUserRole = {
        user_id: userId,
        role_id: roleId,
        assigned_by: assignedBy,
        expires_at: expiresAt || null,
        is_active: true
      };
      
      await this.insertData("user_roles", newUserRole);
      
      return this.makeResponse(201, "Role assigned to user successfully");
    } catch (error) {
      logger.error("Error in assignRoleToUser:", error);
      return this.makeResponse(500, "Error assigning role to user");
    }
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleId: number): Promise<any> {
    try {
      const result:any = await this.callQuerySafe(`UPDATE user_roles SET is_active = FALSE, updated_at = NOW() WHERE user_id = '${userId}' AND role_id = ${roleId} AND is_active = TRUE`);
      
      if (result.affectedRows === 0) {
        return this.makeResponse(404, "User role not found or already inactive");
      }
      
      return this.makeResponse(200, "Role removed from user successfully");
    } catch (error) {
      logger.error("Error in removeRoleFromUser:", error);
      return this.makeResponse(500, "Error removing role from user");
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, permission: Permission): Promise<boolean> {
    try {
      const userPermissions:any = await this.callQuerySafe(`
        SELECT ar.name
        FROM access_rights ar
        JOIN role_permissions rp ON ar.id = rp.access_right_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = '${userId}' 
        AND ur.is_active = TRUE 
        AND ar.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND ar.name = '${permission}'
      `);
      
      return userPermissions.length > 0;
    } catch (error) {
      logger.error("Error in hasPermission:", error);
      return false;
    }
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<any> {
    try {
      const userPermissions:any = await this.callQuerySafe(`
        SELECT DISTINCT ar.name, ar.description, ar.category
        FROM access_rights ar
        JOIN role_permissions rp ON ar.id = rp.access_right_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = '${userId}' 
        AND ur.is_active = TRUE 
        AND ar.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY ar.category, ar.name
      `);
      
      return this.makeResponse(200, "User permissions retrieved successfully", userPermissions);
    } catch (error) {
      logger.error("Error in getUserPermissions:", error);
      return this.makeResponse(500, "Error retrieving user permissions");
    }
  }

  /**
   * Check if user has role
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const userRoles:any = await this.callQuerySafe(`
        SELECT COUNT(*) as count
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = '${userId}' 
        AND r.name = '${roleName}'
        AND ur.is_active = TRUE 
        AND r.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      `);
      
      return userRoles[0].count > 0;
    } catch (error) {
      logger.error("Error in hasRole:", error);
      return false;
    }
  }

  /**
   * Get all users with a specific role
   */
  async getUsersWithRole(roleName: string): Promise<any> {
    try {
      const users:any = await this.callQuerySafe(`
        SELECT ur.user_id, ur.assigned_at, ur.expires_at, r.name as role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = '${roleName}'
        AND ur.is_active = TRUE 
        AND r.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY ur.assigned_at DESC
      `);
      
      return this.makeResponse(200, "Users with role retrieved successfully", users);
    } catch (error) {
      logger.error("Error in getUsersWithRole:", error);
      return this.makeResponse(500, "Error retrieving users with role");
    }
  }

  /**
   * Get role statistics
   */
  async getRoleStatistics(): Promise<any> {
    try {
      const stats:any = await this.callQuerySafe(`
        SELECT 
          r.name,
          r.description,
          COUNT(ur.user_id) as user_count,
          r.is_active
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.is_active = TRUE
        GROUP BY r.id, r.name, r.description, r.is_active
        ORDER BY user_count DESC
      `);
      
      return this.makeResponse(200, "Role statistics retrieved successfully", stats);
    } catch (error) {
      logger.error("Error in getRoleStatistics:", error);
      return this.makeResponse(500, "Error retrieving role statistics");
    }
  }

  /**
   * Get access rights statistics
   */
  async getAccessRightsStatistics(): Promise<any> {
    try {
      const stats:any    = await this.callQuerySafe(`
        SELECT 
          ar.name,
          ar.description,
          ar.category,
          COUNT(rp.role_id) as role_count,
          ar.is_active
        FROM access_rights ar
        LEFT JOIN role_permissions rp ON ar.id = rp.access_right_id
        GROUP BY ar.id, ar.name, ar.description, ar.category, ar.is_active
        ORDER BY ar.category, ar.name
      `);
      
      return this.makeResponse(200, "Access rights statistics retrieved successfully", stats);
    } catch (error) {
      logger.error("Error in getAccessRightsStatistics:", error);
      return this.makeResponse(500, "Error retrieving access rights statistics");
    }
  }
}

export default RolesModel; 