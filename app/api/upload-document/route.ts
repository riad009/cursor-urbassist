import { NextRequest, NextResponse } from "next/server";

// PDF parsing for PLU documents
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.",
        },
        { status: 400 }
      );
    }

    let textContent = "";

    if (file.type === "text/plain") {
      textContent = await file.text();
    } else if (file.type === "application/pdf") {
      // Parse PDF using pdf-parse
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse");
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        textContent = pdfData.text;

        if (!textContent || textContent.trim().length < 50) {
          // PDF might be scanned/image-based, provide feedback
          textContent = `[PDF parsed but limited text extracted - ${pdfData.numpages} pages detected]\n\n${textContent}`;
        }
      } catch (pdfError) {
        console.error("PDF parse error:", pdfError);
        // Fallback: return basic info about the file
        textContent = `[PDF parsing failed for: ${file.name}]\nSize: ${file.size} bytes\nPlease try uploading a text-based PDF or TXT file.`;
      }
    } else {
      // For DOC/DOCX, try to extract text
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        // Basic text extraction from DOCX (ZIP containing XML)
        const text = buffer.toString("utf-8");
        // Extract readable text from XML content
        const cleanText = text
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        textContent =
          cleanText.length > 100
            ? cleanText
            : `[Document content extracted from: ${file.name}]`;
      } catch {
        textContent = `[Could not parse: ${file.name}]`;
      }
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      size: file.size,
      type: file.type,
      content: textContent,
      pageCount:
        file.type === "application/pdf"
          ? textContent.match(/(\d+) pages/)?.[1] || "unknown"
          : undefined,
    });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
