import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

function numberToWordsINR(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return 'Rupees Zero Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  function convertChunk(n: number): string {
    let str = '';
    if (n >= 100) {
      str += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += units[n] + ' ';
    }
    return str;
  }

  let num = rounded;
  let words = '';

  if (Math.floor(num / 10000000) > 0) {
    words += convertChunk(Math.floor(num / 10000000)) + 'Crore ';
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    words += convertChunk(Math.floor(num / 100000)) + 'Lakh ';
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    words += convertChunk(Math.floor(num / 1000)) + 'Thousand ';
    num %= 1000;
  }
  if (num > 0) {
    words += convertChunk(num);
  }

  return `Rupees ${words.trim()} Only`;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  async generateInvoicePdf(orderData: {
    orderNumber: string;
    createdAt: Date | string;
    subtotal: number;
    gstPercentage?: number | null;
    gstAmount?: number | null;
    deliveryFee: number;
    codFee?: number | null;
    extraFeeName?: string | null;
    extraFeeAmount?: number | null;
    grandTotal: number;
    paymentMethod: string;
    paymentStatus: string;
    user?: { name?: string | null; email?: string | null; phone?: string | null } | null;
    address?: {
      fullName?: string | null;
      streetAddress?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      phone?: string | null;
    } | null;
    items: Array<{
      productName: string;
      variantName?: string | null;
      quantity: number;
      price: number;
      totalPrice: number;
    }>;
    storeSettings?: {
      supportEmail?: string | null;
      supportPhone?: string | null;
      gstNumber?: string | null;
    } | null;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const primaryColor = '#1A365D'; // Dark Blue
        const secondaryColor = '#4A5568'; // Slate Gray
        const borderColor = '#E2E8F0'; // Light Gray border

        // Header Section
        doc.fillColor(primaryColor).fontSize(22).font('Helvetica-Bold').text('KickAt', 40, 40);
        doc.fillColor(secondaryColor).fontSize(9).font('Helvetica').text('Official Store Invoice', 40, 66);

        if (orderData.storeSettings?.supportEmail) {
          doc.text(`Support: ${orderData.storeSettings.supportEmail}`, 40, 78);
        }
        if (orderData.storeSettings?.supportPhone) {
          doc.text(`Phone: ${orderData.storeSettings.supportPhone}`, 40, 90);
        }
        if (orderData.storeSettings?.gstNumber) {
          doc.fillColor(primaryColor).font('Helvetica-Bold').text(`GSTIN: ${orderData.storeSettings.gstNumber}`, 40, 102);
        }

        // TAX INVOICE Title (Top Right)
        doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', 350, 40, { align: 'right' });

        // Invoice Metadata Box
        doc.fillColor(secondaryColor).fontSize(9).font('Helvetica');
        const invDateStr = new Date(orderData.createdAt).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        doc.text(`Invoice No: INV-${orderData.orderNumber}`, 350, 66, { align: 'right' });
        doc.text(`Invoice Date: ${invDateStr}`, 350, 78, { align: 'right' });
        doc.text(`Order No: ${orderData.orderNumber}`, 350, 90, { align: 'right' });
        doc.text(`Payment Method: ${orderData.paymentMethod}`, 350, 102, { align: 'right' });
        doc.text(`Payment Status: ${orderData.paymentStatus}`, 350, 114, { align: 'right' });

        // Horizontal Line
        doc.moveTo(40, 130).lineTo(555, 130).strokeColor(borderColor).lineWidth(1).stroke();

        // Customer & Address Details
        let currentY = 142;
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('CUSTOMER & BILLING DETAILS', 40, currentY);

        currentY += 16;
        doc.fillColor(secondaryColor).fontSize(9).font('Helvetica');
        const custName = orderData.address?.fullName || orderData.user?.name || 'Valued Customer';
        doc.text(`Name: ${custName}`, 40, currentY);
        currentY += 12;

        if (orderData.user?.email) {
          doc.text(`Email: ${orderData.user.email}`, 40, currentY);
          currentY += 12;
        }

        const phone = orderData.address?.phone || orderData.user?.phone;
        if (phone) {
          doc.text(`Phone: ${phone}`, 40, currentY);
          currentY += 12;
        }

        if (orderData.address) {
          const addrLines = [
            orderData.address.streetAddress,
            `${orderData.address.city || ''}, ${orderData.address.state || ''} ${orderData.address.postalCode || ''}`,
            orderData.address.country || 'India',
          ].filter(Boolean);

          addrLines.forEach((line) => {
            doc.text(line as string, 40, currentY);
            currentY += 12;
          });
        }

        currentY = Math.max(currentY, 210);

        // Table Header
        doc.rect(40, currentY, 515, 20).fill('#EDF2F7');
        doc.fillColor('#2D3748').fontSize(9).font('Helvetica-Bold');
        doc.text('#', 45, currentY + 5, { width: 20 });
        doc.text('Item Description', 70, currentY + 5, { width: 260 });
        doc.text('Qty', 340, currentY + 5, { width: 40, align: 'center' });
        doc.text('Unit Price', 390, currentY + 5, { width: 75, align: 'right' });
        doc.text('Total', 475, currentY + 5, { width: 75, align: 'right' });

        currentY += 24;

        // Items List
        doc.font('Helvetica').fontSize(9);
        orderData.items.forEach((item, index) => {
          if (currentY > 730) {
            doc.addPage();
            currentY = 40;
          }

          const desc = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
          
          doc.fillColor('#4A5568');
          doc.text(`${index + 1}`, 45, currentY, { width: 20 });
          doc.text(desc, 70, currentY, { width: 260 });
          doc.text(`${item.quantity}`, 340, currentY, { width: 40, align: 'center' });
          doc.text(`₹${Number(item.price).toFixed(2)}`, 390, currentY, { width: 75, align: 'right' });
          doc.text(`₹${Number(item.totalPrice).toFixed(2)}`, 475, currentY, { width: 75, align: 'right' });

          const rowHeight = Math.max(16, doc.heightOfString(desc, { width: 260 }) + 4);
          currentY += rowHeight;

          doc.moveTo(40, currentY - 2).lineTo(555, currentY - 2).strokeColor('#F7FAFC').lineWidth(0.5).stroke();
        });

        currentY += 10;
        if (currentY > 680) {
          doc.addPage();
          currentY = 40;
        }

        // Horizontal Line above summary
        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(borderColor).lineWidth(1).stroke();
        currentY += 10;

        // Summary Table
        const summaryX = 330;
        const valueX = 475;
        const summaryWidth = 140;

        doc.fillColor('#4A5568').font('Helvetica').fontSize(9);

        // Subtotal
        doc.text('Subtotal:', summaryX, currentY, { width: summaryWidth, align: 'right' });
        doc.text(`₹${Number(orderData.subtotal).toFixed(2)}`, valueX, currentY, { width: 75, align: 'right' });
        currentY += 14;

        // GST Breakdown
        const gstPercentage = Number(orderData.gstPercentage || 0);
        const gstAmount = Number(orderData.gstAmount || 0);

        if (gstAmount > 0 || gstPercentage > 0) {
          const halfGst = (gstAmount / 2).toFixed(2);
          const halfPercent = (gstPercentage / 2).toFixed(1);

          doc.text(`CGST (${halfPercent}%):`, summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text(`₹${halfGst}`, valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;

          doc.text(`SGST (${halfPercent}%):`, summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text(`₹${halfGst}`, valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;
        }

        // Delivery Charges
        if (orderData.deliveryFee > 0) {
          doc.text('Delivery Charges:', summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text(`₹${Number(orderData.deliveryFee).toFixed(2)}`, valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;
        } else {
          doc.text('Delivery Charges:', summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text('FREE', valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;
        }

        // COD Charges
        if (orderData.codFee && orderData.codFee > 0) {
          doc.text('COD Fee:', summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text(`₹${Number(orderData.codFee).toFixed(2)}`, valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;
        }

        // Extra Fee
        if (orderData.extraFeeAmount && orderData.extraFeeAmount > 0) {
          const extraName = orderData.extraFeeName || 'Extra Charge';
          doc.text(`${extraName}:`, summaryX, currentY, { width: summaryWidth, align: 'right' });
          doc.text(`₹${Number(orderData.extraFeeAmount).toFixed(2)}`, valueX, currentY, { width: 75, align: 'right' });
          currentY += 14;
        }

        // Grand Total Box
        doc.rect(330, currentY, 225, 22).fill('#2B6CB0');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
        doc.text('Grand Total:', summaryX + 10, currentY + 5, { width: 120, align: 'left' });
        doc.text(`₹${Number(orderData.grandTotal).toFixed(2)}`, valueX, currentY + 5, { width: 75, align: 'right' });

        currentY += 34;

        // Amount in Words & Footer
        doc.fillColor('#2D3748').font('Helvetica-Bold').fontSize(9);
        doc.text(`Amount in Words: ${numberToWordsINR(orderData.grandTotal)}`, 40, currentY);

        currentY += 24;
        doc.fillColor('#718096').font('Helvetica').fontSize(9);
        doc.text('Thank you for shopping with KickAt!', 40, currentY, { align: 'center' });
        doc.text('This is a computer generated invoice and does not require a physical signature.', 40, currentY + 12, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
