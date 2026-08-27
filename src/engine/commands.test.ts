import { describe, it, expect } from "vitest";
import { validateCommand, executeCommand, mockAICommands } from "./commands";
import type { Design } from "../types/design";
import { createDemoDesign } from "../utils/demoData";

describe("commands", () => {
  it("validateCommand", () => {
    expect(validateCommand({ type:"create_room", parameters:{} }).success).toBe(true);
    expect(validateCommand({ type:"", parameters:{} } as any).success).toBe(false);
  });
  it("executeCommand create_room", () => {
    const design = createDemoDesign();
    const res = executeCommand(design, { type:"create_room", parameters:{ roomType:"bedroom"}});
    expect(res.success).toBe(true);
  });
  it("mockAICommands generates commands", () => {
    const cmds = mockAICommands("Make the kitchen 2 feet larger");
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds[0].type).toBe("resize_room");
  });
});
