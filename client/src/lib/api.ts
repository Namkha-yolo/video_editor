import axios from "axios";
import { supabase } from "./supabase";

export class ApiRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiRateLimitError";
  }
}

export function isApiRateLimitError(error: unknown): error is ApiRateLimitError {
  return error instanceof ApiRateLimitError;
}

const api = axios.create({
  baseURL: "/api",
});

// Attach Supabase auth token to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const retryAfterHeader = error.response.headers["retry-after"];
      const retryAfterSeconds = Number(
        error.response.data?.retry_after_seconds || retryAfterHeader || 0
      );

      return Promise.reject(
        new ApiRateLimitError(
          error.response.data?.error || "Rate limit exceeded. Please try again shortly.",
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
          error.response.data?.code
        )
      );
    }

    return Promise.reject(error);
  }
);

export default api;
