import type { Chapter } from "@/types/editions";
import { FeatureImage } from "./FeatureImage";
import { FeatureListItem } from "./FeatureListItem";
import { ChapterIntro } from "./ChapterIntro";
import { ContactSection } from "./ContactSection";

export function ChapterSection({ chapter }: { chapter: Chapter }) {
  const imageItems = chapter.items.filter((i) => i.kind === "image");
  const listItems = chapter.items.filter((i) => i.kind === "list");

  // Final chapter (Developer painting) resolves into the contact section
  // instead of a feature grid — same painting hero, same scroll pacing.
  if (chapter.slug === "developer") {
    return (
      <section id={chapter.slug} className="scroll-mt-24">
        <ChapterIntro chapter={chapter} />
        <ContactSection />
      </section>
    );
  }

  return (
    <section id={chapter.slug} className="scroll-mt-24">
      <ChapterIntro chapter={chapter} />

      <div className="py-24 lg:pl-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
          {imageItems.length > 0 && (
            <div className="mb-16 grid grid-cols-1 gap-10 lg:grid-cols-3">
              {imageItems.map((item, i) => (
                <FeatureImage key={`${chapter.slug}-img-${i}`} item={item} />
              ))}
            </div>
          )}

          {listItems.length > 0 && (
            <div className="flex flex-col">
              {listItems.map((item, i) => (
                <FeatureListItem key={`${chapter.slug}-list-${i}`} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
