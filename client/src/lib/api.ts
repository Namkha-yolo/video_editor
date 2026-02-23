import axios from "axios";
import { supabase } from "./supabase";

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

export default api;
