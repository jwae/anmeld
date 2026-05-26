const express = require("express");
const createAnmeldeverfahrenController = require("../controllers/anmeldeverfahrenController");

function createAnmeldeverfahrenRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createAnmeldeverfahrenController({ getPool });

  router.use(authenticateToken, requireAdmin);

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.get("/:id/beteiligte-schulen", controller.listParticipatingSchools);
  router.post("/", controller.create);
  router.put("/:id/beteiligte-schulen", controller.syncParticipatingSchools);
  router.put("/:id", controller.update);
  router.delete("/:id", controller.remove);

  return router;
}

module.exports = createAnmeldeverfahrenRouter;
