import type { DashboardWidget } from "@/core/contracts";
import { captureService } from "./service";
import { CaptureInput } from "./ui/CaptureInput";

export const captureWidget: DashboardWidget<{ open: number }> = {
  id: "capture.input",
  title: "캡처",
  surface: "today",
  size: "lg",
  placement: "top",
  order: -10,
  load: async (ctx) => ({
    open: await captureService(ctx).countOpen(),
  }),
  Component: ({ data }) => <CaptureInput openCount={data.open} />,
};
