"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.role !== "admin") {
      router.push("/main/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || user?.role !== "admin") {
    return <div className="p-8 text-center text-muted-foreground">鉴权中或无权限...</div>;
  }

  return <>{children}</>;
}
