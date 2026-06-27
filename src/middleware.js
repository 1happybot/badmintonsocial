export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

export function requireAdminAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect('/admin/login');
  }
  next();
}

export function attachUser(getUser, getAdmin) {
  return async function (req, res, next) {
    res.locals.currentUser = null;
    res.locals.currentAdmin = null;
    res.locals.flash = req.session.flash || null;
    req.session.flash = null;
    if (req.session.userId) {
      try {
        res.locals.currentUser = await getUser(req.session.userId);
      } catch (e) {
        res.locals.currentUser = null;
      }
    }
    if (req.session.adminId && typeof getAdmin === 'function') {
      try {
        res.locals.currentAdmin = await getAdmin(req.session.adminId);
      } catch (e) {
        res.locals.currentAdmin = null;
      }
    }
    next();
  };
}

export function flash(req, type, message) {
  req.session.flash = { type, message };
}
