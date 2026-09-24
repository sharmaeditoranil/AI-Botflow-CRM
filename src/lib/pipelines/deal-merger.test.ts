import { describe, it, expect } from "vitest";
import {
  mergeDealNotes,
  mergeFollowupInstructions,
} from "./deal-merger";

describe("deal-merger", () => {
  describe("mergeDealNotes", () => {
    it("returns null when both are empty", () => {
      expect(mergeDealNotes(null, null)).toBeNull();
      expect(mergeDealNotes("", "  ")).toBeNull();
    });

    it("returns incoming notes when existing is empty", () => {
      const incoming = "[Follow-up #1 - 24 Sep 2026]: Client wants demo";
      expect(mergeDealNotes(null, incoming)).toBe(incoming);
      expect(mergeDealNotes("", incoming)).toBe(incoming);
    });

    it("returns existing notes when incoming is empty", () => {
      const existing = "[Follow-up #1 - 22 Sep 2026]: Call connected";
      expect(mergeDealNotes(existing, null)).toBe(existing);
      expect(mergeDealNotes(existing, "")).toBe(existing);
    });

    it("does not duplicate if incoming is already present in existing", () => {
      const existing = "[Follow-up #1 - 22 Sep 2026]: Call connected";
      expect(mergeDealNotes(existing, existing)).toBe(existing);
      expect(mergeDealNotes(existing, "Call connected")).toBe(existing);
    });

    it("concatenates new follow-up timelines cleanly", () => {
      const existing = "[Follow-up #1 - 22 Sep 2026]: Call connected";
      const incoming = "[Follow-up #2 - 24 Sep 2026]: Sent pricing proposal";
      const merged = mergeDealNotes(existing, incoming);
      expect(merged).toContain(existing);
      expect(merged).toContain(incoming);
      expect(merged).toBe(`${existing}\n${incoming}`);
    });

    it("wraps unstructured incoming notes with merged header", () => {
      const existing = "[Follow-up #1 - 22 Sep 2026]: Call connected";
      const incoming = "Customer wants to negotiate price.";
      const merged = mergeDealNotes(existing, incoming);
      expect(merged).toContain(existing);
      expect(merged).toContain("[Merged Note");
      expect(merged).toContain("Customer wants to negotiate price.");
    });
  });

  describe("mergeFollowupInstructions", () => {
    it("combines instructions without duplicating", () => {
      const existing = "Speak in Hindi, offer 10% discount";
      const incoming = "Follow up on Monday at 3 PM";
      const merged = mergeFollowupInstructions(existing, incoming);
      expect(merged).toContain(existing);
      expect(merged).toContain(incoming);
    });

    it("returns existing if incoming is identical", () => {
      const existing = "Speak in Hindi";
      expect(mergeFollowupInstructions(existing, existing)).toBe(existing);
    });
  });
});
