const express = require("express");
const createAnmelderundenController = require("../controllers/anmelderundenController");

function createAnmelderundenRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createAnmelderundenController({ getPool });

  router.use(authenticateToken, requireAdmin);

  router.get("/anmeldeverfahren/:verfahrenId/runden", controller.listByVerfahren);
  router.post("/anmeldeverfahren/:verfahrenId/runden", controller.create);
  router.post("/anmelderunden/:id/start", controller.startRound);
  router.put("/anmelderunden/:id", controller.update);
  router.delete("/anmelderunden/:id", controller.remove);

  return router;
}

module.exports = createAnmelderundenRouter;
