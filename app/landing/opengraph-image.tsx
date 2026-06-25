import { ImageResponse } from "next/og";

export const alt = "Vannak elveszett jogdíjaid? Hozzuk haza őket!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRIMARY = "#10b981";
const COMP = "#8b5cf6";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#0f1117",
          backgroundImage: `radial-gradient(900px 500px at 15% -10%, ${PRIMARY}40, transparent 60%), radial-gradient(800px 500px at 100% 110%, ${COMP}40, transparent 60%)`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundImage: `linear-gradient(120deg, ${PRIMARY}, ${COMP})`,
            }}
          />
          <div style={{ color: "#94a3b8", fontSize: 26, fontWeight: 600 }}>
            Jogdíj-visszaszerzés előadóknak és szerzőknek
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#f1f5f9",
              letterSpacing: "-0.02em",
            }}
          >
            Vannak elveszett jogdíjaid?{" "}
            <span
              style={{
                marginLeft: 18,
                backgroundImage: `linear-gradient(120deg, ${PRIMARY}, ${COMP})`,
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Hozzuk haza őket!
            </span>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 30, maxWidth: 900 }}>
            ARTISJUS, EJI és 10+ ország jogkezelőinek nyilvános listái egy helyen.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {["ARTISJUS", "EJI", "GVL", "STIM", "SENA"].map((s) => (
            <div
              key={s}
              style={{
                color: "#cbd5e1",
                fontSize: 24,
                fontWeight: 600,
                padding: "8px 18px",
                borderRadius: 999,
                border: "1px solid #2d3348",
              }}
            >
              {s}
            </div>
          ))}
          <div style={{ color: "#64748b", fontSize: 24, marginLeft: "auto" }}>
            15+ jogkezelő · 10+ ország
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
