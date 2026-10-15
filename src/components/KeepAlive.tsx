"use client";

import { useEffect } from "react";
import { startKeepAlive } from "@/lib/keepAlive";

export function KeepAlive() {
  useEffect(() => {
    return startKeepAlive();
  }, []);
  return null;
}
