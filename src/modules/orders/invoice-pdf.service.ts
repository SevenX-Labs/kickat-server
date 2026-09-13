import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import PDFDocument from "pdfkit";

export interface InvoicePdfData {
  orderNumber: string;
  createdAt: Date | string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountTotal?: number;
  gstAmount?: number;
  gstPercentage?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  deliveryFee?: number;
  shippingFee?: number;
  codFee?: number;
  extraFeeAmount?: number;
  extraFeeName?: string;
  grandTotal: number;
  total?: number;
  user?: {
    fullName?: string;
    name?: string;
    email?: string;
    phone?: string;
    phoneNumber?: string;
  };
  address?: {
    fullName?: string;
    streetAddress?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    phoneNumber?: string;
  };
  items: Array<{
    productName: string;
    variantName?: string | null;
    hsnCode?: string | null;
    quantity: number;
    price: number;
    totalPrice: number;
    gstRate?: number;
    gstAmount?: number;
  }>;
}

export interface StoreSettingsData {
  storeName?: string;
  storeEmail?: string;
  storePhone?: string;
  gstin?: string;
  pan?: string;
  storeAddress?: string;
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
    let storeSettings: StoreSettingsData = customStoreSettings || {};

    if (!customStoreSettings && this.prisma) {
      try {
        const sysSetting = await (this.prisma as any).systemSetting.findFirst();
        if (sysSetting) {
          storeSettings = {
            storeName: sysSetting.storeName || "KickAt Retail India",
            storeEmail: sysSetting.supportEmail || "support@kickat.co.in",
            storePhone: sysSetting.supportPhone || "+91 1800-123-5425",
            gstin: sysSetting.gstin || undefined,
            pan: sysSetting.pan || undefined,
            storeAddress: sysSetting.storeAddress || sysSetting.address || undefined,
          };
        }
      } catch (err) {
        // Fallback to clean defaults if settings lookup fails
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 40,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", (err) => reject(err));

        // Design Colors & Tokens
        const brandOrange = "#FF6B00";
        const darkText = "#0F172A";
        const bodyText = "#334155";
        const mutedText = "#64748B";
        const lightBorder = "#E2E8F0";
        const subtleBg = "#F8FAFC";

        // Check whether HSN data exists across items
        const hasHsnData = orderData.items.some((item) => !!item.hsnCode);

        // 1. TOP BRAND ACCENT BAR
        doc.rect(40, 40, 515, 4).fill(brandOrange);

        let y = 55;

        // 2. REFINED TWO-COLUMN HEADER
        // LEFT: Brand Logo & Title
        doc.fillColor(darkText).fontSize(22).font("Helvetica-Bold").text("KickAt", 40, y);
        doc.fillColor(brandOrange).fontSize(10).font("Helvetica-Bold").text("TAX INVOICE", 40, y + 26);
        
        const storeName = storeSettings.storeName || "KickAt Retail India";
        doc.fillColor(bodyText).fontSize(9).font("Helvetica").text(storeName, 40, y + 40);
        
        let storeSubInfo = [];
        if (storeSettings.gstin) storeSubInfo.push(`GSTIN: ${storeSettings.gstin}`);
        if (storeSettings.pan) storeSubInfo.push(`PAN: ${storeSettings.pan}`);
        if (storeSubInfo.length > 0) {
          doc.fillColor(mutedText).fontSize(8).text(storeSubInfo.join("  |  "), 40, y + 52);
        }

        if (storeSettings.storeAddress) {
          doc.fillColor(mutedText).fontSize(8).text(storeSettings.storeAddress, 40, y + 64, { width: 260 });
        }

        // RIGHT: Invoice Metadata Block
        const invDateStr = new Date(orderData.createdAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        const metaX = 350;
        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("INVOICE NO:", metaX, y + 4, { width: 80, align: "right" });
        doc.fillColor(darkText).fontSize(9).font("Helvetica-Bold").text(`INV-${orderData.orderNumber}`, metaX + 85, y + 3, { width: 120, align: "right" });

        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("INVOICE DATE:", metaX, y + 18, { width: 80, align: "right" });
        doc.fillColor(darkText).fontSize(9).font("Helvetica").text(invDateStr, metaX + 85, y + 17, { width: 120, align: "right" });

        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("ORDER NO:", metaX, y + 32, { width: 80, align: "right" });
        doc.fillColor(darkText).fontSize(9).font("Helvetica").text(orderData.orderNumber, metaX + 85, y + 31, { width: 120, align: "right" });

        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("PAYMENT METHOD:", metaX, y + 46, { width: 80, align: "right" });
        doc.fillColor(darkText).fontSize(9).font("Helvetica").text(orderData.paymentMethod || "ONLINE", metaX + 85, y + 45, { width: 120, align: "right" });

        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("PAYMENT STATUS:", metaX, y + 60, { width: 80, align: "right" });
        doc.fillColor(darkText).fontSize(9).font("Helvetica-Bold").text(orderData.paymentStatus || "PAID", metaX + 85, y + 59, { width: 120, align: "right" });

        y += 85;

        // DIVIDER LINE
        doc.moveTo(40, y).lineTo(555, y).strokeColor(lightBorder).lineWidth(0.75).stroke();
        y += 15;

        // 3. CUSTOMER SECTION (BILL TO & SHIP TO)
        const custBoxWidth = 245;
        const billX = 40;
        const shipX = 310;

        // BILL TO
        doc.fillColor(brandOrange).fontSize(9).font("Helvetica-Bold").text("BILL TO", billX, y);
        doc.moveTo(billX, y + 13).lineTo(billX + 60, y + 13).strokeColor(brandOrange).lineWidth(1).stroke();
        
        let billY = y + 20;
        const custName = orderData.user?.fullName || orderData.user?.name || orderData.address?.fullName || "Valued Customer";
        doc.fillColor(darkText).fontSize(9.5).font("Helvetica-Bold").text(custName, billX, billY);
        billY += 14;

        if (orderData.user?.email) {
          doc.fillColor(bodyText).fontSize(8.5).font("Helvetica").text(orderData.user.email, billX, billY);
          billY += 12;
        }

        const phone = orderData.user?.phone || orderData.user?.phoneNumber || orderData.address?.phone || orderData.address?.phoneNumber;
        if (phone) {
          doc.fillColor(bodyText).fontSize(8.5).font("Helvetica").text(`Phone: ${phone}`, billX, billY);
          billY += 12;
        }

        if (orderData.address) {
          const addrStr = [
            orderData.address.streetAddress || orderData.address.addressLine1,
            orderData.address.addressLine2,
            `${orderData.address.city || ""}, ${orderData.address.state || ""} - ${orderData.address.postalCode || ""}`,
            orderData.address.country || "India",
          ].filter(Boolean).join(", ");
          doc.fillColor(mutedText).fontSize(8.5).font("Helvetica").text(addrStr, billX, billY, { width: custBoxWidth });
        }

        // SHIP TO
        doc.fillColor(brandOrange).fontSize(9).font("Helvetica-Bold").text("SHIP TO", shipX, y);
        doc.moveTo(shipX, y + 13).lineTo(shipX + 60, y + 13).strokeColor(brandOrange).lineWidth(1).stroke();

        let shipY = y + 20;
        const shipName = orderData.address?.fullName || custName;
        doc.fillColor(darkText).fontSize(9.5).font("Helvetica-Bold").text(shipName, shipX, shipY);
        shipY += 14;

        if (orderData.address) {
          const addrStr = [
            orderData.address.streetAddress || orderData.address.addressLine1,
            orderData.address.addressLine2,
            `${orderData.address.city || ""}, ${orderData.address.state || ""} - ${orderData.address.postalCode || ""}`,
            orderData.address.country || "India",
          ].filter(Boolean).join(", ");
          doc.fillColor(mutedText).fontSize(8.5).font("Helvetica").text(addrStr, shipX, shipY, { width: custBoxWidth });
          shipY += 28;
        }

        const shipPhone = orderData.address?.phone || orderData.address?.phoneNumber || phone;
        if (shipPhone) {
          doc.fillColor(bodyText).fontSize(8.5).font("Helvetica").text(`Phone: ${shipPhone}`, shipX, shipY);
        }

        y = Math.max(billY + 30, shipY + 20);

        // 4. ITEM TABLE
        const renderTableHeader = (currentY: number) => {
          doc.rect(40, currentY, 515, 20).fill(subtleBg);
          doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(lightBorder).lineWidth(0.75).stroke();
          doc.moveTo(40, currentY + 20).lineTo(555, currentY + 20).strokeColor(lightBorder).lineWidth(0.75).stroke();

          doc.fillColor(darkText).fontSize(8).font("Helvetica-Bold");

          if (hasHsnData) {
            doc.text("#", 45, currentY + 6, { width: 20 });
            doc.text("ITEM DESCRIPTION", 70, currentY + 6, { width: 200 });
            doc.text("HSN/SAC", 275, currentY + 6, { width: 50, align: "center" });
            doc.text("QTY", 330, currentY + 6, { width: 30, align: "center" });
            doc.text("UNIT PRICE", 365, currentY + 6, { width: 55, align: "right" });
            doc.text("TAXABLE", 425, currentY + 6, { width: 55, align: "right" });
            doc.text("TOTAL", 485, currentY + 6, { width: 60, align: "right" });
          } else {
            doc.text("#", 48, currentY + 6, { width: 20 });
            doc.text("ITEM DESCRIPTION", 75, currentY + 6, { width: 240 });
            doc.text("QTY", 320, currentY + 6, { width: 35, align: "center" });
            doc.text("UNIT PRICE", 360, currentY + 6, { width: 65, align: "right" });
            doc.text("TAXABLE", 430, currentY + 6, { width: 55, align: "right" });
            doc.text("TOTAL", 490, currentY + 6, { width: 55, align: "right" });
          }
        };

        renderTableHeader(y);
        y += 20;

        orderData.items.forEach((item, index) => {
          const itemTitle = item.productName || "Product Item";
          const variantTitle = item.variantName ? item.variantName : null;

          const descWidth = hasHsnData ? 200 : 240;
          doc.font("Helvetica").fontSize(9);
          let titleHeight = doc.heightOfString(itemTitle, { width: descWidth });
          let variantHeight = variantTitle ? doc.heightOfString(variantTitle, { width: descWidth }) : 0;
          
          let rowHeight = Math.max(26, titleHeight + variantHeight + 10);

          if (y + rowHeight > 700) {
            doc.addPage();
            y = 40;
            doc.rect(40, y, 515, 4).fill(brandOrange);
            y += 15;
            renderTableHeader(y);
            y += 20;
          }

          // Subtle bottom border for row
          doc.moveTo(40, y + rowHeight).lineTo(555, y + rowHeight).strokeColor(lightBorder).lineWidth(0.5).stroke();

          doc.fillColor(darkText).fontSize(8.5);

          if (hasHsnData) {
            doc.text(`${index + 1}`, 45, y + 6, { width: 20 });
            
            // Item title & variant stack
            doc.font("Helvetica-Bold").text(itemTitle, 70, y + 6, { width: descWidth });
            if (variantTitle) {
              doc.fillColor(mutedText).fontSize(7.5).font("Helvetica").text(variantTitle, 70, y + 6 + titleHeight + 2, { width: descWidth });
            }
            
            doc.fillColor(bodyText).fontSize(8.5).font("Helvetica");
            doc.text(item.hsnCode || "-", 275, y + 6, { width: 50, align: "center" });
            doc.text(`${item.quantity}`, 330, y + 6, { width: 30, align: "center" });
            doc.text(`Rs. ${Number(item.price).toFixed(2)}`, 365, y + 6, { width: 55, align: "right" });
            
            const taxable = Number(item.totalPrice) - Number(item.gstAmount || 0);
            doc.text(`Rs. ${taxable.toFixed(2)}`, 425, y + 6, { width: 55, align: "right" });
            doc.text(`Rs. ${Number(item.totalPrice).toFixed(2)}`, 485, y + 6, { width: 60, align: "right" });
          } else {
            doc.text(`${index + 1}`, 48, y + 6, { width: 20 });
            
            // Item title & variant stack
            doc.font("Helvetica-Bold").text(itemTitle, 75, y + 6, { width: descWidth });
            if (variantTitle) {
              doc.fillColor(mutedText).fontSize(7.5).font("Helvetica").text(variantTitle, 75, y + 6 + titleHeight + 2, { width: descWidth });
            }

            doc.fillColor(bodyText).fontSize(8.5).font("Helvetica");
            doc.text(`${item.quantity}`, 320, y + 6, { width: 35, align: "center" });
            doc.text(`Rs. ${Number(item.price).toFixed(2)}`, 360, y + 6, { width: 65, align: "right" });
            
            const taxable = Number(item.totalPrice) - Number(item.gstAmount || 0);
            doc.text(`Rs. ${taxable.toFixed(2)}`, 430, y + 6, { width: 55, align: "right" });
            doc.text(`Rs. ${Number(item.totalPrice).toFixed(2)}`, 490, y + 6, { width: 55, align: "right" });
          }

          y += rowHeight;
        });

        // Balance vertical spacing if single page
        if (y < 520) {
          y = 520;
        } else {
          y += 20;
        }

        // 5. SUMMARY & TOTALS SECTION
        const summaryY = y;

        // Left Column: Terms & Amount in Words
        const leftWidth = 280;
        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("AMOUNT IN WORDS", 40, summaryY);
        const grandTotalVal = Number(orderData.grandTotal || orderData.total || 0);
        doc.fillColor(darkText).fontSize(9).font("Helvetica-Bold").text(numberToWordsINR(grandTotalVal), 40, summaryY + 12, { width: leftWidth });

        doc.fillColor(mutedText).fontSize(8).font("Helvetica-Bold").text("TERMS & CONDITIONS", 40, summaryY + 45);
        doc.fillColor(mutedText).fontSize(7.5).font("Helvetica");
        doc.text("1. Goods once sold are covered under KickAt standard return policy.", 40, summaryY + 57, { width: leftWidth });
        doc.text("2. All disputes are subject to local jurisdiction.", 40, summaryY + 68, { width: leftWidth });

        // Right Column: Price & GST Breakdown
        const rightLabelX = 330;
        const rightValX = 455;
        const rightValWidth = 100;
        let sumRowY = summaryY;

        doc.fillColor(bodyText).fontSize(8.5).font("Helvetica");

        // Subtotal
        doc.text("Subtotal:", rightLabelX, sumRowY, { width: 120, align: "right" });
        doc.text(`Rs. ${Number(orderData.subtotal).toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
        sumRowY += 14;

        // Discount
        if (orderData.discountTotal && orderData.discountTotal > 0) {
          doc.text("Discount:", rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`- Rs. ${Number(orderData.discountTotal).toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;
        }

        // GST Handling (Respect existing stored order historical data: IGST vs CGST/SGST)
        const gstAmount = Number(orderData.gstAmount || 0);
        const gstPercentage = Number(orderData.gstPercentage || 0);
        const igstTotal = Number(orderData.igstTotal || 0);
        const cgstTotal = Number(orderData.cgstTotal || 0);
        const sgstTotal = Number(orderData.sgstTotal || 0);

        if (igstTotal > 0) {
          doc.text(`IGST (${gstPercentage}%): `, rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`Rs. ${igstTotal.toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;
        } else if (cgstTotal > 0 || sgstTotal > 0 || gstAmount > 0) {
          const cAmount = cgstTotal > 0 ? cgstTotal : gstAmount / 2;
          const sAmount = sgstTotal > 0 ? sgstTotal : gstAmount / 2;
          const halfPercent = gstPercentage > 0 ? (gstPercentage / 2).toFixed(1) : "9.0";

          doc.text(`CGST (${halfPercent}%): `, rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`Rs. ${cAmount.toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;

          doc.text(`SGST (${halfPercent}%): `, rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`Rs. ${sAmount.toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;
        }

        // Delivery Charges
        const delivery = Number(orderData.deliveryFee || orderData.shippingFee || 0);
        doc.text("Delivery Charges:", rightLabelX, sumRowY, { width: 120, align: "right" });
        doc.text(delivery > 0 ? `Rs. ${delivery.toFixed(2)}` : "FREE", rightValX, sumRowY, { width: rightValWidth, align: "right" });
        sumRowY += 14;

        // COD Fee
        if (orderData.codFee && orderData.codFee > 0) {
          doc.text("COD Fee:", rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`Rs. ${Number(orderData.codFee).toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;
        }

        // Other Fee
        if (orderData.extraFeeAmount && orderData.extraFeeAmount > 0) {
          const extraLabel = orderData.extraFeeName || "Other Fee";
          doc.text(`${extraLabel}:`, rightLabelX, sumRowY, { width: 120, align: "right" });
          doc.text(`Rs. ${Number(orderData.extraFeeAmount).toFixed(2)}`, rightValX, sumRowY, { width: rightValWidth, align: "right" });
          sumRowY += 14;
        }

        sumRowY += 4;
        // Divider above Grand Total
        doc.moveTo(rightLabelX + 40, sumRowY).lineTo(555, sumRowY).strokeColor(lightBorder).lineWidth(0.75).stroke();
        sumRowY += 10;

        // GRAND TOTAL (Elegant Highlighting with Accent Left Bar)
        doc.rect(rightLabelX + 30, sumRowY - 4, 195, 28).fill(subtleBg);
        doc.rect(rightLabelX + 30, sumRowY - 4, 3, 28).fill(brandOrange);

        doc.fillColor(darkText).fontSize(11).font("Helvetica-Bold");
        doc.text("GRAND TOTAL", rightLabelX + 40, sumRowY + 3, { width: 85 });
        doc.fillColor(brandOrange).fontSize(12).font("Helvetica-Bold");
        doc.text(`Rs. ${grandTotalVal.toFixed(2)}`, rightValX - 10, sumRowY + 3, { width: 110, align: "right" });

        // 6. FOOTER (Anchored at page bottom Y: 760)
        doc.moveTo(40, 755).lineTo(555, 755).strokeColor(lightBorder).lineWidth(0.5).stroke();
        
        doc.fillColor(darkText).fontSize(9).font("Helvetica-Bold").text("Thank you for shopping with KickAt.", 40, 765, { align: "center" });

        let footerContacts = ["KickAt"];
        if (storeSettings.storeEmail) footerContacts.push(storeSettings.storeEmail);
        if (storeSettings.storePhone) footerContacts.push(storeSettings.storePhone);
        footerContacts.push("www.kickat.co.in");

        doc.fillColor(mutedText).fontSize(8).font("Helvetica").text(footerContacts.join("  |  "), 40, 778, { align: "center" });
        doc.fillColor(mutedText).fontSize(7).font("Helvetica").text("This is a computer-generated invoice and does not require a signature.", 40, 790, { align: "center" });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
