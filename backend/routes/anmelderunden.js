const express = require("express");
const createAnmelderundenController = require("../controllers/anmelderundenController");

function createAnmelderundenRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createAnmelderundenController({ getPool });

  router.get("/anmeldeverfahren/:verfahrenId/runden", requirePermission("verfahren.anzeigen"), controller.listByVerfahren);
  router.post("/anmeldeverfahren/:verfahrenId/runden", requirePermission("verfahren.bearbeiten"), controller.create);
  router.post("/anmelderunden/:id/start", requirePermission("verfahren.bearbeiten"), controller.startRound);
  router.put("/anmelderunden/:id", requirePermission("verfahren.bearbeiten"), controller.update);
  router.delete("/anmelderunden/:id", requirePermission("verfahren.bearbeiten"), controller.remove);

  return router;
}

module.exports = createAnmelderundenRouter;
