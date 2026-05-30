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
  async getUebersicht(
    verfahrenId: number,
    rundeId: number,
    token?: string,
    selectedSnr?: string,
  ) {
    const response = await apiClient.get("/api/koordination/uebersicht", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
        ...(selectedSnr ? { selected_snr: selectedSnr } : {}),
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async zuordnen(
    payload: {
      verfahren_id: number;
      runde_id: number;
      row_ids: number[];
      schul_nr: string;
    },
    token?: string,
  ) {
    const response = await apiClient.post("/api/koordination/zuordnen", payload, buildAuthConfig(token));
    return response.data;
  },
};
