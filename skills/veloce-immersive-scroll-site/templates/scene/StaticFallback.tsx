/** No-WebGL / reduced-motion fallback: a static, procedural CSS nebula. No canvas, no motion. */
export default function StaticFallback() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 overflow-hidden bg-void-950"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 50% at 20% 10%, rgba(255,154,77,0.16), transparent 60%)," +
          "radial-gradient(ellipse 60% 45% at 85% 30%, rgba(120,140,255,0.12), transparent 60%)," +
          "radial-gradient(ellipse 55% 40% at 50% 85%, rgba(180,120,255,0.1), transparent 60%)," +
          "radial-gradient(circle at 10% 90%, rgba(255,255,255,0.05), transparent 40%)",
      }}
    >
      <div className="noise-veil absolute inset-0 opacity-30" />
    </div>
  );
}
