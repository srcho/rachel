"use client";
import { SerwistProvider } from "@serwist/next/react";

/** 프로덕션 빌드에서만 서비스 워커를 등록한다(개발 중엔 public/sw.js 가 없다). */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "production") return <>{children}</>;
  return <SerwistProvider swUrl="/sw.js">{children}</SerwistProvider>;
}
