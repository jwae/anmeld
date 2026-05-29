const express = require("express");
const createKoordinationController = require("../controllers/koordinationController");

function createKoordinationRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createKoordinationController({ getPool });

  router.use(authenticateToken, requireAdmin);
  router.get("/uebersicht", controller.uebersicht);
  router.post("/zuordnen", controller.zuordnen);

  return router;
}

module.exports = createKoordinationRouter;
