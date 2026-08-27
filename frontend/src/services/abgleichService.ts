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

  async updateSchuelerGeocoding(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.post("/api/abgleich/schueler-uebersicht/geocoding", {
      verfahren_id: verfahrenId,
      runde_id: rundeId,
    }, buildAuthConfig(token));
    return response.data;
  },

  async createOffenerFall(
    payload: {
      verfahren_id: number;
      runde_id: number;
      interne_schueler_id: number;
      fallgrund_id: number;
      bemerkung: string;
    },
    token?: string,
  ) {
    const response = await apiClient.post("/api/abgleich/offene-faelle", payload, buildAuthConfig(token));
    return response.data;
  },

  async updateSchueler(
    id: number,
    payload: Record<string, unknown>,
    token?: string,
  ) {
    const response = await apiClient.patch(
      `/api/abgleich/schueler/${encodeURIComponent(String(id))}`,
      payload,
      buildAuthConfig(token),
    );
    return response.data;
  },

  async deleteSchueler(id: number, token?: string) {
    const response = await apiClient.delete(
      `/api/importe/pool/schueler/${encodeURIComponent(String(id))}`,
      buildAuthConfig(token),
    );
    return response.data;
  },
};
