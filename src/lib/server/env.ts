// 서버 전용 모듈: 클라이언트 컴포넌트에서 import 하면 빌드 단계에서 에러가 납니다.
import "server-only";

type ServerKey = "SEOUL_API_KEY" | "DATA_GO_KR_API_KEY" | "KAKAO_REST_API_KEY";

export class MissingKeyError extends Error {
  constructor(public readonly keyName: ServerKey) {
    super(`${keyName} is not configured`);
  }
}

/** 서버 키를 읽는다. 값 자체는 어떤 에러 메시지·로그에도 넣지 않는다. */
export function serverKey(name: ServerKey): string {
  const v = process.env[name]?.trim();
  if (!v) throw new MissingKeyError(name);
  return v;
}
