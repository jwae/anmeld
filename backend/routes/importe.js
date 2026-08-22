const express = require("express");
const createImporteController = require("../controllers/importeController");

function createImporteRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createImporteController({ getPool });

  router.get("/pool/statistik", requirePermission("verfahren.anzeigen"), controller.poolStats);
  router.get("/pool/schueler", requirePermission("verfahren.anzeigen"), controller.poolSchuelerList);
  router.patch("/pool/schueler/:id", requirePermission("verfahren.bearbeiten"), controller.updatePoolSchueler);
  router.delete("/pool/schueler/:id", requirePermission("verfahren.bearbeiten"), controller.deletePoolSchueler);
  router.post("/pool/vorschau", requirePermission("verfahren.bearbeiten"), controller.poolPreview);
  router.post("/pool", requirePermission("verfahren.bearbeiten"), controller.poolImport);
  router.post("/pool/schild/jg4", requirePermission("verfahren.bearbeiten"), controller.importJg4ausSchild);
  router.get("/anm-schueler/schema", requirePermission("verfahren.anzeigen"), controller.anmSchuelerImportSchema);
  router.post("/anm-schueler/validate", requirePermission("verfahren.bearbeiten"), controller.anmSchuelerImportValidate);
  router.post("/anm-schueler/execute", requirePermission("verfahren.bearbeiten"), controller.anmSchuelerImportExecute);
  router.get("/anm-schueler/anmeldungen/schema", requirePermission("verfahren.anzeigen"), controller.anmSchuelerAnmeldungenSchema);
  router.post("/anm-schueler/anmeldungen/validate", requirePermission("verfahren.bearbeiten"), controller.anmSchuelerAnmeldungenValidate);
  router.post("/anm-schueler/anmeldungen/execute", requirePermission("verfahren.bearbeiten"), controller.anmSchuelerAnmeldungenExecute);
  router.delete("/schueler/alle", requirePermission("verfahren.bearbeiten"), controller.clearSchuelerDaten);

  router.get("/anmeldungen/schulen", requirePermission("verfahren.anzeigen"), controller.anmeldungenSchulen);
  router.post("/anmeldungen/vorschau", requirePermission("verfahren.bearbeiten"), controller.anmeldungenPreview);
  router.post("/anmeldungen/alle", requirePermission("verfahren.bearbeiten"), controller.anmeldungenImportAll);
  router.post("/anmeldungen/schild3", requirePermission("verfahren.bearbeiten"), controller.importiereAnmeldungenAusSchild3);
  router.post("/anmeldungen/:snr", requirePermission("verfahren.bearbeiten"), controller.anmeldungenImportSchool);

  return router;
}

module.exports = createImporteRouter;
