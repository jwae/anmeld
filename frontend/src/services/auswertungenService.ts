import apiClient from "./apiClient";

type AuthConfig = {
  headers?: Record<string, string>;
};

export type AuswertungFormat = "pdf" | "excel" | "word";

export type AuswertungOption = {
  key: string;
  label: string;
};

export type AuswertungsKachel = {
  id: string;
  title: string;
  description: string;
  formats: AuswertungFormat[];
  options: AuswertungOption[];
};

export type AuswertungsCatalogResponse = {
  cards: AuswertungsKachel[];
};

export type AuswertungsGenerateResponse = {
  message: string;
  placeholder: true;
  request: {
    verfahrenId: number;
    rundeId: number;
    bereich: string;
    auswertung: string;
    format: AuswertungFormat;
  };
};

export type AuswertungsDownloadResponse = {
  blob: Blob;
  contentType: string;
  fileName: string;
};

export type SchuelerRundenuebersichtRow = {
  lfd_nr: number;
  interne_schueler_id: number;
  externe_schueler_id: string;
  name_vorname: string;
  geburtsdatum: string;
  abgebende_schule_nr: string;
  abgebende_schule_name: string;
  r1_status: string;
  r1_schule: string;
  r2_status: string;
  r2_schule: string;
  r3_status: string;
  r3_schule: string;
};

export type SchuelerRundenuebersichtResponse = {
  title: string;
  verfahren: {
    id: number;
    bezeichnung: string;
    schuljahr: string;
  };
  generated_at: string;
  total: number;
  rows: SchuelerRundenuebersichtRow[];
};

export type OffeneAnmeldungenRow = {
  lfd_nr: number;
  interne_schueler_id: number;
  externe_schueler_id: string;
  name_vorname: string;
  geburtsdatum: string;
  abgebende_schule_nr: string;
  abgebende_schule_name: string;
  anmeldestatus: string;
  schule: string;
  bemerkung: string;
};

export type OffeneAnmeldungenResponse = {
  title: string;
  verfahren: {
    id: number;
    bezeichnung: string;
    schuljahr: string;
  };
  runde: {
    id: number;
    bezeichnung: string;
    runden_nummer: number;
  };
  generated_at: string;
  total: number;
  rows: OffeneAnmeldungenRow[];
};

export type PoolSchuelerAktuelleRundeResponse = {
  title: string;
  verfahren: {
    id: number;
    bezeichnung: string;
    schuljahr: string;
  };
  runde: {
    id: number;
    bezeichnung: string;
    runden_nummer: number;
  };
  generated_at: string;
  total: number;
  rows: OffeneAnmeldungenRow[];
};

export type SchuelerNachHerkunftsschuleResponse = {
  title: string;
  verfahren: {
    id: number;
    bezeichnung: string;
    schuljahr: string;
  };
  runde: {
    id: number;
    bezeichnung: string;
    runden_nummer: number;
  };
  generated_at: string;
  total: number;
  rows: OffeneAnmeldungenRow[];
};

export type SchulgruppenRow = {
  snr: string;
  schule: string;
  jahrgang: string;
  gesamtkapazitaet: number;
  maximale_klassen: number;
  anmeldungen_gesamt: number;
  freie_plaetze: number;
  warteliste: number;
  le: number;
  zd: number;
};

export type SchulgruppenResponse = {
  title: string;
  verfahren: {
    id: number;
    bezeichnung: string;
    schuljahr: string;
  };
  runde: {
    id: number;
    bezeichnung: string;
    runden_nummer: number;
  };
  generated_at: string;
  total: number;
  rows: SchulgruppenRow[];
};

function buildAuthConfig(token?: string): AuthConfig {
  const trimmedToken = String(token || "").trim();
  if (!trimmedToken) return {};
  return {
    headers: {
      Authorization: `Bearer ${trimmedToken}`,
    },
  };
}

const auswertungenService = {
  async getCatalog(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get<AuswertungsCatalogResponse>("/api/auswertungen/catalog", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getSchulgruppen(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get<SchulgruppenResponse>("/api/auswertungen/schulgruppen", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async generate(
    payload: {
      verfahren_id: number;
      runde_id: number;
      bereich: string;
      auswertung: string;
      format: AuswertungFormat;
    },
    token?: string,
  ) {
    const response = await apiClient.post<AuswertungsGenerateResponse>(
      "/api/auswertungen/generate",
      payload,
      buildAuthConfig(token),
    );
    return response.data;
  },

  async download(
    payload: {
      verfahren_id: number;
      runde_id: number;
      bereich: string;
      auswertung: string;
      format: AuswertungFormat;
    },
    token?: string,
  ): Promise<AuswertungsDownloadResponse> {
    const response = await apiClient.post(
      "/api/auswertungen/download",
      payload,
      {
        ...buildAuthConfig(token),
        responseType: "blob",
      },
    );

    const disposition = String(response.headers["content-disposition"] || "");
    const fileNameMatch = disposition.match(/filename="([^"]+)"/i);

    return {
      blob: response.data as Blob,
      contentType: String(response.headers["content-type"] || ""),
      fileName: String(fileNameMatch?.[1] || "auswertung-download"),
    };
  },

  async getSchuelerRundenuebersicht(verfahrenId: number, token?: string) {
    const response = await apiClient.get<SchuelerRundenuebersichtResponse>("/api/auswertungen/schueler-rundenuebersicht", {
      params: {
        verfahren_id: verfahrenId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getOffeneAnmeldungen(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get<OffeneAnmeldungenResponse>("/api/auswertungen/offene-anmeldungen", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getPoolSchuelerAktuelleRunde(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get<PoolSchuelerAktuelleRundeResponse>("/api/auswertungen/pool-schueler-aktuelle-runde", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getSchuelerNachHerkunftsschule(verfahrenId: number, rundeId: number, token?: string) {
    const response = await apiClient.get<SchuelerNachHerkunftsschuleResponse>("/api/auswertungen/schueler-nach-herkunftsschule", {
      params: {
        verfahren_id: verfahrenId,
        runde_id: rundeId,
      },
      ...buildAuthConfig(token),
    });
    return response.data;
  },
};

export default auswertungenService;
