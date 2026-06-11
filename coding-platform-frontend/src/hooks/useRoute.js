import { useState, useEffect } from "react";

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  const [search, setSearch] = useState(window.location.search);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };

    const handleLocationChange = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pushstate", handleLocationChange);
    window.addEventListener("replacestate", handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pushstate", handleLocationChange);
      window.removeEventListener("replacestate", handleLocationChange);
    };
  }, []);

  const navigate = (to) => {
    window.history.pushState(null, "", to);
    window.dispatchEvent(new Event("pushstate"));
  };

  const query = {};
  new URLSearchParams(search).forEach((value, key) => {
    query[key] = value;
  });

  return { path, query, navigate };
}