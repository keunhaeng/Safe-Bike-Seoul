"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Props = {
  label: string;
  badge: string;
  badgeColor: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
};

/** 카카오 로컬 검색(/api/places)을 사용하는 장소 검색 입력. */
export default function PlaceSearch({ label, badge, badgeColor, value, onChange }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // 포커스를 잃고 120ms 뒤 드롭다운을 닫는 타이머. 다시 포커스되면 취소해야 새 검색이 닫히지 않는다.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, error, loading } = useApi<Place[]>(
    open && debounced ? `/api/places?query=${encodeURIComponent(debounced)}` : null,
  );
  const text = editing ? query : (value?.name ?? "");

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-600/20">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: badgeColor }}>
          {badge}
        </span>
        <input
          id={id}
          value={text}
          placeholder={label}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          onFocus={() => { clearTimeout(blurTimer.current); setEditing(true); setQuery(""); setDebounced(""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => { setOpen(false); setEditing(false); }, 120); }}
        />
        {value && (
          <button type="button" aria-label={`${label} 지우기`} className="text-zinc-400 hover:text-zinc-700" onMouseDown={(e) => { e.preventDefault(); onChange(null); }}>
            ✕
          </button>
        )}
      </div>
      {open && debounced && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-zinc-500">검색 중…</li>}
          {error && <li className="px-3 py-2 text-sm text-red-600">{error}</li>}
          {data?.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">검색 결과가 없어요</li>}
          {data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-zinc-100"
                onMouseDown={(e) => { e.preventDefault(); onChange(p); setOpen(false); setEditing(false); }}
              >
                <span className="block text-sm font-medium text-zinc-900">{p.name}</span>
                <span className="block text-xs text-zinc-500">{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
