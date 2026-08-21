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

  async logout() {
    return apiClient.post("/api/auth/logout");
  }
};

export const connectionService = {
  async getStatus() {
    const resp = await apiClient.get<ConnectionStatus>("/api/connection/status");
    return resp.data;
  },

  async connect(payload: any) {
    const resp = await apiClient.post<ConnectionResponse>("/api/connection/connect", payload);
    return resp.data;
  }
};
