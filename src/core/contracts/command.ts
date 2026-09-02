export interface CommandRunContext {
  navigate(href: string): void;
  openDock(prompt?: string): void;
}

export interface Command {
  id: string;
  label: string;
  /** 예: 'mod+j' */
  shortcut?: string;
  keywords?: string[];
  run(ctx: CommandRunContext): void;
}
