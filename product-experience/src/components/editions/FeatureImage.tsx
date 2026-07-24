import Image from "next/image";
import type { FeatureItem } from "@/types/editions";
import { ExternalLinkIcon, PlayIcon } from "@/components/icons";

export function FeatureImage({ item }: { item: FeatureItem }) {
  return (
    <article className="flex flex-col gap-4">
      {item.imgSrc && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--g3)]">
          <Image
            src={item.imgSrc}
            alt={item.eyebrow ?? ""}
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover"
            unoptimized
          />
          {item.hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <span className="flex size-12 items-center justify-center rounded-full bg-white text-black shadow-md transition-transform hover:scale-105">
                <PlayIcon />
              </span>
            </div>
          )}
        </div>
      )}
      {item.eyebrow && <h4 className="text-base font-bold text-[var(--g5)]">{item.eyebrow}</h4>}
      {item.desc && <p className="text-sm leading-relaxed text-[var(--g5)]/80">{item.desc}</p>}
      {item.linkHref && item.linkText && (
        <a
          href={item.linkHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--g5)]/20 px-4 py-2 text-xs font-medium text-[var(--g5)] no-underline hover:bg-[var(--g5)]/5"
        >
          {item.linkText}
          <ExternalLinkIcon />
        </a>
      )}
    </article>
  );
}
