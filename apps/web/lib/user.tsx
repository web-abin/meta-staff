"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { activeUserId, api, setActiveUserId } from "./api";
import type { User } from "./types";

interface Ctx {
  me: User | null;
  users: User[];
  ready: boolean;
  setMe: (u: User) => void;
  logout: () => void;
  reload: () => void;
}

const UserCtx = createContext<Ctx>({
  me: null,
  users: [],
  ready: false,
  setMe: () => {},
  logout: () => {},
  reload: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [me, setMeState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const stored = activeUserId();
    if (!stored) {
      setMeState(null);
      setUsers([]);
      setReady(true);
      return;
    }
    try {
      const [list, current] = await Promise.all([api.users(), api.me()]);
      setUsers(list);
      const selected = list.find((u) => u.id === stored) || current;
      setMeState(selected);
    } catch {
      // bad stored id; force logout state
      setActiveUserId(null);
      setMeState(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setMe = useCallback((u: User) => {
    setActiveUserId(u.id);
    setMeState(u);
    void reload();
  }, [reload]);

  const logout = useCallback(() => {
    setActiveUserId(null);
    setMeState(null);
    setUsers([]);
  }, []);

  return (
    <UserCtx.Provider value={{ me, users, ready, setMe, logout, reload }}>
      {children}
    </UserCtx.Provider>
  );
}

export function useUser() {
  return useContext(UserCtx);
}

export function isAdmin(u: User | null): boolean {
  return !!u && u.role === "admin";
}
