const express = require('express');
const KapazitaetenController = require('../controllers/kapazitaetenController');

function createKapazitaetenRoutes(pool) {
  const router = express.Router();
  const controller = new KapazitaetenController(pool);

  router.get('/kapazitaeten', (req, res) => controller.getKapazitaeten(req, res));
  router.get('/kapazitaeten/:id', (req, res) => controller.getKapazitaet(req, res));
  router.post('/kapazitaeten', (req, res) => controller.createKapazitaet(req, res));
  router.put('/kapazitaeten/:id', (req, res) => controller.updateKapazitaet(req, res));
  router.delete('/kapazitaeten/:id', (req, res) => controller.deleteKapazitaet(req, res));
  
  router.get('/anmeldeverfahren/:id/schulen', (req, res) => controller.getVerfahrenSchulen(req, res));
  router.post('/anmeldeverfahren/:id/kapazitaeten/import/vorschau', (req, res) => controller.previewImport(req, res));
  router.post('/anmeldeverfahren/:id/kapazitaeten/import', (req, res) => controller.importCsv(req, res));

  return router;
}

module.exports = createKapazitaetenRoutes;
