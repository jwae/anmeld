const express = require("express");
const createKoordinationController = require("../controllers/koordinationController");

function createKoordinationRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createKoordinationController({ getPool });

  router.use(authenticateToken, requireAdmin);
  router.get("/uebersicht", controller.uebersicht);
  router.post("/sichtbare-schueler/geocoding", controller.geocodeVisibleStudents);
  router.get("/offene-faelle", controller.offeneFaelle);
  router.put("/offene-faelle/:id", controller.updateOffenerFall);
  router.post("/zuordnen", controller.zuordnen);

  return router;
}

module.exports = createKoordinationRouter;
