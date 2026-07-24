export type FeatureKind = "image" | "list";

export interface FeatureItem {
  chapter: string;
  kind: FeatureKind;
  eyebrow: string | null;
  desc: string | null;
  linkText: string | null;
  linkHref: string | null;
  imgSrc: string | null;
  hasVideo: boolean;
}

export interface Chapter {
  slug: string;
  title: string;
  roman: string;
  items: FeatureItem[];
}
