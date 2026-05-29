import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dsa_user"));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(
    () => localStorage.getItem("dsa_token") || null
  );

  const login = (userData, tok) => {
    setUser(userData);
    setToken(tok);
    localStorage.setItem("dsa_user", JSON.stringify(userData));
    localStorage.setItem("dsa_token", tok);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("dsa_user");
    localStorage.removeItem("dsa_token");
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAdmin: user?.role === "ADMIN" }}
    >
      {children}
    </AuthContext.Provider>
  );
}