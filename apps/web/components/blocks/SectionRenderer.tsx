import type { Section, Brand } from "@/lib/schema/page-schema";
import { EditableSection } from "@/components/editor/EditableSection";
import { HeroBlock } from "./HeroBlock";
import { FeaturesBlock } from "./FeaturesBlock";
import { TestimonialsBlock } from "./TestimonialsBlock";
import { FAQBlock } from "./FAQBlock";
import { CTABlock } from "./CTABlock";
import { TrustBadgesBlock } from "./TrustBadgesBlock";
import { StatsBlock } from "./StatsBlock";
import { AgendaBlock } from "./AgendaBlock";
import { SpeakersBlock } from "./SpeakersBlock";
import { ProductGridBlock } from "./ProductGridBlock";

interface SectionRendererProps {
  section: Section;
  brand: Brand;
  onCtaClick?: () => void;
  razorpayKeyId?: string;
  sectionIndex?: number;
}

const SECTION_LABELS: Record<string, string> = {
  hero: "hero", features: "features", benefits: "benefits", testimonials: "reviews",
  faq: "FAQ", cta: "call to action", trust: "trust badges", stats: "stats",
  agenda: "agenda", speakers: "speakers", "product-grid": "products",
};

export function SectionRenderer({ section, brand, onCtaClick, razorpayKeyId, sectionIndex }: SectionRendererProps) {
  if (!section.visible) return null;

  let inner: React.ReactNode;
  switch (section.type) {
    case "hero":
      inner = <HeroBlock section={section} brand={brand} onCtaClick={onCtaClick} sectionIndex={sectionIndex} />; break;
    case "features":
    case "benefits":
      inner = <FeaturesBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "testimonials":
      inner = <TestimonialsBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "faq":
      inner = <FAQBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "cta":
      inner = <CTABlock section={section} brand={brand} onCtaClick={onCtaClick} sectionIndex={sectionIndex} />; break;
    case "trust":
      inner = <TrustBadgesBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "stats":
      inner = <StatsBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "agenda":
      inner = <AgendaBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "speakers":
      inner = <SpeakersBlock section={section} brand={brand} sectionIndex={sectionIndex} />; break;
    case "product-grid":
      inner = (
        <ProductGridBlock
          section={section}
          brand={brand}
          razorpayKeyId={razorpayKeyId ?? "rzp_test_placeholder"}
          sectionIndex={sectionIndex}
        />
      );
      break;
    default:
      return null;
  }

  return <EditableSection label={SECTION_LABELS[section.type]}>{inner}</EditableSection>;
}
