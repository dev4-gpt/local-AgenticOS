import { Header } from "@/components/editions/Header";
import { SidebarNav } from "@/components/editions/SidebarNav";
import { HeroSection } from "@/components/editions/HeroSection";
import { ChapterSection } from "@/components/editions/ChapterSection";
import { ThemeObserver } from "@/components/editions/ThemeObserver";
import { chapters } from "@/data/editions";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ThemeObserver />
      <Header />
      <HeroSection />
      <SidebarNav />
      {chapters.map((chapter) => (
        <ChapterSection key={chapter.slug} chapter={chapter} />
      ))}
    </main>
  );
}
