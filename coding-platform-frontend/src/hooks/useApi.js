import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API } from "../utils/constants";

export function useApi() {
  const { token } = useAuth();

  const call = useCallback(
    async (path, opts = {}, base = API) => {
      const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Request failed");
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    [token]
  );

  return call;
}