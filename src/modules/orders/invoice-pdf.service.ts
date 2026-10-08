import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import PDFDocument from "pdfkit";

export interface InvoicePdfData {
  storeSettings?: StoreSettingsData | null;
  orderNumber: string;
  createdAt: Date | string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountTotal?: number | null;
  gstAmount?: number | null;
  gstPercentage?: number | null;
  cgstTotal?: number | null;
  sgstTotal?: number | null;
  igstTotal?: number | null;
  deliveryFee?: number | null;
  shippingFee?: number | null;
  codFee?: number | null;
  extraFeeAmount?: number | null;
  extraFeeName?: string | null;
  grandTotal: number;
  total?: number | null;
  user?: {
    fullName?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    phoneNumber?: string | null;
  } | null;
  address?: {
    fullName?: string | null;
    streetAddress?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    phoneNumber?: string | null;
  } | null;
  items: Array<{
    productName: string;
    variantName?: string | null;
    hsnCode?: string | null;
    quantity: number;
    price: number;
    totalPrice: number;
    gstRate?: number | null;
    gstAmount?: number | null;
  }>;
}

export interface StoreSettingsData {
  gstNumber?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  storeAddress?: string | null;
  storeName?: string | null;
  storeEmail?: string | null;
  supportEmail?: string | null;
  storePhone?: string | null;
  supportPhone?: string | null;
}

function formatAddress(addr?: any): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const line1 = (addr.streetAddress || addr.addressLine1 || "").trim();
  const line2 = (addr.addressLine2 || "").trim();
  if (line1) lines.push(line1);
  if (line2 && line2.toLowerCase() !== line1.toLowerCase()) lines.push(line2);

  const parts: string[] = [];
  if (addr.city && addr.city.trim()) parts.push(addr.city.trim());
  if (addr.state && addr.state.trim()) parts.push(addr.state.trim());
  const cityState = parts.join(", ");

  const zip = (addr.postalCode || "").trim();
  if (cityState && zip) {
    lines.push(`${cityState} - ${zip}`);
  } else if (cityState) {
    lines.push(cityState);
  } else if (zip) {
    lines.push(zip);
  }

  if (addr.country && addr.country.trim()) {
    lines.push(addr.country.trim());
  }
  return lines;
}

