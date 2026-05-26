import apiClient from "./apiClient";

function buildAuthConfig(token?: string) {
  const trimmedToken = String(token || "").trim();
  if (!trimmedToken) return {};
  return {
    headers: {
      Authorization: `Bearer ${trimmedToken}`,
    },
  };
}

export default {
  async getVerfahrenUebersicht(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get("/api/abgleich/verfahren-uebersicht", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getSchuelerUebersicht(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get("/api/abgleich/schueler-uebersicht", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },
};
