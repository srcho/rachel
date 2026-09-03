# S3.0 회의 스파이크 결과 (2026-09-03)

## 1. Muse Voice Transcribe 배치 — 한국어 품질 (완료)

- 입력: OpenAI TTS(gpt-4o-mini-tts, alloy/nova 두 목소리)로 만든 60.5초 한국어 회의(영어 용어·숫자·이름 혼용), 16 kHz mono WAV(1.9 MB).
- 호출: `POST /v1/asr/transcribe`, `audioEncoding: WAV`.

| 설정 | 처리 시간 | 결과 |
|---|---|---|
| ENDPOINTING, `languageBias:["Korean","English"]`, keywords(레이첼·Muse·VibeVoice·김민수) | 10.7s | **거의 완벽.** 고유명사·영어 용어 전부 정확. "파이널"→"바이널" 1건. 숫자는 "삼백만 원"·"세 시"처럼 한글 표기 |
| ENDPOINTING, 바이어스 없음 | 11.2s | 한국어는 잡히나 고유명사 오류("레이첼"→"네이처", "Muse"→"뮤스", "VibeVoice"→"라이브 보이스"), 숫자도 한글 |
| DIARIZATION, 바이어스+keywords | 10.9s | 6턴을 **A/B 로 정확히 분리**(정답과 1:1). 발화 경계 오차 ≤ 0.5s |
| (참고) OpenAI `gpt-transcribe`, language=ko | — | "레이첼"→"네이처", "Muse"→"뉴스", "VibeVoice"→"Voice", "맥"→"맵". Muse+keywords 가 더 정확 |

- 비용: 60초 = $0.003 (audioDurationMs 60,480 → 60초 과금). 실시간 배율 ≈ 0.18 → 20초 세그먼트는 약 4초 + 업로드.
- 응답 스키마 확인: `{ sessionId, transcript, audioDurationMs, turns[{turnId,startMs,endMs,transcript,speaker?}] }`. ENDPOINTING 은 speaker 없음.
- 교훈: macOS `say` 의 ko_KR 목소리(Eddy·Flo·Reed 등)는 한글을 발음하지 않는다(영어·숫자만). 테스트 오디오는 OpenAI TTS 로 만든다(`scratchpad/audio/real-ko.wav`, 레포 미포함).

**결정**: 라이브·파이널 패스 모두 `languageBias: ["Korean","English"]` + 키워드(참석자·용어·최근 카드 제목) 필수. 숫자 한글 표기는 후처리(luna 정리)에서 아라비아 숫자로 정규화.

## 2. 미확인 (사용자 실기기·추가 실험)

- [ ] iPhone 설치형 PWA: getUserMedia + AudioWorklet + MediaRecorder 동시 동작, 실제 sampleRate, 30분 녹음 안정성, 백그라운드 시 동작 → S3.2 배포 후 확인
- [ ] IndexedDB 115 MB 저장·읽기 속도, `storage.persist()`
- [ ] Muse 배치 분당 요청 한도(20초 세그먼트 연속 전송) → 라이브 패스 실사용에서 429 여부 관찰
- [ ] VibeVoice-ASR(mlx-community bf16, 약 18 GB) 로컬 품질·속도 → 맥 워커 결정(D13). 필요 시 별도 세션에서 다운로드 후 같은 `real-ko.wav` 로 비교
