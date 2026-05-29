import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8080/api";

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth endpoints
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
};

// Problem endpoints
export const problemAPI = {
  listProblems: (params) => api.get("/problems", { params }),
  getProblem: (slug) => api.get(`/problems/${slug}`),
  createProblem: (data) => api.post("/problems", data),
  updateProblem: (id, data) => api.put(`/problems/${id}`, data),
  deleteProblem: (id) => api.delete(`/problems/${id}`),
};

// Submission endpoints
export const submissionAPI = {
  submit: (data) => api.post("/submissions", data),
  getSubmission: (id) => api.get(`/submissions/${id}`),
  getMySubmissions: (page, size) =>
    api.get("/submissions/me", { params: { page, size } }),
  getProblemSubmissions: (problemId, page, size) =>
    api.get(`/submissions/problem/${problemId}`, { params: { page, size } }),
};

export default api;
