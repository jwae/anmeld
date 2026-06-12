const express = require("express");
const createImporteController = require("../controllers/importeController");

function createImporteRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createImporteController({ getPool });

  router.use(authenticateToken, requireAdmin);

  router.get("/pool/statistik", controller.poolStats);
  router.get("/pool/schueler", controller.poolSchuelerList);
  router.post("/pool/vorschau", controller.poolPreview);
  router.post("/pool", controller.poolImport);
  router.post("/pool/schild/jg4", controller.importJg4ausSchild);
  router.delete("/schueler/alle", controller.clearSchuelerDaten);

  router.get("/anmeldungen/schulen", controller.anmeldungenSchulen);
  router.post("/anmeldungen/vorschau", controller.anmeldungenPreview);
  router.post("/anmeldungen/alle", controller.anmeldungenImportAll);
  router.post("/anmeldungen/schild3", controller.importiereAnmeldungenAusSchild3);
  router.post("/anmeldungen/:snr", controller.anmeldungenImportSchool);

  return router;
}

module.exports = createImporteRouter;
