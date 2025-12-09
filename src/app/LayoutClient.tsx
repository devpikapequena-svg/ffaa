// app/LayoutClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";

type LayoutContentProps = {
  children: React.ReactNode;
};

export function LayoutClient({ children }: LayoutContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);

  const isNotFoundPage = pathname === "/_not-found";

  // 🔹 Loader de navegação
  useEffect(() => {
    if (isNotFoundPage) return;

    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 500); // failsafe

    const handleLoad = () => {
      setIsNavigating(false);
      clearTimeout(timer);
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);

      const observer = new MutationObserver(() => {
        if (document.readyState === "complete") {
          handleLoad();
          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("load", handleLoad);
      clearTimeout(timer);
    };
  }, [pathname, searchParams, isNotFoundPage]);

  // 🔹 Removido: mensagens do console + detecção de DevTools
  useEffect(() => {
    // Limpado totalmente
  }, []);

  return (
    <>
      {isNavigating && !isNotFoundPage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
          <div className="loading-spinner" />
        </div>
      )}

      <div
        className={cn(
          "min-h-screen bg-background font-sans antialiased transition-opacity duration-300",
          isNavigating && !isNotFoundPage ? "opacity-0" : "opacity-100",
        )}
      >
        {children}
        <Toaster />
      </div>
    </>
  );
}