function numberToWordsINR(num: number): string {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return "Rupees Zero Only";

  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertTwoDigits(v: number): string {
    if (v < 10) return units[v];
    if (v >= 10 && v < 20) return teens[v - 10];
    return (tens[Math.floor(v / 10)] + " " + units[v % 10]).trim();
  }

  function convertThreeDigits(v: number): string {
    const hundred = Math.floor(v / 100);
    const rest = v % 100;
    let res = "";
    if (hundred > 0) res += units[hundred] + " Hundred";
    if (rest > 0) {
      if (res) res += " ";
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  const hundredPlus = rem % 1000;

  let parts: string[] = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + " Crore");
  if (lakh > 0) parts.push(convertTwoDigits(lakh) + " Lakh");
  if (thousand > 0) parts.push(convertTwoDigits(thousand) + " Thousand");
  if (hundredPlus > 0) parts.push(convertThreeDigits(hundredPlus));

  return "Rupees " + parts.join(" ") + " Only";
}

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma?: PrismaService) {}

  public async generateInvoicePdf(orderData: InvoicePdfData, customStoreSettings?: StoreSettingsData): Promise<Buffer> {
    let storeSettings: StoreSettingsData = customStoreSettings || orderData.storeSettings || {};

    if (!customStoreSettings && this.prisma) {
      try {
        const sysSetting = await (this.prisma as any).systemSetting.findFirst();
        if (sysSetting) {
          storeSettings = {
            storeName: sysSetting.storeName || "KickAt Retail India",
            storeEmail: sysSetting.supportEmail || "support@kickat.in",
            storePhone: sysSetting.supportPhone || "+91 1800-123-5425",
            gstin: sysSetting.gstin || sysSetting.gstNumber || undefined,
            pan: sysSetting.pan || undefined,
            storeAddress: sysSetting.storeAddress || sysSetting.address || undefined,
          };
        }
      } catch (err) {
        // Fallback gracefully
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 36,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", (err) => reject(err));

        // Design Colors & Tokens
        const brandPrimary = "#F97316";   // KickAt Brand Warm Orange
        const textDark = "#0F172A";       // Slate 900
        const textBody = "#334155";       // Slate 700
        const textMuted = "#64748B";      // Slate 500
        const cardBg = "#F8FAFC";         // Slate 50
        const cardBorder = "#E2E8F0";     // Slate 200
        const tableHeaderBg = "#1E293B";  // Slate 800
        const brandLight = "#FFF7ED";     // Orange 50
        const brandBorder = "#FED7AA";    // Orange 200

        const leftMargin = 36;
        const contentWidth = 523.28;
        const rightMargin = leftMargin + contentWidth;

        const hasHsnData = orderData.items.some((item) => !!item.hsnCode);

        // 1. TOP BRAND ACCENT BAR
        doc.rect(leftMargin, 28, contentWidth, 3).fill(brandPrimary);

        let y = 44;

        // 2. REFINED TWO-COLUMN HEADER
        // LEFT: Brand Wordmark & Tax Invoice Badge
        doc.fillColor(textDark).fontSize(22).font("Helvetica-Bold").text("KickAt", leftMargin, y);
        
        doc.font("Helvetica-Bold").fontSize(22);
        const brandNameW = doc.widthOfString("KickAt");
        const pillX = leftMargin + brandNameW + 10;
        const pillY = y + 2;
        doc.roundedRect(pillX, pillY, 74, 16, 4).fillAndStroke(brandLight, brandBorder);
        doc.fillColor(brandPrimary).fontSize(7.5).font("Helvetica-Bold").text("TAX INVOICE", pillX, pillY + 4.5, { width: 74, align: "center" });

        // Seller Details
        const storeName = storeSettings.storeName || "KickAt Retail India";
        doc.fillColor(textBody).fontSize(9).font("Helvetica-Bold").text(storeName, leftMargin, y + 27);
        
        let storeSubInfo: string[] = [];
        if (storeSettings.gstin || storeSettings.gstNumber) storeSubInfo.push(`GSTIN: ${storeSettings.gstin || storeSettings.gstNumber}`);
        if (storeSettings.pan) storeSubInfo.push(`PAN: ${storeSettings.pan}`);
        storeSubInfo.push("www.kickat.in");
        doc.fillColor(textMuted).fontSize(8).font("Helvetica").text(storeSubInfo.join("  •  "), leftMargin, y + 40);

        if (storeSettings.storeAddress || storeSettings.address) {
          doc.fillColor(textMuted).fontSize(7.5).font("Helvetica").text(storeSettings.storeAddress || storeSettings.address!, leftMargin, y + 52, { width: 250 });
        }

        // RIGHT: Order Metadata Card (Structured Box - Eliminates Overlapping)
        const metaCardWidth = 215;
        const metaCardX = rightMargin - metaCardWidth;
        const metaCardY = y;
        const metaCardHeight = 74;

        doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 6).fillAndStroke(cardBg, cardBorder);

        const invDateStr = new Date(orderData.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        const paymentStatusClean = (orderData.paymentStatus || "COMPLETED").toUpperCase();
        const paymentColor = paymentStatusClean === "COMPLETED" || paymentStatusClean === "PAID" ? "#16A34A" : brandPrimary;

        const metaRows = [
          { label: "Invoice No:", val: `INV-${orderData.orderNumber}`, bold: true, color: textDark },
          { label: "Invoice Date:", val: invDateStr, bold: false, color: textBody },
          { label: "Order ID:", val: orderData.orderNumber, bold: false, color: textBody },
          { label: "Payment:", val: `${orderData.paymentMethod || "ONLINE"} • ${paymentStatusClean}`, bold: true, color: paymentColor },
        ];

        let currMetaY = metaCardY + 8;
        metaRows.forEach((r) => {
          doc.fillColor(textMuted).fontSize(7.5).font("Helvetica-Bold").text(r.label, metaCardX + 10, currMetaY, { width: 68 });
          doc.fillColor(r.color).fontSize(8).font(r.bold ? "Helvetica-Bold" : "Helvetica").text(r.val, metaCardX + 80, currMetaY, { width: metaCardWidth - 90, align: "right" });
          currMetaY += 14.5;
        });

        y += 86;

        // 3. CUSTOMER SECTION (BILL TO & SHIP TO CARDS)
        const cardGap = 12;
        const addrCardWidth = (contentWidth - cardGap) / 2;
        const billCardX = leftMargin;
        const shipCardX = leftMargin + addrCardWidth + cardGap;

        const billLines = formatAddress(orderData.address);
        const shipLines = formatAddress(orderData.address);

        const custName = orderData.user?.fullName || orderData.user?.name || orderData.address?.fullName || "Valued Customer";
        const custEmail = orderData.user?.email;
        const custPhone = orderData.user?.phone || orderData.user?.phoneNumber || orderData.address?.phone || orderData.address?.phoneNumber;

        // Calculate card height dynamically based on content lines
        const maxLines = Math.max(billLines.length, shipLines.length);
        const addrCardHeight = Math.max(82, 54 + (maxLines * 12));

        // Bill To Card
        doc.roundedRect(billCardX, y, addrCardWidth, addrCardHeight, 6).fillAndStroke(cardBg, cardBorder);
        doc.fillColor(brandPrimary).fontSize(7.5).font("Helvetica-Bold").text("BILLED TO", billCardX + 12, y + 10);
        doc.fillColor(textDark).fontSize(9.5).font("Helvetica-Bold").text(custName, billCardX + 12, y + 23, { width: addrCardWidth - 24 });

        let bLineY = y + 37;
        if (custEmail) {
          doc.fillColor(textBody).fontSize(8).font("Helvetica").text(custEmail, billCardX + 12, bLineY, { width: addrCardWidth - 24 });
          bLineY += 12;
        }
        if (custPhone) {
          doc.fillColor(textBody).fontSize(8).font("Helvetica").text(`Phone: ${custPhone}`, billCardX + 12, bLineY, { width: addrCardWidth - 24 });
          bLineY += 12;
        }
        if (billLines.length > 0) {
          doc.fillColor(textMuted).fontSize(7.5).font("Helvetica").text(billLines.join(", "), billCardX + 12, bLineY, { width: addrCardWidth - 24 });
        }

        // Ship To Card
        const shipName = orderData.address?.fullName || custName;
        const shipPhone = orderData.address?.phone || orderData.address?.phoneNumber || custPhone;

        doc.roundedRect(shipCardX, y, addrCardWidth, addrCardHeight, 6).fillAndStroke(cardBg, cardBorder);
        doc.fillColor(brandPrimary).fontSize(7.5).font("Helvetica-Bold").text("SHIPPED TO", shipCardX + 12, y + 10);
        doc.fillColor(textDark).fontSize(9.5).font("Helvetica-Bold").text(shipName, shipCardX + 12, y + 23, { width: addrCardWidth - 24 });

        let sLineY = y + 37;
        if (shipPhone) {
          doc.fillColor(textBody).fontSize(8).font("Helvetica").text(`Phone: ${shipPhone}`, shipCardX + 12, sLineY, { width: addrCardWidth - 24 });
          sLineY += 12;
        }
        if (shipLines.length > 0) {
          doc.fillColor(textMuted).fontSize(7.5).font("Helvetica").text(shipLines.join(", "), shipCardX + 12, sLineY, { width: addrCardWidth - 24 });
        }

        y += addrCardHeight + 16;

        // 4. ITEMS TABLE
        const colX = hasHsnData
          ? {
              idx: leftMargin + 8,
              desc: leftMargin + 28,
              hsn: rightMargin - 260,
              qty: rightMargin - 210,
              price: rightMargin - 155,
              taxable: rightMargin - 95,
              total: rightMargin - 10,
            }
          : {
              idx: leftMargin + 8,
              desc: leftMargin + 28,
              hsn: 0,
              qty: rightMargin - 220,
              price: rightMargin - 160,
              taxable: rightMargin - 95,
              total: rightMargin - 10,
            };

        const renderTableHeader = (currentY: number) => {
          doc.roundedRect(leftMargin, currentY, contentWidth, 22, 4).fill(tableHeaderBg);
          doc.fillColor("#FFFFFF").fontSize(7.5).font("Helvetica-Bold");

          doc.text("#", colX.idx, currentY + 7, { width: 16 });

          if (hasHsnData) {
            doc.text("ITEM DESCRIPTION", colX.desc, currentY + 7, { width: 220 });
            doc.text("HSN/SAC", colX.hsn - 20, currentY + 7, { width: 45, align: "center" });
            doc.text("QTY", colX.qty - 15, currentY + 7, { width: 35, align: "center" });
            doc.text("UNIT PRICE", colX.price - 40, currentY + 7, { width: 55, align: "right" });
            doc.text("TAXABLE", colX.taxable - 40, currentY + 7, { width: 55, align: "right" });
            doc.text("TOTAL", colX.total - 45, currentY + 7, { width: 45, align: "right" });
          } else {
            doc.text("ITEM DESCRIPTION", colX.desc, currentY + 7, { width: 260 });
            doc.text("QTY", colX.qty - 15, currentY + 7, { width: 35, align: "center" });
            doc.text("UNIT PRICE", colX.price - 40, currentY + 7, { width: 55, align: "right" });
            doc.text("TAXABLE", colX.taxable - 40, currentY + 7, { width: 55, align: "right" });
            doc.text("TOTAL", colX.total - 45, currentY + 7, { width: 45, align: "right" });
          }
        };

        renderTableHeader(y);
        y += 24;

        orderData.items.forEach((item, index) => {
          const itemTitle = item.productName || "Product Item";
          const variant = item.variantName;
          const descWidth = hasHsnData ? 215 : 255;

          doc.font("Helvetica-Bold").fontSize(8.5);
          const titleH = doc.heightOfString(itemTitle, { width: descWidth });
          const rowH = Math.max(28, titleH + (variant ? 16 : 6) + 6);

          if (y + rowH > 700) {
            doc.addPage();
            y = 36;
            doc.rect(leftMargin, y - 8, contentWidth, 3).fill(brandPrimary);
            renderTableHeader(y);
            y += 24;
          }

          // Subtle divider line under each item row
          doc.moveTo(leftMargin, y + rowH).lineTo(rightMargin, y + rowH).strokeColor(cardBorder).lineWidth(0.5).stroke();

          // Index
          doc.fillColor(textMuted).fontSize(8).font("Helvetica").text(String(index + 1), colX.idx, y + 6);

          // Product Title
          doc.fillColor(textDark).fontSize(8.5).font("Helvetica-Bold").text(itemTitle, colX.desc, y + 6, { width: descWidth });

          // Variant Tag / Badge
          if (variant) {
            const varY = y + 6 + titleH + 2;
            doc.font("Helvetica").fontSize(7.5);
            const varW = doc.widthOfString(variant) + 10;
            doc.roundedRect(colX.desc, varY, varW, 12, 3).fillAndStroke(cardBg, cardBorder);
            doc.fillColor(textBody).fontSize(7.5).font("Helvetica").text(variant, colX.desc + 5, varY + 2.5);
          }

          const taxable = Number(item.totalPrice) - Number(item.gstAmount || 0);

          doc.fillColor(textBody).fontSize(8.5).font("Helvetica");

          if (hasHsnData) {
            doc.text(item.hsnCode || "-", colX.hsn - 20, y + 6, { width: 45, align: "center" });
            doc.text(String(item.quantity), colX.qty - 15, y + 6, { width: 35, align: "center" });
            doc.text(`Rs. ${Number(item.price).toFixed(2)}`, colX.price - 40, y + 6, { width: 55, align: "right" });
            doc.text(`Rs. ${taxable.toFixed(2)}`, colX.taxable - 40, y + 6, { width: 55, align: "right" });
          } else {
            doc.text(String(item.quantity), colX.qty - 15, y + 6, { width: 35, align: "center" });
            doc.text(`Rs. ${Number(item.price).toFixed(2)}`, colX.price - 40, y + 6, { width: 55, align: "right" });
            doc.text(`Rs. ${taxable.toFixed(2)}`, colX.taxable - 40, y + 6, { width: 55, align: "right" });
          }

          doc.fillColor(textDark).fontSize(8.5).font("Helvetica-Bold");
          doc.text(`Rs. ${Number(item.totalPrice).toFixed(2)}`, colX.total - 45, y + 6, { width: 45, align: "right" });

          y += rowH;
        });

        // 5. SUMMARY & TOTALS SECTION
        y = Math.max(y + 20, 480);

        if (y > 640) {
          doc.addPage();
          y = 44;
          doc.rect(leftMargin, 28, contentWidth, 3).fill(brandPrimary);
        }

        const summaryLeftW = 270;
        const summaryRightW = 225;
        const summaryRightX = rightMargin - summaryRightW;

        // Left Column: Amount in Words Card & Terms
        const grandTotalVal = Number(orderData.grandTotal || orderData.total || 0);
        doc.roundedRect(leftMargin, y, summaryLeftW, 46, 5).fillAndStroke(cardBg, cardBorder);
        doc.rect(leftMargin, y, 3.5, 46).fill(brandPrimary);

        doc.fillColor(textMuted).fontSize(7).font("Helvetica-Bold").text("AMOUNT IN WORDS", leftMargin + 12, y + 8);
        doc.fillColor(textDark).fontSize(8.5).font("Helvetica-Bold").text(numberToWordsINR(grandTotalVal), leftMargin + 12, y + 20, { width: summaryLeftW - 24 });

        // Terms
        const termsY = y + 58;
        doc.fillColor(textMuted).fontSize(7.5).font("Helvetica-Bold").text("TERMS & CONDITIONS", leftMargin, termsY);
        doc.fillColor(textMuted).fontSize(7.5).font("Helvetica");
        doc.text("1. Goods once sold are covered under KickAt standard return policy.", leftMargin, termsY + 12, { width: summaryLeftW });
        doc.text("2. All disputes are subject to local jurisdiction.", leftMargin, termsY + 23, { width: summaryLeftW });

        // Right Column: Financial Breakdown
        let rY = y;
        const rLabelW = 125;
        const rValW = 90;
        const rLabelX = summaryRightX;
        const rValX = rightMargin - rValW;

        const addSummaryRow = (label: string, val: string, isGreen = false, isBold = false) => {
          doc.fillColor(textBody).fontSize(8).font("Helvetica").text(label, rLabelX, rY, { width: rLabelW, align: "right" });
          doc.fillColor(isGreen ? "#16A34A" : textDark).fontSize(8).font(isBold ? "Helvetica-Bold" : "Helvetica").text(val, rValX, rY, { width: rValW, align: "right" });
          rY += 13.5;
        };

        // Subtotal
        addSummaryRow("Subtotal:", `Rs. ${Number(orderData.subtotal).toFixed(2)}`);

        // Discount
        if (orderData.discountTotal && orderData.discountTotal > 0) {
          addSummaryRow("Discount:", `- Rs. ${Number(orderData.discountTotal).toFixed(2)}`, true, true);
        }

        // GST Breakdown
        const gstAmount = Number(orderData.gstAmount || 0);
        const gstPercentage = Number(orderData.gstPercentage || 0);
        const igstTotal = Number(orderData.igstTotal || 0);
        const cgstTotal = Number(orderData.cgstTotal || 0);
        const sgstTotal = Number(orderData.sgstTotal || 0);

        if (igstTotal > 0) {
          addSummaryRow(`IGST (${gstPercentage}%):`, `Rs. ${igstTotal.toFixed(2)}`);
        } else if (cgstTotal > 0 || sgstTotal > 0 || gstAmount > 0) {
          const cAmount = cgstTotal > 0 ? cgstTotal : gstAmount / 2;
          const sAmount = sgstTotal > 0 ? sgstTotal : gstAmount / 2;
          const halfPercent = gstPercentage > 0 ? (gstPercentage / 2).toFixed(1) : "9.0";
          addSummaryRow(`CGST (${halfPercent}%):`, `Rs. ${cAmount.toFixed(2)}`);
          addSummaryRow(`SGST (${halfPercent}%):`, `Rs. ${sAmount.toFixed(2)}`);
        }

        // Delivery Charges
        const delivery = Number(orderData.deliveryFee || orderData.shippingFee || 0);
        addSummaryRow("Delivery Charges:", delivery > 0 ? `Rs. ${delivery.toFixed(2)}` : "FREE", delivery === 0, delivery === 0);

        // COD Fee
        if (orderData.codFee && orderData.codFee > 0) {
          addSummaryRow("COD Handling Fee:", `Rs. ${Number(orderData.codFee).toFixed(2)}`);
        }

        // Other / Extra Fee
        if (orderData.extraFeeAmount && orderData.extraFeeAmount > 0) {
          const extraLabel = (orderData.extraFeeName || "Other Fee") + ":";
          addSummaryRow(extraLabel, `Rs. ${Number(orderData.extraFeeAmount).toFixed(2)}`);
        }

        rY += 4;
        doc.moveTo(rLabelX + 25, rY).lineTo(rightMargin, rY).strokeColor(cardBorder).lineWidth(0.75).stroke();
        rY += 8;

        // GRAND TOTAL HIGHLIGHT CARD
        const gtCardH = 34;
        doc.roundedRect(summaryRightX, rY, summaryRightW, gtCardH, 5).fillAndStroke(brandLight, brandBorder);
        doc.rect(summaryRightX, rY, 3.5, gtCardH).fill(brandPrimary);

        doc.fillColor(textDark).fontSize(9.5).font("Helvetica-Bold").text("GRAND TOTAL", summaryRightX + 14, rY + 11);
        doc.fillColor(brandPrimary).fontSize(12.5).font("Helvetica-Bold").text(`Rs. ${grandTotalVal.toFixed(2)}`, rValX - 25, rY + 10, { width: rValW + 20, align: "right" });

        // 6. FOOTER (Anchored at page bottom Y: 760)
        const footerY = 760;
        doc.moveTo(leftMargin, footerY).lineTo(rightMargin, footerY).strokeColor(cardBorder).lineWidth(0.5).stroke();

        doc.fillColor(textDark).fontSize(8.5).font("Helvetica-Bold").text("Thank you for choosing KickAt!", leftMargin, footerY + 10, { width: contentWidth, align: "center" });

        let footerContacts = ["KickAt"];
        if (storeSettings.storeEmail) footerContacts.push(storeSettings.storeEmail);
        if (storeSettings.storePhone) footerContacts.push(storeSettings.storePhone);
        footerContacts.push("www.kickat.in");

        doc.fillColor(textMuted).fontSize(7.5).font("Helvetica").text(footerContacts.join("   •   "), leftMargin, footerY + 22, { width: contentWidth, align: "center" });
        doc.fillColor("#94A3B8").fontSize(6.5).font("Helvetica").text("This is an authentic, computer-generated tax invoice and does not require a physical signature.", leftMargin, footerY + 34, { width: contentWidth, align: "center" });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
