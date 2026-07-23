import apiClient from "./apiClient";
import type { AnmeldeStatus, Anmelderunde, NextRoundTransitionResponse } from "../types";

type AuthConfig = {
  headers?: Record<string, string>;
};

type RundePayload = {
  runden_nummer: number;
  bezeichnung: string;
  startdatum: string | null;
  enddatum: string | null;
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

export const anmelderundenService = {
  async listByVerfahren(verfahrenId: number, token?: string) {
    const resp = await apiClient.get<{ rows: Anmelderunde[] }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(verfahrenId))}/runden`,
      buildAuthConfig(token),
    );
    return resp.data.rows || [];
  },

  async create(verfahrenId: number, payload: RundePayload, token?: string) {
    const resp = await apiClient.post<{ row: Anmelderunde; message: string }>(
      `/api/anmeldeverfahren/${encodeURIComponent(String(verfahrenId))}/runden`,
      payload,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async update(id: number, payload: RundePayload, token?: string) {
    const resp = await apiClient.put<{ row: Anmelderunde; message: string }>(
      `/api/anmelderunden/${encodeURIComponent(String(id))}`,
      payload,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async remove(id: number, token?: string) {
    const resp = await apiClient.delete<{ message: string }>(
      `/api/anmelderunden/${encodeURIComponent(String(id))}`,
      buildAuthConfig(token),
    );
    return resp.data;
  },

  async startRound(id: number, token?: string) {
    const resp = await apiClient.post<NextRoundTransitionResponse>(
      `/api/anmelderunden/${encodeURIComponent(String(id))}/start`,
      {},
      buildAuthConfig(token),
    );
    return resp.data;
  },
};
