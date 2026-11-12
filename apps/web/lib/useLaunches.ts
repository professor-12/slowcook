"use client";
import { useCallback, useEffect, useState } from "react";
import { FACTORY, view } from "./near";

export type LoadState<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

/** Poll a loader; keeps the last good data on transient RPC errors (no skeleton flash on refetch). */
export function usePolling<T>(load: () => Promise<T>, ms = 6000, deps: unknown[] = []) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const run = useCallback(load, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    try {
      const data = await run();
      setState({ status: "ready", data });
    } catch (e) {
      setState((s) => (s.status === "ready" ? s : { status: "error", error: String((e as Error)?.message ?? e) }));
    }
  }, [run]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
  }, [refresh, ms]);
  return { state, refresh };
}

export const loadLaunches = () => view<any[]>(FACTORY, "list_launches", { from: "0", limit: 100 });
