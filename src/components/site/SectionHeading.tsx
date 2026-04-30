export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      {eyebrow && (
        <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-foreground">
        {title}
      </h2>
      {sub && (
        <p className={`mt-4 text-muted-foreground max-w-2xl ${align === "center" ? "mx-auto" : ""}`}>
          {sub}
        </p>
      )}
    </div>
  );
}