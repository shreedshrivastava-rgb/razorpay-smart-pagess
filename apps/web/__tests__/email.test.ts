import { describe, it, expect } from "@jest/globals";
import { buyerReceiptEmail, merchantSaleEmail, refundEmail, emailConfigured } from "@/lib/email";

const base = {
  brandName: "Priya's Cakes",
  productName: "Chocolate Cake",
  amount: 65000, // ₹650.00 in paise
  currency: "INR",
  paymentId: "pay_TEST123",
  customerName: "Asha Verma",
  customerEmail: "asha@example.com",
};

describe("email templates", () => {
  it("buyer receipt includes brand, product, formatted amount, payment id", () => {
    const { subject, html } = buyerReceiptEmail(base);
    expect(subject).toContain("Priya's Cakes");
    expect(html).toContain("Chocolate Cake");
    expect(html).toContain("650");
    expect(html).toContain("pay_TEST123");
    expect(html).toContain("Asha"); // first name greeting
  });

  it("merchant sale alert shows amount in the subject", () => {
    const { subject, html } = merchantSaleEmail(base);
    expect(subject).toContain("650");
    expect(html).toContain("You made a sale");
  });

  it("refund email shows the refunded amount", () => {
    const { subject, html } = refundEmail({ ...base, refundAmount: 30000 });
    expect(subject).toContain("Refund");
    expect(html).toContain("300"); // ₹300.00 refunded
  });

  it("escapes HTML in brand/product to prevent injection", () => {
    const { html } = buyerReceiptEmail({ ...base, productName: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("free orders render 'Free' instead of an amount", () => {
    const { html } = buyerReceiptEmail({ ...base, amount: 0 });
    expect(html).toContain("Free");
  });

  it("emailConfigured reflects env presence", () => {
    const had = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
    if (had) process.env.RESEND_API_KEY = had;
  });
});
