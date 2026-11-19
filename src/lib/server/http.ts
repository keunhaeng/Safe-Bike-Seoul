import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { MissingKeyError } from "./env";

export class UpstreamError extends Error {
  constructor(
    public readonly source: string,
    public readonly status?: number,
    /** 인증키 오류(잘못된 키·미승인 서비스)로 판단되는 경우 */
    public readonly auth = false,
  ) {
    super(`${source} upstream error${status ? ` (${status})` : ""}${auth ? " [auth]" : ""}`);
  }
}

const SOURCE_NAMES: [string, string][] = [
  ["seoul", "서울 열린데이터광장"],
  ["kakao", "카카오 API"],
  ["kma", "기상청 단기예보(공공데이터포털)"],
  ["data.go.kr", "공공데이터포털"],
];
const sourceName = (source: string) => SOURCE_NAMES.find(([p]) => source.startsWith(p))?.[1] ?? "외부 API";

/** 에러 메시지에 섞여 들어올 수 있는 키 값을 가린다. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  // 카카오는 잘못된 키를 메시지에 그대로 되돌려 준다: wrong appKey(<키>) format
  return out.replace(/appKey\([^)]*\)/gi, "appKey(***)");
}

export class BadRequestError extends Error {}

/** 사용자에게 그대로 보여줘도 안전한 메시지를 가진 서버 측 오류(키·URL 미포함). */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

/**
 * 외부 API 호출. 요청 URL(키 포함)은 에러·로그에 절대 남기지 않는다.
 */
export async function fetchJson<T>(
  source: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch (e) {
    unstable_rethrow(e); // Next.js 내부 신호(동적 렌더링 전환 등)는 삼키지 않는다
    throw new UpstreamError(source);
  }
  if (res.status === 401 || res.status === 403) throw new UpstreamError(source, res.status, true);
  if (!res.ok) throw new UpstreamError(source, res.status);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // 서울 열린데이터광장·공공데이터포털은 오류를 XML 로 돌려주기도 한다 (예: INFO-100 인증키 오류)
    // INFO-100: 인증키 무효, INFO-300: 인증키 사용 제한 (INFO-200 은 '데이터 없음'이라 제외)
    const auth = /INFO-100|INFO-300|SERVICE_KEY|인증키가/.test(text);
    throw new UpstreamError(source, res.status, auth);
  }
}

/** 성공/실패를 일관된 JSON 으로 감싸고, 브라우저용 캐시 정책을 붙인다. */
export async function respond<T>(
  handler: () => Promise<T>,
  cacheSeconds = 0,
): Promise<Response> {
  await connection(); // 요청 시점에만 실행 (빌드 중 외부 API 호출·키 사용 방지)
  try {
    const data = await handler();
    return Response.json(
      { ok: true, data },
      {
        headers: {
          "Cache-Control": cacheSeconds
            ? `private, max-age=${cacheSeconds}`
            : "no-store",
        },
      },
    );
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof BadRequestError) {
      return Response.json({ ok: false, error: e.message }, { status: 400 });
    }
    if (e instanceof ServiceError) {
      console.error(`[api] ${e.message}`);
      return Response.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof MissingKeyError) {
      console.error(`[api] ${e.keyName} 환경변수가 설정되지 않았습니다.`);
      return Response.json({ ok: false, error: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }
    if (e instanceof UpstreamError) {
      console.error(`[api] ${e.message}`);
      const name = sourceName(e.source);
      const error = e.auth
        ? `${name} 인증에 실패했습니다. 서버의 API 키와 활용신청(권한) 상태를 확인하세요.`
        : `${name} 호출에 실패했습니다. 잠시 후 다시 시도하세요.`;
      return Response.json({ ok: false, error }, { status: 502 });
    }
    console.error("[api] unexpected error");
    return Response.json({ ok: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export function numParam(
  sp: URLSearchParams,
  name: string,
  { min, max }: { min: number; max: number },
): number {
  const raw = sp.get(name);
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new BadRequestError(`${name} 값이 올바르지 않습니다.`);
  }
  return n;
}
