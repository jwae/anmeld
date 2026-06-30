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
};

export default auswertungenService;
