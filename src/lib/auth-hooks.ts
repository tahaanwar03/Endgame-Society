"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const services = getFirebaseServices();

    if (!services) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(services.auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return {
    user,
    loading,
    isAdmin: isAdminEmail(user?.email)
  };
}

export async function logout() {
  const services = getFirebaseServices();

  if (services) {
    await signOut(services.auth);
  }
}
