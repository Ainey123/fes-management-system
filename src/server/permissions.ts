export enum Permission {
  VIEW = 'VIEW',
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  CREATE_FOLDER = 'CREATE_FOLDER',
  RENAME_FOLDER = 'RENAME_FOLDER',
  MOVE = 'MOVE',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS',
}

export const allPermissions = Object.values(Permission);
