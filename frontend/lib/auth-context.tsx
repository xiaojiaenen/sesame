import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserInfo {
  user_id: string;
  role: "admin" | "user";
  is_active: boolean;
  session_status: string;
}

interface AuthContextType {
  token: string | null;
  user: UserInfo | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("sesame_token");
      if (storedToken) {
        setToken(storedToken);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/user/profile`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
          } else {
            localStorage.removeItem("sesame_token");
            setToken(null);
          }
        } catch (error) {
          console.error("Failed to fetch profile", error);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!token && pathname !== "/login") {
        router.push("/login");
      }
    }
  }, [token, isLoading, pathname, router]);

  const login = (newToken: string) => {
    localStorage.setItem("sesame_token", newToken);
    setToken(newToken);
    // Profile will be fetched on next render or we can fetch it immediately
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/user/profile`, {
      headers: {
        Authorization: `Bearer ${newToken}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((userData) => {
        setUser(userData);
        router.push("/main/dashboard");
      })
      .catch((error) => {
        console.error("Failed to fetch profile after login", error);
        // Still redirect to dashboard, profile will be fetched on next mount
        router.push("/main/dashboard");
      });
  };

  const logout = () => {
    localStorage.removeItem("sesame_token");
    setToken(null);
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
