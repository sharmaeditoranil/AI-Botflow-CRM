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
