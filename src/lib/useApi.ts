"use client";

import { useEffect, useState } from "react";
import type { ApiResult } from "./types";

type Settled<T> = { url: string; result: ApiResult<T> };

/** url 이 null 이면 요청하지 않는다. url 이 바뀌면 loading 이 되고 이전 응답은 무시된다. */
export function useApi<T>(url: string | null) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json() as Promise<ApiResult<T>>)
      .then((result) => !cancelled && setSettled({ url, result }))
      .catch(() => !cancelled && setSettled({ url, result: { ok: false, error: "서버에 연결하지 못했습니다." } }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = url && settled?.url === url ? settled.result : null;
  return {
    data: current?.ok ? current.data : undefined,
    error: current && !current.ok ? current.error : undefined,
    loading: !!url && !current,
  };
}
