"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/DemoAuthProvider";

export function useSmartUser() {
  return useContext(AuthContext);
}
