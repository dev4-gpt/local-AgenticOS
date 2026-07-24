import type { FeatureItem } from "@/types/editions";

export function FeatureListItem({ item }: { item: FeatureItem }) {
  return (
    <article className="flex flex-col gap-2 border-t border-[var(--g5)]/10 py-5 lg:grid lg:grid-cols-5 lg:gap-x-8 lg:py-6">
      {item.eyebrow && (
        <h4 className="font-bold text-[var(--g5)] lg:col-span-2">
          {item.linkHref ? (
            <a
              href={item.linkHref}
              target="_blank"
              rel="noreferrer"
              className="no-underline hover:underline"
            >
              {item.eyebrow}
            </a>
          ) : (
            item.eyebrow
          )}
        </h4>
      )}
      {item.desc && <p className="text-sm text-[var(--g5)]/70 lg:col-span-3">{item.desc}</p>}
    </article>
  );
}
