/** ⌘K 명령. 서버→클라이언트로 넘기므로 함수가 아니라 데이터로 표현한다. */
export interface Command {
  id: string;
  label: string;
  /** 예: 'mod+j' */
  shortcut?: string;
  keywords?: string[];
  /** 이동할 경로 */
  href?: string;
  /** 클라이언트 동작 */
  action?: "openDock" | "startMeeting" | "newCard";
}
