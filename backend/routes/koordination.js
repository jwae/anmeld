const express = require("express");
const createKoordinationController = require("../controllers/koordinationController");

function createKoordinationRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createKoordinationController({ getPool });

  router.get("/uebersicht", requirePermission("verfahren.anzeigen"), controller.uebersicht);
  router.post("/sichtbare-schueler/geocoding", requirePermission("verfahren.bearbeiten"), controller.geocodeVisibleStudents);
  router.get("/offene-faelle", requirePermission("verfahren.anzeigen"), controller.offeneFaelle);
  router.put("/offene-faelle/:id", requirePermission("verfahren.bearbeiten"), controller.updateOffenerFall);
  router.post("/zuordnen", requirePermission("verfahren.bearbeiten"), controller.zuordnen);

  return router;
}

module.exports = createKoordinationRouter;
