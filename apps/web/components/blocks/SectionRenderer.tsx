import type { Section, Brand } from "@/lib/schema/page-schema";
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
}

export function SectionRenderer({ section, brand, onCtaClick, razorpayKeyId }: SectionRendererProps) {
  if (!section.visible) return null;

  switch (section.type) {
    case "hero":
      return <HeroBlock section={section} brand={brand} onCtaClick={onCtaClick} />;
    case "features":
    case "benefits":
      return <FeaturesBlock section={section} brand={brand} />;
    case "testimonials":
      return <TestimonialsBlock section={section} brand={brand} />;
    case "faq":
      return <FAQBlock section={section} brand={brand} />;
    case "cta":
      return <CTABlock section={section} brand={brand} onCtaClick={onCtaClick} />;
    case "trust":
      return <TrustBadgesBlock section={section} brand={brand} />;
    case "stats":
      return <StatsBlock section={section} brand={brand} />;
    case "agenda":
      return <AgendaBlock section={section} brand={brand} />;
    case "speakers":
      return <SpeakersBlock section={section} brand={brand} />;
    case "product-grid":
      return (
        <ProductGridBlock
          section={section}
          brand={brand}
          razorpayKeyId={razorpayKeyId ?? "rzp_test_placeholder"}
        />
      );
    default:
      return null;
  }
}
