const express = require("express");
const createAbgleichController = require("../controllers/abgleichController");

function createAbgleichRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createAbgleichController({ getPool });

  router.get("/verfahren-uebersicht", requirePermission("verfahren.anzeigen"), controller.verfahrenUebersicht);
  router.get("/schueler-uebersicht", requirePermission("verfahren.anzeigen"), controller.schuelerUebersicht);
  router.post("/schueler-uebersicht/geocoding", requirePermission("verfahren.bearbeiten"), controller.schuelerGeocoding);
  router.patch("/schueler/:id", requirePermission("verfahren.bearbeiten"), controller.updateSchueler);
  router.post("/offene-faelle", requirePermission("verfahren.bearbeiten"), controller.createOffenerFall);

  return router;
}

module.exports = createAbgleichRouter;
