import { ImageResponse } from "next/og";

// Master Brand Favicon for Aibotflow CRM (matches user-provided brand mark)
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const LOGO_BASE64 = "data:image/png;base64,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";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <img
          src={LOGO_BASE64}
          alt="Aibotflow"
          width="32"
          height="32"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
