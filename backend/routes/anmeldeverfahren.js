const express = require("express");
const createAnmeldeverfahrenController = require("../controllers/anmeldeverfahrenController");

function createAnmeldeverfahrenRouter({ authenticateToken, requireAdmin, getPool }) {
  const router = express.Router();
  const controller = createAnmeldeverfahrenController({ getPool });

  router.use(authenticateToken, requireAdmin);

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.get("/:id/schulgruppen", controller.listSchoolGroups);
  router.post("/", controller.create);
  router.post("/:id/start", controller.start);
  router.post("/:id/finish", controller.finish);
  router.put("/:id/schulgruppen/quellschulen", controller.syncSourceSchoolGroups);
  router.put("/:id/schulgruppen/zielschulen", controller.syncTargetSchoolGroups);
  router.put("/:id", controller.update);
  router.delete("/:id", controller.remove);

  return router;
}

module.exports = createAnmeldeverfahrenRouter;
