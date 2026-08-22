function normalizePermissionKey(permissionKey) {
  return String(permissionKey || "").trim();
}

function can(user, permissionKey) {
  const requiredPermission = normalizePermissionKey(permissionKey);
  if (!requiredPermission || !Array.isArray(user?.permissions)) return false;

  return user.permissions.some(
    (permission) => normalizePermissionKey(permission) === requiredPermission,
  );
}

function requirePermission(permissionKey) {
  const requiredPermission = normalizePermissionKey(permissionKey);
  if (!requiredPermission) {
    throw new TypeError("Ein Berechtigungsschluessel ist erforderlich.");
  }

  return function permissionMiddleware(req, res, next) {
    if (!can(req.user, requiredPermission)) {
      return res.status(403).json({
        error: "Fuer diese Aktion fehlt die erforderliche Berechtigung.",
        permission: requiredPermission,
      });
    }

    next();
  };
}

function requireAnyPermission(permissionKeys) {
  const requiredPermissions = [...new Set(
    (Array.isArray(permissionKeys) ? permissionKeys : [])
      .map(normalizePermissionKey)
      .filter(Boolean),
  )];
  if (!requiredPermissions.length) {
    throw new TypeError("Mindestens ein Berechtigungsschluessel ist erforderlich.");
  }

  return function anyPermissionMiddleware(req, res, next) {
    if (!requiredPermissions.some((permission) => can(req.user, permission))) {
      return res.status(403).json({
        error: "Fuer diese Aktion fehlt die erforderliche Berechtigung.",
        permissions: requiredPermissions,
      });
    }
    next();
  };
}

module.exports = { can, requirePermission, requireAnyPermission };
