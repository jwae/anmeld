const express = require('express');
const KapazitaetenController = require('../controllers/kapazitaetenController');

function createKapazitaetenRoutes(pool, { requirePermission }) {
  const router = express.Router();
  const controller = new KapazitaetenController(pool);

  router.get('/kapazitaeten', requirePermission('verfahren.anzeigen'), (req, res) => controller.getKapazitaeten(req, res));
  router.get('/kapazitaeten/:id', requirePermission('verfahren.anzeigen'), (req, res) => controller.getKapazitaet(req, res));
  router.post('/kapazitaeten', requirePermission('verfahren.bearbeiten'), (req, res) => controller.createKapazitaet(req, res));
  router.put('/kapazitaeten/:id', requirePermission('verfahren.bearbeiten'), (req, res) => controller.updateKapazitaet(req, res));
  router.delete('/kapazitaeten/:id', requirePermission('verfahren.bearbeiten'), (req, res) => controller.deleteKapazitaet(req, res));
  
  router.get('/anmeldeverfahren/:id/schulen', requirePermission('verfahren.anzeigen'), (req, res) => controller.getVerfahrenSchulen(req, res));
  router.post('/anmeldeverfahren/:id/kapazitaeten/import/vorschau', requirePermission('verfahren.bearbeiten'), (req, res) => controller.previewImport(req, res));
  router.post('/anmeldeverfahren/:id/kapazitaeten/import', requirePermission('verfahren.bearbeiten'), (req, res) => controller.importCsv(req, res));

  return router;
}

module.exports = createKapazitaetenRoutes;
