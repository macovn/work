"use client";

import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[ServiceWorker] Registered:", reg.scope);
        })
        .catch((err) => {
          console.error("[ServiceWorker] Registration failed:", err);
        });
    }
  }, []);

  return <>{children}</>;
}
