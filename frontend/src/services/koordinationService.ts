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

  async geocodeVisibleStudents(
    payload: {
      verfahren_id: number;
      runde_id: number;
      interne_schueler_ids: number[];
    },
    token?: string,
  ) {
    const response = await apiClient.post("/api/koordination/sichtbare-schueler/geocoding", payload, buildAuthConfig(token));
    return response.data;
  },

  async getOffeneFaelle(
    verfahrenId: number,
    rundeId: number,
    token?: string,
  ) {
    const response = await apiClient.get("/api/koordination/offene-faelle", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async updateOffenerFall(
    fallId: number,
    payload: {
      verfahren_id: number;
      runde_id: number;
      fallstatus_id: number;
      bemerkung: string;
    },
    token?: string,
  ) {
    const response = await apiClient.put(`/api/koordination/offene-faelle/${fallId}`, payload, buildAuthConfig(token));
    return response.data;
  },

  async zuordnen(
    payload: {
      verfahren_id: number;
      runde_id: number;
      interne_schueler_ids: number[];
      zugewiesene_schule_snr: string;
    },
    token?: string,
  ) {
    const response = await apiClient.post("/api/koordination/zuordnen", payload, buildAuthConfig(token));
    return response.data;
  },
};
