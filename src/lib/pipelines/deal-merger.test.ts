import { describe, it, expect } from "vitest";
import {
  mergeDealNotes,
  mergeFollowupInstructions,
  parseDealLeadDetails,
  formatDealLeadNotes,
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

  describe("parseDealLeadDetails", () => {
    it("splits comma-separated mixed titles into separate fields", () => {
      const parsed = parseDealLeadDetails(
        "Anil ku Sharma, Wedding Album Design, Gopalganj",
        null
      );
      expect(parsed.cleanTitle).toBe("Anil ku Sharma");
      expect(parsed.service).toBe("Wedding Album Design");
      expect(parsed.city).toBe("Gopalganj");
    });

    it("extracts from notes when bullet points exist", () => {
      const notes = `[Lead Form Details]:\n• Service: Website Development\n• City: Delhi\n• Extra Message: Needs Next.js`;
      const parsed = parseDealLeadDetails("Deal: Rohan", notes);
      expect(parsed.cleanTitle).toBe("Rohan");
      expect(parsed.service).toBe("Website Development");
      expect(parsed.city).toBe("Delhi");
      expect(parsed.leadMessage).toBe("Needs Next.js");
    });

    it("handles hyphen-separated titles like 'Deal: John - SEO (Mumbai)'", () => {
      const parsed = parseDealLeadDetails(
        "Deal: John - SEO (Mumbai)",
        null
      );
      expect(parsed.cleanTitle).toBe("John");
      expect(parsed.service).toBe("SEO");
      expect(parsed.city).toBe("Mumbai");
    });
  });

  describe("formatDealLeadNotes", () => {
    it("formats service, city, and extra message cleanly", () => {
      const formatted = formatDealLeadNotes(
        "",
        "Wedding Album Design",
        "Gopalganj",
        "Need by next week"
      );
      expect(formatted).toContain("[Lead Form Details]:");
      expect(formatted).toContain("• Service: Wedding Album Design");
      expect(formatted).toContain("• City: Gopalganj");
      expect(formatted).toContain("• Extra Message: Need by next week");
    });

    it("preserves subsequent follow-up notes when updating lead details", () => {
      const existing = `[Lead Form Details]:\n• Service: Old Service\n\n[Follow-up #1 - 25 Sep]: Met client`;
      const formatted = formatDealLeadNotes(
        existing,
        "New Service",
        "Patna",
        ""
      );
      expect(formatted).toContain("• Service: New Service");
      expect(formatted).toContain("• City: Patna");
      expect(formatted).toContain("[Follow-up #1 - 25 Sep]: Met client");
      expect(formatted).not.toContain("Old Service");
    });
  });
});

