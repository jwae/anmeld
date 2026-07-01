const express = require("express");
const createAuswertungenController = require("../controllers/auswertungenController");

function createAuswertungenRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createAuswertungenController({ getPool });

  router.use(authenticateToken, requireAdmin);

  router.get("/catalog", controller.catalog);
  router.get("/offene-anmeldungen", controller.offeneAnmeldungen);
  router.get("/schueler-rundenuebersicht", controller.schuelerRundenuebersicht);
  router.post("/generate", controller.generate);
  router.post("/download", controller.download);

  return router;
}

module.exports = createAuswertungenRouter;
