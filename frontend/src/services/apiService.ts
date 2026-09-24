import apiClient from "./apiClient";
import type { 
  LoginResponse, 
  ConnectionStatus, 
  ConnectionResponse
} from "../types";

/**
 * Service for interacting with the Schul-Stat Backend API.
 * Uses the standardized apiClient with interceptors.
 */

export const authService = {
  async login(credentials: any) {
    const resp = await apiClient.post<LoginResponse>("/api/auth/login", credentials);
    return resp.data;
  },

  async logout(token?: string) {
    return apiClient.post("/api/auth/logout", {}, token ? {
      headers: { Authorization: `Bearer ${token}` },
    } : undefined);
  },

  async loginManagementArea(token: string) {
    return apiClient.post("/api/auth/verwaltungsbereich/login", {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async logoutManagementArea(token: string) {
    return apiClient.post("/api/auth/verwaltungsbereich/logout", {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
};

export const connectionService = {
  async test(payload: { host: string; port: number; database: string; username: string; password: string }) {
    const resp = await apiClient.post<{ connected: boolean }>("/api/connection/test", payload);
    return resp.data;
  },

  async getStatus() {
    const resp = await apiClient.get<ConnectionStatus>("/api/connection/status");
    return resp.data;
  },

  async connect(payload: any) {
    const resp = await apiClient.post<ConnectionResponse>("/api/connection/connect", payload);
    return resp.data;
  }
};
