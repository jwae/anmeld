import apiClient from "./apiClient";
import type { AnmeldeStatus, Anmeldeverfahren, BeteiligteSchule } from "../types";

type AuthConfig = {
  headers?: Record<string, string>;
};

type VerfahrenPayload = {
  schuljahr: string;
  bezeichnung: string;
  status: AnmeldeStatus;
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

  async listParticipatingSchools(id: number, token?: string) {
    const resp = await apiClient.get<{ rows: BeteiligteSchule[] }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}/beteiligte-schulen`,
      buildAuthConfig(token),
    );
    return resp.data.rows || [];
  },

  async syncParticipatingSchools(id: number, snrList: string[], token?: string) {
    const resp = await apiClient.put<{ rows: BeteiligteSchule[]; message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(id))}/beteiligte-schulen`,
      { schulen: snrList },
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
