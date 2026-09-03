import { loadEnvConfig } from "@next/env";

// .env.local 의 키(OPENAI_API_KEY 등)를 테스트에서도 쓴다. 통합 테스트는 키가 없으면 skip 한다.
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
