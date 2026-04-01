import { api } from './api';

export const workoutService = {
  async getWeekly(weekStart: string) {
    const { data } = await api.get('/workouts/weekly', { params: { weekStart } });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get(`/workouts/${id}`);
    return data;
  },

  async markComplete(id: string) {
    const { data } = await api.patch(`/workouts/${id}/complete`);
    return data;
  },

  async submitResult(id: string, result: any) {
    const { data } = await api.post(`/workouts/${id}/result`, result);
    return data;
  },

  async getHistory(page = 1, limit = 20) {
    const { data } = await api.get('/workouts/history', { params: { page, limit } });
    return data;
  },

  async getStats() {
    const { data } = await api.get('/workouts/stats');
    return data;
  },

  async create(workoutData: any) {
    const { data } = await api.post('/workouts', workoutData);
    return data;
  },
};
