import type { TrustBadgesSection, Brand } from "@/lib/schema/page-schema";

interface TrustBadgesBlockProps {
  section: TrustBadgesSection;
  brand: Brand;
}

export function TrustBadgesBlock({ section }: TrustBadgesBlockProps) {
  return (
    <section className="py-10 bg-white border-y border-gray-100">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {section.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-gray-600">
              <span className="text-2xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
