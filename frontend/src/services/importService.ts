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

  async getPoolSchueler(verfahrenId: number, rundeId?: number | null, token?: string) {
    const response = await apiClient.get("/api/importe/pool/schueler", {
      params: {
        verfahren_id: verfahrenId,
        ...(rundeId ? { runde_id: rundeId } : {}),
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async updatePoolSchueler(id: number, payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.patch(
      `/api/importe/pool/schueler/${encodeURIComponent(String(id))}`,
      payload,
      buildAuthConfig(token),
    );
    return response.data;
  },

  async deletePoolSchueler(id: number, token?: string) {
    const response = await apiClient.delete(
      `/api/importe/pool/schueler/${encodeURIComponent(String(id))}`,
      buildAuthConfig(token),
    );
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

  async importJg4ausSchild(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/pool/schild/jg4", payload, buildAuthConfig(token));
    return response.data;
  },

  async getAnmSchuelerImportSchema(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.get("/api/importe/anm-schueler/schema", {
      params: payload,
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async validateAnmSchuelerImport(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anm-schueler/validate", payload, buildAuthConfig(token));
    return response.data;
  },

  async executeAnmSchuelerImport(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anm-schueler/execute", payload, buildAuthConfig(token));
    return response.data;
  },

  async getAnmSchuelerAnmeldungenSchema(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.get("/api/importe/anm-schueler/anmeldungen/schema", {
      params: payload,
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async validateAnmSchuelerAnmeldungen(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anm-schueler/anmeldungen/validate", payload, buildAuthConfig(token));
    return response.data;
  },

  async executeAnmSchuelerAnmeldungen(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anm-schueler/anmeldungen/execute", payload, buildAuthConfig(token));
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

  async importiereAnmeldungenAusSchild3(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anmeldungen/schild3", payload, buildAuthConfig(token));
    return response.data;
  },

  async validateRueckmeldungenMg(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anmeldungen/rueckmeldungen-mg/validate", payload, buildAuthConfig(token));
    return response.data;
  },

  async executeRueckmeldungenMg(payload: Record<string, unknown>, token?: string) {
    const response = await apiClient.post("/api/importe/anmeldungen/rueckmeldungen-mg/execute", payload, buildAuthConfig(token));
    return response.data;
  },

  async clearSchueler(verfahrenId: number, token?: string) {
    const response = await apiClient.delete("/api/importe/schueler/alle", {
      params: { verfahren_id: verfahrenId },
      ...buildAuthConfig(token),
    });
    return response.data;
  },
};

export default importService;
