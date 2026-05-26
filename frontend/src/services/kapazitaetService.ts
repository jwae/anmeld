import apiClient from './apiClient';

function buildAuthConfig(token?: string) {
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) {
    return {};
  }

  return {
    headers: {
      Authorization: `Bearer ${trimmedToken}`,
    },
  };
}

export default {
  async getKapazitaeten(params: any, token?: string) {
    const response = await apiClient.get('/api/kapazitaeten', {
      params,
      ...buildAuthConfig(token),
    });
    return response.data;
  },

  async getKapazitaet(id: number, token?: string) {
    const response = await apiClient.get(`/api/kapazitaeten/${id}`, buildAuthConfig(token));
    return response.data;
  },

  async createKapazitaet(data: any, token?: string) {
    const response = await apiClient.post('/api/kapazitaeten', data, buildAuthConfig(token));
    return response.data;
  },

  async updateKapazitaet(id: number, data: any, token?: string) {
    const response = await apiClient.put(`/api/kapazitaeten/${id}`, data, buildAuthConfig(token));
    return response.data;
  },

  async deleteKapazitaet(id: number, token?: string) {
    const response = await apiClient.delete(`/api/kapazitaeten/${id}`, buildAuthConfig(token));
    return response.data;
  },

  async getVerfahrenSchulen(verfahrenId: number, token?: string) {
    const response = await apiClient.get(`/api/anmeldeverfahren/${verfahrenId}/schulen`, buildAuthConfig(token));
    return response.data;
  },

  async previewKapazitaetenImport(verfahrenId: number, csvText: string, token?: string) {
    const response = await apiClient.post(
      `/api/anmeldeverfahren/${verfahrenId}/kapazitaeten/import/vorschau`,
      { csv_text: csvText },
      buildAuthConfig(token),
    );
    return response.data;
  },

  async importKapazitaeten(verfahrenId: number, previewToken: string, selectedRowNos: number[], token?: string) {
    const response = await apiClient.post(
      `/api/anmeldeverfahren/${verfahrenId}/kapazitaeten/import`,
      {
        preview_token: previewToken,
        selected_row_nos: selectedRowNos,
      },
      buildAuthConfig(token),
    );
    return response.data;
  },
};
