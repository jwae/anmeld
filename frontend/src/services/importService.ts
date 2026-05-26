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

export const importService = {
  async getPoolStats(verfahrenId: number, rundeId?: number | null, token?: string) {
    const response = await apiClient.get("/api/importe/pool/statistik", {
      params: {
        verfahren_id: verfahrenId,
        ...(rundeId ? { runde_id: rundeId } : {}),
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async previewPool(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post(
      "/api/importe/pool/vorschau",
      payload,
      buildAuthConfig(token),
    );
    return response.data;
  },

  async importPool(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/pool", payload, buildAuthConfig(token));
    return response.data;
  },

  async getAnmeldungsSchulen(verfahrenId: number, rundeId?: number | null, token?: string) {
    const response = await apiClient.get("/api/importe/anmeldungen/schulen", {
      params: {
        verfahren_id: verfahrenId,
        ...(rundeId ? { runde_id: rundeId } : {}),
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async previewAnmeldungen(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anmeldungen/vorschau", payload, buildAuthConfig(token));
    return response.data;
  },

  async importAnmeldungenSchool(snr: string, payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post(
      `/api/importe/anmeldungen/${encodeURIComponent(String(snr))}`,
      payload,
      buildAuthConfig(token),
    );
    return response.data;
  },

  async importAnmeldungenAlle(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anmeldungen/alle", payload, buildAuthConfig(token));
    return response.data;
  },

  async clearSchueler(token?: string) {
    const response = await apiClient.delete("/api/importe/schueler/alle", buildAuthConfig(token));
    return response.data;
  },
};

export default importService;
