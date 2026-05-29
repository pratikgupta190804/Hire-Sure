import { useState, useCallback } from "react";

export function useToast() {
  const [t, setT] = useState(null);

  const show = useCallback(
    (msg, type = "success") => setT({ msg, type, id: Date.now() }),
    []
  );

  return { show, toast: t, clear: () => setT(null) };
}