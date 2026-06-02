"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ErrorBoundary>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  );
}
