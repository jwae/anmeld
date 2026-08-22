const express = require("express");
const createAnmeldeverfahrenController = require("../controllers/anmeldeverfahrenController");

function createAnmeldeverfahrenRouter({ requirePermission, getPool }) {
  const router = express.Router();
  const controller = createAnmeldeverfahrenController({ getPool });

  router.get("/", requirePermission("verfahren.anzeigen"), controller.list);
  router.get("/:id", requirePermission("verfahren.anzeigen"), controller.getById);
  router.get("/:id/schulgruppen", requirePermission("verfahren.anzeigen"), controller.listSchoolGroups);
  router.post("/", requirePermission("verfahren.bearbeiten"), controller.create);
  router.post("/:id/start", requirePermission("verfahren.bearbeiten"), controller.start);
  router.post("/:id/finish", requirePermission("verfahren.bearbeiten"), controller.finish);
  router.patch("/:id/sichtbarkeit", requirePermission("verfahren.bearbeiten"), controller.updateVisibility);
  router.put("/:id/schulgruppen/quellschulen", requirePermission("verfahren.bearbeiten"), controller.syncSourceSchoolGroups);
  router.put("/:id/schulgruppen/zielschulen", requirePermission("verfahren.bearbeiten"), controller.syncTargetSchoolGroups);
  router.put("/:id", requirePermission("verfahren.bearbeiten"), controller.update);
  router.delete("/:id", requirePermission("verfahren.bearbeiten"), controller.remove);

  return router;
}

module.exports = createAnmeldeverfahrenRouter;
