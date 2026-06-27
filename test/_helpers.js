import express from 'express';

import { getBadgeIcon } from '../src/badge-icons.js';

export function buildApp(router, { session = {}, renderViews = false } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  if (renderViews) {
    app.set('views', new URL('../src/views', import.meta.url).pathname);
  }
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.session = session;
    next();
  });
  app.use((req, res, next) => {
    res.locals.currentUser = null;
    res.locals.currentAdmin = null;
    res.locals.flash = null;
    res.locals.getBadgeIcon = getBadgeIcon;
    next();
  });
  app.use(router);
  app.use((_req, res) => res.status(404).send('not found'));
  return app;
}
