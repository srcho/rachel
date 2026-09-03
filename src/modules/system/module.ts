import type { RachelModule } from "@/core/contracts";
import { backupJob } from "./jobs";
import { DataSettings } from "./ui/DataSettings";

/** system 모듈: 백업·내보내기 같은 사용자 데이터 운영 기능 */
export const systemModule: RachelModule = {
  manifest: {
    id: "system",
    name: "데이터",
    icon: "database",
    schemaVersion: 14,
  },
  jobs: { backup: backupJob },
  settings: {
    id: "system",
    title: "데이터",
    order: 90,
    Component: DataSettings,
  },
};
