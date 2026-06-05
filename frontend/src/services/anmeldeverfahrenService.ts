import apiClient from "./apiClient";
import type { AnmeldeStatus, Anmeldeverfahren, Anmeldeverfahrenstyp } from "../types";

type AuthConfig = {
  headers?: Record<string, string>;
};

type VerfahrenPayload = {
  schuljahr: string;
  bezeichnung: string;
  verfahrenstyp: Anmeldeverfahrenstyp;
  status: AnmeldeStatus;
};

export type VerfahrenSchulgruppe = {
  id: number;
  name: string;
  beschreibung: string;
  aktiv: boolean;
  rolle: "Quellschulen" | "Zielschulen";
  schoolSnrs: string[];
};

export type VerfahrenSchulgruppenResponse = {
  quellschulen: VerfahrenSchulgruppe[];
  zielschulen: VerfahrenSchulgruppe[];
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

export const anmeldeverfahrenService = {
  async list(token?: string) {
    const resp = await apiClient.get<{ rows: Anmeldeverfahren[] }>(
      "/api/anmeldeverfahren",
      buildAuthConfig(token),
    );
    return resp.data.rows || [];
  },

  async getById(id: number, token?: string) {
    const resp = await apiClient.get<Anmeldeverfahren>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}`,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async create(payload: VerfahrenPayload, token?: string) {
    const resp = await apiClient.post<{ row: Anmeldeverfahren; message: string }>(
      "/api/anmeldeverfahren",
      payload,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async update(id: number, payload: VerfahrenPayload, token?: string) {
    const resp = await apiClient.put<{ row: Anmeldeverfahren; message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}`,
      payload,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async listSchoolGroups(id: number, token?: string) {
    const resp = await apiClient.get<VerfahrenSchulgruppenResponse>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}/schulgruppen`,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async syncSourceSchoolGroups(id: number, schoolGroupIds: number[], token?: string) {
    const resp = await apiClient.put<{ schoolGroups: VerfahrenSchulgruppenResponse; message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}/schulgruppen/quellschulen`,
      { schulgruppen: schoolGroupIds },
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async syncTargetSchoolGroups(id: number, schoolGroupIds: number[], token?: string) {
    const resp = await apiClient.put<{ schoolGroups: VerfahrenSchulgruppenResponse; message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}/schulgruppen/zielschulen`,
      { schulgruppen: schoolGroupIds },
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async remove(id: number, token?: string) {
    const resp = await apiClient.delete<{ message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}`,
      buildAuthConfig(token),
    );
    return resp.data;
  },
};
