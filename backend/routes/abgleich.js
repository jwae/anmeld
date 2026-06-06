const express = require("express");
const createAbgleichController = require("../controllers/abgleichController");

function createAbgleichRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createAbgleichController({ getPool });

  router.use(authenticateToken, requireAdmin);
  router.get("/verfahren-uebersicht", controller.verfahrenUebersicht);
  router.get("/schueler-uebersicht", controller.schuelerUebersicht);
  router.post("/schueler-uebersicht/geocoding", controller.schuelerGeocoding);

  return router;
}

module.exports = createAbgleichRouter;
