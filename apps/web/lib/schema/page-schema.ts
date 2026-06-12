import { z } from "zod";

// ─── Brand ───────────────────────────────────────────────────────
export const BrandSchema = z.object({
  name: z.string(),
  logo: z.string().url().optional(),
  tagline: z.string().optional(),
  primaryColor: z.string().default("#6366f1"),
  secondaryColor: z.string().default("#0f172a"),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
});

// ─── Section Types ────────────────────────────────────────────────
export const HeroSectionSchema = z.object({
  id: z.string(),
  type: z.literal("hero"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("gradient"),
  variant: z.enum(["centered", "split", "minimal"]).default("centered"),
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string(),
  ctaSecondaryText: z.string().optional(),
  image: z.string().optional(),
  badge: z.string().optional(),
  urgency: z.string().optional(),
});

export const FeatureItem = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

export const FeaturesSectionSchema = z.object({
  id: z.string(),
  type: z.literal("features"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("light"),
  headline: z.string(),
  subheadline: z.string().optional(),
  layout: z.enum(["grid-3", "grid-2", "list", "cards"]).default("grid-3"),
  items: z.array(FeatureItem),
});

export const BenefitsSectionSchema = z.object({
  id: z.string(),
  type: z.literal("benefits"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("white"),
  headline: z.string(),
  items: z.array(FeatureItem),
});

export const TestimonialItem = z.object({
  name: z.string(),
  title: z.string().optional(),
  company: z.string().optional(),
  avatar: z.string().optional(),
  rating: z.number().min(1).max(5).default(5),
  text: z.string(),
});

export const TestimonialsSectionSchema = z.object({
  id: z.string(),
  type: z.literal("testimonials"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("white"),
  headline: z.string(),
  layout: z.enum(["grid", "carousel", "wall"]).default("grid"),
  items: z.array(TestimonialItem),
});

export const FAQItem = z.object({
  question: z.string(),
  answer: z.string(),
});

export const FAQSectionSchema = z.object({
  id: z.string(),
  type: z.literal("faq"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("light"),
  headline: z.string(),
  items: z.array(FAQItem),
});

export const CTASectionSchema = z.object({
  id: z.string(),
  type: z.literal("cta"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("brand"),
  variant: z.enum(["simple", "banner", "card"]).default("banner"),
  headline: z.string(),
  subheadline: z.string().optional(),
  ctaText: z.string(),
  urgency: z.string().optional(),
  offer: z.string().optional(),
});

export const AgendaItem = z.object({
  time: z.string(),
  title: z.string(),
  description: z.string().optional(),
  speaker: z.string().optional(),
});

export const AgendaSectionSchema = z.object({
  id: z.string(),
  type: z.literal("agenda"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("light"),
  headline: z.string(),
  date: z.string().optional(),
  items: z.array(AgendaItem),
});

export const SpeakerItem = z.object({
  name: z.string(),
  title: z.string(),
  company: z.string(),
  bio: z.string(),
  avatar: z.string().optional(),
  linkedin: z.string().optional(),
});

export const SpeakersSectionSchema = z.object({
  id: z.string(),
  type: z.literal("speakers"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("white"),
  headline: z.string(),
  items: z.array(SpeakerItem),
});

export const ProductSectionSchema = z.object({
  id: z.string(),
  type: z.literal("product"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("white"),
  headline: z.string(),
  images: z.array(z.string()),
  description: z.string(),
  highlights: z.array(z.string()),
  price: z.string().optional(),
  originalPrice: z.string().optional(),
});

export const TrustBadgeItem = z.object({
  icon: z.string(),
  label: z.string(),
});

export const TrustBadgesSectionSchema = z.object({
  id: z.string(),
  type: z.literal("trust"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("white"),
  items: z.array(TrustBadgeItem),
});

export const StatItem = z.object({
  value: z.string(),
  label: z.string(),
});

export const StatsSectionSchema = z.object({
  id: z.string(),
  type: z.literal("stats"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("brand"),
  items: z.array(StatItem),
});

export const SectionSchema = z.discriminatedUnion("type", [
  HeroSectionSchema,
  FeaturesSectionSchema,
  BenefitsSectionSchema,
  TestimonialsSectionSchema,
  FAQSectionSchema,
  CTASectionSchema,
  AgendaSectionSchema,
  SpeakersSectionSchema,
  ProductSectionSchema,
  TrustBadgesSectionSchema,
  StatsSectionSchema,
]);

// ─── Payment ──────────────────────────────────────────────────────
export const PaymentSchema = z.object({
  razorpayKeyId: z.string().default("rzp_test_placeholder"),
  amount: z.number(),
  currency: z.string().default("INR"),
  name: z.string(),
  description: z.string(),
  prefill: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      contact: z.string().optional(),
    })
    .optional(),
  theme: z.object({ color: z.string() }).optional(),
});

// ─── Full Page Schema ─────────────────────────────────────────────
export const PageSchemaValidator = z.object({
  id: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  brand: BrandSchema,
  productImageUrl: z.string().optional(),
  productBullets: z.array(z.string()).optional(),
  template: z.enum(["minimal", "modern", "premium", "event", "d2c"]).default("modern"),
  pageType: z.enum([
    "event", "workshop", "course", "product", "service",
    "saas", "consultation", "subscription",
  ]),
  sections: z.array(SectionSchema),
  payment: PaymentSchema,
  seo: z.object({
    title: z.string(),
    description: z.string(),
    ogImage: z.string().optional(),
  }),
});

export type Brand = z.infer<typeof BrandSchema>;
export type HeroSection = z.infer<typeof HeroSectionSchema>;
export type FeaturesSection = z.infer<typeof FeaturesSectionSchema>;
export type BenefitsSection = z.infer<typeof BenefitsSectionSchema>;
export type TestimonialsSection = z.infer<typeof TestimonialsSectionSchema>;
export type FAQSection = z.infer<typeof FAQSectionSchema>;
export type CTASection = z.infer<typeof CTASectionSchema>;
export type AgendaSection = z.infer<typeof AgendaSectionSchema>;
export type SpeakersSection = z.infer<typeof SpeakersSectionSchema>;
export type ProductSection = z.infer<typeof ProductSectionSchema>;
export type TrustBadgesSection = z.infer<typeof TrustBadgesSectionSchema>;
export type StatsSection = z.infer<typeof StatsSectionSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type PageSchema = z.infer<typeof PageSchemaValidator>;

export type PageType = PageSchema["pageType"];
export type TemplateType = PageSchema["template"];

// ─── Extraction Result ────────────────────────────────────────────
export interface ExtractedBrand {
  name?: string;
  logo?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  images?: string[];
  testimonials?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  content?: string;
  tagline?: string;
}

// ─── Wizard Input ─────────────────────────────────────────────────
export interface WizardInput {
  websiteUrl?: string;
  extracted?: ExtractedBrand;
  brand: Partial<Brand>;
  pageType: PageType;
  businessDescription: string;
  productName: string;
  productDescription: string;
  productUrl?: string;
  productImageUrl?: string;
  productBullets?: string[];
  price?: number;
  currency?: string;
  links?: {
    homepage?: string;
    product?: string;
    collection?: string;
  };
}
