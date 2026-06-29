import { z } from "zod";

// ─── Shared sub-schemas ───────────────────────────────────────────
export const SocialLinksSchema = z.object({
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  website: z.string().optional(),
});

export const CustomFieldSchema = z.object({
  label: z.string(),
  required: z.boolean().default(false),
  type: z.enum(["text", "select"]).default("text"),
  options: z.array(z.string()).optional(),
});

// A variant choice is either a plain label (no price change) or a label with a
// priceDelta in paise added to the base price (e.g. "1.5kg" → +10000).
export const VariantChoiceSchema = z.union([
  z.string(),
  z.object({ label: z.string(), priceDelta: z.number().default(0) }),
]);
export const VariantOptionSchema = z.object({
  label: z.string(),
  options: z.array(VariantChoiceSchema),
});

// Normalize a choice to { label, priceDelta } regardless of which form it's in.
export function variantChoice(opt: z.infer<typeof VariantChoiceSchema>): { label: string; priceDelta: number } {
  return typeof opt === "string" ? { label: opt, priceDelta: 0 } : { label: opt.label, priceDelta: opt.priceDelta ?? 0 };
}

// ─── Brand ───────────────────────────────────────────────────────
export const BrandSchema = z.object({
  name: z.string(),
  logo: z.string().url().optional(),
  tagline: z.string().optional(),
  primaryColor: z.string().default("#6366f1"),
  secondaryColor: z.string().default("#0f172a"),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
  socialLinks: SocialLinksSchema.optional(),
  deliveryInfo: z.string().optional(),
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

export const PricingPlanItem = z.object({
  name: z.string(),
  price: z.string(),
  period: z.string().optional(),
  features: z.array(z.string()),
  highlighted: z.boolean().default(false),
});

export const PricingSectionSchema = z.object({
  id: z.string(),
  type: z.literal("pricing"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("light"),
  headline: z.string(),
  subheadline: z.string().optional(),
  items: z.array(PricingPlanItem),
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

export const ProductGridItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),        // paise — minimum / starting price
  maxPrice: z.number().optional(), // paise — maximum price when sizes differ (e.g. 0.5kg ₹200, 1.5kg ₹300)
  currency: z.string().default("INR"),
  imageUrl: z.string().optional(),
  badge: z.string().optional(),   // "Best Seller", "New", "20% Off"
  bullets: z.array(z.string()).optional(),
});

export const ProductGridSectionSchema = z.object({
  id: z.string(),
  type: z.literal("product-grid"),
  visible: z.boolean().default(true),
  background: z.enum(["white", "light", "dark", "brand", "gradient"]).default("light"),
  headline: z.string(),
  subheadline: z.string().optional(),
  layout: z.enum(["grid-2", "grid-3"]).default("grid-3"),
  items: z.array(ProductGridItemSchema),
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
  PricingSectionSchema,
  ProductGridSectionSchema,
]);

// ─── Payment ──────────────────────────────────────────────────────
export const CouponConfigSchema = z.object({
  code: z.string(),
  discountPercent: z.number().min(0).max(100),
});

// Customizable post-payment thank-you screen.
export const ThankYouConfigSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  showOrderSummary: z.boolean().optional(),
  socialShare: z.array(z.enum(["whatsapp", "linkedin", "twitter", "facebook"])).optional(),
  reviewUrl: z.string().optional(),       // Google review / survey link
  nextSteps: z.object({ text: z.string(), url: z.string().optional() }).optional(),
});

export const PaymentSchema = z.object({
  razorpayKeyId: z.string().default("rzp_test_placeholder"),
  razorpayMode: z.enum(["test", "live"]).default("test"),
  amount: z.number(),
  originalAmount: z.number().optional(),
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
  couponConfig: CouponConfigSchema.optional(),
  customFields: z.array(CustomFieldSchema).optional(),
  methodConfig: z
    .object({
      upi: z.boolean().optional(),
      card: z.boolean().optional(),
      netbanking: z.boolean().optional(),
      wallet: z.boolean().optional(),
    })
    .optional(),
  thankYouConfig: ThankYouConfigSchema.optional(),
});

// ─── Full Page Schema ─────────────────────────────────────────────
export const PageSchemaValidator = z.object({
  id: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  brand: BrandSchema,
  productImageUrl: z.string().optional(),
  productImages: z.array(z.string()).optional(),
  productBullets: z.array(z.string()).optional(),
  template: z.enum(["minimal", "modern", "premium", "event", "d2c"]).default("modern"),
  pageType: z.enum([
    "event", "workshop", "course", "product", "service",
    "saas", "consultation", "subscription",
    "landing", "collection",
  ]),
  sections: z.array(SectionSchema),
  payment: PaymentSchema,
  seo: z.object({
    title: z.string(),
    description: z.string(),
    ogImage: z.string().optional(),
  }),
  // Social proof
  reviewCount: z.number().optional(),
  averageRating: z.number().min(0).max(5).optional(),
  // Product variants & options
  variants: z.array(VariantOptionSchema).optional(),
  maxQuantity: z.number().default(1),
  // Urgency & scarcity
  urgencyEndsAt: z.string().optional(),
  stockCount: z.number().optional(),
  // Pre-order
  isPreOrder: z.boolean().default(false),
  deliveryLabel: z.string().optional(),
  // Publication state
  status: z.enum(["draft", "published"]).default("published"),
});

export type Brand = z.infer<typeof BrandSchema>;
export type SocialLinks = z.infer<typeof SocialLinksSchema>;
export type CustomField = z.infer<typeof CustomFieldSchema>;
export type VariantOption = z.infer<typeof VariantOptionSchema>;
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
export type PricingSection = z.infer<typeof PricingSectionSchema>;
export type ProductGridItem = z.infer<typeof ProductGridItemSchema>;
export type ProductGridSection = z.infer<typeof ProductGridSectionSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type ThankYouConfig = z.infer<typeof ThankYouConfigSchema>;
export type CouponConfig = z.infer<typeof CouponConfigSchema>;
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
  productImages?: string[];
  productBullets?: string[];
  price?: number;
  originalPrice?: number;
  currency?: string;
  links?: {
    homepage?: string;
    product?: string;
    collection?: string;
  };
  // Variants & options
  variants?: VariantOption[];
  maxQuantity?: number;
  customFields?: CustomField[];
  // Urgency & scarcity
  urgencyEndsAt?: string;
  stockCount?: number;
  // Pre-order
  isPreOrder?: boolean;
  deliveryLabel?: string;
  // Coupons
  couponConfig?: { code: string; discountPercent: number };
  // Social proof
  reviewCount?: number;
  averageRating?: number;
  // Language
  language?: string;
  // Collection page: multiple products
  collectionProducts?: CollectionProductInput[];
}

export interface CollectionProductInput {
  id?: string;       // stable id — preserved across regenerations so edits/images don't get lost
  name: string;
  price: number;     // paise — minimum / starting price
  maxPrice?: number; // paise — maximum price when sizes have different prices
  description?: string;
  imageUrl?: string;
  badge?: string;
  bullets?: string[];
}
