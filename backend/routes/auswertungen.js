const express = require("express");
const createAuswertungenController = require("../controllers/auswertungenController");

function createAuswertungenRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createAuswertungenController({ getPool });

  router.use(requirePermission("verfahren.anzeigen"));

  router.get("/catalog", controller.catalog);
  router.get("/schulgruppen", controller.schulgruppen);
  router.get("/verfahrensuebersicht", controller.verfahrensuebersicht);
  router.get("/offene-anmeldungen", controller.offeneAnmeldungen);
  router.get("/pool-schueler-aktuelle-runde", controller.poolSchuelerAktuelleRunde);
  router.get("/schueler-nach-herkunftsschule", controller.schuelerNachHerkunftsschule);
  router.get("/schuelerliste", controller.schuelerliste);
  router.get("/schulen", controller.schulen);
  router.get("/offene-faelle", controller.offeneFaelle);
  router.get("/schueler-rundenuebersicht", controller.schuelerRundenuebersicht);
  router.post("/generate", controller.generate);
  router.post("/download", controller.download);

  return router;
}

module.exports = createAuswertungenRouter;
